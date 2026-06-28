use axum::{
    extract::{Json, Multipart, Path, Query, State},
    http::StatusCode,
    routing::{delete, get, post},
    Router,
};
use base64;
use bs58;
use chrono::Utc;
use ed25519_dalek::{PublicKey as Ed25519PublicKey, Signature as Ed25519Signature, Verifier};
use rand::Rng;
use mongodb::bson::{doc, DateTime as BsonDateTime};
use serde::Deserialize;
use serde_json::json;
use crate::error::AppError;
use crate::models::{
    AccessLevel, ConsentRecord, CredentialOffer, CredentialTemplate, ExpirationPolicy, FieldSource,
    OfferStatus, WalletActivityStatus, WalletActivityType,
};
use crate::services::credential::{CredentialEvidenceInput, IssueCredentialRequest};
use crate::services::wallet::{
    CreateWalletRequest, GrantConsentRequest, ImportCredentialRequest, ShareCredentialRequest,
};
use crate::services::wallet_activity::NewWalletActivity;
use crate::services::AppState;
use crate::utils::credential_preview;
use crate::utils::did as alyra_did;
use crate::utils::did_compat::normalize_did;
use std::collections::{HashMap, HashSet};
use tracing::warn;

const DEFAULT_ACTIVITY_LIMIT: i64 = 50;
const MAX_ACTIVITY_LIMIT: i64 = 100;

fn record_to_consent_doc(record: &ConsentRecord) -> Result<mongodb::bson::Document, AppError> {
    use mongodb::bson::{self, doc, to_bson};

    let mut doc = doc! {
        "id": &record.id,
        "holder_did": &record.user_did,
        "verifier_did": &record.verifier_did,
        "purpose": &record.purpose,
        "data_categories": &record.data_categories,
        "revoked": record.revoked,
        "expired": record.expired,
        "on_chain": record.on_chain,
    };

    let verifier_name = record
        .verifier_name
        .clone()
        .unwrap_or_else(|| "Unknown".to_string());
    doc.insert("verifier_name", verifier_name);

    doc.insert(
        "created_at",
        bson::DateTime::from_millis(record.created_at.timestamp_millis()),
    );
    doc.insert(
        "updated_at",
        bson::DateTime::from_millis(record.updated_at.timestamp_millis()),
    );

    if let Some(expires_at) = record.expires_at {
        doc.insert(
            "expires_at",
            bson::DateTime::from_millis(expires_at.timestamp_millis()),
        );
    }

    if let Some(revoked_at) = record.revoked_at {
        doc.insert(
            "revoked_at",
            bson::DateTime::from_millis(revoked_at.timestamp_millis()),
        );
    }

    if let Some(expired_at) = record.expired_at {
        doc.insert(
            "expired_at",
            bson::DateTime::from_millis(expired_at.timestamp_millis()),
        );
    }

    if let Some(blockchain_tx) = &record.blockchain_tx {
        doc.insert("blockchain_tx", blockchain_tx.clone());
    }

    doc.insert("access_level", to_bson(&record.access_level)?);
    doc.insert(
        "expiration_policy",
        to_bson(&record.expiration_policy)?,
    );

    Ok(doc)
}

#[derive(Debug, Deserialize)]
struct DeleteConsentParams {
    #[serde(default)]
    holder_did: Option<String>,
}

