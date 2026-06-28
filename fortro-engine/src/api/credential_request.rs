use axum::{
    extract::{Json, Path, State},
    http::StatusCode,
    routing::{get, post},
    Router,
};
use base64;
use chrono::{DateTime, Utc};
use ed25519_dalek::{PublicKey as Ed25519PublicKey, Signature as Ed25519Signature, Verifier};
use rand::Rng;
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::collections::{HashMap, HashSet};
use crate::error::AppError;
use crate::models::{
    CredentialEvidence, CredentialRequest, CredentialRequestStatus, WalletActivityStatus,
    WalletActivityType,
};
use crate::services::{credential::CredentialEvidenceInput, AppState};
use crate::services::wallet_activity::NewWalletActivity;
use crate::utils::did as alyra_did;
use crate::utils::did_compat::normalize_did;
use tracing::warn;

/// Submit credential request
#[derive(Debug, Deserialize)]
pub struct SubmitCredentialRequest {
    pub user_did: String,
    pub issuer_did: String,
    pub template_id: String,
    pub schema_id: String,
    pub credential_type: String,
    pub request_data: HashMap<String, String>,
    pub timestamp: String,
    #[serde(default)]
    pub evidence: Vec<CredentialEvidenceInput>,
    #[serde(default)]
    pub evidence_required: Vec<String>,
}

async fn resolve_issuer_display(state: &AppState, issuer_did: &str) -> String {
    if let Ok(Some(issuer_doc)) = state
        .db()
        .find_one::<serde_json::Value>("issuers", mongodb::bson::doc! { "id": issuer_did })
        .await
    {
        if let Some(name) = issuer_doc.get("name").and_then(|v| v.as_str()) {
            let trimmed = name.trim();
            if !trimmed.is_empty() {
                return trimmed.to_string();
            }
        }

        if let Some(display) = issuer_doc.get("display_name").and_then(|v| v.as_str()) {
            let trimmed = display.trim();
            if !trimmed.is_empty() {
                return trimmed.to_string();
            }
        }

        if let Some(organization) = issuer_doc.get("organization").and_then(|v| v.as_str()) {
            let trimmed = organization.trim();
            if !trimmed.is_empty() {
                return trimmed.to_string();
            }
        }

        if let Some(alias) = issuer_doc.get("alias").and_then(|v| v.as_str()) {
            let trimmed = alias.trim();
            if !trimmed.is_empty() {
                return trimmed.to_string();
            }
        }
    }

    issuer_did
        .split(':')
        .last()
        .unwrap_or(issuer_did)
        .to_string()
}

/// Credential request response
#[derive(Debug, Serialize)]
pub struct CredentialRequestResponse {
    pub request_id: String,
    pub status: String,
    pub message: String,
    pub created_at: DateTime<Utc>,
}

/// Proof request for signature verification
#[derive(Debug, Deserialize)]
pub struct ProofRequest {
    #[serde(rename = "type")]
    pub type_: String,
    pub nonce: String,
    pub signature: String,
    #[serde(default)]
    pub did: Option<String>,
    #[serde(default, rename = "publicKey")]
    pub public_key: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct ApproveRejectRequest {
    pub proof: ProofRequest,
    #[serde(default)]
    pub reason: Option<String>,
    #[serde(default)]
    pub issuer_data: Option<serde_json::Value>,
    #[serde(default)]
    pub evidence: Vec<CredentialEvidenceInput>,
}

/// Create credential request routes
pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/credential-request", post(submit_request))
        .route("/:did/credential-requests", get(get_user_requests))
        .route(
            "/:did/credential-request/:request_id",
            get(get_request_status),
        )
        .route("/issuer/:issuer_did/requests", get(get_issuer_requests))
        .route(
            "/issuer/:issuer_did/request/:request_id",
            get(get_issuer_request_detail),
        )
        .route(
            "/issuer/:issuer_did/request/:request_id/challenge",
            get(get_request_challenge),
        )
        .route(
            "/issuer/:issuer_did/request/:request_id/approve",
            post(approve_request),
        )
        .route(
            "/issuer/:issuer_did/request/:request_id/reject",
            post(reject_request),
        )
}

