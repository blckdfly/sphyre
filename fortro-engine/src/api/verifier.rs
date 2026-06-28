#[derive(Debug, Deserialize)]
struct ResendPresentationRequestBody {
    #[serde(default)]
    expires_in_minutes: Option<i64>,
}

use crate::api::presentation_request::decrypt_selected_attributes;

fn augment_presentation_with_status(presentation: Presentation) -> Result<serde_json::Value, AppError> {
    let (mut credential_status, provided_attributes, revoked_attributes) =
        extract_status_fields(&presentation.presentation_data);

    // Check real-time consent expiration
    let mut consent_is_expired = false;
    if let Some(consent_expires_at_value) = presentation.presentation_data.get("consent_expires_at") {
        if let Some(expires_str) = consent_expires_at_value.as_str() {
            if let Ok(expires_dt) = chrono::DateTime::parse_from_rfc3339(expires_str) {
                if expires_dt < chrono::Utc::now() {
                    consent_is_expired = true;
                    tracing::debug!("Consent expired at {}, marking as expired", expires_str);
                }
            }
        }
    }

    let mut json_value = serde_json::to_value(&presentation).map_err(|e| {
        AppError::InternalError(format!("Failed to serialize presentation: {}", e))
    })?;

    if let Some(obj) = json_value.as_object_mut() {
        if let Some(pseudonym) = presentation.prover_pseudonym.clone() {
            obj.insert(
                "prover_pseudonym".to_string(),
                serde_json::Value::String(pseudonym.clone()),
            );
            obj.insert("prover_did".to_string(), serde_json::Value::Null);

            if let Some(presentation_data_value) = obj.get_mut("presentation_data") {
                if let serde_json::Value::Object(data_obj) = presentation_data_value {
                    data_obj.insert(
                        "holder_pseudonym".to_string(),
                        serde_json::Value::String(pseudonym),
                    );
                    data_obj.remove("holder_did");
                }
            }
        }

        // Decrypt selected_attributes if encrypted
        if let Some(presentation_data_value) = obj.get_mut("presentation_data") {
            if let serde_json::Value::Object(data_obj) = presentation_data_value {
                let is_encrypted = data_obj
                    .get("attributes_encrypted")
                    .and_then(|v| v.as_bool())
                    .unwrap_or(false);
                
                if is_encrypted {
                    if let Some(encrypted_attrs) = data_obj.get("selected_attributes").cloned() {
                        match decrypt_selected_attributes(&encrypted_attrs) {
                            Ok(decrypted) => {
                                data_obj.insert("selected_attributes".to_string(), decrypted);
                            }
                            Err(e) => {
                                tracing::warn!("Failed to decrypt selected_attributes: {}", e);
                                // Keep encrypted values as fallback
                            }
                        }
                    }
                }
                // Remove the encryption flag from response
                data_obj.remove("attributes_encrypted");

                // Update consent_status in real-time if expired
                if consent_is_expired {
                    data_obj.insert("consent_status".to_string(), serde_json::Value::String("expired".to_string()));
                }
            }
        }

        // Update credential_status if consent is expired
        if consent_is_expired {
            credential_status = Some("expired".to_string());
            obj.insert("consent_status".to_string(), serde_json::Value::String("expired".to_string()));
        } else {
            // Preserve existing consent_status from presentation_data
            if let Some(consent_status) = presentation.presentation_data.get("consent_status") {
                obj.insert("consent_status".to_string(), consent_status.clone());
            }
        }

        if let Some(status) = credential_status {
            obj.insert("credential_status".to_string(), serde_json::Value::String(status));
        }

        obj.insert(
            "provided_attributes".to_string(),
            serde_json::Value::Array(
                provided_attributes
                    .iter()
                    .map(|attr| serde_json::Value::String(attr.clone()))
                    .collect(),
            ),
        );

        obj.insert(
            "revoked_attributes".to_string(),
            serde_json::Value::Array(
                revoked_attributes
                    .iter()
                    .map(|attr| serde_json::Value::String(attr.clone()))
                    .collect(),
            ),
        );
    }
    Ok(json_value)
}


fn extract_status_fields(
    presentation_data: &HashMap<String, serde_json::Value>,
) -> (Option<String>, Vec<String>, Vec<String>) {
    let provided_attributes = presentation_data
        .get("provided_attributes")
        .and_then(|value| value.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|value| value.as_str().map(|s| s.to_string()))
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();

    let revoked_attributes = presentation_data
        .get("revoked_attributes")
        .and_then(|value| value.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|value| value.as_str().map(|s| s.to_string()))
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();

    let credential_status = presentation_data
        .get("credential_status")
        .and_then(|value| value.as_str())
        .map(|s| s.to_string())
        .or_else(|| {
            if !revoked_attributes.is_empty() {
                Some("revoked".to_string())
            } else if provided_attributes.is_empty() {
                Some("expired".to_string())
            } else {
                None
            }
        });

    (credential_status, provided_attributes, revoked_attributes)
}