async fn delete_consent_record(
    State(state): State<AppState>,
    Path((did, consent_id)): Path<(String, String)>,
    Query(params): Query<DeleteConsentParams>,
) -> Result<(StatusCode, Json<serde_json::Value>), AppError> {
    let normalized_path_did = normalize_did(&did).map_err(|e| {
        AppError::ValidationError(format!("Invalid holder DID in path: {}", e))
    })?;

    let normalized_holder = if let Some(holder) = params.holder_did.as_deref() {
        Some(normalize_did(holder).map_err(|e| {
            AppError::ValidationError(format!("Invalid holder DID in query: {}", e))
        })?)
    } else {
        None
    };

    let effective_holder = normalized_holder
        .clone()
        .unwrap_or_else(|| normalized_path_did.clone());

    if effective_holder != normalized_path_did {
        return Err(AppError::AccessDeniedError(
            "Holder DID mismatch for consent deletion".to_string(),
        ));
    }

    let consent = state
        .db
        .find_consent_by_id(&consent_id)
        .await?
        .ok_or_else(|| AppError::NotFoundError(format!("Consent {} not found", consent_id)))?;

    if consent.holder_did != normalized_path_did {
        return Err(AppError::AccessDeniedError(
            "You can only delete your own consent records".to_string(),
        ));
    }

    if !consent.revoked || !consent.data_categories.is_empty() {
        return Err(AppError::ValidationError(
            "Consent must be fully revoked (empty scope) before deletion".to_string(),
        ));
    }

    let deleted = state
        .db
        .delete_consent(&consent_id, &normalized_path_did)
        .await?;

    if !deleted {
        return Err(AppError::InternalError(
            "Failed to delete consent from database".to_string(),
        ));
    }

    Ok((
        StatusCode::OK,
        Json(json!({
            "success": true,
            "message": "Consent record deleted",
        })),
    ))
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
            format!(
                "{} attribute(s) revoked; {} remaining",
                revoked_count.unwrap_or(0),
                remaining_count.unwrap_or(0)
            )
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

pub fn ed25519_pubkey_from_did_key(did: &str) -> Option<[u8; 32]> {
    let encoded = did.strip_prefix("did:key:")?;
    let mut chars = encoded.chars();
    let multibase_prefix = chars.next()?;

    if multibase_prefix != 'z' {
        return None;
    }

    let decoded = bs58::decode(chars.as_str()).into_vec().ok()?;

    if decoded.len() < 34 {
        return None;
    }

    if decoded[0] != 0xED || decoded[1] != 0x01 {
        return None;
    }

    let mut pk = [0u8; 32];
    pk.copy_from_slice(&decoded[2..34]);
    Some(pk)
}

async fn test_challenge(
    State(state): State<AppState>,
    Path(offer_id): Path<String>,
) -> Result<(StatusCode, Json<serde_json::Value>), AppError> {
    let offer = state
        .db
        .find_one::<CredentialOffer>("credential_offers", mongodb::bson::doc! { "id": &offer_id })
        .await?
        .ok_or_else(|| AppError::NotFoundError("Offer not found".to_string()))?;

    if let Some(expires_at) = offer.expires_at {
        if Utc::now() > expires_at {
            return Err(AppError::ValidationError("Offer has expired".to_string()));
        }
    }
    if offer.one_time_used {
        return Err(AppError::ValidationError(
            "Offer has already been used".to_string(),
        ));
    }
    if offer.status != OfferStatus::Pending {
        return Err(AppError::ValidationError(format!(
            "Offer is not pending (status: {:?})",
            offer.status
        )));
    }

    let nonce_b64 = {
        let mut rng = rand::thread_rng();
        let bytes: [u8; 32] = rng.gen();
        base64::encode(bytes)
    };

    let now = Utc::now();
    let expires = now + chrono::Duration::seconds(300);
    let nonce_doc = mongodb::bson::doc! {
        "offer_id": &offer_id,
        "nonce": &nonce_b64,
        "created_at": mongodb::bson::DateTime::from_millis(now.timestamp_millis()),
        "expires_at": mongodb::bson::DateTime::from_millis(expires.timestamp_millis()),
    };

    let _ = state
        .db
        .delete_one(
            "offer_nonces",
            mongodb::bson::doc! { "offer_id": &offer_id },
        )
        .await;
    state.db.insert_one("offer_nonces", &nonce_doc).await?;

    Ok((
        StatusCode::OK,
        Json(json!({
            "nonce": nonce_b64,
            "did_methods": vec!["did:key", "did:alyra"],
            "expires_in": 300,
        })),
    ))
}

async fn test_accept(
    State(state): State<AppState>,
    Path(offer_id): Path<String>,
    Json(request): Json<serde_json::Value>,
) -> Result<(StatusCode, Json<serde_json::Value>), AppError> {
    let holder_did = request
        .get("holder_did")
        .and_then(|v| v.as_str())
        .ok_or_else(|| AppError::ValidationError("holder_did is required".to_string()))?;
    let provided_nonce = request
        .get("nonce")
        .and_then(|v| v.as_str())
        .ok_or_else(|| AppError::ValidationError("nonce is required".to_string()))?;

    let offer = state
        .db
        .find_one::<CredentialOffer>("credential_offers", mongodb::bson::doc! { "id": &offer_id })
        .await?
        .ok_or_else(|| AppError::NotFoundError("Offer not found".to_string()))?;

    if offer.status != OfferStatus::Pending {
        return Err(AppError::ValidationError(format!(
            "Offer is not pending (status: {:?})",
            offer.status
        )));
    }
    if offer.one_time_used {
        return Err(AppError::ValidationError(
            "Offer has already been used".to_string(),
        ));
    }
    if let Some(expires_at) = offer.expires_at {
        if Utc::now() > expires_at {
            let _ = state
                .db
                .update_one(
                    "credential_offers",
                    mongodb::bson::doc! { "id": &offer_id },
                    mongodb::bson::doc! { "$set": { "status": "expired" } },
                )
                .await;
            return Err(AppError::ValidationError("Offer has expired".to_string()));
        }
    }

    let nonce_doc = state
        .db
        .find_one::<mongodb::bson::Document>(
            "offer_nonces",
            mongodb::bson::doc! { "offer_id": &offer_id },
        )
        .await?
        .ok_or_else(|| AppError::ValidationError("Nonce not found or expired".to_string()))?;

    let stored_nonce = nonce_doc
        .get_str("nonce")
        .map_err(|_| AppError::ValidationError("Invalid nonce format".to_string()))?;

    if stored_nonce != provided_nonce {
        return Err(AppError::ValidationError("Nonce mismatch".to_string()));
    }

    let now = Utc::now();
    let update = mongodb::bson::doc! {
        "$set": {
            "recipient_did": holder_did,
            "accepted_by_did": holder_did,
            "accepted_at": mongodb::bson::DateTime::from_millis(now.timestamp_millis()),
            "status": "accepted",
            "one_time_used": true,
        }
    };

    state
        .db
        .update_one(
            "credential_offers",
            mongodb::bson::doc! { "id": &offer_id },
            update,
        )
        .await?;

    loop {
        let deleted = state
            .db
            .delete_one(
                "offer_nonces",
                mongodb::bson::doc! { "offer_id": &offer_id },
            )
            .await?;
        if !deleted {
            break;
        }
    }

    tracing::info!(
        "Offer {} accepted by holder {} at {}",
        offer_id,
        holder_did,
        now
    );

    Ok((
        StatusCode::OK,
        Json(json!({
            "success": true,
            "message": "Offer accepted successfully",
            "offer_id": offer_id,
            "recipient_did": holder_did,
            "accepted_at": now,
            "next_step": "fill_claims"
        })),
    ))
}

#[derive(Debug, Deserialize)]
pub struct PredicateProofRequest {
    pub attribute: String,
    pub operator: String,
    pub value: i64,
}

#[derive(Debug, Deserialize)]
pub struct AnonymousProofRequest {
    pub attributes: Vec<String>,
}

async fn generate_anonymous_proof(
    State(state): State<AppState>,
    Path((did, credential_id)): Path<(String, String)>,
    Json(body): Json<AnonymousProofRequest>,
) -> Result<(StatusCode, Json<serde_json::Value>), AppError> {
    if body.attributes.is_empty() {
        return Err(AppError::ValidationError(
            "At least one attribute must be provided".to_string(),
        ));
    }

    let credential_service = state.credential_service();
    let credential = credential_service
        .get_credential_by_id(&credential_id)
        .await?
        .ok_or_else(|| {
            AppError::NotFoundError(format!("Credential with ID {} not found", credential_id))
        })?;

    if credential.owner_did != did {
        return Err(AppError::AccessDeniedError(
            "You can only generate proofs for your own credentials".to_string(),
        ));
    }

    let proof_opt = credential_service
        .build_anonymous_presentation(&credential, &body.attributes)
        .await?;

    if let Some(proof) = proof_opt {
        let proof_value = serde_json::to_value(&proof).map_err(|e| {
            AppError::InternalError(format!("Failed to serialize anonymous proof: {}", e))
        })?;

        Ok((
            StatusCode::OK,
            Json(json!({
                "success": true,
                "credential_id": credential_id,
                "proof": proof_value,
            })),
        ))
    } else {
        Err(AppError::ValidationError(
            "Anonymous proof is not available for the requested attributes".to_string(),
        ))
    }
}
async fn create_predicate_proof(
    State(state): State<AppState>,
    Path(credential_id): Path<String>,
    Json(body): Json<PredicateProofRequest>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    use crate::models::Credential;
    use crate::utils::zk_proofs;

    tracing::info!(
        "Creating ZKP predicate proof for credential: {}",
        credential_id
    );

    // Log the incoming request details
    tracing::info!(
        "Predicate proof request - attribute: {} (type: {}), operator: {} (type: {}), value: {} (type: {})",
        body.attribute,
        std::any::type_name_of_val(&body.attribute),
        body.operator,
        std::any::type_name_of_val(&body.operator),
        body.value,
        std::any::type_name_of_val(&body.value)
    );

    let db = state.db();
    let collection = db.db.collection::<Credential>("credentials");
    let credential = collection
        .find_one(mongodb::bson::doc! { "id": &credential_id })
        .await
        .map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Database error: {}", e),
            )
        })?
        .ok_or_else(|| (StatusCode::NOT_FOUND, "Credential not found".to_string()))?;

    let preview_map = credential_preview::get_plain_preview(&credential)
        .map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Failed to decode credential preview: {}", e),
            )
        })?
        .ok_or_else(|| {
            (
                StatusCode::BAD_REQUEST,
                "Credential has no preview data".to_string(),
            )
        })?;

    let attribute_value_i64 = credential_preview::derive_numeric_attribute(&preview_map, &body.attribute)
        .ok_or_else(|| {
            (
                StatusCode::BAD_REQUEST,
                format!(
                    "Attribute '{}' not found, not numeric, or cannot be derived from date",
                    body.attribute
                ),
            )
        })?;

    tracing::info!(
        "Predicate proof request: {} {} {} (actual attribute value: {})",
        body.attribute, body.operator, body.value, attribute_value_i64
    );

    if attribute_value_i64 < 0 {
        return Err((
            StatusCode::BAD_REQUEST,
            format!(
                "Attribute '{}' resolved to negative value {} which is not supported",
                body.attribute, attribute_value_i64
            ),
        ));
    }

    let attribute_value = attribute_value_i64 as u64;

    // Create predicate proof using bulletproofs
    let predicate_type = if body.operator == "==" || body.operator == "!=" {
        "equality"
    } else {
        "range"
    };

    let proof = zk_proofs::create_predicate_proof(
        &body.attribute,
        attribute_value as u64,
        &body.operator,
        body.value,
    )
    .map_err(|e| {
        (
            StatusCode::BAD_REQUEST,
            format!("Failed to create proof: {}", e),
        )
    })?;

    tracing::info!("ZKP predicate proof created for {}", body.attribute);

    Ok(Json(serde_json::json!({
        "success": true,
        "proof": {
            "attribute_name": proof.attribute_name,
            "predicate_type": proof.predicate_type,
            "predicate_value": proof.predicate_value,
            "range_proof": {
                "proof": hex::encode(&proof.range_proof.proof),
                "commitment": hex::encode(&proof.range_proof.commitment),
            }
        },
        "message": format!("Proof created: {} {} {} (actual value NOT revealed)",
            body.attribute, body.operator, body.value)
    })))
}