/// Submit a new credential request
async fn submit_request(
    State(state): State<AppState>,
    Json(request): Json<SubmitCredentialRequest>,
) -> Result<(StatusCode, Json<serde_json::Value>), AppError> {
    let user_did = normalize_did(&request.user_did)?;
    let issuer_did = normalize_did(&request.issuer_did)?;

    // Create credential request with template_id
    let mut credential_request = CredentialRequest::with_template(
        user_did.clone(),
        issuer_did.clone(),
        request.credential_type.clone(),
        request.schema_id.clone(),
        request
            .request_data
            .clone()
            .into_iter()
            .map(|(k, v)| (k, json!(v)))
            .collect(),
        request.template_id.clone(),
    );

    credential_request.evidence = request
        .evidence
        .iter()
        .map(|attachment| attachment.to_model())
        .collect();

    credential_request.evidence_required = request
        .evidence_required
        .iter()
        .map(|label| label.trim())
        .filter(|label| !label.is_empty())
        .map(|label| label.to_string())
        .collect();

    // Store in database
    let db = state.db();
    db.create_credential_request(&credential_request).await?;

    tracing::info!(
        "New credential request {} from {} to issuer {}",
        credential_request.id,
        user_did,
        issuer_did
    );

    let wallet_activity_service = state.wallet_activity_service();
    let issuer_display = resolve_issuer_display(&state, &issuer_did).await;

    let mut metadata = HashMap::new();
    metadata.insert("issuer_did".to_string(), issuer_did.clone());
    metadata.insert(
        "request_id".to_string(),
        credential_request.id.clone(),
    );
    if let Some(template_id) = &credential_request.template_id {
        metadata.insert("template_id".to_string(), template_id.clone());
    }
    metadata.insert(
        "credential_type".to_string(),
        credential_request.credential_type.clone(),
    );

    let mut sanitized_metadata = HashMap::new();
    sanitized_metadata.insert("issuer_name".to_string(), issuer_display.clone());
    sanitized_metadata.insert(
        "credential_type".to_string(),
        credential_request.credential_type.clone(),
    );
    sanitized_metadata.insert(
        "summary".to_string(),
        format!(
            "Requested {} from {}",
            credential_request.credential_type, issuer_display
        ),
    );

    if let Err(error) = wallet_activity_service
        .record_activity(NewWalletActivity {
            holder_did: user_did.clone(),
            activity_type: WalletActivityType::CredentialRequested,
            status: WalletActivityStatus::Pending,
            title: format!(
                "Requested {} credential",
                credential_request.credential_type
            ),
            description: format!(
                "Sent credential request to {}",
                issuer_display
            ),
            metadata,
            sanitized_metadata,
            created_at: Some(credential_request.created_at),
        })
        .await
    {
        warn!(
            error = ?error,
            "failed to record credential request wallet activity"
        );
    }

    Ok((
        StatusCode::CREATED,
        Json(json!({
            "success": true,
            "request_id": credential_request.id,
            "status": "pending",
            "message": "Credential request submitted successfully",
            "created_at": credential_request.created_at,
        })),
    ))
}

/// Get all credential requests for a user
async fn get_user_requests(
    State(state): State<AppState>,
    Path(did): Path<String>,
) -> Result<(StatusCode, Json<serde_json::Value>), AppError> {
    let normalized_did = normalize_did(&did)?;
    let db = state.db();

    let requests = db.find_credential_requests_by_user(&normalized_did).await?;

    Ok((
        StatusCode::OK,
        Json(json!({
            "success": true,
            "requests": requests,
        })),
    ))
}

/// Get status of a specific credential request
async fn get_request_status(
    State(state): State<AppState>,
    Path((did, request_id)): Path<(String, String)>,
) -> Result<(StatusCode, Json<serde_json::Value>), AppError> {
    let normalized_did = normalize_did(&did)?;
    let db = state.db();

    let request = db
        .find_credential_request(&request_id)
        .await?
        .ok_or_else(|| AppError::NotFoundError(format!("Request {} not found", request_id)))?;

    // Verify the request belongs to this user
    if request.user_did != normalized_did {
        return Err(AppError::UnauthorizedError(
            "Request does not belong to this user".to_string(),
        ));
    }

    Ok((
        StatusCode::OK,
        Json(json!({
            "success": true,
            "request": request,
        })),
    ))
}