use axum::{
    extract::{Json, Path, Query, State},
    http::StatusCode,
    routing::{get, post, put},
    Router,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;

use crate::blockchain;
use crate::error::AppError;
use crate::models::{
    AccessLevel,
    CredentialRequirement,
    ExpirationPolicy,
    Presentation,
    PresentationStatus,
    WalletActivityStatus,
    WalletActivityType,
};
use crate::services::verifier::{
    CreatePresentationRequestRequest, CreateVerifierRequest, ResendPresentationRequestOptions,
    VerifyPresentationRequest,
};
use crate::services::wallet_activity::NewWalletActivity;
use crate::services::AppState;
use crate::utils::bbs_plus::{bbs_verify, BBSPublicKey, BBSSignature};
use crate::utils::crypto;
use tracing::{info, warn};

/// Create verifier routes
pub fn routes() -> Router<AppState> {
    Router::new()
        // Verifier management
        .route("/", post(create_verifier))
        .route("/:did/info", get(get_verifier))
        .route("/:did/update", put(update_verifier))
        // Authentication endpoints
        .route("/:did/set-auth", post(set_auth_hash))
        .route("/:did/authenticate", post(authenticate_verifier))
        // Presentation requests
        .route("/requests", post(create_presentation_request))
        .route("/requests/:id", get(get_presentation_request))
        // Presentations
        .route("/presentations", post(submit_presentation))
        .route("/:did/presentations", get(list_presentations))
        .route("/presentations/:id", get(get_presentation))
        .route("/presentations/:id/verify", post(verify_presentation))
        .route("/presentations/:id/status", put(update_presentation_status))
        .route("/presentations/:id/resend", post(resend_presentation_request))
        // Consent management
        .route("/consents", get(list_consents))
        .route("/consents/request", post(request_consent))
        .route("/consents/check", post(check_consent))
        // QR code generation
        .route(
            "/qr/presentation-request",
            post(generate_presentation_request_qr),
        )
        // Public verification
        .route("/verify/ipfs/:ipfs_hash", get(verify_credential_from_ipfs))
        // Statistics
        .route("/:did/statistics", get(get_verifier_statistics))
        // Verification Presets Management
        .route("/:did/presets", get(list_presets))
        .route("/:did/presets", post(create_preset))
        .route("/:did/presets/:preset_id", get(get_preset))
        .route("/:did/presets/:preset_id", put(update_preset))
        .route(
            "/:did/presets/:preset_id",
            axum::routing::delete(delete_preset),
        )
}

/// Create verifier request with challenge token
#[derive(Debug, Deserialize)]
struct CreateVerifierWithChallengeRequest {
    #[serde(flatten)]
    verifier: CreateVerifierRequest,
    challenge_token: String,
}

/// Create verifier handler
async fn create_verifier(
    State(state): State<AppState>,
    Json(request): Json<CreateVerifierWithChallengeRequest>,
) -> Result<(StatusCode, Json<serde_json::Value>), AppError> {
    let verifier_service = state.verifier_service();
    let verifier = verifier_service
        .create_verifier(request.verifier, &request.challenge_token)
        .await?;

    if let Ok(blockchain_client_lock) = crate::blockchain::get_blockchain_client().await {
        let client_opt = blockchain_client_lock.read().await;
        if let Some(client) = client_opt.as_ref() {
            let verifier_address = client.wallet_address();

            match client.is_admin(verifier_address).await {
                Ok(is_admin) => {
                    if is_admin {
                        tracing::info!("Verifier has admin role: {:?}", verifier_address);
                    } else {
                        tracing::warn!("Verifier does not have admin role: {:?}", verifier_address);
                    }
                }
                Err(e) => {
                    tracing::warn!("Failed to check verifier role: {}", e);
                }
            }
        }
    }

    Ok((
        StatusCode::CREATED,
        Json(json!({
            "success": true,
            "message": "Verifier created successfully with verified domain",
            "verifier": verifier,
        })),
    ))
}

async fn resend_presentation_request(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(body): Json<ResendPresentationRequestBody>,
) -> Result<(StatusCode, Json<serde_json::Value>), AppError> {
    let verifier_service = state.verifier_service();
    let result = verifier_service
        .resend_presentation_request(
            &id,
            ResendPresentationRequestOptions {
                expires_in_minutes: body.expires_in_minutes,
            },
        )
        .await?;

    let wallet_activity_service = state.wallet_activity_service();
    let holder_did = result.request.holder_did.clone();
    let verifier_label = result.request.verifier_name.clone();
    let expires_at = result.request.expires_at.to_rfc3339();

    if !holder_did.is_empty() {
        let mut metadata = HashMap::new();
        metadata.insert("request_id".to_string(), result.request.request_id.clone());
        metadata.insert("verifier_did".to_string(), result.request.verifier_did.clone());
        if let Some(presentation_id) = &result.request.presentation_id {
            metadata.insert("presentation_id".to_string(), presentation_id.clone());
        }

        let mut sanitized_metadata = HashMap::new();
        sanitized_metadata.insert("verifier_name".to_string(), verifier_label.clone());
        sanitized_metadata.insert("verifier_did".to_string(), result.request.verifier_did.clone());
        sanitized_metadata.insert("request_id".to_string(), result.request.request_id.clone());
        sanitized_metadata.insert("purpose".to_string(), result.request.purpose.clone());
        sanitized_metadata.insert("expires_at".to_string(), expires_at.clone());
        sanitized_metadata.insert(
            "summary".to_string(),
            format!("{} is requesting access again for {}", verifier_label, result.request.purpose)
        );
        sanitized_metadata.insert(
            "title".to_string(),
            format!("Access request from {}", verifier_label)
        );
        sanitized_metadata.insert(
            "description".to_string(),
            format!(
                "{} is requesting access again for {}. Open the Activity tab to respond.",
                verifier_label, result.request.purpose
            ),
        );

        if let Err(error) = wallet_activity_service
            .record_activity(NewWalletActivity {
                holder_did,
                activity_type: WalletActivityType::AccessRequested,
                status: WalletActivityStatus::Pending,
                title: format!("Access request from {}", verifier_label),
                description: format!(
                    "{} is requesting access again for {}. Open the Activity tab to respond.",
                    verifier_label, result.request.purpose
                ),
                metadata,
                sanitized_metadata,
                created_at: Some(result.request.created_at),
            })
            .await
        {
            warn!(error = ?error, "failed to record wallet activity for resend request");
        }
    }

    Ok((
        StatusCode::CREATED,
        Json(json!({
            "success": true,
            "message": "Presentation request resent successfully",
            "request": result.request,
            "qr_payload": result.qr_payload,
        })),
    ))
}

/// Get verifier handler
async fn get_verifier(
    State(state): State<AppState>,
    Path(did): Path<String>,
) -> Result<(StatusCode, Json<serde_json::Value>), AppError> {
    let verifier_service = state.verifier_service();
    let verifier = verifier_service.get_verifier(&did).await?;

    Ok((
        StatusCode::OK,
        Json(json!({
            "success": true,
            "verifier": verifier,
        })),
    ))
}

/// Update verifier handler
async fn update_verifier(
    State(state): State<AppState>,
    Path(did): Path<String>,
    Json(request): Json<HashMap<String, serde_json::Value>>,
) -> Result<(StatusCode, Json<serde_json::Value>), AppError> {
    let verifier_service = state.verifier_service();
    let verifier = verifier_service.update_verifier(&did, request).await?;

    Ok((
        StatusCode::OK,
        Json(json!({
            "success": true,
            "message": "Verifier updated successfully",
            "verifier": verifier,
        })),
    ))
}

/// Create presentation request handler
async fn create_presentation_request(
    State(state): State<AppState>,
    Json(request): Json<CreatePresentationRequestRequest>,
) -> Result<(StatusCode, Json<serde_json::Value>), AppError> {
    let verifier_service = state.verifier_service();
    let response = verifier_service
        .create_presentation_request(request)
        .await?;

    Ok((
        StatusCode::CREATED,
        Json(json!({
            "success": true,
            "message": "Presentation request created successfully",
            "request": response.request,
            "qr_code_data": response.qr_code_data,
        })),
    ))
}

/// Get presentation request handler
async fn get_presentation_request(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<(StatusCode, Json<serde_json::Value>), AppError> {
    let presentation_service = state.presentation_service();
    let request = presentation_service
        .get_presentation_by_id(&id)
        .await?
        .ok_or_else(|| {
            AppError::NotFoundError(format!("Presentation request with ID {} not found", id))
        })?;

    Ok((
        StatusCode::OK,
        Json(json!({
            "success": true,
            "request": request,
        })),
    ))
}

#[derive(Debug, Deserialize)]
struct SubmitPresentationRequest {
    request_id: String,
    holder_did: String,
    credentials: Vec<serde_json::Value>,
    #[serde(default)]
    zk_proofs: Option<Vec<serde_json::Value>>,
    consent_id: Option<String>,
}

async fn submit_presentation(
    State(state): State<AppState>,
    Json(request): Json<SubmitPresentationRequest>,
) -> Result<(StatusCode, Json<serde_json::Value>), AppError> {
    info!("Receiving presentation from holder: {}", request.holder_did);

    let verifier_service = state.verifier_service();

    // Get the original presentation request to get verifier_did
    let presentation_request = verifier_service
        .get_presentation_request_by_id(&request.request_id)
        .await?
        .ok_or_else(|| AppError::NotFoundError("Presentation request not found".to_string()))?;

    // Create presentation record
    let presentation = verifier_service
        .create_presentation(
            &presentation_request.verifier_did,
            &request.holder_did,
            request.credentials,
            Some(request.request_id.clone()),
        )
        .await?;

    info!("Presentation created: {}", presentation.id);

    Ok((
        StatusCode::CREATED,
        Json(json!({
            "success": true,
            "message": "Presentation received successfully",
            "presentation_id": presentation.id,
        })),
    ))
}

async fn list_presentations(
    State(state): State<AppState>,
    Path(verifier_did): Path<String>,
) -> Result<(StatusCode, Json<serde_json::Value>), AppError> {
    let verifier_service = state.verifier_service();
    let presentations = verifier_service
        .get_presentations_by_verifier(&verifier_did)
        .await?
        .into_iter()
        .map(augment_presentation_with_status)
        .collect::<Result<Vec<_>, AppError>>()?;

    Ok((
        StatusCode::OK,
        Json(json!({
            "success": true,
            "presentations": presentations,
        })),
    ))
}

/// Get presentation handler
async fn get_presentation(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<(StatusCode, Json<serde_json::Value>), AppError> {
    let verifier_service = state.verifier_service();
    let presentation = verifier_service
        .get_presentation_by_id(&id)
        .await?
        .ok_or_else(|| AppError::NotFoundError(format!("Presentation with ID {} not found", id)))?;

    let enriched = augment_presentation_with_status(presentation)?;

    Ok((
        StatusCode::OK,
        Json(json!({
            "success": true,
            "presentation": enriched,
        })),
    ))
}

/// Blockchain verification status
#[derive(Debug, Serialize)]
struct BlockchainVerificationStatus {
    on_chain: bool,
    revoked: bool,
    verified: bool,
}

async fn verify_presentation(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(request): Json<VerifyPresentationRequest>,
) -> Result<(StatusCode, Json<serde_json::Value>), AppError> {
    let verifier_service = state.verifier_service();

    let stored_presentation = verifier_service
        .get_presentation_by_id(&id)
        .await?
        .ok_or_else(|| AppError::NotFoundError(format!("Presentation with ID {} not found", id)))?;

    let credential_service = state.credential_service();

    let mut result = verifier_service
        .verify_presentation(request.clone())
        .await?;

    info!(
        "Presentation {} cryptographic verification: {}",
        id, result.is_valid
    );

    let mut blockchain_status = BlockchainVerificationStatus {
        on_chain: false,
        revoked: false,
        verified: false,
    };

    if let Ok(blockchain_client_lock) = state.get_blockchain_client().await {
        let client_guard = blockchain_client_lock.read().await;
        if let Some(client) = client_guard.as_ref() {
            let mut all_registered = true;
            let mut any_revoked = false;

            for credential_id in &stored_presentation.credential_ids {
                let credential_opt = credential_service
                    .get_credential_by_id(credential_id)
                    .await?;

                let credential = match credential_opt {
                    Some(cred) => cred,
                    None => {
                        all_registered = false;
                        result.is_valid = false;
                        result.errors.push(format!(
                            "Credential {} referenced in presentation not found for blockchain validation",
                            credential_id
                        ));
                        continue;
                    }
                };

                let registration_did = credential
                    .subject_did
                    .clone()
                    .unwrap_or_else(|| credential.owner_did.clone());

                match client
                    .is_credential_registered(&registration_did, &credential.credential_hash)
                    .await
                {
                    Ok(true) => {
                        match client
                            .is_credential_revoked(&registration_did, &credential.credential_hash)
                            .await
                        {
                            Ok(true) => {
                                any_revoked = true;
                                all_registered = false;
                                result.is_valid = false;
                                result.errors.push(format!(
                                    "Credential {} is revoked on-chain",
                                    credential_id
                                ));
                            }
                            Ok(false) => {}
                            Err(e) => {
                                all_registered = false;
                                result.is_valid = false;
                                result.errors.push(format!(
                                    "Failed to check revocation for credential {}: {}",
                                    credential_id, e
                                ));
                            }
                        }
                    }
                    Ok(false) => {
                        all_registered = false;
                        result.is_valid = false;
                        result.errors.push(format!(
                            "Credential {} is not registered on-chain",
                            credential_id
                        ));
                    }
                    Err(e) => {
                        all_registered = false;
                        result.is_valid = false;
                        result.errors.push(format!(
                            "Blockchain verification failed for credential {}: {}",
                            credential_id, e
                        ));
                    }
                }
            }

            blockchain_status.on_chain = all_registered;
            blockchain_status.revoked = any_revoked;
            blockchain_status.verified = all_registered && !any_revoked;
        }
    } else {
        warn!(
            "Blockchain client unavailable – skipping on-chain validation for presentation {}",
            id
        );
    }

    let consent_valid = match verifier_service
        .check_consent(
            &result.verifier_did,
            &result.prover_did,
            "presentation_verification",
        )
        .await
    {
        Ok(valid) => {
            info!("Presentation {} consent check: {}", id, valid);
            valid
        }
        Err(e) => {
            warn!(
                "Presentation {} consent check failed: {}. Denying access.",
                id, e
            );
            false
        }
    };

    if result.verifier_did.is_empty() {
        result.verifier_did = stored_presentation.verifier_did.clone();
    }

    if result.prover_did.is_empty() {
        result.prover_did = stored_presentation.prover_did.clone();
    }

    let final_valid = result.is_valid && consent_valid;
    let new_status = if final_valid {
        PresentationStatus::Verified
    } else {
        PresentationStatus::Rejected
    };

    verifier_service
        .update_presentation_status(&id, &stored_presentation.verifier_did, new_status.clone())
        .await?;

    info!("Presentation {} Approved with status: {:?}", id, new_status);

    Ok((
        StatusCode::OK,
        Json(json!({
            "success": true,
            "verification_result": result,
            "blockchain_verification": blockchain_status,
            "status": new_status,
            "auto_approved": final_valid,
            "consent_valid": consent_valid,
        })),
    ))
}

/// Update presentation status request
#[derive(Debug, Deserialize)]
pub struct UpdatePresentationStatusRequest {
    pub verifier_did: String,
    pub status: PresentationStatus,
}

/// Update presentation status handler
async fn update_presentation_status(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(body): Json<UpdatePresentationStatusRequest>,
) -> Result<(StatusCode, Json<serde_json::Value>), AppError> {
    let verifier_service = state.verifier_service();
    let success = verifier_service
        .update_presentation_status(&id, &body.verifier_did, body.status)
        .await?;

    Ok((
        StatusCode::OK,
        Json(json!({
            "success": success,
            "message": "Presentation status updated successfully",
        })),
    ))
}

/// List consents handler
async fn list_consents(
    State(state): State<AppState>,
    Query(params): Query<HashMap<String, String>>,
) -> Result<(StatusCode, Json<serde_json::Value>), AppError> {
    let verifier_did = params.get("verifier_did").ok_or_else(|| {
        AppError::ValidationError("verifier_did parameter is required".to_string())
    })?;

    let verifier_service = state.verifier_service();
    let consents = verifier_service
        .get_consents_for_verifier(verifier_did)
        .await?;

    Ok((
        StatusCode::OK,
        Json(json!({
            "success": true,
            "consents": consents,
        })),
    ))
}

/// Request consent request
#[derive(Debug, Deserialize)]
pub struct RequestConsentRequest {
    pub verifier_did: String,
    pub user_did: String,
    pub purpose: String,
    pub data_categories: Vec<String>,
    pub access_level: AccessLevel,
    pub expiration_policy: ExpirationPolicy,
    pub expires_at: Option<chrono::DateTime<chrono::Utc>>,
}

/// Request consent handler
async fn request_consent(
    State(state): State<AppState>,
    Json(request): Json<RequestConsentRequest>,
) -> Result<(StatusCode, Json<serde_json::Value>), AppError> {
    let verifier_service = state.verifier_service();
    let consent = verifier_service
        .request_consent(
            &request.verifier_did,
            &request.user_did,
            &request.purpose,
            request.data_categories,
            request.access_level,
            request.expiration_policy,
            request.expires_at,
        )
        .await?;

    Ok((
        StatusCode::CREATED,
        Json(json!({
            "success": true,
            "message": "Consent request created successfully",
            "consent": consent,
        })),
    ))
}

/// Check consent request
#[derive(Debug, Deserialize)]
pub struct CheckConsentRequest {
    pub verifier_did: String,
    pub user_did: String,
    pub purpose: String,
}

/// Check consent handler
async fn check_consent(
    State(state): State<AppState>,
    Json(request): Json<CheckConsentRequest>,
) -> Result<(StatusCode, Json<serde_json::Value>), AppError> {
    let verifier_service = state.verifier_service();
    let has_consent = verifier_service
        .check_consent(&request.verifier_did, &request.user_did, &request.purpose)
        .await?;

    let mut blockchain_consent = false;
    if let Ok(client_lock) = blockchain::get_blockchain_client().await {
        if let Some(client) = client_lock.read().await.as_ref() {
            match client
                .is_consent_valid(&request.user_did, &request.verifier_did, &request.purpose)
                .await
            {
                Ok(is_valid) => {
                    blockchain_consent = is_valid;
                    info!(
                        "Blockchain consent check: {} for user={}, verifier={}, purpose={}",
                        is_valid, request.user_did, request.verifier_did, request.purpose
                    );
                }
                Err(e) => {
                    warn!("Failed to check consent on blockchain: {}", e);
                }
            }
        }
    }

    Ok((
        StatusCode::OK,
        Json(json!({
            "success": true,
            "has_consent": has_consent,
            "blockchain_consent": blockchain_consent,
            "consent_valid": has_consent || blockchain_consent,
        })),
    ))
}

/// Generate presentation request QR code request
#[derive(Debug, Deserialize)]
pub struct GeneratePresentationRequestQrRequest {
    pub verifier_did: String,
    pub required_credentials: Vec<CredentialRequirement>,
    pub presentation_type: String,
    pub purpose: String,
    pub callback_url: Option<String>,
    pub expires_at: Option<chrono::DateTime<chrono::Utc>>,
    #[serde(default)]
    pub required_attribute_values: Option<HashMap<String, Vec<String>>>,
    #[serde(default)]
    pub required_predicates: Option<Vec<serde_json::Value>>,
}

/// Generate presentation request QR code handler
async fn generate_presentation_request_qr(
    State(state): State<AppState>,
    Json(request): Json<GeneratePresentationRequestQrRequest>,
) -> Result<(StatusCode, Json<serde_json::Value>), AppError> {
    let verifier_service = state.verifier_service();

    let short_url = verifier_service
        .generate_presentation_request_qr_short_url(
            &request.verifier_did,
            request.required_credentials,
            &request.presentation_type,
            &request.purpose,
            request.callback_url,
            request.expires_at,
            request.required_attribute_values,
            request.required_predicates,
        )
        .await?;

    info!(
        "Generated presentation request QR for verifier: {}",
        request.verifier_did
    );

    Ok((
        StatusCode::OK,
        Json(json!({
            "success": true,
            "qr_data": short_url,
        })),
    ))
}

async fn verify_credential_from_ipfs(
    State(state): State<AppState>,
    Path(ipfs_hash): Path<String>,
) -> Result<(StatusCode, Json<serde_json::Value>), AppError> {
    info!("Public verification request for IPFS hash: {}", ipfs_hash);

    let ipfs_client = &state.ipfs;
    let credential_data = ipfs_client
        .get_json::<serde_json::Value>(&ipfs_hash)
        .await
        .map_err(|e| AppError::NotFoundError(format!("Failed to fetch from IPFS: {}", e)))?;

    info!("Fetched credential from IPFS: {:?}", credential_data);

    let issuer = credential_data
        .get("issuer")
        .and_then(|v| v.as_str())
        .ok_or_else(|| AppError::ValidationError("Missing issuer in credential".to_string()))?;

    if !crate::utils::did::validate_did(issuer) {
        return Err(AppError::ValidationError(
            "Issuer DID is invalid".to_string(),
        ));
    }

    let proof = credential_data
        .get("proof")
        .ok_or_else(|| AppError::ValidationError("Missing proof".to_string()))?;
    let jwt = proof
        .get("jws")
        .and_then(|v| v.as_str())
        .ok_or_else(|| AppError::ValidationError("Missing JWT in proof".to_string()))?;

    let (jwt_header, jwt_claims) = crate::utils::jwt::verify_pq_jwt(jwt)?;

    if jwt_claims.iss != issuer {
        return Err(AppError::ValidationError(
            "Issuer DID mismatch between credential and proof".to_string(),
        ));
    }

    // Ensure the credential inside the JWT matches the fetched credential
    if let Some(jwt_vc) = jwt_claims.additional_claims.get("vc") {
        if jwt_vc != &credential_data {
            return Err(AppError::ValidationError(
                "Credential payload mismatch between IPFS data and JWT proof".to_string(),
            ));
        }
    }

    let jwt_signature_algorithm = jwt_header.alg.clone();

    let credential_record = state
        .db
        .find_credential_by_ipfs_hash(&ipfs_hash)
        .await?;
    let stored_gateway_url = credential_record
        .as_ref()
        .map(|c| c.ipfs_gateway_url.clone());
    let stored_tx_hash = credential_record
        .as_ref()
        .and_then(|c| c.blockchain_tx_hash.clone());
    let stored_reference = credential_record
        .as_ref()
        .and_then(|c| c.blockchain_reference.clone());

    let mut blockchain_verified = false;
    let mut blockchain_warning: Option<String> = None;

    let mut signature_algorithm = jwt_signature_algorithm.clone();
    let mut signature_valid = true;
    let mut signature_type = credential_record
        .as_ref()
        .map(|c| c.signature_type.clone())
        .unwrap_or_else(|| jwt_signature_algorithm.clone());

    if let Some(record) = credential_record.as_ref() {
        if record.signature_type.eq_ignore_ascii_case("bbs+") {
            if let (Some(sig_hex), Some(pk_hex)) = (
                record.bbs_signature.as_ref(),
                record.bbs_public_key.as_ref(),
            ) {
                match (hex::decode(sig_hex), hex::decode(pk_hex)) {
                    (Ok(sig_bytes), Ok(pk_bytes)) => {
                        match (
                            serde_json::from_slice::<BBSSignature>(&sig_bytes),
                            serde_json::from_slice::<BBSPublicKey>(&pk_bytes),
                        ) {
                            (Ok(bbs_signature), Ok(bbs_public_key)) => {
                                if let Some(claims_map) = credential_data
                                    .get("credentialSubject")
                                    .and_then(|cs| cs.get("claims"))
                                    .and_then(Value::as_object)
                                {
                                    let mut attribute_keys: Vec<String> =
                                        claims_map.keys().cloned().collect();
                                    attribute_keys.sort();
                                    let messages: Vec<String> = attribute_keys
                                        .iter()
                                        .map(|key| {
                                            claims_map
                                                .get(key)
                                                .map(|value| value.to_string())
                                                .unwrap_or_default()
                                        })
                                        .collect();

                                    match bbs_verify(&messages, &bbs_signature, &bbs_public_key) {
                                        Ok(is_valid) => {
                                            signature_valid = is_valid;
                                            signature_algorithm = "bbs+".to_string();
                                            signature_type = record.signature_type.clone();
                                        }
                                        Err(e) => {
                                            warn!(
                                                "Failed to verify BBS+ signature for credential {}: {}",
                                                record.id, e
                                            );
                                            signature_valid = false;
                                            signature_algorithm = "bbs+".to_string();
                                            signature_type = record.signature_type.clone();
                                        }
                                    }
                                } else {
                                    warn!(
                                        "Credential {} lacks credentialSubject.claims for BBS+ verification",
                                        record.id
                                    );
                                    signature_valid = false;
                                    signature_algorithm = "bbs+".to_string();
                                    signature_type = record.signature_type.clone();
                                }
                            }
                            (Err(e_sig), _) => {
                                warn!(
                                    "Failed to parse stored BBS+ signature for credential {}: {}",
                                    record.id, e_sig
                                );
                                signature_valid = false;
                                signature_algorithm = "bbs+".to_string();
                                signature_type = record.signature_type.clone();
                            }
                            (_, Err(e_pk)) => {
                                warn!(
                                    "Failed to parse stored BBS+ public key for credential {}: {}",
                                    record.id, e_pk
                                );
                                signature_valid = false;
                                signature_algorithm = "bbs+".to_string();
                                signature_type = record.signature_type.clone();
                            }
                        }
                    }
                    (Err(e_sig_bytes), _) => {
                        warn!(
                            "Failed to decode stored BBS+ signature hex for credential {}: {}",
                            record.id, e_sig_bytes
                        );
                        signature_valid = false;
                        signature_algorithm = "bbs+".to_string();
                        signature_type = record.signature_type.clone();
                    }
                    (_, Err(e_pk_bytes)) => {
                        warn!(
                            "Failed to decode stored BBS+ public key hex for credential {}: {}",
                            record.id, e_pk_bytes
                        );
                        signature_valid = false;
                        signature_algorithm = "bbs+".to_string();
                        signature_type = record.signature_type.clone();
                    }
                }
            } else {
                warn!(
                    "Credential {} marked as BBS+ but missing signature/public key",
                    record.id
                );
                signature_valid = false;
                signature_algorithm = "bbs+".to_string();
                signature_type = record.signature_type.clone();
            }
        }
    }

    if let Ok(client_lock) = blockchain::get_blockchain_client().await {
        if let Some(client) = client_lock.read().await.as_ref() {
            // Try to verify on blockchain using issuer DID and IPFS hash
            match client.is_credential_registered(issuer, &ipfs_hash).await {
                Ok(is_registered) => {
                    blockchain_verified = is_registered;
                }
                Err(e) => {
                    warn!("Failed to verify on blockchain: {}", e);
                    blockchain_warning = Some(format!("Blockchain check failed: {}", e));
                }
            }

            let _blockchain_tx = client
                .get_registration_tx_hash(issuer, &ipfs_hash)
                .await
                .ok()
                .flatten();
        } else if blockchain_warning.is_none() {
            blockchain_warning = Some("Blockchain client not initialised".to_string());
        }
    } else {
        blockchain_warning = Some("Blockchain client unavailable".to_string());
    }

    let anchored_via_record = stored_tx_hash.is_some();
    let on_chain = blockchain_verified || anchored_via_record;
    let verified = signature_valid && on_chain;

    if !blockchain_verified && anchored_via_record {
        blockchain_warning =
            Some("Blockchain RPC unavailable; using stored issuance record".to_string());
    }

    let metadata_uri = credential_data
        .get("metadata_uri")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .or_else(|| Some(format!("ipfs://{}", ipfs_hash)));

    let ipfs_gateway_url = stored_gateway_url
        .or_else(|| {
            credential_data
                .get("ipfs_gateway_url")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string())
        })
        .unwrap_or_else(|| format!("https://gateway.sphyre.tech/ipfs/{}", ipfs_hash));

    let message = if blockchain_verified {
        "Credential verified: Valid signature and anchored on blockchain"
    } else if anchored_via_record {
        "Credential verified: Valid signature (anchoring confirmed from issuance record)"
    } else {
        "Credential verification failed: credential not anchored on blockchain"
    };

    let (
        evidence_attachments,
        evidence_required,
        evidence_status,
        credential_id,
        extensions,
    ) = credential_record
        .as_ref()
        .map(|record| {
            (
                record.evidence_attachments.clone(),
                record.evidence_required.clone(),
                record
                    .evidence_status
                    .as_ref()
                    .map(|status| format!("{:?}", status)),
                Some(record.id.clone()),
                record.extensions.clone(),
            )
        })
        .unwrap_or_else(|| (Vec::new(), Vec::new(), None, None, Vec::new()));

    let revoked_attributes: Vec<String> = credential_record
        .as_ref()
        .and_then(|record| {
            record
                .credential_preview
                .as_ref()
                .and_then(|preview| preview.get("revoked_attributes"))
                .and_then(|value| serde_json::from_value::<Vec<String>>(value.clone()).ok())
        })
        .unwrap_or_default();

    let mut credential_with_filtered_claims = credential_data.clone();
    if let Some(subject_value) = credential_with_filtered_claims.get_mut("credentialSubject") {
        if let Some(subject_obj) = subject_value.as_object_mut() {
            if let Some(claims_value) = subject_obj.get_mut("claims") {
                if let Some(claims_map) = claims_value.as_object_mut() {
                    claims_map.retain(|key, _| {
                        !revoked_attributes
                            .iter()
                            .any(|rev| rev.eq_ignore_ascii_case(key))
                    });
                }
            }

            let should_hide_subject = credential_record
                .as_ref()
                .map(|record| record.anonymous_credential.is_some())
                .unwrap_or(false);

            if should_hide_subject {
                if let Some(original_id_value) = subject_obj.remove("id") {
                    if let Some(original_id_str) = original_id_value.as_str() {
                        let hashed = crypto::hash_to_hex(original_id_str.as_bytes());
                        let pseudonym = format!("did:alyra:anon:{}", &hashed[..32]);
                        subject_obj.insert(
                            "holder_pseudonym".to_string(),
                            serde_json::Value::String(pseudonym),
                        );
                    }
                }
            }
        }
    }

    let provided_attributes: Vec<String> = credential_with_filtered_claims
        .get("credentialSubject")
        .and_then(|subject| subject.get("claims"))
        .and_then(|claims| claims.as_object())
        .map(|claims| claims.keys().cloned().collect())
        .unwrap_or_default();

    Ok((
        StatusCode::OK,
        Json(json!({
            "success": verified,
            "verified": verified,
            "credential": credential_with_filtered_claims,
            "verification": {
                "ipfs_hash": ipfs_hash,
                "issuer": issuer,
                "signature_valid": signature_valid,
                "signature_algorithm": signature_algorithm,
                "signature_type": signature_type,
                "on_chain": on_chain,
                "blockchain_verified": blockchain_verified,
                "timestamp": chrono::Utc::now().to_rfc3339(),
                "metadata_uri": metadata_uri,
                "ipfs_gateway_url": ipfs_gateway_url,
                "blockchain_tx": stored_tx_hash,
                "blockchain_reference": stored_reference,
                "warning": blockchain_warning,
                "credential_id": credential_id,
                "evidence_attachments": evidence_attachments,
                "evidence_required": evidence_required,
                "evidence_status": evidence_status,
                "extensions": extensions,
                "provided_attributes": provided_attributes,
                "revoked_attributes": revoked_attributes,
            },
            "message": message
        })),
    ))
}

/// Get verifier statistics handler
async fn get_verifier_statistics(
    State(state): State<AppState>,
    Path(did): Path<String>,
) -> Result<(StatusCode, Json<serde_json::Value>), AppError> {
    let verifier_service = state.verifier_service();
    let statistics = verifier_service.get_verifier_statistics(&did).await?;

    Ok((
        StatusCode::OK,
        Json(json!({
            "success": true,
            "statistics": statistics,
        })),
    ))
}

/// Set auth hash request
#[derive(Debug, Deserialize)]
struct SetAuthHashRequest {
    auth_token: String,
}

/// Set auth hash handler
async fn set_auth_hash(
    State(state): State<AppState>,
    Path(did): Path<String>,
    Json(request): Json<SetAuthHashRequest>,
) -> Result<(StatusCode, Json<serde_json::Value>), AppError> {
    let verifier_service = state.verifier_service();
    verifier_service
        .set_auth_hash(&did, &request.auth_token)
        .await?;

    Ok((
        StatusCode::OK,
        Json(json!({
            "success": true,
            "message": "Authentication credentials set successfully",
        })),
    ))
}

/// Authenticate verifier request
#[derive(Debug, Deserialize)]
struct AuthenticateVerifierRequest {
    auth_token: String,
}

/// Authenticate verifier handler
async fn authenticate_verifier(
    State(state): State<AppState>,
    Path(did): Path<String>,
    Json(request): Json<AuthenticateVerifierRequest>,
) -> Result<(StatusCode, Json<serde_json::Value>), AppError> {
    let verifier_service = state.verifier_service();
    let verifier = verifier_service
        .authenticate(&did, &request.auth_token)
        .await?;

    // Use auth_token as JWT token for API requests
    let token = request.auth_token.clone();

    Ok((
        StatusCode::OK,
        Json(json!({
            "success": true,
            "message": "Authentication successful",
            "token": token,
            "verifier": verifier,
        })),
    ))
}

#[derive(Debug, Deserialize)]
struct CreatePresetRequest {
    name: String,
    description: String,
    preset_type: String,
    required_predicates: Option<Vec<crate::models::PredicateRequirement>>,
    required_attributes: Vec<String>,
    requested_attributes: Option<Vec<String>>,
}

async fn create_preset(
    State(state): State<AppState>,
    Path(verifier_did): Path<String>,
    Json(request): Json<CreatePresetRequest>,
) -> Result<(StatusCode, Json<serde_json::Value>), AppError> {
    use crate::models::VerificationPreset;

    // Log predicate details for debugging
    if let Some(ref predicates) = request.required_predicates {
        tracing::info!("Creating preset with {} predicates", predicates.len());
        for (i, pred) in predicates.iter().enumerate() {
            tracing::info!(
                "Predicate {}: {} {} {} (value type: {}, value: {})",
                i, pred.attribute, pred.operator, pred.value,
                std::any::type_name_of_val(&pred.value),
                pred.value
            );
        }
    }

    let required_attributes = request.required_attributes.clone();
    
    // Note: Predicate attributes are NOT added to required_attributes
    // Predicates are for backend validation only, not UI selection

    let mut preset = VerificationPreset::new(
        request.name,
        request.description,
        verifier_did.clone(),
        request.preset_type,
        required_attributes,
    );

    preset.required_predicates = request.required_predicates;
    preset.requested_attributes = request.requested_attributes;

    let collection = state
        .db
        .db
        .collection::<VerificationPreset>("verification_presets");
    collection
        .insert_one(&preset)
        .await
        .map_err(|e| AppError::DatabaseError(format!("Failed to create preset: {}", e)))?;

    info!(
        "Verification preset created: {} for verifier {}",
        preset.id, verifier_did
    );

    Ok((
        StatusCode::CREATED,
        Json(json!({
            "success": true,
            "message": "Verification preset created successfully",
            "preset": preset,
        })),
    ))
}

async fn list_presets(
    State(state): State<AppState>,
    Path(verifier_did): Path<String>,
) -> Result<(StatusCode, Json<serde_json::Value>), AppError> {
    use crate::models::VerificationPreset;
    use mongodb::bson::doc;

    let collection = state
        .db
        .db
        .collection::<VerificationPreset>("verification_presets");

    // Find all presets for this verifier OR system presets
    let filter = doc! {
        "$or": [
            { "verifier_did": &verifier_did },
            { "is_system": true }
        ]
    };

    let mut cursor = collection
        .find(filter)
        .await
        .map_err(|e| AppError::DatabaseError(format!("Failed to list presets: {}", e)))?;

    let mut presets = Vec::new();
    while cursor.advance().await.unwrap_or(false) {
        if let Ok(preset) = cursor.deserialize_current() {
            presets.push(preset);
        }
    }

    info!(
        "Found {} presets for verifier {}",
        presets.len(),
        verifier_did
    );

    Ok((
        StatusCode::OK,
        Json(json!({
            "success": true,
            "presets": presets,
            "count": presets.len(),
        })),
    ))
}

async fn get_preset(
    State(state): State<AppState>,
    Path((verifier_did, preset_id)): Path<(String, String)>,
) -> Result<(StatusCode, Json<serde_json::Value>), AppError> {
    use crate::models::VerificationPreset;
    use mongodb::bson::doc;

    let collection = state
        .db
        .db
        .collection::<VerificationPreset>("verification_presets");

    let filter = doc! {
        "id": &preset_id,
        "$or": [
            { "verifier_did": &verifier_did },
            { "is_system": true }
        ]
    };

    let preset = collection
        .find_one(filter)
        .await
        .map_err(|e| AppError::DatabaseError(format!("Failed to get preset: {}", e)))?
        .ok_or_else(|| AppError::NotFoundError(format!("Preset {} not found", preset_id)))?;

    Ok((
        StatusCode::OK,
        Json(json!({
            "success": true,
            "preset": preset,
        })),
    ))
}

#[derive(Debug, Deserialize)]
struct UpdatePresetRequest {
    name: Option<String>,
    description: Option<String>,
    preset_type: Option<String>,
    required_predicates: Option<Vec<crate::models::PredicateRequirement>>,
    required_attributes: Option<Vec<String>>,
    requested_attributes: Option<Vec<String>>,
}

async fn update_preset(
    State(state): State<AppState>,
    Path((verifier_did, preset_id)): Path<(String, String)>,
    Json(request): Json<UpdatePresetRequest>,
) -> Result<(StatusCode, Json<serde_json::Value>), AppError> {
    use crate::models::VerificationPreset;
    use mongodb::bson::{doc, Document};

    tracing::info!("Updating preset {} for verifier {}", preset_id, verifier_did);
    tracing::info!("Update request: {:?}", request);

    let collection = state
        .db
        .db
        .collection::<VerificationPreset>("verification_presets");

    let find_filter = doc! {
        "id": &preset_id,
        "verifier_did": &verifier_did,
        "is_system": false,
    };

    let existing = collection
        .find_one(find_filter.clone())
        .await
        .map_err(|e| {
            tracing::error!("Failed to find preset {}: {}", preset_id, e);
            AppError::DatabaseError(format!("Failed to find preset: {}", e))
        })?
        .ok_or_else(|| {
            tracing::error!("Preset {} not found for verifier {}", preset_id, verifier_did);
            AppError::NotFoundError(format!(
                "Preset {} not found or cannot be edited",
                preset_id
            ))
        })?;

    tracing::info!("Found existing preset: {}", existing.name);

    let mut update_doc = Document::new();

    if let Some(name) = request.name {
        update_doc.insert("name", name.trim());
        tracing::info!("Updating name to: {}", name);
    }
    if let Some(description) = request.description {
        update_doc.insert("description", description.trim());
        tracing::info!("Updating description");
    }
    if let Some(preset_type) = request.preset_type {
        update_doc.insert("preset_type", preset_type.trim());
        tracing::info!("Updating preset_type to: {}", preset_type);
    }
    if let Some(required_attributes) = request.required_attributes {
        // Note: Predicate attributes are NOT added to required_attributes
        // Predicates are for backend validation only, not UI selection
        update_doc.insert("required_attributes", required_attributes.clone());
        tracing::info!("Updating required_attributes: {:?}", required_attributes);
    }
    if let Some(required_predicates) = request.required_predicates {
        let predicates_bson = mongodb::bson::to_bson(&required_predicates)
            .map_err(|e| {
                tracing::error!("Failed to serialize predicates: {}", e);
                AppError::ValidationError(format!("Failed to serialize predicates: {}", e))
            })?;
        update_doc.insert("required_predicates", predicates_bson);
        tracing::info!("Updating required_predicates: {} predicates", required_predicates.len());
    }
    if let Some(requested_attributes) = request.requested_attributes {
        update_doc.insert("requested_attributes", requested_attributes.clone());
        tracing::info!("Updating requested_attributes: {:?}", requested_attributes);
    }

    use mongodb::bson::DateTime as BsonDateTime;
    let now = chrono::Utc::now();
    update_doc.insert(
        "updated_at",
        BsonDateTime::from_millis(now.timestamp_millis()),
    );

    tracing::info!("Update document: {:?}", update_doc);

    let update = doc! { "$set": update_doc };

    let update_result = collection
        .update_one(find_filter, update)
        .await
        .map_err(|e| {
            tracing::error!("Failed to update preset {}: {}", preset_id, e);
            AppError::DatabaseError(format!("Failed to update preset: {}", e))
        })?;

    tracing::info!("Update result: matched {}, modified {}", 
        update_result.matched_count, update_result.modified_count);

    if update_result.modified_count == 0 {
        tracing::warn!("No documents were modified for preset {}", preset_id);
    }

    let updated_preset = collection
        .find_one(doc! { "id": &preset_id })
        .await
        .map_err(|e| {
            tracing::error!("Failed to fetch updated preset {}: {}", preset_id, e);
            AppError::DatabaseError(format!("Failed to fetch updated preset: {}", e))
        })?
        .ok_or_else(|| {
            tracing::error!("Preset {} not found after update", preset_id);
            AppError::NotFoundError("Preset not found after update".to_string())
        })?;

    tracing::info!("Successfully updated preset: {} by verifier {}", preset_id, verifier_did);

    Ok((
        StatusCode::OK,
        Json(json!({
            "success": true,
            "message": "Preset updated successfully",
            "preset": updated_preset,
        })),
    ))
}

async fn delete_preset(
    State(state): State<AppState>,
    Path((verifier_did, preset_id)): Path<(String, String)>,
) -> Result<(StatusCode, Json<serde_json::Value>), AppError> {
    use crate::models::VerificationPreset;
    use mongodb::bson::doc;

    let collection = state
        .db
        .db
        .collection::<VerificationPreset>("verification_presets");

    let filter = doc! {
        "id": &preset_id,
        "verifier_did": &verifier_did,
        "is_system": false,
    };

    let result = collection
        .delete_one(filter)
        .await
        .map_err(|e| AppError::DatabaseError(format!("Failed to delete preset: {}", e)))?;

    if result.deleted_count == 0 {
        return Err(AppError::NotFoundError(format!(
            "Preset {} not found or cannot be deleted (system presets cannot be deleted)",
            preset_id
        )));
    }

    info!("Preset deleted: {} by verifier {}", preset_id, verifier_did);

    Ok((
        StatusCode::OK,
        Json(json!({
            "success": true,
            "message": "Preset deleted successfully",
        })),
    ))
}