async fn revoke_credential(
    State(state): State<AppState>,
    Path((did, credential_id)): Path<(String, String)>,
    Json(body): Json<RevokeCredentialRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    let holder_did = crate::utils::did_compat::normalize_did(&did)
        .map_err(|e| AppError::ValidationError(format!("Invalid DID: {}", e)))?;

    // Verify holder_did matches
    let body_did = crate::utils::did_compat::normalize_did(&body.holder_did)
        .map_err(|e| AppError::ValidationError(format!("Invalid DID: {}", e)))?;

    if holder_did != body_did {
        return Err(AppError::AccessDeniedError("DID mismatch".to_string()));
    }

    tracing::info!(
        "Revoking credential: {} for holder: {}",
        credential_id,
        holder_did
    );

    let db = state.db();

    use crate::models::Credential;
    let credential = db
        .find_one::<Credential>(
            "credentials",
            mongodb::bson::doc! {
                "id": &credential_id,
                "owner_did": &holder_did,
            },
        )
        .await?
        .ok_or_else(|| {
            AppError::NotFoundError(format!("Credential {} not found", credential_id))
        })?;

    let blockchain_client = state
        .get_blockchain_client()
        .await
        .map_err(|e| AppError::BlockchainError(e))?;

    let client_lock = blockchain_client.read().await;
    let client = client_lock.as_ref().ok_or_else(|| {
        AppError::BlockchainError("Blockchain client not initialized".to_string())
    })?;

    let receipt = client
        .revoke_credential(&holder_did, &credential.credential_hash)
        .await
        .map_err(|e| AppError::BlockchainError(e.to_string()))?;

    let tx_hash_str = format!("{:?}", receipt.transaction_hash);
    tracing::info!("Credential revoked on blockchain: tx={}", tx_hash_str);

    let mut revoked_credential = credential.clone();
    revoked_credential.status = crate::models::CredentialStatus::Revoked;
    revoked_credential.updated_at = Utc::now();
    revoked_credential.revocation_blockchain_tx = Some(tx_hash_str.clone());

    db.save_credential(&revoked_credential).await?;

    // Cascade update to presentations referencing this credential
    let presentation_service = state.presentation_service();
    presentation_service
        .update_presentations_after_credential_revoke(&holder_did, &credential.id)
        .await?;

    tracing::info!(
        "Credential revoked and saved to database with tx_hash: {}",
        credential_id
    );

    let wallet_activity_service = state.wallet_activity_service();

    let mut metadata = HashMap::new();
    metadata.insert("holder_did".to_string(), holder_did.clone());
    metadata.insert("credential_id".to_string(), credential_id.clone());
    metadata.insert("issuer_did".to_string(), credential.issuer_did.clone());
    metadata.insert("tx_hash".to_string(), tx_hash_str.clone());
    metadata.insert("credential_type".to_string(), credential.credential_type.clone());

    let issuer_display = credential
        .issuer_did
        .split(':')
        .last()
        .unwrap_or(&credential.issuer_did)
        .to_string();

    let mut sanitized_metadata = HashMap::new();
    sanitized_metadata.insert("issuer_name".to_string(), issuer_display.clone());
    sanitized_metadata.insert("credential_type".to_string(), credential.credential_type.clone());
    sanitized_metadata.insert("credential_id".to_string(), credential_id.clone());
    sanitized_metadata.insert("status".to_string(), "revoked".to_string());
    sanitized_metadata.insert("tx_hash".to_string(), tx_hash_str.clone());
    sanitized_metadata.insert(
        "summary".to_string(),
        format!("{} revoked", credential.credential_type),
    );

    if let Err(error) = wallet_activity_service
        .record_activity(NewWalletActivity {
            holder_did: holder_did.clone(),
            activity_type: WalletActivityType::CredentialRevoked,
            status: WalletActivityStatus::Completed,
            title: format!("{} credential revoked", credential.credential_type),
            description: "Credential revoked on-chain.".to_string(),
            metadata,
            sanitized_metadata,
            created_at: Some(revoked_credential.updated_at),
        })
        .await
    {
        warn!(
            error = ?error,
            "failed to record wallet activity for credential revocation"
        );
    }

    Ok(Json(serde_json::json!({
        "success": true,
        "message": "Credential revoked successfully",
        "credential_id": credential_id,
        "tx_hash": tx_hash_str,
        "block_number": receipt.block_number.map(|b| b.as_u64()),
    })))
}

#[derive(Debug, Deserialize, Default)]
struct ActivityQuery {
    #[serde(default)]
    limit: Option<i64>,
}

async fn list_wallet_activities(
    State(state): State<AppState>,
    Path(did): Path<String>,
    Query(query): Query<ActivityQuery>,
) -> Result<(StatusCode, Json<serde_json::Value>), AppError> {
    let normalized_did = crate::utils::did_compat::normalize_did(&did).map_err(|e| {
        AppError::ValidationError(format!("Invalid DID: {}", e))
    })?;

    let limit = query
        .limit
        .or(Some(DEFAULT_ACTIVITY_LIMIT))
        .map(|value| value.clamp(1, MAX_ACTIVITY_LIMIT));

    let wallet_activity_service = state.wallet_activity_service();
    let activities = wallet_activity_service
        .list_activities(&normalized_did, limit)
        .await?;

    let response: Vec<_> = activities
        .into_iter()
        .map(|activity| {
            serde_json::json!({
                "id": activity.id,
                "holder_did": activity.holder_did,
                "activity_type": activity.activity_type,
                "status": activity.status,
                "created_at": activity.created_at,
                "updated_at": activity.updated_at,
                "sanitized_metadata": activity.sanitized_metadata,
            })
        })
        .collect();

    Ok((
        StatusCode::OK,
        Json(serde_json::json!({
            "success": true,
            "data": response,
        })),
    ))
}
pub fn routes() -> Router<AppState> {
    Router::<AppState>::new()
        .route("/", post(create_wallet))
        .route("/:did", get(get_wallet))
        .route("/:did/credentials", get(get_credentials))
        .route("/:did/credentials/import", post(import_credential))
        .route("/:did/credentials/:credential_id", get(get_credential))
        .route(
            "/:did/credentials/:credential_id",
            delete(delete_credential),
        )
        .route(
            "/:did/credentials/:credential_id/anonymous-proof",
            post(generate_anonymous_proof),
        )
        .route(
            "/:did/credentials/:credential_id/revoke",
            post(revoke_credential),
        )
        .route(
            "/:did/evidence/upload",
            post(upload_evidence),
        )
        .route(
            "/:did/credentials/share",
            post(share_credentials),
        )
        .route("/:did/activities", get(list_wallet_activities))
        .route("/:did/presentations", get(get_presentations))
        .route("/:did/statistics", get(get_statistics))
        .route("/:did/consents", get(get_consents))
        .route("/:did/consents", post(create_consent))
        .route(
            "/:did/consents/:consent_id",
            delete(delete_consent_record),
        )
        .route(
            "/:did/consents/:consent_id/revoke",
            post(revoke_consent),
        )
        .route("/:did/backup", post(backup_wallet))
        .route("/restore", post(restore_wallet))
        .route("/scan-qr", post(scan_qr_code))
        .route("/offers/:offer_id/challenge", get(get_offer_challenge))
        .route("/offers/:offer_id/accept", post(accept_offer))
        .route(
            "/credentials/:credential_id/predicate-proof",
            post(create_predicate_proof),
        )
}

/// Scan QR code request
#[derive(Debug, Deserialize)]
pub struct ScanQrCodeRequest {
    pub qr_data: String,
}