/// Get a specific credential request detail
async fn get_issuer_request_detail(
    State(state): State<AppState>,
    Path((issuer_did, request_id)): Path<(String, String)>,
) -> Result<(StatusCode, Json<serde_json::Value>), AppError> {
    let normalized_did = normalize_did(&issuer_did)?;
    let db = state.db();

    let request = db
        .find_credential_request(&request_id)
        .await?
        .ok_or_else(|| AppError::NotFoundError(format!("Request {} not found", request_id)))?;

    // Verify the request is for this issuer
    if request.issuer_did != normalized_did {
        return Err(AppError::UnauthorizedError(
            "Request is not for this issuer".to_string(),
        ));
    }

    Ok((
        StatusCode::OK,
        Json(json!({
            "success": true,
            "request": request,
        })),
    ))
}

/// Get all pending requests for an issuer
async fn get_issuer_requests(
    State(state): State<AppState>,
    Path(issuer_did): Path<String>,
) -> Result<(StatusCode, Json<serde_json::Value>), AppError> {
    let normalized_did = normalize_did(&issuer_did)?;
    let db = state.db();

    let requests = db
        .find_credential_requests_by_issuer(&normalized_did)
        .await?;

    // Filter for pending requests
    let pending_requests: Vec<_> = requests
        .into_iter()
        .filter(|r| matches!(r.status, CredentialRequestStatus::Pending))
        .collect();

    Ok((
        StatusCode::OK,
        Json(json!({
            "success": true,
            "requests": pending_requests,
            "total": pending_requests.len(),
        })),
    ))
}

async fn get_request_challenge(
    State(state): State<AppState>,
    Path((issuer_did, request_id)): Path<(String, String)>,
) -> Result<(StatusCode, Json<serde_json::Value>), AppError> {
    let normalized_did = normalize_did(&issuer_did)?;
    let db = state.db();

    // Get the request
    let request = db
        .find_credential_request(&request_id)
        .await?
        .ok_or_else(|| AppError::NotFoundError(format!("Request {} not found", request_id)))?;

    // Verify the request is for this issuer
    if request.issuer_did != normalized_did {
        return Err(AppError::UnauthorizedError(
            "Request is not for this issuer".to_string(),
        ));
    }

    // Validate request status
    if !matches!(request.status, CredentialRequestStatus::Pending) {
        return Err(AppError::ValidationError(format!(
            "Request is not pending (status: {:?})",
            request.status
        )));
    }

    // Generate nonce
    let nonce_b64 = {
        let mut rng = rand::thread_rng();
        let nonce_bytes: [u8; 32] = rng.gen();
        base64::encode(nonce_bytes)
    };

    // Store nonce with TTL
    let now = Utc::now();
    let expires = now + chrono::Duration::seconds(300);
    let nonce_doc = mongodb::bson::doc! {
        "request_id": &request_id,
        "nonce": &nonce_b64,
        "created_at": mongodb::bson::DateTime::from_millis(now.timestamp_millis()),
        "expires_at": mongodb::bson::DateTime::from_millis(expires.timestamp_millis()),
    };

    // Delete existing nonces for this request
    loop {
        let deleted = db
            .delete_one(
                "verification_nonces",
                mongodb::bson::doc! { "request_id": &request_id },
            )
            .await?;
        if !deleted {
            break;
        }
    }
    db.insert_one("verification_nonces", &nonce_doc).await?;

    tracing::info!(
        "Generated challenge for request {} by issuer {}",
        request_id,
        normalized_did
    );

    Ok((
        StatusCode::OK,
        Json(json!({
            "nonce": nonce_b64,
            "did_methods": vec!["did:key", "did:alyra"],
            "expires_in": 300,
            "request_id": request_id,
        })),
    ))
}

