use crate::models::{
    Consent, WalletActivityStatus, WalletActivityType
};
use crate::services::wallet_activity::NewWalletActivity;
use crate::services::AppState;
use crate::utils::did_compat::normalize_did;
use axum::{
    extract::{Path, State},
    http::StatusCode,
    routing::{get, post},
    Json, Router,
};
use mongodb::bson::doc;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// Routes for consent management
pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/:did/consents", get(list_consents))
        .route("/:did/consents", post(grant_consent))
        .route("/:did/consents/:consent_id", get(get_consent))
        .route("/:did/consents/:consent_id/revoke", post(revoke_consent))
}

#[derive(Debug, Deserialize, Serialize)]
pub struct GrantConsentBody {
    pub verifier_did: String,
    pub purpose: String,
    pub data_categories: Vec<String>,
    pub access_level: u8,
    pub expires_at: Option<u64>,
}

#[derive(Debug, Deserialize)]
struct RevokeConsentBody {
    holder_did: String,
    #[serde(default)]
    revoke_attributes: Option<Vec<String>>,
}

async fn grant_consent(
    State(state): State<AppState>,
    Path(holder_did): Path<String>,
    Json(body): Json<GrantConsentBody>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let holder_did = normalize_did(&holder_did)
        .map_err(|e| (StatusCode::BAD_REQUEST, format!("Invalid DID: {}", e)))?;

    tracing::info!("Granting consent for holder: {}", holder_did);

    let blockchain_client = state
        .get_blockchain_client()
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?;

    let client_lock = blockchain_client.read().await;
    let client = client_lock.as_ref().ok_or_else(|| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            "Blockchain client not initialized".to_string(),
        )
    })?;

    let data_categories_str = body.data_categories.join(",");

    let receipt = client
        .grant_consent(
            &holder_did,
            &body.verifier_did,
            &body.purpose,
            &data_categories_str,
            body.access_level,
            body.expires_at.unwrap_or(0),
        )
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    tracing::info!(
        "Consent granted on blockchain: tx={:?}",
        receipt.transaction_hash
    );

    let consent_id = Uuid::new_v4().to_string();
    let now = chrono::Utc::now();

    let consent_doc = doc! {
        "id": &consent_id,
        "holder_did": &holder_did,
        "verifier_did": &body.verifier_did,
        "purpose": &body.purpose,
        "data_categories": &body.data_categories,
        "access_level": body.access_level as i32,
        "expires_at": body.expires_at.map(|v| v as i64),
        "blockchain_tx_hash": format!("{:?}", receipt.transaction_hash),
        "created_at": mongodb::bson::DateTime::from_millis(now.timestamp_millis()),
        "revoked": false,
    };

    let db = state.db();
    db.db
        .collection::<mongodb::bson::Document>("consents")
        .insert_one(&consent_doc)
        .await
        .map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Database error: {}", e),
            )
        })?;

    tracing::info!("Consent saved to MongoDB: {}", consent_id);

    Ok(Json(serde_json::json!({
        "success": true,
        "consent_id": consent_id,
        "tx_hash": format!("{:?}", receipt.transaction_hash),
        "block_number": receipt.block_number.map(|b| b.as_u64()),
        "gas_used": receipt.gas_used.map(|g| g.to_string()),
    })))
}

async fn list_consents(
    State(state): State<AppState>,
    Path(did): Path<String>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let holder_did = normalize_did(&did)
        .map_err(|e| (StatusCode::BAD_REQUEST, format!("Invalid DID: {}", e)))?;

    tracing::info!("Listing consents for holder: {}", holder_did);

    let db = state.db();
    let collection = db.db.collection::<Consent>("consents");

    let filter = doc! {
        "holder_did": &holder_did,
    };

    let consents = match state.db().find_many::<Consent>("consents", filter).await {
        Ok(creds) => creds,
        Err(e) => {
            tracing::error!("Failed to fetch consents: {}", e);
            return Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Database error: {}", e),
            ));
        }
    };

    tracing::info!(
        "Found {} consents for holder: {}",
        consents.len(),
        holder_did
    );

    Ok(Json(serde_json::json!({
        "success": true,
        "consents": consents,
        "count": consents.len()
    })))
}

async fn get_consent(
    State(state): State<AppState>,
    Path((did, consent_id)): Path<(String, String)>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let holder_did = normalize_did(&did)
        .map_err(|e| (StatusCode::BAD_REQUEST, format!("Invalid DID: {}", e)))?;

    tracing::info!("Getting consent: {} for holder: {}", consent_id, holder_did);

    let db = state.db();
    let collection = db.db.collection::<Consent>("consents");

    let filter = doc! {
        "id": &consent_id,
        "holder_did": &holder_did,
    };

    let consent = collection
        .find_one(filter)
        .await
        .map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Database error: {}", e),
            )
        })?
        .ok_or_else(|| (StatusCode::NOT_FOUND, "Consent not found".to_string()))?;

    tracing::info!("Found consent: {}", consent_id);

    Ok(Json(serde_json::json!({
        "success": true,
        "consent": consent
    })))
}