/// Backup wallet request
#[derive(Debug, Deserialize)]
pub struct BackupWalletRequest {
    pub password: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateConsentBody {
    pub verifier_did: String,
    pub purpose: String,
    #[serde(default)]
    pub data_categories: Vec<String>,
    #[serde(default = "default_access_level")]
    pub access_level: String,
    #[serde(default = "default_expiration_policy")]
    pub expiration_policy: String,
    #[serde(alias = "expiresAt", alias = "expires_at")]
    pub expires_at: Option<String>,
}

/// Restore wallet request
#[derive(Debug, Deserialize)]
pub struct RestoreWalletRequest {
    pub backup_data: String,
    pub password: String,
}

/// Revoke credential request
#[derive(Debug, Deserialize)]
pub struct RevokeCredentialRequest {
    pub holder_did: String,
}

/// Create wallet handler
async fn create_wallet(
    State(state): State<AppState>,
    Json(request): Json<CreateWalletRequest>,
) -> Result<(StatusCode, Json<serde_json::Value>), AppError> {
    let wallet_service = state.wallet_service();
    let wallet = wallet_service.create_wallet(request).await?;

    Ok((
        StatusCode::CREATED,
        Json(json!({
            "success": true,
            "message": "Wallet created successfully",
            "wallet": wallet,
        })),
    ))
}

/// Get wallet handler
async fn get_wallet(
    State(state): State<AppState>,
    Path(did): Path<String>,
) -> Result<(StatusCode, Json<serde_json::Value>), AppError> {
    let wallet_service = state.wallet_service();
    let wallet = wallet_service.get_wallet(&did).await?;

    Ok((
        StatusCode::OK,
        Json(json!({
            "success": true,
            "wallet": wallet,
        })),
    ))
}

/// Get credentials handler
async fn get_credentials(
    State(state): State<AppState>,
    Path(did): Path<String>,
) -> Result<(StatusCode, Json<serde_json::Value>), AppError> {
    tracing::info!("Raw DID from request: {}", did);

    let normalized_did = crate::utils::did_compat::normalize_did(&did).map_err(|e| {
        tracing::error!("Failed to normalize DID {}: {}", did, e);
        AppError::ValidationError(format!("Invalid DID: {}", e))
    })?;

    tracing::info!(
        "Fetching credentials for DID: {} (normalized: {})",
        did,
        normalized_did
    );

    // Query MongoDB directly to see what's stored
    let db_credentials_count = state
        .db
        .db
        .collection::<crate::models::Credential>("credentials")
        .count_documents(mongodb::bson::doc! { "owner_did": &normalized_did })
        .await
        .unwrap_or(0);

    tracing::info!(
        "Found {} credentials in MongoDB for owner_did: {}",
        db_credentials_count,
        normalized_did
    );

    // DEBUG: Query with original DID too
    let db_credentials_count_original = state
        .db
        .db
        .collection::<crate::models::Credential>("credentials")
        .count_documents(mongodb::bson::doc! { "owner_did": &did })
        .await
        .unwrap_or(0);

    tracing::info!(
        "Found {} credentials in MongoDB for owner_did: {} (original DID)",
        db_credentials_count_original,
        did
    );

    let credential_service = state.credential_service();
    let all_credentials = match credential_service
        .get_credentials_by_owner(&normalized_did)
        .await
    {
        Ok(creds) => {
            tracing::info!("Found {} credentials for DID: {}", creds.len(), did);
            creds
        }
        Err(e) => {
            tracing::warn!("No credentials found for DID {}: {}", did, e);
            vec![]
        }
    };

    let total_credentials = all_credentials.len();
    let credentials: Vec<_> = all_credentials
        .into_iter()
        .filter(|cred| {
            let is_active = cred.status == crate::models::CredentialStatus::Active;
            let is_not_expired = cred.expires_at.map_or(true, |exp| exp > chrono::Utc::now());

            if !is_active {
                tracing::warn!(
                    "Filtering out revoked/expired credential: {} (status: {:?})",
                    cred.id,
                    cred.status
                );
            }

            is_active && is_not_expired
        })
        .collect();

    tracing::info!(
        "Returned {} active credentials (filtered {} revoked/expired)",
        credentials.len(),
        total_credentials - credentials.len()
    );

    let db = state.db();
    let mut formatted_credentials = Vec::new();

    for cred in credentials {
        // Fetch issuer name from issuers collection
        let issuer_name = match db
            .find_one::<serde_json::Value>(
                "issuers",
                mongodb::bson::doc! { "id": &cred.issuer_did },
            )
            .await
        {
            Ok(Some(issuer)) => {
                // Try to get name from issuer document
                issuer
                    .get("name")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string())
                    .unwrap_or_else(|| {
                        cred.issuer_did
                            .split(':')
                            .last()
                            .map(|s| format!("Issuer {}", s))
                            .unwrap_or_else(|| "Unknown Issuer".to_string())
                    })
            }
            _ => {
                // Fallback: extract from DID if issuer not found
                tracing::warn!("Issuer {} not found in issuers collection", cred.issuer_did);
                cred.issuer_did
                    .split(':')
                    .last()
                    .map(|s| format!("Issuer {}", s))
                    .unwrap_or_else(|| "Unknown Issuer".to_string())
            }
        };

        let preview = credential_preview::get_plain_preview(&cred)
            .unwrap_or(None)
            .unwrap_or_default();
        formatted_credentials.push(json!({
            "id": cred.id,
            "issuer_did": cred.issuer_did,
            "issuer_name": issuer_name,
            "credential_type": cred.credential_type,
            "credential_preview": preview.clone(),
            "credential_data": preview,
            "credential_preview_encrypted": cred.credential_preview_encrypted,
            "issuance_date": cred.created_at,
            "expiration_date": cred.expires_at,
            "status": format!("{:?}", cred.status).to_lowercase(),
            "ipfs_hash": cred.ipfs_hash,
            "ipfs_gateway_url": cred.ipfs_gateway_url,
            "jwt": cred.jwt,
            "signature_type": cred.signature_type,
            "bbs_signature": cred.bbs_signature,
            "bbs_public_key": cred.bbs_public_key,
            "blockchain_tx_hash": cred.blockchain_tx_hash,
            "blockchain_reference": cred.blockchain_reference,
            "anonymous_credential": cred.anonymous_credential,
            "anonymous_master_secret": cred.anonymous_master_secret,
            "evidence_attachments": cred.evidence_attachments,
            "evidence_required": cred.evidence_required,
            "evidence_status": cred.evidence_status,
            "extensions": cred.extensions,
        }));
    }

    tracing::info!(
        "Returning {} credentials for DID: {}",
        formatted_credentials.len(),
        did
    );

    Ok((
        StatusCode::OK,
        Json(json!({
            "success": true,
            "data": formatted_credentials,
            "count": formatted_credentials.len(),
            "query_did": did,
        })),
    ))
}

/// Get credential handler
async fn get_credential(
    State(state): State<AppState>,
    Path((did, credential_id)): Path<(String, String)>,
) -> Result<(StatusCode, Json<serde_json::Value>), AppError> {
    let credential_service = state.credential_service();
    let credential = credential_service
        .get_credential_by_id(&credential_id)
        .await?
        .ok_or_else(|| {
            AppError::NotFoundError(format!("Credential with ID {} not found", credential_id))
        })?;

    // Check if the credential belongs to the wallet
    if credential.owner_did != did {
        return Err(AppError::AccessDeniedError(
            "You can only access your own credentials".to_string(),
        ));
    }

    Ok((
        StatusCode::OK,
        Json(json!({
            "success": true,
            "credential": credential,
        })),
    ))
}

/// Import credential handler
async fn import_credential(
    State(state): State<AppState>,
    Path(did): Path<String>,
    Json(request): Json<ImportCredentialRequest>,
) -> Result<(StatusCode, Json<serde_json::Value>), AppError> {
    let wallet_service = state.wallet_service();
    let credential = wallet_service.import_credential(&did, request).await?;

    Ok((
        StatusCode::OK,
        Json(json!({
            "success": true,
            "message": "Credential imported successfully",
            "credential": credential,
        })),
    ))
}