/// Approve a credential request
async fn approve_request(
    State(state): State<AppState>,
    Path((issuer_did, request_id)): Path<(String, String)>,
    Json(data): Json<ApproveRejectRequest>,
) -> Result<(StatusCode, Json<serde_json::Value>), AppError> {
    let normalized_did = normalize_did(&issuer_did)?;
    let db = state.db();

    // Get the request
    let mut request = db
        .find_credential_request(&request_id)
        .await?
        .ok_or_else(|| AppError::NotFoundError(format!("Request {} not found", request_id)))?;

    // Verify the request is for this issuer
    if request.issuer_did != normalized_did {
        return Err(AppError::UnauthorizedError(
            "Request is not for this issuer".to_string(),
        ));
    }

    // Verify nonce exists
    let nonce_docs = db
        .find_many::<mongodb::bson::Document>(
            "verification_nonces",
            mongodb::bson::doc! { "request_id": &request_id },
        )
        .await?;
    if nonce_docs.is_empty() {
        return Err(AppError::ValidationError(
            "Nonce not found or expired. Please request a new challenge.".to_string(),
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

    if stored_nonce != data.proof.nonce {
        return Err(AppError::ValidationError("Nonce mismatch".to_string()));
    }

    // Verify signature
    let nonce_message = data.proof.nonce.as_bytes();
    let sig_bytes = base64::decode(&data.proof.signature)
        .map_err(|e| AppError::ValidationError(format!("Invalid signature (base64): {}", e)))?;

    let verify_did = data.proof.did.as_deref().unwrap_or(&issuer_did);

    if verify_did.starts_with("did:key:") && data.proof.type_.to_lowercase().contains("ed25519") {
        // Ed25519 verification for did:key
        let pk_bytes =
            crate::api::wallet::ed25519_pubkey_from_did_key(verify_did).ok_or_else(|| {
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
        if sig_bytes.len() == 64 {
            if let Some(public_key_b64) = &data.proof.public_key {
                let pk_bytes = base64::decode(public_key_b64).map_err(|_| {
                    AppError::ValidationError("Invalid Ed25519 public key (base64)".to_string())
                })?;

                if pk_bytes.len() != 32 {
                    return Err(AppError::ValidationError(format!(
                        "Invalid Ed25519 public key length: {} (expected 32)",
                        pk_bytes.len()
                    )));
                }

                let pk = Ed25519PublicKey::from_bytes(&pk_bytes).map_err(|_| {
                    AppError::ValidationError("Invalid Ed25519 public key format".to_string())
                })?;
                let sig = Ed25519Signature::from_bytes(&sig_bytes).map_err(|_| {
                    AppError::ValidationError("Invalid Ed25519 signature format".to_string())
                })?;

                pk.verify(nonce_message, &sig).map_err(|_| {
                    AppError::ValidationError("Ed25519 signature verification failed".to_string())
                })?;

                tracing::info!(" Signature verified: did:alyra (Ed25519 from proof.publicKey)");
            } else {
                return Err(AppError::ValidationError(
                    "Ed25519 public key not provided in proof".to_string(),
                ));
            }
        } else {
            // Dilithium signature try to verify with Dilithium public key from database
            let public_key_b58 = if let Some(wallet) = db.find_wallet_by_did(verify_did).await? {
                wallet.dilithium_public_key
            } else if let Some(issuer) = db.find_issuer_by_did(verify_did).await? {
                issuer
                    .get_str("public_key")
                    .map_err(|_| {
                        AppError::ValidationError("Issuer public key not found".to_string())
                    })?
                    .to_string()
            } else if let Some(verifier) = db.find_verifier_by_did(verify_did).await? {
                verifier
                    .get_str("public_key")
                    .map_err(|_| {
                        AppError::ValidationError("Verifier public key not found".to_string())
                    })?
                    .to_string()
            } else {
                return Err(AppError::ValidationError(
                    "DID not found in any collection".to_string(),
                ));
            };

            let dilithium_result = alyra_did::verify(nonce_message, &sig_bytes, &public_key_b58);

            if let Ok(true) = dilithium_result {
                tracing::info!("Signature verified: did:alyra");
            } else {
                return Err(AppError::ValidationError(
                    "Dilithium signature verification failed".to_string(),
                ));
            }
        }
    } else {
        return Err(AppError::ValidationError(
            "Unsupported DID method for signature verification".to_string(),
        ));
    }

    // Delete nonce
    db.delete_one(
        "verification_nonces",
        mongodb::bson::doc! { "request_id": &request_id },
    )
    .await?;

    let mut normalized_evidence_inputs: Vec<CredentialEvidenceInput> = Vec::new();
    let mut normalized_evidence_models: Vec<CredentialEvidence> = Vec::new();
    let mut evidence_required: Vec<String> = Vec::new();

    if let Some(template_id) = &request.template_id {
        if let Ok(Some(template_doc)) = db
            .find_one::<mongodb::bson::Document>(
                "credential_templates",
                mongodb::bson::doc! { "id": template_id },
            )
            .await
        {
            if let Ok(fields_arr) = template_doc.get_array("fields") {
                let mut missing_fields = Vec::new();

                for field_doc in fields_arr {
                    if let Some(field_obj) = field_doc.as_document() {
                        let source = field_obj.get_str("source").unwrap_or("holder_input");
                        if source == "issuer_input" {
                            let field_name = field_obj.get_str("name").unwrap_or("unknown");
                            let required = field_obj.get_bool("required").unwrap_or(false);

                            if required {
                                let has_value = if let Some(issuer_data_obj) = &data.issuer_data {
                                    if let Some(obj) = issuer_data_obj.as_object() {
                                        obj.contains_key(field_name) && !obj[field_name].is_null()
                                    } else {
                                        false
                                    }
                                } else {
                                    false
                                };

                                if !has_value {
                                    missing_fields.push(field_name.to_string());
                                }
                            }
                        }
                    }
                }

                if !missing_fields.is_empty() {
                    tracing::warn!("Missing required issuer fields: {:?}", missing_fields);
                    return Err(AppError::ValidationError(format!(
                        "Missing required issuer fields: {}",
                        missing_fields.join(", ")
                    )));
                }
            }

            evidence_required = template_doc
                .get_array("evidence_required")
                .map(|arr| {
                    arr.iter()
                        .filter_map(|val| val.as_str().map(|s| s.to_string()))
                        .collect::<Vec<_>>()
                })
                .unwrap_or_default();

            normalized_evidence_inputs = data
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

            normalized_evidence_models = normalized_evidence_inputs
                .iter()
                .map(|att| CredentialEvidence {
                    label: att.label.clone(),
                    filename: att.filename.clone(),
                    ipfs_hash: att.ipfs_hash.clone(),
                    gateway_url: att.gateway_url.clone(),
                    content_type: att.content_type.clone(),
                    size: att.size,
                })
                .collect();

            if !evidence_required.is_empty() {
                if normalized_evidence_inputs.is_empty() {
                    return Err(AppError::ValidationError(
                        "Evidence is required for this credential".to_string(),
                    ));
                }

                let provided_labels: HashSet<String> = normalized_evidence_inputs
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
        }
    }

    if let Some(issuer_data_obj) = &data.issuer_data {
        if let Some(obj) = issuer_data_obj.as_object() {
            for (key, value) in obj {
                request.request_data.insert(key.clone(), value.clone());
            }
        }
    }

    request.evidence = normalized_evidence_models.clone();
    request.evidence_required = evidence_required.clone();

    request.status = CredentialRequestStatus::Approved;
    request.processed_at = Some(Utc::now());

    db.update_credential_request(&request).await?;

    tracing::info!(
        "Request {} approved by issuer {} with signature verification",
        request_id,
        normalized_did
    );

    let credential_service = state.credential_service();
    let wallet_activity_service = state.wallet_activity_service();
    let issuer_display = resolve_issuer_display(&state, &normalized_did).await;

    let extensions = if let Some(template_id) = &request.template_id {
        match state
            .issuer_service()
            .get_credential_template(&normalized_did, template_id)
            .await
        {
            Ok(template) => template.extensions.clone(),
            Err(err) => {
                tracing::warn!(
                    "Failed to load template {} while approving request {}: {}",
                    template_id, request.id, err
                );
                Vec::new()
            }
        }
    } else {
        Vec::new()
    };

    let issue_request = crate::services::credential::IssueCredentialRequest {
        credential_type: request.credential_type.clone(),
        schema_id: request.schema_id.clone(),
        subject_did: Some(request.user_did.clone()),
        template_id: request.template_id.clone(),
        attributes: request.request_data.clone(),
        expiration_date: None,
        evidence: normalized_evidence_inputs.clone(),
        evidence_required: request.evidence_required.clone(),
        extensions,
    };

    let credential_response = credential_service
        .issue_credential(&normalized_did, issue_request)
        .await?;

    let mut approval_metadata = HashMap::new();
    approval_metadata.insert("issuer_did".to_string(), normalized_did.clone());
    approval_metadata.insert("request_id".to_string(), request.id.clone());
    if let Some(template_id) = &request.template_id {
        approval_metadata.insert("template_id".to_string(), template_id.clone());
    }
    approval_metadata.insert("schema_id".to_string(), request.schema_id.clone());
    approval_metadata.insert("status".to_string(), "approved".to_string());

    let mut approval_sanitized_metadata = HashMap::new();
    approval_sanitized_metadata.insert("issuer_name".to_string(), issuer_display.clone());
    approval_sanitized_metadata.insert(
        "credential_type".to_string(),
        request.credential_type.clone(),
    );
    approval_sanitized_metadata.insert("status".to_string(), "approved".to_string());
    approval_sanitized_metadata.insert(
        "summary".to_string(),
        format!(
            "{} credential request approved by {}",
            request.credential_type, issuer_display
        ),
    );

    if let Err(error) = wallet_activity_service
        .record_activity(NewWalletActivity {
            holder_did: request.user_did.clone(),
            activity_type: WalletActivityType::CredentialRequested,
            status: WalletActivityStatus::Completed,
            title: format!("{} credential request approved", request.credential_type),
            description: format!(
                "Issuer {} approved your credential request",
                issuer_display
            ),
            metadata: approval_metadata,
            sanitized_metadata: approval_sanitized_metadata,
            created_at: request.processed_at,
        })
        .await
    {
        warn!(
            error = ?error,
            "failed to record credential request approval activity"
        );
    }

    let mut metadata = HashMap::new();
    metadata.insert("issuer_did".to_string(), normalized_did.clone());
    metadata.insert("request_id".to_string(), request.id.clone());
    metadata.insert(
        "credential_id".to_string(),
        credential_response.credential.id.clone(),
    );
    metadata.insert(
        "schema_id".to_string(),
        request.schema_id.clone(),
    );
    if let Some(template_id) = &request.template_id {
        metadata.insert("template_id".to_string(), template_id.clone());
    }

    let mut sanitized_metadata = HashMap::new();
    sanitized_metadata.insert("issuer_name".to_string(), issuer_display.clone());
    sanitized_metadata.insert(
        "credential_type".to_string(),
        request.credential_type.clone(),
    );
    sanitized_metadata.insert(
        "credential_id".to_string(),
        credential_response.credential.id.clone(),
    );
    sanitized_metadata.insert(
        "summary".to_string(),
        format!(
            "{} credential issued by {}",
            request.credential_type, issuer_display
        ),
    );

    if let Err(error) = wallet_activity_service
        .record_activity(NewWalletActivity {
            holder_did: request.user_did.clone(),
            activity_type: WalletActivityType::CredentialIssued,
            status: WalletActivityStatus::Completed,
            title: format!("{} credential issued", request.credential_type),
            description: format!(
                "Credential issued by {}",
                issuer_display
            ),
            metadata,
            sanitized_metadata,
            created_at: Some(credential_response.credential.created_at),
        })
        .await
    {
        warn!(
            error = ?error,
            "failed to record credential issuance wallet activity"
        );
    }

    Ok((
        StatusCode::OK,
        Json(json!({
            "success": true,
            "message": "Request approved and credential issued",
            "credential_id": credential_response.credential.id,
            "request_id": request_id,
        })),
    ))
}

async fn reject_request(
    State(state): State<AppState>,
    Path((issuer_did, request_id)): Path<(String, String)>,
    Json(data): Json<ApproveRejectRequest>,
) -> Result<(StatusCode, Json<serde_json::Value>), AppError> {
    let normalized_did = normalize_did(&issuer_did)?;
    let db = state.db();

    let mut request = db
        .find_credential_request(&request_id)
        .await?
        .ok_or_else(|| AppError::NotFoundError(format!("Request {} not found", request_id)))?;

    if request.issuer_did != normalized_did {
        return Err(AppError::UnauthorizedError(
            "Request is not for this issuer".to_string(),
        ));
    }
    let nonce_docs = db
        .find_many::<mongodb::bson::Document>(
            "verification_nonces",
            mongodb::bson::doc! { "request_id": &request_id },
        )
        .await?;
    if nonce_docs.is_empty() {
        return Err(AppError::ValidationError(
            "Nonce not found or expired. Please request a new challenge.".to_string(),
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

    if stored_nonce != data.proof.nonce {
        return Err(AppError::ValidationError("Nonce mismatch".to_string()));
    }

    let nonce_message = data.proof.nonce.as_bytes();
    let sig_bytes = base64::decode(&data.proof.signature)
        .map_err(|e| AppError::ValidationError(format!("Invalid signature (base64): {}", e)))?;

    let verify_did = data.proof.did.as_deref().unwrap_or(&issuer_did);

    if verify_did.starts_with("did:key:") && data.proof.type_.to_lowercase().contains("ed25519") {
        let pk_bytes =
            crate::api::wallet::ed25519_pubkey_from_did_key(verify_did).ok_or_else(|| {
                AppError::ValidationError("Unsupported or invalid did:key for Ed25519".to_string())
            })?;
        let pk = Ed25519PublicKey::from_bytes(&pk_bytes)
            .map_err(|_| AppError::ValidationError("Invalid Ed25519 public key".to_string()))?;
        let sig = Ed25519Signature::from_bytes(&sig_bytes)
            .map_err(|_| AppError::ValidationError("Invalid Ed25519 signature".to_string()))?;
        pk.verify(nonce_message, &sig)
            .map_err(|_| AppError::ValidationError("Signature verification failed".to_string()))?;
        tracing::info!("Signature verified: did:key");
    } else if verify_did.starts_with("did:alyra:") {
        let public_key_b58 = if let Some(wallet) = db.find_wallet_by_did(verify_did).await? {
            wallet.dilithium_public_key
        } else if let Some(issuer) = db.find_issuer_by_did(verify_did).await? {
            issuer
                .get_str("public_key")
                .map_err(|_| AppError::ValidationError("Issuer public key not found".to_string()))?
                .to_string()
        } else if let Some(verifier) = db.find_verifier_by_did(verify_did).await? {
            verifier
                .get_str("public_key")
                .map_err(|_| {
                    AppError::ValidationError("Verifier public key not found".to_string())
                })?
                .to_string()
        } else {
            return Err(AppError::ValidationError(
                "DID not found in any collection".to_string(),
            ));
        };

        let dilithium_result = alyra_did::verify(nonce_message, &sig_bytes, &public_key_b58);

        if let Ok(true) = dilithium_result {
            tracing::info!("Signature verified: did:alyra (Dilithium)");
        } else {
            if sig_bytes.len() == 64 {
                // Decode public key from base58
                if let Ok(pk_decoded) = bs58::decode(&public_key_b58).into_vec() {
                    if pk_decoded.len() == 32 {
                        if let Ok(pk) = Ed25519PublicKey::from_bytes(&pk_decoded) {
                            if let Ok(sig) = Ed25519Signature::from_bytes(&sig_bytes) {
                                if pk.verify(nonce_message, &sig).is_ok() {
                                    tracing::info!(
                                        "Signature verified: did:alyra (Ed25519 compat mode)"
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
                            "Unsupported public key size: {}",
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
        return Err(AppError::ValidationError(
            "Unsupported DID method for signature verification".to_string(),
        ));
    }

    db.delete_one(
        "verification_nonces",
        mongodb::bson::doc! { "request_id": &request_id },
    )
    .await?;

    request.status = CredentialRequestStatus::Rejected;
    request.processed_at = Some(Utc::now());

    db.update_credential_request(&request).await?;

    tracing::info!(
        "Request {} rejected by issuer {} with signature verification. Reason: {:?}",
        request_id,
        normalized_did,
        data.reason
    );

    let wallet_activity_service = state.wallet_activity_service();
    let issuer_display = resolve_issuer_display(&state, &normalized_did).await;

    let mut metadata = HashMap::new();
    metadata.insert("issuer_did".to_string(), normalized_did.clone());
    metadata.insert("request_id".to_string(), request.id.clone());
    if let Some(reason) = &data.reason {
        metadata.insert("reason".to_string(), reason.clone());
    }

    let mut sanitized_metadata = HashMap::new();
    sanitized_metadata.insert("issuer_name".to_string(), issuer_display.clone());
    sanitized_metadata.insert(
        "credential_type".to_string(),
        request.credential_type.clone(),
    );
    sanitized_metadata.insert(
        "summary".to_string(),
        format!(
            "Credential request rejected by {}",
            issuer_display
        ),
    );

    if let Err(error) = wallet_activity_service
        .record_activity(NewWalletActivity {
            holder_did: request.user_did.clone(),
            activity_type: WalletActivityType::CredentialRequested,
            status: WalletActivityStatus::Rejected,
            title: format!(
                "{} credential request rejected",
                request.credential_type
            ),
            description: format!(
                "Issuer {} rejected the credential request",
                issuer_display
            ),
            metadata,
            sanitized_metadata,
            created_at: request.processed_at,
        })
        .await
    {
        warn!(
            error = ?error,
            "failed to record credential request rejection activity"
        );
    }

    Ok((
        StatusCode::OK,
        Json(json!({
            "success": true,
            "message": "Request rejected",
            "request_id": request_id,
        })),
    ))
}