async fn revoke_consent(
    State(state): State<AppState>,
    Path((did, consent_id)): Path<(String, String)>,
    Json(body): Json<RevokeConsentBody>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let normalized_path_did = normalize_did(&did)
        .map_err(|e| (StatusCode::BAD_REQUEST, format!("Invalid DID: {}", e)))?;

    let normalized_body_did = normalize_did(&body.holder_did)
        .map_err(|e| (StatusCode::BAD_REQUEST, format!("Invalid DID: {}", e)))?;

    if normalized_body_did != normalized_path_did {
        return Err((StatusCode::FORBIDDEN, "DID mismatch".to_string()));
    }

    let is_partial_revoke = body
        .revoke_attributes
        .as_ref()
        .map_or(false, |attrs| !attrs.is_empty());

    if is_partial_revoke {
        tracing::info!(
            "Revoking specific attributes from consent: {} for holder: {}",
            consent_id,
            normalized_path_did
        );
    } else {
        tracing::info!(
            "Revoking entire consent: {} for holder: {}",
            consent_id,
            normalized_path_did
        );
    }

    let db = state.db();
    let collection = db.db.collection::<Consent>("consents");

    let consent = collection
        .find_one(doc! {
            "id": &consent_id,
            "holder_did": &normalized_path_did,
        })
        .await
        .map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Database error: {}", e),
            )
        })?
        .ok_or_else(|| {
            (
                StatusCode::NOT_FOUND,
                "Consent not found".to_string(),
            )
        })?;

    if consent.revoked || consent.data_categories.is_empty() {
        let response = serde_json::json!({
            "success": true,
            "message": "Consent already revoked",
            "revoke_type": "full",
            "revoked_attributes": consent.data_categories.clone(),
            "remaining_attributes": Vec::<String>::new(),
        });

        return Ok(Json(response));
    }

    if is_partial_revoke {
        let revoke_attrs = body.revoke_attributes.as_ref().unwrap();
        for attr in revoke_attrs {
            if !consent.data_categories.contains(attr) {
                return Err((
                    StatusCode::BAD_REQUEST,
                    format!("Attribute '{}' not found in consent", attr),
                ));
            }
        }
    }

    let now = chrono::Utc::now();
    let presentation_service = state.presentation_service();
    let wallet_activity_service = state.wallet_activity_service();

    let (update, newly_revoked_attrs, remaining_attrs_option) = if is_partial_revoke {
        let revoke_attrs = body.revoke_attributes.as_ref().unwrap();
        let remaining_categories: Vec<String> = consent
            .data_categories
            .iter()
            .filter(|cat| !revoke_attrs.contains(cat))
            .cloned()
            .collect();

        tracing::info!(
            "Removing {} attributes, {} remaining",
            revoke_attrs.len(),
            remaining_categories.len()
        );

        let update_doc = if remaining_categories.is_empty() {
            doc! {
                "$set": {
                    "revoked": true,
                    "data_categories": [],
                    "revoked_at": mongodb::bson::to_bson(&now)
                        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("DateTime serialization error: {}", e)))?,
                }
            }
        } else {
            doc! {
                "$set": {
                    "data_categories": &remaining_categories,
                    "updated_at": mongodb::bson::to_bson(&now)
                        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("DateTime serialization error: {}", e)))?,
                }
            }
        };

        (update_doc, revoke_attrs.clone(), Some(remaining_categories))
    } else {
        (
            doc! {
                "$set": {
                    "revoked": true,
                    "revoked_at": mongodb::bson::to_bson(&now)
                        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("DateTime serialization error: {}", e)))?,
                }
            },
            consent.data_categories.clone(),
            None,
        )
    };

    let mut tx_hash: Option<String> = None;

    // Selalu coba revoke di blockchain meski hanya parsial (akan tercatat sebagai revoke penuh)
    let revoke_type = if is_partial_revoke { "partial" } else { "full" };
    if let Ok(client_lock) = state.get_blockchain_client().await {
        if let Some(client) = client_lock.read().await.as_ref() {
            match client
                .revoke_consent(&normalized_path_did, &consent.verifier_did, &consent.purpose)
                .await
            {
                Ok(receipt) => {
                    tracing::info!(
                        "Consent revoked on blockchain: tx={:?}",
                        receipt.transaction_hash
                    );
                    tx_hash = Some(format!("{:?}", receipt.transaction_hash));
                }
                Err(e) => {
                    tracing::warn!(
                        error = ?e,
                        holder_did = %normalized_path_did,
                        verifier_did = %consent.verifier_did,
                        "Failed to revoke consent on blockchain; continuing without on-chain update",
                    );
                }
            }
        } else {
            tracing::warn!("Blockchain client not initialized; skipping on-chain revoke");
        }
    } else {
        tracing::warn!("Blockchain client unavailable; skipping on-chain revoke");
    }

    if let Err(error) = presentation_service
        .update_presentations_after_consent_change(
            &normalized_path_did,
            &consent.verifier_did,
            &newly_revoked_attrs,
            remaining_attrs_option.as_deref(),
            false,
        )
        .await
    {
        tracing::warn!(
            error = ?error,
            holder_did = %normalized_path_did,
            verifier_did = %consent.verifier_did,
            consent_id = %consent_id,
            "Failed to sync presentations after consent change; continuing",
        );
    }

    collection
        .update_one(doc! { "id": &consent_id }, update)
        .await
        .map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Database error: {}", e),
            )
        })?;

    let tx_hash_str = tx_hash.clone().unwrap_or_default();

    record_wallet_activity(
        &wallet_activity_service,
        NewWalletActivity {
            holder_did: normalized_path_did.clone(),
            activity_type: WalletActivityType::CredentialRevoked,
            status: WalletActivityStatus::Completed,
            title: if is_partial_revoke {
                format!("Consent attributes revoked for {}", consent.purpose)
            } else {
                format!("Consent revoked for {}", consent.purpose)
            },
            description: if is_partial_revoke {
                format!(
                    "Revoked {} attribute(s) from consent shared with {}",
                    newly_revoked_attrs.len(),
                    consent.verifier_did
                )
            } else {
                format!(
                    "Revoked consent for {} with {}",
                    consent.purpose, consent.verifier_did
                )
            },
            metadata: build_metadata(
                &normalized_path_did,
                &consent.verifier_did,
                &consent_id,
                &tx_hash_str,
                Some(&newly_revoked_attrs),
                remaining_attrs_option.as_ref(),
            ),
            sanitized_metadata: build_sanitized_metadata(
                &consent.verifier_did,
                &consent.purpose,
                Some(newly_revoked_attrs.len()),
                remaining_attrs_option.as_ref().map(|attrs| attrs.len()),
                is_partial_revoke,
            ),
            created_at: Some(now),
        },
    )
    .await;

    let mut response = serde_json::json!({
        "success": true,
        "revoke_type": revoke_type,
        "revoked_attributes": newly_revoked_attrs,
    });

    if let Some(map) = response.as_object_mut() {
        map.insert(
            "message".to_string(),
            serde_json::Value::String(if is_partial_revoke {
                "Consent attributes revoked successfully".to_string()
            } else {
                "Entire consent revoked successfully".to_string()
            }),
        );

        if let Some(remaining) = remaining_attrs_option.as_ref() {
            map.insert(
                "remaining_attributes".to_string(),
                serde_json::Value::Array(
                    remaining
                        .iter()
                        .map(|s| serde_json::Value::String(s.clone()))
                        .collect(),
                ),
            );
        }

        if let Some(hash) = tx_hash {
            map.insert("tx_hash".to_string(), serde_json::Value::String(hash));
        }
    }

    Ok(Json(response))
}