/// Delete credential handler
async fn delete_credential(
    State(state): State<AppState>,
    Path((did, credential_id)): Path<(String, String)>,
) -> Result<(StatusCode, Json<serde_json::Value>), AppError> {
    let wallet_service = state.wallet_service();
    let success = wallet_service
        .delete_credential(&did, &credential_id)
        .await?;

    Ok((
        StatusCode::OK,
        Json(json!({
            "success": success,
            "message": "Credential deleted successfully",
        })),
    ))
}

async fn share_credentials(
    State(state): State<AppState>,
    Path(did): Path<String>,
    Json(request): Json<ShareCredentialRequest>,
) -> Result<(StatusCode, Json<serde_json::Value>), AppError> {
    let private_key = "did:alyra";

    let wallet_service = state.wallet_service();
    let jwt = wallet_service
        .share_credentials(&did, private_key, request)
        .await?;

    Ok((
        StatusCode::OK,
        Json(json!({
            "success": true,
            "message": "Credentials shared successfully",
            "jwt": jwt,
        })),
    ))
}

async fn get_presentations(
    State(state): State<AppState>,
    Path(did): Path<String>,
) -> Result<(StatusCode, Json<serde_json::Value>), AppError> {
    let wallet_service = state.wallet_service();
    let presentations = wallet_service.get_presentations(&did).await?;

    Ok((
        StatusCode::OK,
        Json(json!({
            "success": true,
            "presentations": presentations,
        })),
    ))
}

/// Get consents handler
async fn get_consents(
    State(state): State<AppState>,
    Path(did): Path<String>,
) -> Result<(StatusCode, Json<serde_json::Value>), AppError> {
    let holder_did = normalize_did(&did).map_err(|e| {
        AppError::ValidationError(format!("Invalid DID: {}", e))
    })?;

    let wallet_service = state.wallet_service();
    let mut consents: Vec<mongodb::bson::Document> = wallet_service
        .get_consents(&holder_did)
        .await?
        .into_iter()
        .map(|mut consent| {
            if consent.verifier_name.is_none() {
                consent.verifier_name = Some("Unknown".to_string());
            }
            mongodb::bson::to_document(&consent)
        })
        .collect::<Result<_, _>>()?;

    // Backfill with legacy consent records to support older entries
    let legacy_records = state
        .db
        .find_consent_records_by_user(&holder_did)
        .await?
        .into_iter()
        .filter_map(|record| record_to_consent_doc(&record).ok())
        .collect::<Vec<_>>();

    consents.extend(legacy_records);

    Ok((
        StatusCode::OK,
        Json(json!({
            "success": true,
            "consents": consents,
        })),
    ))
}

async fn create_consent(
    State(state): State<AppState>,
    Path(did): Path<String>,
    Json(body): Json<CreateConsentBody>,
) -> Result<(StatusCode, Json<serde_json::Value>), AppError> {
    let holder_did = normalize_did(&did).map_err(|e| {
        tracing::error!("Failed to normalize DID {}: {}", did, e);
        AppError::ValidationError(format!("Invalid DID: {}", e))
    })?;

    let access_level = parse_access_level(&body.access_level)?;
    let expiration_policy = parse_expiration_policy(&body.expiration_policy)?;

    let expires_at = if let Some(ref iso) = body.expires_at {
        Some(parse_iso_datetime(iso)? )
    } else {
        None
    };

    if matches!(expiration_policy, ExpirationPolicy::FixedDate) && expires_at.is_none() {
        return Err(AppError::ValidationError(
            "expires_at is required when expiration_policy is fixed_date".to_string(),
        ));
    }

    let wallet_service = state.wallet_service();

    let grant_request = GrantConsentRequest {
        verifier_did: body.verifier_did.clone(),
        purpose: body.purpose.clone(),
        data_categories: body.data_categories.clone(),
        access_level,
        expiration_policy,
        expires_at,
    };

    let consent = wallet_service
        .grant_consent(&holder_did, grant_request)
        .await?;

    Ok((
        StatusCode::CREATED,
        Json(json!({
            "success": true,
            "consent": consent,
        })),
    ))
}

fn default_access_level() -> String {
    "read_only".to_string()
}

fn default_expiration_policy() -> String {
    "indefinite".to_string()
}

fn parse_access_level(value: &str) -> Result<AccessLevel, AppError> {
    match value.to_lowercase().as_str() {
        "read_only" | "readonly" => Ok(AccessLevel::ReadOnly),
        "read_write" | "readwrite" => Ok(AccessLevel::ReadWrite),
        "full_access" | "fullaccess" | "full" => Ok(AccessLevel::FullAccess),
        "write" => Ok(AccessLevel::Write),
        "delete" => Ok(AccessLevel::Delete),
        "one_time" | "onetime" => Ok(AccessLevel::OneTime),
        other => Err(AppError::ValidationError(format!(
            "Unsupported access_level '{}'. Expected one of read_only, read_write, full_access, write, delete, one_time.",
            other
        ))),
    }
}

fn parse_expiration_policy(value: &str) -> Result<ExpirationPolicy, AppError> {
    match value.to_lowercase().as_str() {
        "fixed_date" | "fixed" => Ok(ExpirationPolicy::FixedDate),
        "one_time_use" | "one_time" => Ok(ExpirationPolicy::OneTimeUse),
        "indefinite" => Ok(ExpirationPolicy::Indefinite),
        other => Err(AppError::ValidationError(format!(
            "Unsupported expiration_policy '{}'. Expected fixed_date, one_time_use, or indefinite.",
            other
        ))),
    }
}

fn parse_iso_datetime(value: &str) -> Result<chrono::DateTime<Utc>, AppError> {
    chrono::DateTime::parse_from_rfc3339(value)
        .map(|dt| dt.with_timezone(&Utc))
        .map_err(|e| AppError::ValidationError(format!("Invalid expires_at timestamp: {}", e)))
}

#[derive(Debug, Deserialize)]
struct WalletRevokeConsentBody {
    #[serde(default)]
    holder_did: Option<String>,
    #[serde(default)]
    revoke_attributes: Option<Vec<String>>,
}

async fn revoke_consent(
    State(state): State<AppState>,
    Path((did, consent_id)): Path<(String, String)>,
    Json(body): Json<WalletRevokeConsentBody>,
) -> Result<(StatusCode, Json<serde_json::Value>), AppError> {
    let normalized_path_did = normalize_did(&did).map_err(|e| {
        AppError::ValidationError(format!("Invalid holder DID in path: {}", e))
    })?;

    let normalized_body_did = if let Some(holder) = body.holder_did.as_deref() {
        Some(normalize_did(holder).map_err(|e| {
            AppError::ValidationError(format!("Invalid holder DID in payload: {}", e))
        })?)
    } else {
        None
    };

    let effective_holder = normalized_body_did
        .clone()
        .unwrap_or_else(|| normalized_path_did.clone());

    if effective_holder != normalized_path_did {
        return Err(AppError::AccessDeniedError(
            "Holder DID mismatch for consent revocation".to_string(),
        ));
    }

    let consent = state
        .db
        .find_consent_by_id(&consent_id)
        .await?
        .ok_or_else(|| AppError::NotFoundError(format!("Consent {} not found", consent_id)))?;

    let consent_holder_did = normalize_did(&consent.holder_did).unwrap_or_else(|_| consent.holder_did.clone());

    if consent_holder_did != normalized_path_did {
        return Err(AppError::AccessDeniedError(
            "You can only revoke your own consent records".to_string(),
        ));
    }

    if consent.revoked || consent.data_categories.is_empty() {
        let response_payload = json!({
            "success": true,
            "message": "Consent already revoked",
            "revoke_type": "full",
            "revoked_attributes": consent.data_categories.clone(),
            "remaining_attributes": Vec::<String>::new(),
        });

        return Ok((StatusCode::OK, Json(response_payload)));
    }

    let revoke_attributes = body
        .revoke_attributes
        .unwrap_or_default()
        .into_iter()
        .filter(|attr| !attr.trim().is_empty())
        .collect::<Vec<_>>();
    let is_partial_request = !revoke_attributes.is_empty();

    let now = Utc::now();
    let bson_now = BsonDateTime::from_millis(now.timestamp_millis());
    let consents_collection = state.db.consents();
    let filter_doc = doc! { "id": &consent_id, "holder_did": &consent_holder_did };

    let mut should_call_blockchain = false;

    let (revoke_type, revoked_attrs, remaining_scope) = if is_partial_request {
        for attr in &revoke_attributes {
            if !consent.data_categories.contains(attr) {
                return Err(AppError::ValidationError(format!(
                    "Attribute '{}' not found in consent scope",
                    attr
                )));
            }
        }

        let remaining: Vec<String> = consent
            .data_categories
            .iter()
            .filter(|attr| !revoke_attributes.contains(attr))
            .cloned()
            .collect();

        if remaining.is_empty() {
            should_call_blockchain = true;
            consents_collection
                .update_one(
                    filter_doc.clone(),
                    doc! { "$set": { "revoked": true, "revoked_at": bson_now.clone(), "data_categories": [], "updated_at": bson_now.clone() } },
                )
                .await?;

            ("full", consent.data_categories.clone(), Vec::<String>::new())
        } else {
            consents_collection
                .update_one(
                    filter_doc.clone(),
                    doc! {
                        "$set": {
                            "data_categories": &remaining,
                            "updated_at": bson_now.clone(),
                        }
                    },
                )
                .await?;

            ("partial", revoke_attributes.clone(), remaining)
        }
    } else {
        should_call_blockchain = true;
        consents_collection
            .update_one(
                filter_doc.clone(),
                doc! { "$set": { "revoked": true, "revoked_at": bson_now.clone(), "data_categories": Vec::<String>::new(), "updated_at": bson_now.clone() } },
            )
            .await?;

        ("full", consent.data_categories.clone(), Vec::<String>::new())
    };

    let mut tx_hash: Option<String> = None;

    if should_call_blockchain {
        if let Ok(client_lock) = state.get_blockchain_client().await {
            if let Some(client) = client_lock.read().await.as_ref() {
                match client
                    .revoke_consent(&consent_holder_did, &consent.verifier_did, &consent.purpose)
                    .await
                {
                    Ok(receipt) => {
                        tx_hash = Some(format!("{:?}", receipt.transaction_hash));
                    }
                    Err(e) => {
                        warn!(
                            "Failed to revoke consent on blockchain: {}. Continuing without blockchain.",
                            e
                        );
                    }
                }
            }
        }
    }

    let remaining_slice = if remaining_scope.is_empty() {
        None
    } else {
        Some(remaining_scope.as_slice())
    };

    if let Err(error) = state
        .presentation_service()
        .update_presentations_after_consent_change(
            &consent_holder_did,
            &consent.verifier_did,
            &revoked_attrs,
            remaining_slice,
            false,
        )
        .await
    {
        warn!(
            error = ?error,
            holder_did = %consent_holder_did,
            verifier_did = %consent.verifier_did,
            consent_id = %consent_id,
            "Failed to update presentations after consent change; continuing without presentation sync",
        );
    }

    let remaining_vec_option = if remaining_scope.is_empty() {
        None
    } else {
        Some(&remaining_scope)
    };

    let wallet_activity_service = state.wallet_activity_service();
    let tx_hash_value = tx_hash.clone().unwrap_or_default();

    let revoked_count = revoked_attrs.len();
    let remaining_count = remaining_vec_option.map(|v| v.len());

    record_wallet_activity(
        &wallet_activity_service,
        NewWalletActivity {
            holder_did: consent_holder_did.clone(),
            activity_type: WalletActivityType::CredentialRevoked,
            status: WalletActivityStatus::Completed,
            title: if revoke_type == "partial" {
                format!("Consent attributes revoked for {}", consent.purpose)
            } else {
                format!("Consent revoked for {}", consent.purpose)
            },
            description: if revoke_type == "partial" {
                format!(
                    "Revoked {} attribute(s) from consent shared with {}",
                    revoked_count,
                    consent.verifier_did
                )
            } else {
                format!(
                    "Revoked consent for {} with {}",
                    consent.purpose, consent.verifier_did
                )
            },
            metadata: build_metadata(
                &consent_holder_did,
                &consent.verifier_did,
                &consent_id,
                &tx_hash_value,
                Some(&revoked_attrs),
                remaining_vec_option,
            ),
            sanitized_metadata: build_sanitized_metadata(
                &consent.verifier_did,
                &consent.purpose,
                Some(revoked_count),
                remaining_count,
                revoke_type == "partial",
            ),
            created_at: Some(now),
        },
    )
    .await;

    let message = match revoke_type {
        "partial" => format!(
            "{} attribute(s) revoked",
            revoked_attrs.len()
        ),
        _ => "Consent revoked successfully".to_string(),
    };

    let response_payload = if revoke_type == "partial" {
        json!({
            "success": true,
            "message": message,
            "revoke_type": revoke_type,
            "revoked_attributes": revoked_attrs,
            "remaining_attributes": remaining_scope,
        })
    } else {
        let mut payload = json!({
            "success": true,
            "message": message,
            "revoke_type": revoke_type,
            "revoked_attributes": revoked_attrs,
            "remaining_attributes": remaining_scope,
        });

        if let Some(hash) = tx_hash {
            if let Some(map) = payload.as_object_mut() {
                map.insert("tx_hash".to_string(), json!(hash));
            }
        }

        payload
    };

    Ok((StatusCode::OK, Json(response_payload)))
}

/// Get statistics handler
async fn get_statistics(
    State(state): State<AppState>,
    Path(did): Path<String>,
) -> Result<(StatusCode, Json<serde_json::Value>), AppError> {
    let wallet_service = state.wallet_service();
    let statistics = wallet_service.get_wallet_statistics(&did).await?;

    Ok((
        StatusCode::OK,
        Json(json!({
            "success": true,
            "statistics": statistics,
        })),
    ))
}

/// Backup wallet handler
async fn backup_wallet(
    State(state): State<AppState>,
    Path(did): Path<String>,
    Json(request): Json<BackupWalletRequest>,
) -> Result<(StatusCode, Json<serde_json::Value>), AppError> {
    let wallet_service = state.wallet_service();
    let backup_data = wallet_service
        .generate_backup(&did, &request.password)
        .await?;

    Ok((
        StatusCode::OK,
        Json(json!({
            "success": true,
            "message": "Wallet backup generated successfully",
            "backup_data": backup_data,
        })),
    ))
}

/// Restore wallet handler
async fn restore_wallet(
    State(state): State<AppState>,
    Json(request): Json<RestoreWalletRequest>,
) -> Result<(StatusCode, Json<serde_json::Value>), AppError> {
    let wallet_service = state.wallet_service();
    let wallet = wallet_service
        .restore_backup(&request.backup_data, &request.password)
        .await?;

    Ok((
        StatusCode::OK,
        Json(json!({
            "success": true,
            "message": "Wallet restored successfully",
            "wallet": wallet,
        })),
    ))
}

/// Scan QR code handler
async fn scan_qr_code(
    State(state): State<AppState>,
    Json(request): Json<ScanQrCodeRequest>,
) -> Result<(StatusCode, Json<serde_json::Value>), AppError> {
    let wallet_service = state.wallet_service();
    let result = wallet_service.scan_qr_code(&request.qr_data).await?;

    Ok((
        StatusCode::OK,
        Json(json!({
            "success": true,
            "result": result,
        })),
    ))
}
#[derive(Debug, Deserialize)]
pub struct AcceptOfferRequest {
    pub holder_did: String,
    pub proof: ProofRequest,
    #[serde(default)]
    pub holder_data: HashMap<String, serde_json::Value>,
    #[serde(default)]
    pub evidence: Vec<CredentialEvidenceInput>,
}