fn build_metadata(
    holder_did: &str,
    verifier_did: &str,
    consent_id: &str,
    tx_hash: &str,
    revoked_attributes: Option<&Vec<String>>,
    remaining_attributes: Option<&Vec<String>>,
) -> std::collections::HashMap<String, String> {
    let mut metadata = std::collections::HashMap::new();
    metadata.insert("holder_did".to_string(), holder_did.to_string());
    metadata.insert("verifier_did".to_string(), verifier_did.to_string());
    metadata.insert("consent_id".to_string(), consent_id.to_string());
    metadata.insert("tx_hash".to_string(), tx_hash.to_string());

    if let Some(attrs) = revoked_attributes {
        metadata.insert(
            "revoked_attributes".to_string(),
            attrs.join(","),
        );
    }

    if let Some(attrs) = remaining_attributes {
        metadata.insert(
            "remaining_attributes".to_string(),
            attrs.join(","),
        );
    }

    metadata
}

fn build_sanitized_metadata(
    verifier_did: &str,
    purpose: &str,
    revoked_count: Option<usize>,
    remaining_count: Option<usize>,
    is_partial: bool,
) -> std::collections::HashMap<String, String> {
    let mut sanitized = std::collections::HashMap::new();
    sanitized.insert(
        "verifier_name".to_string(),
        verifier_did.split(':').last().unwrap_or(verifier_did).to_string(),
    );
    sanitized.insert("status".to_string(), "revoked".to_string());
    sanitized.insert("summary".to_string(), format!("{} revoked", purpose));

    sanitized.insert(
        "description".to_string(),
        if is_partial {
            format!("{} attribute(s) revoked; {} remaining", revoked_count.unwrap_or(0), remaining_count.unwrap_or(0))
        } else {
            format!("Consent fully revoked for {}", purpose)
        },
    );

    sanitized
}

async fn record_wallet_activity(
    service: &crate::services::wallet_activity::WalletActivityService,
    activity: NewWalletActivity,
) {
    if let Err(error) = service.record_activity(activity).await {
        tracing::warn!(error = ?error, "failed to record wallet activity for consent revocation");
    }
}

use futures::stream::TryStreamExt;