/// Upload credential evidence to IPFS and return metadata
async fn upload_evidence(
    State(state): State<AppState>,
    Path(did): Path<String>,
    mut multipart: Multipart,
) -> Result<(StatusCode, Json<serde_json::Value>), AppError> {
    let holder_did = normalize_did(&did)?;

    let mut label: Option<String> = None;
    let mut filename: Option<String> = None;
    let mut content_type: Option<String> = None;
    let mut file_bytes: Option<Vec<u8>> = None;

    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|e| AppError::InternalError(format!("Failed to read multipart data: {}", e)))?
    {
        let name = field.name().unwrap_or("");

        match name {
            "label" => {
                let value = field
                    .text()
                    .await
                    .map_err(|e| AppError::ValidationError(format!("Invalid label field: {}", e)))?;
                label = if value.trim().is_empty() {
                    None
                } else {
                    Some(value.trim().to_string())
                };
            }
            "file" => {
                filename = field.file_name().map(|s| s.to_string());
                content_type = field.content_type().map(|s| s.to_string());
                let data = field
                    .bytes()
                    .await
                    .map_err(|e| AppError::InternalError(format!("Failed to read file bytes: {}", e)))?;
                file_bytes = Some(data.to_vec());
            }
            _ => {
            }
        }
    }

    let file_data = file_bytes.ok_or_else(|| {
        AppError::ValidationError("Multipart request must include a 'file' field".to_string())
    })?;

    let size = file_data.len() as u64;

    let upload_service = state.upload_service();
    let (ipfs_hash, gateway_url) = upload_service
        .upload_file(file_data, content_type.as_deref())
        .await?;

    let effective_filename = filename
        .clone()
        .unwrap_or_else(|| format!("evidence-{}.bin", ipfs_hash.chars().take(8).collect::<String>()));

    let effective_label = label
        .clone()
        .unwrap_or_else(|| effective_filename.clone());

    Ok((
        StatusCode::OK,
        Json(json!({
            "success": true,
            "message": "Evidence uploaded successfully",
            "owner_did": holder_did,
            "evidence": {
                "label": effective_label,
                "filename": effective_filename,
                "ipfs_hash": ipfs_hash,
                "gateway_url": gateway_url,
                "content_type": content_type,
                "size": size,
            }
        })),
    ))
}

#[derive(Debug, Deserialize)]
pub struct ProofRequest {
    #[serde(rename = "type")]
    pub type_: String,
    pub nonce: String,
    pub signature: String,
    #[serde(default)]
    pub did: Option<String>,
}

async fn get_offer_challenge(
    State(state): State<AppState>,
    Path(offer_id): Path<String>,
) -> Result<(StatusCode, Json<serde_json::Value>), AppError> {
    let offer = state
        .db
        .find_one::<CredentialOffer>("credential_offers", mongodb::bson::doc! { "id": &offer_id })
        .await?
        .ok_or_else(|| AppError::NotFoundError("Offer not found".to_string()))?;

    if let Some(expires_at) = offer.expires_at {
        if Utc::now() > expires_at {
            return Err(AppError::ValidationError("Offer has expired".to_string()));
        }
    }

    if offer.one_time_used {
        return Err(AppError::ValidationError(
            "Offer has already been used".to_string(),
        ));
    }

    if offer.status != OfferStatus::Pending {
        return Err(AppError::ValidationError(format!(
            "Offer is not pending (status: {:?})",
            offer.status
        )));
    }

    let nonce_b64 = {
        let mut rng = rand::thread_rng();
        let nonce_bytes: [u8; 32] = rng.gen();
        base64::encode(nonce_bytes)
    };

    let now = Utc::now();
    let expires = now + chrono::Duration::seconds(300);
    let nonce_doc = mongodb::bson::doc! {
        "offer_id": &offer_id,
        "nonce": &nonce_b64,
        "created_at": mongodb::bson::DateTime::from_millis(now.timestamp_millis()),
        "expires_at": mongodb::bson::DateTime::from_millis(expires.timestamp_millis()),
    };

    loop {
        let deleted = state
            .db
            .delete_one(
                "offer_nonces",
                mongodb::bson::doc! { "offer_id": &offer_id },
            )
            .await?;
        if !deleted {
            break;
        }
    }
    state.db.insert_one("offer_nonces", &nonce_doc).await?;

    Ok((
        StatusCode::OK,
        Json(json!({
            "nonce": nonce_b64,
            "did_methods": vec!["did:key", "did:alyra"],
            "expires_in": 300,
        })),
    ))
}

async fn accept_offer(
    State(state): State<AppState>,
    Path(offer_id): Path<String>,
    Json(request): Json<AcceptOfferRequest>,
) -> Result<(StatusCode, Json<serde_json::Value>), AppError> {
    let offer = state
        .db
        .find_one::<CredentialOffer>("credential_offers", mongodb::bson::doc! { "id": &offer_id })
        .await?
        .ok_or_else(|| AppError::NotFoundError("Offer not found".to_string()))?;

    if offer.status != OfferStatus::Pending {
        return Err(AppError::ValidationError(format!(
            "Offer is not pending (status: {:?})",
            offer.status
        )));
    }

    if let Some(expires_at) = offer.expires_at {
        if Utc::now() > expires_at {
            state
                .db
                .update_one(
                    "credential_offers",
                    mongodb::bson::doc! { "id": &offer_id },
                    mongodb::bson::doc! { "$set": { "status": "expired" } },
                )
                .await?;
            return Err(AppError::ValidationError("Offer has expired".to_string()));
        }
    }

    if offer.one_time_used {
        return Err(AppError::ValidationError(
            "Offer has already been used".to_string(),
        ));
    }

    let nonce_docs = state
        .db
        .find_many::<mongodb::bson::Document>(
            "offer_nonces",
            mongodb::bson::doc! { "offer_id": &offer_id },
        )
        .await?;
    if nonce_docs.is_empty() {
        return Err(AppError::ValidationError(
            "Nonce not found or expired".to_string(),
        ));
    }
    let latest = nonce_docs
        .into_iter()
        .max_by_key(|doc| {
            doc.get_datetime("created_at")
                .map(|dt| dt.timestamp_millis())
                .unwrap_or(0)
        })
        .unwrap();
    let stored_nonce = latest
        .get_str("nonce")
        .map_err(|_| AppError::ValidationError("Invalid nonce format".to_string()))?;

    if stored_nonce != request.proof.nonce {
        return Err(AppError::ValidationError("Nonce mismatch".to_string()));
    }

    let nonce_message = request.proof.nonce.as_bytes();
    let sig_bytes = base64::decode(&request.proof.signature)
        .map_err(|e| AppError::ValidationError(format!("Invalid signature (base64): {}", e)))?;

    let verify_did = request.proof.did.as_deref().unwrap_or(&request.holder_did);

    if verify_did.starts_with("did:key:") && request.proof.type_.to_lowercase().contains("ed25519")
    {
        let pk_bytes = ed25519_pubkey_from_did_key(verify_did).ok_or_else(|| {
            AppError::ValidationError("Unsupported or invalid did:key for Ed25519".to_string())
        })?;
        let pk = Ed25519PublicKey::from_bytes(&pk_bytes)
            .map_err(|_| AppError::ValidationError("Invalid Ed25519 public key".to_string()))?;
        let sig = Ed25519Signature::from_bytes(&sig_bytes)
            .map_err(|_| AppError::ValidationError("Invalid Ed25519 signature".to_string()))?;
        pk.verify(nonce_message, &sig)
            .map_err(|_| AppError::ValidationError("Signature verification failed".to_string()))?;
        tracing::info!("Signature verified: did:key (Ed25519)");
    } else if verify_did.starts_with("did:alyra:") {
        let wallet = state
            .db
            .find_wallet_by_did(verify_did)
            .await?
            .ok_or_else(|| {
                AppError::ValidationError("Wallet not found for holder DID".to_string())
            })?;

        let public_key_b58 = &wallet.dilithium_public_key;

        let dilithium_result = alyra_did::verify(nonce_message, &sig_bytes, &public_key_b58);

        if let Ok(true) = dilithium_result {
            tracing::info!("Signature verified: did:alyra");
        } else {
            if sig_bytes.len() == 64 {
                if let Ok(pk_decoded) = bs58::decode(&public_key_b58).into_vec() {
                    if pk_decoded.len() == 32 {
                        if let Ok(pk) = Ed25519PublicKey::from_bytes(&pk_decoded) {
                            if let Ok(sig) = Ed25519Signature::from_bytes(&sig_bytes) {
                                if pk.verify(nonce_message, &sig).is_ok() {
                                    tracing::info!(
                                        "Signature verified: did:alyra"
                                    );
                                } else {
                                    return Err(AppError::ValidationError(
                                        "Ed25519 signature verification failed".to_string(),
                                    ));
                                }
                            } else {
                                return Err(AppError::ValidationError(
                                    "Invalid Ed25519 signature format".to_string(),
                                ));
                            }
                        } else {
                            return Err(AppError::ValidationError(
                                "Invalid Ed25519 public key format".to_string(),
                            ));
                        }
                    } else if pk_decoded.len() == 1312 {
                        return Err(AppError::ValidationError(
                            "Dilithium signature verification failed".to_string(),
                        ));
                    } else {
                        return Err(AppError::ValidationError(format!(
                            "Unexpected public key length: {}",
                            pk_decoded.len()
                        )));
                    }
                } else {
                    return Err(AppError::ValidationError(
                        "Cannot decode public key from base58".to_string(),
                    ));
                }
            } else {
                return Err(AppError::ValidationError(format!(
                    "Invalid signature length: {} (expected 64 for Ed25519)",
                    sig_bytes.len()
                )));
            }
        }
    } else {
        warn!(
            "Unknown DID method for signature verification: {}",
            request.holder_did
        );
        return Err(AppError::ValidationError(
            "Unsupported DID method for signature verification".to_string(),
        ));
    }

    let template = state
        .db
        .find_one::<CredentialTemplate>(
            "credential_templates",
            mongodb::bson::doc! { "id": &offer.template_id },
        )
        .await?
        .ok_or_else(|| {
            AppError::NotFoundError(format!("Template {} not found", offer.template_id))
        })?;

    let evidence_required = template.evidence_required.clone();
    let extensions = template.extensions.clone();
    let normalized_evidence: Vec<CredentialEvidenceInput> = request
        .evidence
        .iter()
        .map(|att| CredentialEvidenceInput {
            label: att.label.trim().to_string(),
            filename: att.filename.clone(),
            ipfs_hash: att.ipfs_hash.clone(),
            gateway_url: att.gateway_url.clone(),
            content_type: att.content_type.clone(),
            size: att.size,
        })
        .collect();

    if !evidence_required.is_empty() {
        if normalized_evidence.is_empty() {
            return Err(AppError::ValidationError(
                "Evidence is required for this credential offer".to_string(),
            ));
        }

        let provided_labels: HashSet<String> = normalized_evidence
            .iter()
            .map(|att| att.label.to_lowercase())
            .collect();

        let mut missing_labels = Vec::new();
        for required_label in &evidence_required {
            if !provided_labels.contains(&required_label.trim().to_lowercase()) {
                missing_labels.push(required_label.clone());
            }
        }

        if !missing_labels.is_empty() {
            return Err(AppError::ValidationError(format!(
                "Missing evidence for: {}",
                missing_labels.join(", ")
            )));
        }
    }

    for (field_name, _) in &request.holder_data {
        let field = template
            .fields
            .iter()
            .find(|f| &f.name == field_name)
            .ok_or_else(|| {
                AppError::ValidationError(format!("Field '{}' not found in template", field_name))
            })?;

        if field.source != FieldSource::HolderInput {
            return Err(AppError::ValidationError(format!(
                "Field '{}' is not a holder_input field",
                field_name
            )));
        }
    }

    let required_holder_fields: Vec<&str> = template
        .fields
        .iter()
        .filter(|f| f.source == FieldSource::HolderInput && f.required)
        .map(|f| f.name.as_str())
        .collect();

    for required_field in required_holder_fields {
        if !request.holder_data.contains_key(required_field) {
            return Err(AppError::ValidationError(format!(
                "Required field '{}' is missing",
                required_field
            )));
        }
    }

    let mut complete_attributes = offer.issuer_data.clone().unwrap_or_default();
    complete_attributes.extend(request.holder_data.clone());

    tracing::info!(
        "Merged data: issuer_fields={}, holder_fields={}, total_fields={}",
        offer.issuer_data.as_ref().map(|d| d.len()).unwrap_or(0),
        request.holder_data.len(),
        complete_attributes.len()
    );

    tracing::info!(
        "Issuing credential: holder_did={}, type={}, schema={}",
        request.holder_did,
        offer.credential_type,
        offer.schema_id
    );

    tracing::info!(
        "holder_did format: {}, length: {}, starts_with: {}",
        request.holder_did,
        request.holder_did.len(),
        request.holder_did.chars().take(20).collect::<String>()
    );

    let credential_service = state.credential_service();
    let credential = credential_service
        .issue_credential(
            &offer.issuer_did,
            IssueCredentialRequest {
                credential_type: offer.credential_type.clone(),
                schema_id: offer.schema_id.clone(),
                subject_did: Some(request.holder_did.clone()),
                template_id: Some(offer.template_id.clone()),
                attributes: complete_attributes,
                expiration_date: None,
                evidence: normalized_evidence.clone(),
                evidence_required: evidence_required.clone(),
                extensions,
            },
        )
        .await?;

    let credential_id = credential.credential.id.clone();

    tracing::info!(
        "Credential created: id={}, owner_did={}, ipfs_hash={:?}",
        credential_id,
        credential.credential.owner_did,
        credential.ipfs_hash
    );

    tracing::info!(
        "Credential saved to MongoDB with owner_did={}",
        credential.credential.owner_did
    );

    tracing::info!(
        "Credential issued: id={}, type={}, holder={}",
        credential_id,
        offer.credential_type,
        request.holder_did
    );

    let now = Utc::now();
    let update = mongodb::bson::doc! {
        "$set": {
            "recipient_did": &request.holder_did,
            "accepted_by_did": &request.holder_did,
            "accepted_at": mongodb::bson::DateTime::from_millis(now.timestamp_millis()),
            "status": "completed",
            "one_time_used": true,
            "credential_id": &credential_id,
        }
    };

    state
        .db
        .update_one(
            "credential_offers",
            mongodb::bson::doc! { "id": &offer_id },
            update,
        )
        .await?;

    state
        .db
        .delete_one(
            "offer_nonces",
            mongodb::bson::doc! { "offer_id": &offer_id },
        )
        .await?;

    tracing::info!(
        "Offer {} completed: credential={}, holder={}, time={}",
        offer_id,
        credential_id,
        request.holder_did,
        now
    );

    tracing::info!(
        "offer={}, credential={}, holder={}, saved_to_mongodb=YES",
        offer_id,
        credential_id,
        request.holder_did
    );

    Ok((
        StatusCode::OK,
        Json(json!({
            "success": true,
            "credential_id": credential_id,
            "credential": credential,
            "message": "Credential issued successfully",
            "offer_id": offer_id,
            "recipient_did": request.holder_did,
            "accepted_at": now,
            "debug": {
                "owner_did": credential.credential.owner_did,
                "credential_type": offer.credential_type,
                "ipfs_hash": credential.ipfs_hash,
            }
        })),
    ))
}