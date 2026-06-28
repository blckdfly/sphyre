use axum::{
    extract::{Path, State},
    http::StatusCode,
    routing::{get, post},
    Json, Router,
};
use mongodb::bson::{doc, to_bson, to_document, Bson, DateTime as BsonDateTime};
use serde::Deserialize;
use serde_json::{json, Value as JsonValue};
use crate::models::{
    CredentialStatus, Presentation, PresentationStatus, PredicateRequirement,
    VerifierPresentationRequest, VerifierActivityStatus,
    VerifierActivityType, WalletActivityStatus, WalletActivityType,
};
use crate::services::{
    verifier_activity::NewVerifierActivity, wallet_activity::NewWalletActivity, AppState,
};
use crate::utils::anonymous_credentials::{
    verify_unlinkable_presentation, UnlinkablePresentation,
};
use crate::utils::zk_proofs::{self, PredicateProof};
use hex;
use crate::utils::did::build_pairwise_pseudonym;
use crate::utils::did_compat::{did_to_frontend_format, normalize_did};
use chrono::{DateTime, Utc};
use std::collections::{HashMap, HashSet};

// Request structures
#[derive(Debug, Deserialize)]
pub struct CreatePresentationRequestBody {
    #[serde(alias = "verifierDid")]
    pub verifier_did: String,
    #[serde(alias = "verifierName")]
    pub verifier_name: String,
    #[serde(alias = "holderDid", alias = "holderDID")]
    pub holder_did: String,
    #[serde(alias = "credentialId")]
    pub credential_id: String,
    #[serde(alias = "purposeText")]
    pub purpose: String,
    #[serde(alias = "requiredPredicates")]
    pub required_predicates: Option<Vec<PredicateRequirement>>,
    #[serde(alias = "requiredAttributes")]
    pub required_attributes: Vec<String>,
    #[serde(alias = "requestedAttributes")]
    pub requested_attributes: Option<Vec<String>>,
    #[serde(alias = "presentationId")]
    pub presentation_id: Option<String>,
    #[serde(alias = "requiredIssuers")]
    pub required_issuers: Option<Vec<String>>,
    #[serde(alias = "requiredAttributeValues")]
    pub required_attribute_values: Option<HashMap<String, Vec<String>>>,
    #[serde(alias = "anonymousProof", default)]
    pub anonymous_proof: Option<serde_json::Value>,
}

fn sanitize_selected_attributes_value(
    selected: &serde_json::Value,
    is_anonymous_mode: bool,
) -> serde_json::Value {
    if !is_anonymous_mode {
        return selected.clone();
    }

    if let Some(obj) = selected.as_object() {
        let masked = obj
            .keys()
            .map(|key| (key.clone(), serde_json::json!("verified via anonymous proof")))
            .collect();
        serde_json::Value::Object(masked)
    } else {
        serde_json::json!({})
    }
}

use base64::{engine::general_purpose, Engine as _};
use once_cell::sync::OnceCell;
use crate::utils::crypto;
use crate::error::AppError;

/// Get the encryption key for presentation data from environment variable
fn get_presentation_encryption_key() -> Result<Option<[u8; 32]>, AppError> {
    static KEY: OnceCell<Option<[u8; 32]>> = OnceCell::new();

    KEY.get_or_try_init(|| {
        let raw = match std::env::var("PRESENTATION_DATA_ENCRYPTION_KEY") {
            Ok(value) if !value.trim().is_empty() => value,
            _ => {
                // Fallback to WALLET_ACTIVITY_ENCRYPTION_KEY for compatibility
                match std::env::var("WALLET_ACTIVITY_ENCRYPTION_KEY") {
                    Ok(value) if !value.trim().is_empty() => value,
                    _ => {
                        tracing::info!("Presentation data encryption key not set; storing selected_attributes without encryption");
                        return Ok(None);
                    }
                }
            }
        };

        let decoded = general_purpose::STANDARD
            .decode(raw.trim())
            .map_err(|e| AppError::ConfigError(format!(
                "Failed to decode presentation encryption key: {}",
                e
            )))?;

        if decoded.len() != 32 {
            return Err(AppError::ConfigError(
                "Presentation encryption key must decode to 32 bytes".to_string(),
            ));
        }

        let mut key = [0u8; 32];
        key.copy_from_slice(&decoded);
        Ok(Some(key))
    })
    .copied()
}

/// Encrypt selected_attributes values while preserving keys
fn encrypt_selected_attributes(
    selected: &serde_json::Value,
) -> Result<(serde_json::Value, bool), AppError> {
    let Some(key) = get_presentation_encryption_key()? else {
        return Ok((selected.clone(), false));
    };

    if let Some(obj) = selected.as_object() {
        let encrypted: Result<serde_json::Map<String, serde_json::Value>, AppError> = obj
            .iter()
            .map(|(attr_key, value)| {
                let value_str = value.to_string();
                let encrypted_bytes = crypto::encrypt(value_str.as_bytes(), &key)
                    .map_err(|e| AppError::InternalError(format!("Failed to encrypt attribute value: {}", e)))?;
                let encoded = general_purpose::STANDARD.encode(&encrypted_bytes);
                Ok((attr_key.clone(), serde_json::json!(encoded)))
            })
            .collect();
        Ok((serde_json::Value::Object(encrypted?), true))
    } else {
        Ok((serde_json::json!({}), false))
    }
}

/// Decrypt selected_attributes values
pub fn decrypt_selected_attributes(
    encrypted: &serde_json::Value,
) -> Result<serde_json::Value, AppError> {
    let Some(key) = get_presentation_encryption_key()? else {
        return Ok(encrypted.clone());
    };

    if let Some(obj) = encrypted.as_object() {
        let decrypted: Result<serde_json::Map<String, serde_json::Value>, AppError> = obj
            .iter()
            .map(|(attr_key, value)| {
                if let Some(enc_str) = value.as_str() {
                    let decoded = general_purpose::STANDARD
                        .decode(enc_str)
                        .map_err(|e| AppError::InternalError(format!("Failed to decode attribute: {}", e)))?;
                    let decrypted_bytes = crypto::decrypt(&decoded, &key)
                        .map_err(|e| AppError::InternalError(format!("Failed to decrypt attribute: {}", e)))?;
                    let value_str = String::from_utf8(decrypted_bytes)
                        .map_err(|e| AppError::InternalError(format!("Invalid UTF-8 in decrypted attribute: {}", e)))?;
                    let parsed: serde_json::Value = serde_json::from_str(&value_str)
                        .unwrap_or_else(|_| serde_json::json!(value_str));
                    Ok((attr_key.clone(), parsed))
                } else {
                    Ok((attr_key.clone(), value.clone()))
                }
            })
            .collect();
        Ok(serde_json::Value::Object(decrypted?))
    } else {
        Ok(encrypted.clone())
    }
}


pub(crate) fn sanitize_presentation_request(
    request: &VerifierPresentationRequest,
) -> serde_json::Value {
    let pseudonym = request
        .holder_pseudonym
        .clone()
        .unwrap_or_else(|| {
            build_pairwise_pseudonym(&request.holder_did, &request.verifier_did, &request.request_id)
        });

    serde_json::json!({
        "request_id": request.request_id.clone(),
        "presentation_id": request.presentation_id.clone(),
        "holder_pseudonym": pseudonym,
        "verifier_did": request.verifier_did.clone(),
        "verifier_name": request.verifier_name.clone(),
        "purpose": request.purpose.clone(),
        "required_attributes": request.required_attributes.clone(),
        "required_attribute_values": request.required_attribute_values.clone(),
        "required_predicates": request.required_predicates.clone(),
        "requested_attributes": request.requested_attributes.clone(),
        "status": request.status.clone(),
        "created_at": request.created_at.to_rfc3339(),
        "updated_at": request.updated_at.to_rfc3339(),
        "expires_at": request.expires_at.to_rfc3339(),
    })
}

fn sanitize_metadata(source: &HashMap<String, String>) -> HashMap<String, String> {
    let mut sanitized = HashMap::new();
    if let Some(summary) = source.get("summary") {
        sanitized.insert("summary".to_string(), summary.clone());
    }
    if let Some(status) = source.get("status") {
        sanitized.insert("status".to_string(), status.clone());
    }
    if let Some(verifier_name) = source.get("verifier_name") {
        sanitized.insert("verifier_name".to_string(), verifier_name.clone());
    }
    sanitized
}

async fn record_verifier_activity(
    state: &AppState,
    verifier_did: &str,
    status: VerifierActivityStatus,
    title: String,
    description: String,
    metadata: HashMap<String, String>,
) {
    if let Err(error) = state
        .verifier_activity_service()
        .record_activity(NewVerifierActivity {
            verifier_did: verifier_did.to_string(),
            activity_type: VerifierActivityType::Verification,
            status,
            title,
            description,
            metadata,
            created_at: Some(Utc::now()),
        })
        .await
    {
        tracing::warn!(error = ?error, "failed to record verifier activity");
    }
}

fn embed_anonymous_mode(
    presentation_data: &mut HashMap<String, serde_json::Value>,
    pseudonym: &str,
) {
    presentation_data.insert(
        "pseudonymous_prover".to_string(),
        serde_json::Value::String(pseudonym.to_string()),
    );
    if let Some(metadata) = presentation_data.get_mut("_anonymous_metadata") {
        if let Some(obj) = metadata.as_object_mut() {
            obj.insert("prover_pseudonym".to_string(), serde_json::Value::String(pseudonym.to_string()));
        }
    }
}

#[derive(Debug, Deserialize)]
pub struct ApprovePresentationRequestBody {
    pub holder_did: String,
    pub selected_attributes: serde_json::Value,
    pub zk_proofs: Option<Vec<serde_json::Value>>,
    #[serde(default)]
    pub anonymous_proof: Option<serde_json::Value>,
    #[serde(alias = "credentialId")]
    pub credential_id: Option<String>,
    #[serde(alias = "consentExpiresAt", alias = "consent_expires_at")]
    pub consent_expires_at: Option<String>,
    /// Client-signed Presentation JWT (Dilithium / alg=Dilithium).
    /// When present, the backend verifies and uses it directly. If absent,
    /// the backend creates a Dilithium-signed presentation JWT.
    #[serde(default)]
    pub signed_presentation_jwt: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct RejectRequestBody {
    pub holder_did: String,
    #[serde(default)]
    pub reason: Option<String>,
    #[serde(default)]
    pub error_code: Option<String>,
    #[serde(default)]
    pub details: Option<JsonValue>,
}

type HandlerResult = Result<Json<serde_json::Value>, (StatusCode, Json<serde_json::Value>)>;

fn failure_response(
    status: StatusCode,
    reason: impl Into<String>,
    error_code: impl Into<String>,
    details: Option<JsonValue>,
) -> (StatusCode, Json<serde_json::Value>) {
    let reason = reason.into();
    let error_code = error_code.into();

    let mut payload = serde_json::json!({
        "success": false,
        "reason": reason,
        "error_code": error_code,
    });

    if let Some(details_value) = details {
        if let Some(obj) = payload.as_object_mut() {
            obj.insert("details".to_string(), details_value);
        }
    }

    (status, Json(payload))
}

fn build_or_verify_pq_presentation_jwt(
    provided_jwt: Option<&str>,
    holder_did: &str,
    verifier_did: &str,
    credential_jwts: &[String],
) -> Result<String, (StatusCode, Json<serde_json::Value>)> {
    if let Some(jwt) = provided_jwt {
        crate::utils::jwt::verify_pq_jwt(jwt).map_err(|e| {
            failure_response(
                StatusCode::BAD_REQUEST,
                format!("Invalid Dilithium Presentation JWT: {}", e),
                "PRESENTATION_JWT_INVALID",
                None,
            )
        })?;

        return Ok(jwt.to_string());
    }

    let (public_key, private_key) = crate::utils::crypto::generate_dilithium_keypair().map_err(|e| {
        failure_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Failed to generate Dilithium presentation keypair: {}", e),
            "PRESENTATION_JWT_ERROR",
            None,
        )
    })?;

    crate::utils::jwt::create_pq_presentation_jwt(
        holder_did,
        Some(verifier_did),
        credential_jwts,
        &private_key,
        &public_key,
        Some(3600),
    )
    .map_err(|e| {
        failure_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Failed to create Dilithium Presentation JWT: {}", e),
            "PRESENTATION_JWT_ERROR",
            None,
        )
    })
}

fn infer_failure_code(
    rejection_reasons: &[String],
    credential_status: &str,
    missing_attributes: &HashSet<String>,
    attribute_value_mismatches: &[JsonValue],
) -> String {
    if rejection_reasons
        .iter()
        .any(|reason| reason.to_ascii_lowercase().contains("could not be found"))
    {
        return "CREDENTIAL_NOT_FOUND".to_string();
    }

    if credential_status.eq_ignore_ascii_case("revoked")
        || rejection_reasons
            .iter()
            .any(|reason| reason.to_ascii_lowercase().contains("revoked"))
    {
        return "CREDENTIAL_REVOKED".to_string();
    }

    if credential_status.eq_ignore_ascii_case("expired")
        || rejection_reasons
            .iter()
            .any(|reason| reason.to_ascii_lowercase().contains("expired"))
    {
        return "CREDENTIAL_EXPIRED".to_string();
    }

    if rejection_reasons
        .iter()
        .any(|reason| reason.to_ascii_lowercase().contains("not active"))
    {
        return "INVALID_CREDENTIAL_STATUS".to_string();
    }

    if !missing_attributes.is_empty() {
        return "MISSING_REQUIRED_ATTRIBUTES".to_string();
    }

    if !attribute_value_mismatches.is_empty() {
        return "ATTRIBUTE_VALUE_MISMATCH".to_string();
    }

    "VERIFICATION_FAILED".to_string()
}

fn format_verifier_display(verifier_name: &str, verifier_did: &str) -> String {
    let trimmed = verifier_name.trim();
    if !trimmed.is_empty() {
        return trimmed.to_string();
    }
    verifier_did
        .split(':')
        .last()
        .unwrap_or(verifier_did)
        .to_string()
}

async fn resolve_verifier_display(
    state: &AppState,
    verifier_name: &str,
    verifier_did: &str,
) -> String {
    let verifier_service = state.verifier_service();
    if let Ok(verifier) = verifier_service.get_verifier(verifier_did).await {
        if let Some(name) = verifier
            .get("name")
            .and_then(|value| value.as_str())
            .map(str::trim)
        {
            if !name.is_empty() {
                return name.to_string();
            }
        }
        if let Some(org) = verifier
            .get("organization")
            .and_then(|value| value.as_str())
            .map(str::trim)
        {
            if !org.is_empty() {
                return org.to_string();
            }
        }
    }

    format_verifier_display(verifier_name, verifier_did)
}

async fn create_presentation_request(
    State(state): State<AppState>,
    Json(body): Json<CreatePresentationRequestBody>,
) -> HandlerResult {
    tracing::info!(
        "Creating presentation request from verifier: {}",
        body.verifier_did
    );
    tracing::info!("Original holder_did from body: {}", body.holder_did);
    tracing::info!("Original holder_did length: {}", body.holder_did.len());

    // Normalize DIDs
    let verifier_did = normalize_did(&body.verifier_did).map_err(|e| {
        failure_response(
            StatusCode::BAD_REQUEST,
            format!("Invalid verifier DID: {}", e),
            "INVALID_VERIFIER_DID",
            None,
        )
    })?;
    let holder_did = normalize_did(&body.holder_did).map_err(|e| {
        failure_response(
            StatusCode::BAD_REQUEST,
            format!("Invalid holder DID: {}", e),
            "INVALID_HOLDER_DID",
            None,
        )
    })?;
    // Build DID candidates
    let mut did_candidates = vec![holder_did.clone()];
    if let Ok(frontend_form) = did_to_frontend_format(&holder_did) {
        if frontend_form != holder_did {
            did_candidates.push(frontend_form);
        }
    }

    tracing::info!("Normalized holder_did: {}", holder_did);
    tracing::info!("Normalized holder_did length: {}", holder_did.len());
    tracing::info!("DID candidates for storage: {:?}", did_candidates);
    tracing::info!("Will store holder_did as: {}", holder_did);

    let credential_service = state.credential_service();
    let credential = credential_service
        .get_credential_by_id(&body.credential_id)
        .await
        .map_err(|e| failure_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Database error: {}", e),
            "DATABASE_ERROR",
            None,
        ))?
        .ok_or_else(|| {
            failure_response(
                StatusCode::NOT_FOUND,
                format!("Credential {} not found", body.credential_id),
                "CREDENTIAL_NOT_FOUND",
                None,
            )
        })?;

    // Check if credential is active
    if credential.status != crate::models::CredentialStatus::Active {
        return Err(failure_response(
            StatusCode::BAD_REQUEST,
            format!(
                "Cannot create presentation request: credential status is {:?}",
                credential.status
            ),
            "INVALID_CREDENTIAL_STATUS",
            None,
        ));
    }

    // Check if credential is not expired
    if let Some(expires_at) = credential.expires_at {
        if expires_at <= chrono::Utc::now() {
            return Err(failure_response(
                StatusCode::BAD_REQUEST,
                "Cannot create presentation request: credential has expired",
                "CREDENTIAL_EXPIRED",
                None,
            ));
        }
    }

    // Check if credential belongs to holder
    if credential.owner_did != holder_did {
        return Err(failure_response(
            StatusCode::FORBIDDEN,
            "Credential does not belong to the holder",
            "CREDENTIAL_NOT_OWNED",
            None,
        ));
    }

    tracing::info!("Credential {} is active and valid", body.credential_id);

    // Create presentation request
    let mut request = VerifierPresentationRequest::new(
        verifier_did.clone(),
        body.verifier_name.clone(),
        holder_did.clone(),
        body.credential_id.clone(),
        body.purpose.clone(),
        body.required_attributes.clone(),
        body.required_predicates.clone().map(|predicates| {
            predicates.into_iter().map(|p| serde_json::to_value(p).unwrap_or_default()).collect()
        }),
        body.required_attribute_values.clone(),
    );

    request.holder_pseudonym = Some(build_pairwise_pseudonym(
        &holder_did,
        &verifier_did,
        &request.request_id,
    ));

    // Add optional fields
    request.requested_attributes = body.requested_attributes.clone();
    if let Some(presentation_id) = body
        .presentation_id
        .as_ref()
        .filter(|id| !id.trim().is_empty())
    {
        request.presentation_id = Some(presentation_id.clone());
    }

    // Store in database
    let db = state.db();
    let collection = db
        .db
        .collection::<VerifierPresentationRequest>("verifier_presentation_requests");
    collection.insert_one(&request).await.map_err(|e| {
        failure_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Database error: {}", e),
            "DATABASE_ERROR",
            None,
        )
    })?;

    tracing::info!("Presentation request created: {}", request.request_id);

    if let Ok(blockchain_client_lock) = state.get_blockchain_client().await {
        let client_opt = blockchain_client_lock.read().await;
        if let Some(client) = client_opt.as_ref() {
            // Create hash of presentation request for blockchain
            let request_hash = crate::utils::crypto::hash_to_hex(
                serde_json::to_string(&request)
                    .unwrap_or_default()
                    .as_bytes(),
            );

            tracing::info!("Presentation request hash: {}", request_hash);
        }
    }

    let qr_payload = serde_json::json!({
        "type": "presentation_request",
        "request_id": request.request_id.clone(),
        "verifier_did": request.verifier_did.clone(),
        "verifier_name": request.verifier_name.clone(),
        "required_attributes": request.required_attributes.clone(),
        "required_attribute_values": request.required_attribute_values.clone(),
        "required_issuers": request.required_issuers.clone(),
        "required_predicates": request.required_predicates.clone(),
        "purpose": request.purpose.clone(),
        "presentation_id": request.presentation_id,
        "expires_at": request.expires_at.to_rfc3339(),
    });

    tracing::info!(
        "QR Payload: {}",
        serde_json::to_string_pretty(&qr_payload).unwrap_or_default()
    );

    let verifier_display = resolve_verifier_display(&state, &request.verifier_name, &request.verifier_did).await;
    let credential_type = credential.credential_type.clone();

    let is_anonymous_mode = body.anonymous_proof.is_some();
    let mut metadata = HashMap::new();
    metadata.insert("holder_did".to_string(), holder_did.clone());
    metadata.insert("verifier_did".to_string(), request.verifier_did.clone());
    metadata.insert("request_id".to_string(), request.request_id.clone());
    metadata.insert("purpose".to_string(), request.purpose.clone());
    metadata.insert("credential_type".to_string(), credential_type.clone());
    if !is_anonymous_mode {
        metadata.insert("credential_id".to_string(), request.credential_id.clone());
    }

    let mut sanitized_metadata = HashMap::new();
    sanitized_metadata.insert("verifier_name".to_string(), verifier_display.clone());
    sanitized_metadata.insert(
        "summary".to_string(),
        format!("{} requested {}", verifier_display, credential_type),
    );
    sanitized_metadata.insert("credential_type".to_string(), credential_type.clone());
    if !is_anonymous_mode {
        sanitized_metadata.insert("credential_id".to_string(), request.credential_id.clone());
    }

    if let Err(error) = state
        .wallet_activity_service()
        .record_activity(NewWalletActivity {
            holder_did: holder_did.clone(),
            activity_type: WalletActivityType::VerificationCompleted,
            status: WalletActivityStatus::Pending,
            title: format!("Verification request from {}", verifier_display),
            description: format!(
                "{} is requesting access to your credential for {}",
                verifier_display, request.purpose
            ),
            metadata,
            sanitized_metadata,
            created_at: Some(request.created_at),
        })
        .await
    {
        tracing::warn!(error = ?error, "failed to record wallet activity for presentation request creation");
    }

    Ok(Json(json!({
        "success": true,
        "request_id": request.request_id,
        "qr_payload": qr_payload,
        "message": "Presentation request created successfully"
    })))
}

async fn get_pending_requests(
    State(state): State<AppState>,
    Path(holder_did_raw): Path<String>,
) -> HandlerResult {
    tracing::info!("Original holder_did from URL: {}", holder_did_raw);

    let holder_did = normalize_did(&holder_did_raw).map_err(|e| {
        failure_response(
            StatusCode::BAD_REQUEST,
            format!("Invalid holder DID: {}", e),
            "INVALID_HOLDER_DID",
            None,
        )
    })?;

    let mut did_candidates = vec![holder_did.clone()];
    if let Ok(frontend_form) = did_to_frontend_format(&holder_did) {
        if frontend_form != holder_did {
            did_candidates.push(frontend_form);
        }
    }
    tracing::info!("Normalized holder_did: {}", holder_did);
    tracing::info!("Checking pending requests for holder: {}", holder_did);
    tracing::info!("holder_did length: {}", holder_did.len());
    tracing::info!("DID candidates for query: {:?}", did_candidates);

    let db = state.db();
    let collection = db
        .db
        .collection::<VerifierPresentationRequest>("verifier_presentation_requests");

    let filter = doc! {
        "holder_did": { "$in": did_candidates.clone() },
        "status": "pending",
    };

    tracing::info!("MongoDB filter: {:?}", filter);
    tracing::info!(
        "Searching for requests with holder_did in: {:?}",
        did_candidates
    );

    let mut cursor = collection.find(filter).await.map_err(|e| {
        failure_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Database error: {}", e),
            "DATABASE_ERROR",
            None,
        )
    })?;

    let mut requests = Vec::new();
    use futures::stream::StreamExt;
    while let Some(result) = cursor.next().await {
        match result {
            Ok(request) => {
                requests.push(sanitize_presentation_request(&request));
            }
            Err(e) => {
                tracing::error!("Error reading request: {}", e);
                continue;
            }
        }
    }

    tracing::info!("Found {} pending request(s) for holder", requests.len());

    Ok(Json(json!({
        "success": true,
        "requests": requests
    })))
}

async fn approve_presentation_request(
    State(state): State<AppState>,
    Path(request_id): Path<String>,
    Json(body): Json<ApprovePresentationRequestBody>,
) -> HandlerResult {
    tracing::info!("=== APPROVE PRESENTATION REQUEST START ===");
    tracing::info!("Request ID: {}", request_id);
    tracing::info!("Request Body: {:?}", body);
    
    let holder_did = normalize_did(&body.holder_did)
        .map_err(|e| failure_response(
            StatusCode::BAD_REQUEST,
            format!("Invalid holder DID: {}", e),
            "INVALID_HOLDER_DID",
            None,
        ))?;
    let mut did_candidates = vec![holder_did.clone()];
    if let Ok(frontend_form) = did_to_frontend_format(&holder_did) {
        if frontend_form != holder_did {
            did_candidates.push(frontend_form);
        }
    }

    tracing::info!("Holder DID: {}", holder_did);
    tracing::info!("DID candidates: {:?}", did_candidates);

    let db = state.db();
    let collection = db
        .db
        .collection::<VerifierPresentationRequest>("verifier_presentation_requests");

    let filter = doc! {
        "request_id": &request_id,
        "status": "pending",
    };

    tracing::info!("Filter: {:?}", filter);

    let request = collection.find_one(filter.clone()).await.map_err(|e| {
        failure_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Database error: {}", e),
            "DATABASE_ERROR",
            None,
        )
    })?;

    if request.is_none() {
        tracing::warn!("Request not found with status=pending, trying without status filter...");
        let debug_filter = doc! {
            "request_id": &request_id,
            "holder_did": { "$in": did_candidates.clone() },
        };
        if let Ok(Some(debug_req)) = collection.find_one(debug_filter).await {
            tracing::warn!("Found request but status is: {:?}", debug_req.status);
            tracing::warn!("Request holder_did: {}", debug_req.holder_did);
            tracing::warn!("Request created_at: {:?}", debug_req.created_at);
            tracing::warn!("Request expires_at: {:?}", debug_req.expires_at);
        } else {
            tracing::warn!("Request not found even without status filter!");
            if let Ok(Some(any_req)) = collection
                .find_one(doc! { "request_id": &request_id })
                .await
            {
                tracing::warn!("Found request with ID but holder_did mismatch!");
                tracing::warn!("Expected holder_did: {:?}", did_candidates);
                tracing::warn!("Actual holder_did: {}", any_req.holder_did);
            } else {
                tracing::warn!("Request ID not found in database at all!");
                tracing::warn!("Looking for request_id: {}", request_id);

                if let Ok(all_requests) = collection
                    .find(doc! {
                        "holder_did": { "$in": did_candidates.clone() },
                        "status": "pending"
                    })
                    .await
                {
                    use futures::TryStreamExt;
                    if let Ok(requests) = all_requests.try_collect::<Vec<_>>().await {
                        tracing::warn!(
                            "Found {} pending requests for this holder:",
                            requests.len()
                        );
                        for (idx, req) in requests.iter().enumerate() {
                            tracing::warn!(
                                "[{}] request_id: {}, verifier: {}, created: {:?}",
                                idx,
                                req.request_id,
                                req.verifier_did,
                                req.created_at
                            );
                        }
                    }
                }
            }
        }
    }

    let request = request.ok_or_else(|| {
        failure_response(
            StatusCode::NOT_FOUND,
            "Presentation request not found or already processed",
            "PRESENTATION_REQUEST_NOT_FOUND",
            None,
        )
    })?;

    // Check expiration
    let now = chrono::Utc::now();
    if request.expires_at < now {
        return Err(failure_response(
            StatusCode::BAD_REQUEST,
            "Presentation request has expired",
            "PRESENTATION_REQUEST_EXPIRED",
            None,
        ));
    }

    let is_anonymous_mode = body.anonymous_proof.is_some();

    // Prepare presentation data
    let mut presentation_data: HashMap<String, serde_json::Value> = HashMap::new();
    presentation_data.insert(
        "request_id".to_string(),
        serde_json::json!(request_id.clone()),
    );
    if !is_anonymous_mode {
        presentation_data.insert(
            "holder_did".to_string(),
            serde_json::json!(holder_did.clone()),
        );
    }
    presentation_data.insert(
        "approved_at".to_string(),
        serde_json::json!(now.to_rfc3339()),
    );
    
    // For non-anonymous mode, encrypt selected_attributes before storing
    let (stored_attributes, is_encrypted) = if is_anonymous_mode {
        // Anonymous mode: mask values
        (sanitize_selected_attributes_value(&body.selected_attributes, true), false)
    } else {
        // Normal mode: encrypt values to protect privacy in MongoDB
        encrypt_selected_attributes(&body.selected_attributes)
            .map_err(|e| failure_response(
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Failed to encrypt attributes: {}", e),
                "ENCRYPTION_ERROR",
                None,
            ))?
    };
    
    presentation_data.insert(
        "selected_attributes".to_string(),
        stored_attributes,
    );
    presentation_data.insert(
        "attributes_encrypted".to_string(),
        serde_json::json!(is_encrypted),
    );
    presentation_data.insert(
        "purpose".to_string(),
        serde_json::json!(request.purpose.clone()),
    );


    if is_anonymous_mode {
        let masked_attr_keys: Vec<String> = body
            .selected_attributes
            .as_object()
            .map(|obj| obj.keys().cloned().collect())
            .unwrap_or_default();

        presentation_data.insert(
            "_anonymous_metadata".to_string(),
            serde_json::json!({
                "unlinkable": true,
                "presentation_mode": "anonymous",
                "masked_attributes": masked_attr_keys,
                "request_id": request_id.clone(),
                "verifier_did": request.verifier_did.clone(),
                "timestamp": now.timestamp(),
            }),
        );
    }

    let holder_pseudonym = request
        .holder_pseudonym
        .clone()
        .unwrap_or_else(|| {
            build_pairwise_pseudonym(
                &request.holder_did,
                &request.verifier_did,
                &request.request_id,
            )
        });
    presentation_data.insert(
        "holder_pseudonym".to_string(),
        serde_json::json!(holder_pseudonym.clone()),
    );
    let mut parsed_predicate_proofs: Vec<PredicateProof> = Vec::new();
    if let Some(proofs) = &body.zk_proofs {
        presentation_data.insert("zk_proofs".to_string(), serde_json::json!(proofs));

        for proof_value in proofs {
            let mut normalized_value = proof_value.clone();
            if let Some(proof_obj) = normalized_value.as_object_mut() {
                if let Some(range_value) = proof_obj.get_mut("range_proof") {
                    if let Some(range_obj) = range_value.as_object_mut() {
                        for key in ["proof", "commitment"] {
                            if let Some(field_value) = range_obj.get_mut(key) {
                                if let Some(hex_str) = field_value.as_str() {
                                    let decoded = hex::decode(hex_str).map_err(|e| {
                                        failure_response(
                                            StatusCode::BAD_REQUEST,
                                            format!(
                                                "Invalid predicate proof payload: failed to decode {} hex: {}",
                                                key, e
                                            ),
                                            "INVALID_PREDICATE_PROOF",
                                            None,
                                        )
                                    })?;
                                    let byte_array: Vec<JsonValue> = decoded.into_iter().map(|b| json!(b)).collect();
                                    *field_value = JsonValue::Array(byte_array);
                                }
                            }
                        }
                    }
                }
            }

            let parsed_proof = serde_json::from_value::<PredicateProof>(normalized_value).map_err(|e| {
                failure_response(
                    StatusCode::BAD_REQUEST,
                    format!("Invalid predicate proof payload: {}", e),
                    "INVALID_PREDICATE_PROOF",
                    None,
                )
            })?;
            parsed_predicate_proofs.push(parsed_proof);
        }
    }

    let credential_id_from_body = body
        .credential_id
        .as_ref()
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string());

    let credential_id_to_use = credential_id_from_body
        .clone()
        .unwrap_or_else(|| request.credential_id.clone());

    if credential_id_to_use.trim().is_empty() {
        return Err(failure_response(
            StatusCode::BAD_REQUEST,
            "Credential ID is required to approve this presentation",
            "CREDENTIAL_ID_REQUIRED",
            None,
        ));
    }

    let credential_service = state.credential_service();
    let credential_opt = credential_service
        .get_credential_by_id(&credential_id_to_use)
        .await
        .map_err(|e| {
            failure_response(
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Database error: {}", e),
                "DATABASE_ERROR",
                None,
            )
        })?;

    let resolved_credential_type = credential_opt
        .as_ref()
        .map(|cred| cred.credential_type.clone())
        .unwrap_or_else(|| "credential".to_string());

    let credential_jwts_for_presentation: Vec<String> = credential_opt
        .as_ref()
        .map(|cred| vec![cred.jwt.clone()])
        .unwrap_or_default();

    let presentation_jwt = build_or_verify_pq_presentation_jwt(
        body.signed_presentation_jwt.as_deref(),
        &holder_did,
        &request.verifier_did,
        &credential_jwts_for_presentation,
    )?;

    let mut rejection_reasons: Vec<String> = Vec::new();
    let mut credential_status_str = "active".to_string();
    let mut anonymous_revealed_attributes: Option<HashMap<String, String>> = None;

    if let Some(cred) = credential_opt.as_ref() {
        tracing::info!(
            "Credential lookup succeeded for request {}: id={}, status={:?}",
            request_id, cred.id, cred.status
        );

        match cred.status {
            CredentialStatus::Active => {
                credential_status_str = "active".to_string();
            }
            CredentialStatus::Revoked => {
                credential_status_str = "revoked".to_string();
                rejection_reasons.push("Credential has been revoked".to_string());
            }
            _ => {
                credential_status_str = "revoked".to_string();
                rejection_reasons
                    .push("Credential status is not active".to_string());
            }
        }

        if let Some(expires_at) = cred.expires_at {
            if expires_at <= chrono::Utc::now() {
                credential_status_str = "expired".to_string();
                rejection_reasons.push("Credential has expired".to_string());
            }
        }
    } else {
        credential_status_str = "revoked".to_string();
        rejection_reasons.push("Credential could not be found".to_string());
    }

    // Add attribute metadata
    let provided_attributes: Vec<String> = if let Some(obj) = body.selected_attributes.as_object() {
        obj.keys().map(|k| k.to_string()).collect()
    } else {
        Vec::new()
    };
    let provided_attribute_set: HashSet<String> = provided_attributes
        .iter()
        .map(|attr| attr.trim().to_lowercase())
        .collect();
    let mut missing_required_attributes: HashSet<String> = HashSet::new();
    let mut attribute_value_mismatch_details: Vec<JsonValue> = Vec::new();
    let mut predicate_validation_errors: Vec<JsonValue> = Vec::new();
    let mut validated_predicate_proofs: Vec<PredicateProof> = Vec::new();
    presentation_data.insert(
        "provided_attributes".to_string(),
        serde_json::json!(provided_attributes),
    );
    if !request.required_attributes.is_empty() {
        presentation_data.insert(
            "required_attributes".to_string(),
            serde_json::json!(request.required_attributes.clone()),
        );

        for attr in &request.required_attributes {
            let normalized_attr = attr.trim().to_lowercase();
            if !normalized_attr.is_empty() && !provided_attribute_set.contains(&normalized_attr) {
                missing_required_attributes.insert(attr.to_string());
            }
        }
    }

    // Also check predicate attributes - they should be present in the credential
    // even if not shared as plaintext (for ZK proof generation)
    if let Some(required_predicates) = &request.required_predicates {
        for predicate in required_predicates {
            let predicate_attr = predicate.get("attribute").and_then(|v| v.as_str()).unwrap_or("");
            let normalized_attr = predicate_attr.trim().to_lowercase();
            if !normalized_attr.is_empty() && !provided_attribute_set.contains(&normalized_attr) {
                // For predicates, we don't add to missing_required_attributes if ZK proof is provided
                // but we log it for debugging
                tracing::warn!(
                    "Predicate attribute '{}' not found in provided attributes, will rely on ZK proof",
                    predicate_attr
                );
            }
        }
    }
    presentation_data.insert(
        "anonymous_mode".to_string(),
        serde_json::json!(body.anonymous_proof.is_some()),
    );
    presentation_data.insert(
        "credential_status".to_string(),
        serde_json::json!(credential_status_str.clone()),
    );

    if let Some(required_values) = request.required_attribute_values.clone() {
        presentation_data.insert(
            "required_attribute_values".to_string(),
            serde_json::json!(required_values),
        );
    }

    if let Some(expires_str) = body.consent_expires_at.as_ref() {
        presentation_data.insert(
            "consent_expires_at".to_string(),
            serde_json::json!(expires_str),
        );
    } else if credential_status_str == "expired" {
        presentation_data.insert(
            "consent_expires_at".to_string(),
            serde_json::json!(Utc::now().to_rfc3339()),
        );
    }

    if let Some(cred) = credential_opt.as_ref() {
        match cred.status {
            CredentialStatus::Active => {
                credential_status_str = "active".to_string();
            }
            CredentialStatus::Revoked => {
                credential_status_str = "revoked".to_string();
                if !rejection_reasons
                    .iter()
                    .any(|msg| msg.contains("revoked"))
                {
                    rejection_reasons.push("Credential has been revoked".to_string());
                }
            }
            _ => {
                credential_status_str = "revoked".to_string();
                if !rejection_reasons
                    .iter()
                    .any(|msg| msg.contains("status is not active"))
                {
                    rejection_reasons
                        .push("Credential status is not active".to_string());
                }
            }
        }
    }

    // Normalize selected attribute values for case-insensitive checks
    let mut normalized_selected_values: HashMap<String, (String, String)> = HashMap::new();
    if let Some(obj) = body.selected_attributes.as_object() {
        for (key, value) in obj {
            let normalized_key = key.trim().to_lowercase();
            let raw_value = value
                .as_str()
                .map(|s| s.to_string())
                .unwrap_or_else(|| value.to_string());
            let normalized_value = raw_value.trim().to_lowercase();
            normalized_selected_values.insert(normalized_key, (raw_value, normalized_value));
        }
    }

    if let Some(revealed) = anonymous_revealed_attributes.as_ref() {
        for (key, value) in revealed {
            let normalized_key = key.trim().to_lowercase();
            if normalized_key.is_empty() {
                continue;
            }

            let raw_value = value.clone();
            let normalized_value = raw_value.trim().to_lowercase();
            normalized_selected_values.insert(normalized_key, (raw_value, normalized_value));
        }
    }

    let mut predicate_proofs_by_attr: HashMap<String, Vec<PredicateProof>> = HashMap::new();
    for proof in parsed_predicate_proofs {
        let normalized_attr = proof.attribute_name.trim().to_lowercase();
        if normalized_attr.is_empty() {
            let reason = "Predicate proof attribute name is empty".to_string();
            rejection_reasons.push(reason.clone());
            predicate_validation_errors.push(json!({
                "reason": "empty_attribute",
                "attribute": proof.attribute_name,
            }));
            continue;
        }

        predicate_proofs_by_attr
            .entry(normalized_attr)
            .or_insert_with(Vec::new)
            .push(proof);
    }

    if let Some(required_predicates) = request.required_predicates.as_ref() {
        tracing::info!(
            "Processing {} required predicates for request {}",
            required_predicates.len(),
            request_id
        );
        
        presentation_data.insert(
            "required_predicates".to_string(),
            serde_json::json!(required_predicates),
        );

        for predicate_req in required_predicates {
            let attr_key = predicate_req.get("attribute").and_then(|v| v.as_str()).unwrap_or("").trim().to_lowercase();
            if attr_key.is_empty() {
                continue;
            }

            let candidate_summaries: Vec<String> = predicate_proofs_by_attr
                .get(&attr_key)
                .map(|vec| {
                    vec.iter()
                        .map(|proof| format!("{} {}", proof.predicate_type, proof.predicate_value))
                        .collect()
                })
                .unwrap_or_default();
            let had_candidate = !candidate_summaries.is_empty();

            let mut matched_proof: Option<PredicateProof> = None;
            if let Some(vec) = predicate_proofs_by_attr.get_mut(&attr_key) {
                if let Some(index) = vec.iter().position(|proof| {
                    let operator = predicate_req.get("operator").and_then(|v| v.as_str()).unwrap_or("");
                    let value = predicate_req.get("value").and_then(|v| v.as_i64()).unwrap_or(0);
                    proof.predicate_type == operator
                        && proof.predicate_value == value
                }) {
                    matched_proof = Some(vec.remove(index));
                }
            }

            if let Some(vec) = predicate_proofs_by_attr.get(&attr_key) {
                if vec.is_empty() {
                    predicate_proofs_by_attr.remove(&attr_key);
                }
            }

            let attribute_label = predicate_req.get("attribute").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let operator_label = predicate_req.get("operator").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let value = predicate_req.get("value").and_then(|v| v.as_i64()).unwrap_or(0);

            match matched_proof {
                Some(proof) => match zk_proofs::verify_predicate_proof(&proof) {
                    Ok(true) => {
                        validated_predicate_proofs.push(proof);
                    }
                    Ok(false) => {
                        let reason = format!(
                            "Predicate proof verification failed for attribute '{}'",
                            attribute_label
                        );
                        rejection_reasons.push(reason.clone());
                        predicate_validation_errors.push(json!({
                            "attribute": attribute_label,
                            "operator": operator_label,
                            "expected_value": value,
                            "reason": "verification_failed",
                        }));
                    }
                    Err(e) => {
                        let reason = format!(
                            "Failed to verify predicate proof for attribute '{}': {}",
                            attribute_label, e
                        );
                        rejection_reasons.push(reason.clone());
                        predicate_validation_errors.push(json!({
                            "attribute": attribute_label,
                            "operator": operator_label,
                            "expected_value": value,
                            "reason": "verification_error",
                            "error": e.to_string(),
                        }));
                    }
                },
                None => {
                    let reason = if had_candidate {
                        tracing::warn!(
                            "Predicate proof mismatch for '{}': expected {} {} but got {:?}",
                            attribute_label, operator_label, value, candidate_summaries
                        );
                        "Predicate proof did not match the required condition".to_string()
                    } else {
                        tracing::error!(
                            "Missing predicate proof for attribute '{}' with operator {} {} - no proofs provided for this attribute",
                            attribute_label, operator_label, value
                        );
                        "Predicate proof was not provided for a required condition".to_string()
                    };

                    rejection_reasons.push(reason.clone());
                    predicate_validation_errors.push(json!({
                        "attribute": attribute_label,
                        "operator": operator_label,
                        "expected_value": value,
                        "reason": if had_candidate { "mismatched_proof" } else { "missing_proof" },
                        "received": candidate_summaries,
                    }));
                },
            }
        }
    }

    for (_attribute, proofs) in predicate_proofs_by_attr.into_iter() {
        for proof in proofs {
            match zk_proofs::verify_predicate_proof(&proof) {
                Ok(true) => {
                    validated_predicate_proofs.push(proof);
                }
                Ok(false) => {
                    let reason = format!(
                        "Predicate proof verification failed for attribute '{}'",
                        proof.attribute_name
                    );
                    rejection_reasons.push(reason.clone());
                    predicate_validation_errors.push(json!({
                        "attribute": proof.attribute_name,
                        "operator": proof.predicate_type,
                        "expected_value": proof.predicate_value,
                        "reason": "verification_failed",
                    }));
                }
                Err(e) => {
                    let reason = format!(
                        "Failed to verify predicate proof for attribute '{}': {}",
                        proof.attribute_name, e
                    );
                    rejection_reasons.push(reason.clone());
                    predicate_validation_errors.push(json!({
                        "attribute": proof.attribute_name,
                        "operator": proof.predicate_type,
                        "expected_value": proof.predicate_value,
                        "reason": "verification_error",
                        "error": e.to_string(),
                    }));
                }
            }
        }
    }

    if !validated_predicate_proofs.is_empty() {
        let predicate_proofs_json = serde_json::json!(validated_predicate_proofs);
        presentation_data.insert(
            "predicate_proofs".to_string(),
            predicate_proofs_json.clone(),
        );
        presentation_data.insert("predicateProofs".to_string(), predicate_proofs_json);
    }

    if !predicate_validation_errors.is_empty() {
        presentation_data.insert(
            "predicate_validation_errors".to_string(),
            serde_json::json!(predicate_validation_errors),
        );
    }

    if let Some(required_value_map) = request.required_attribute_values.as_ref() {
        for (attribute, allowed_values) in required_value_map {
            let normalized_attribute = attribute.trim().to_lowercase();
            if allowed_values.is_empty() {
                if !normalized_selected_values.contains_key(&normalized_attribute) {
                    rejection_reasons.push(format!(
                        "Attribute '{}' was not provided",
                        attribute
                    ));
                    missing_required_attributes.insert(attribute.to_string());
                }
                continue;
            }

            match normalized_selected_values.get(&normalized_attribute) {
                Some((raw_value, normalized_value)) => {
                    let is_match = allowed_values.iter().any(|candidate| {
                        candidate.trim().eq_ignore_ascii_case(raw_value)
                            || candidate.trim().to_lowercase() == *normalized_value
                    });

                    if !is_match {
                        rejection_reasons.push(format!(
                            "Attribute '{}' value '{}' is not allowed.",
                            attribute, raw_value
                        ));
                        attribute_value_mismatch_details.push(json!({
                            "attribute": attribute,
                            "provided": raw_value,
                            "accepted_values": allowed_values,
                        }));
                    }
                }
                None => {
                    rejection_reasons.push(format!(
                        "Attribute '{}' was not provided.",
                        attribute
                    ));
                    missing_required_attributes.insert(attribute.to_string());
                }
            }
        }
    }

    if !missing_required_attributes.is_empty() {
        presentation_data.insert(
            "missing_attributes".to_string(),
            json!(missing_required_attributes.iter().cloned().collect::<Vec<String>>()),
        );
    }

    if !attribute_value_mismatch_details.is_empty() {
        presentation_data.insert(
            "attribute_value_mismatches".to_string(),
            json!(attribute_value_mismatch_details.clone()),
        );
    }

    let verifier_display = resolve_verifier_display(&state, &request.verifier_name, &request.verifier_did).await;

    let final_valid = rejection_reasons.is_empty();

    if !final_valid {
        let rejection_reason = rejection_reasons.join("; ");

        let failure_code = infer_failure_code(
            &rejection_reasons,
            &credential_status_str,
            &missing_required_attributes,
            &attribute_value_mismatch_details,
        );

        let mut failure_details = json!({
            "rejection_reasons": rejection_reasons,
        });

        if !missing_required_attributes.is_empty() {
            failure_details
                .as_object_mut()
                .expect("failure_details should be an object")
                .insert(
                    "missing_attributes".to_string(),
                    json!(missing_required_attributes.iter().cloned().collect::<Vec<String>>()),
                );
        }

        if !attribute_value_mismatch_details.is_empty() {
            failure_details
                .as_object_mut()
                .expect("failure_details should be an object")
                .insert("attribute_value_mismatches".to_string(), json!(attribute_value_mismatch_details));
        }

        presentation_data.insert(
            "rejection_reasons".to_string(),
            json!(rejection_reasons.clone()),
        );
        presentation_data.insert("failure_code".to_string(), json!(failure_code.clone()));
        presentation_data.insert("failure_details".to_string(), failure_details.clone());

        let mut metadata = HashMap::new();
        metadata.insert("holder_did".to_string(), holder_did.clone());
        metadata.insert("verifier_did".to_string(), request.verifier_did.clone());
        metadata.insert("request_id".to_string(), request.request_id.clone());
        metadata.insert("credential_id".to_string(), credential_id_to_use.clone());
        metadata.insert("credential_type".to_string(), resolved_credential_type.clone());
        metadata.insert("rejection_reason".to_string(), rejection_reason.clone());
        metadata.insert("failure_code".to_string(), failure_code.clone());

        let mut sanitized_metadata = HashMap::new();
        sanitized_metadata.insert("verifier_name".to_string(), verifier_display.clone());
        sanitized_metadata.insert("credential_type".to_string(), resolved_credential_type.clone());
        sanitized_metadata.insert("credential_id".to_string(), credential_id_to_use.clone());
        sanitized_metadata.insert("status".to_string(), "failed".to_string());
        sanitized_metadata.insert(
            "summary".to_string(),
            format!(
                "Presentation for {} rejected by {}",
                resolved_credential_type, verifier_display
            ),
        );

        if let Err(error) = state
            .wallet_activity_service()
            .record_activity(NewWalletActivity {
                holder_did: holder_did.clone(),
                activity_type: WalletActivityType::VerificationCompleted,
                status: WalletActivityStatus::Failed,
                title: format!("Presentation failed verification for {}", verifier_display),
                description: rejection_reason.clone(),
                metadata,
                sanitized_metadata,
                created_at: Some(now),
            })
            .await
        {
            tracing::warn!(
                error = ?error,
                "failed to record wallet activity for presentation rejection"
            );
        }

        let holder_did_display = did_to_frontend_format(&holder_did).unwrap_or_else(|_| holder_did.clone());

        let mut verifier_metadata = HashMap::new();
        verifier_metadata.insert("holder_did".to_string(), holder_did_display);
        verifier_metadata.insert("request_id".to_string(), request.request_id.clone());
        verifier_metadata.insert("credential_type".to_string(), resolved_credential_type.clone());
        verifier_metadata.insert("failure_code".to_string(), failure_code.clone());
        verifier_metadata.insert("verifier_name".to_string(), verifier_display.clone());
        verifier_metadata.insert("rejection_reasons".to_string(), rejection_reasons.join("; "));
        if !missing_required_attributes.is_empty() {
            if let Ok(serialized) = serde_json::to_string(
                &missing_required_attributes
                    .iter()
                    .cloned()
                    .collect::<Vec<_>>(),
            ) {
                verifier_metadata.insert("missing_attributes".to_string(), serialized);
            }
        }
        if !attribute_value_mismatch_details.is_empty() {
            if let Ok(serialized) = serde_json::to_string(&attribute_value_mismatch_details) {
                verifier_metadata.insert("attribute_value_mismatches".to_string(), serialized);
            }
        }
        if let Ok(serialized) = serde_json::to_string(&failure_details) {
            verifier_metadata.insert("failure_details".to_string(), serialized);
        }

        record_verifier_activity(
            &state,
            &request.verifier_did,
            VerifierActivityStatus::Failed,
            format!("Verification failed for {}", resolved_credential_type),
            rejection_reason.clone(),
            verifier_metadata,
        )
        .await;

        let presentation_data_doc = to_document(&presentation_data).map_err(|e| {
            failure_response(
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Failed to serialize presentation data: {}", e),
                "SERIALIZATION_ERROR",
                None,
            )
        })?;
        let failure_details_bson = to_bson(&failure_details).map_err(|e| {
            failure_response(
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Failed to serialize failure details: {}", e),
                "SERIALIZATION_ERROR",
                None,
            )
        })?;

        let rejection_update = doc! {
            "$set": {
                "status": "rejected",
                "rejection_reason": rejection_reason.clone(),
                "failure_code": &failure_code,
                "failure_details": failure_details_bson,
                "presentation_data": presentation_data_doc.clone(),
                "updated_at": BsonDateTime::from_millis(now.timestamp_millis()),
                "credential_id": &credential_id_to_use,
                "holder_did": &holder_did,
            }
        };

        collection
            .update_one(filter.clone(), rejection_update)
            .await
            .map_err(|e| {
                failure_response(
                    StatusCode::INTERNAL_SERVER_ERROR,
                    format!("Database error: {}", e),
                    "DATABASE_ERROR",
                    None,
                )
            })?;

        tracing::warn!(
            "Rejecting presentation request {} due to: {}",
            request_id, rejection_reason
        );

        // Persist rejected presentation so verifier activity can surface failures
        let rejected_presentation = Presentation {
            id: uuid::Uuid::new_v4().to_string(),
            prover_did: holder_did.clone(),
            prover_pseudonym: None,
            verifier_did: request.verifier_did.clone(),
            presentation_type: "credential_presentation".to_string(),
            credential_ids: vec![credential_id_to_use.clone()],
            presentation_data: presentation_data.clone(),
            jwt: presentation_jwt.clone(),
            status: PresentationStatus::Failed,
            created_at: now,
            verified_at: Some(now),
            is_verified: false,
        };

        if let Err(error) = state.db().save_presentation(&rejected_presentation).await {
            tracing::warn!(
                error = ?error,
                "failed to persist rejected presentation for request {}",
                request_id
            );
        }

        return Err(failure_response(
            StatusCode::BAD_REQUEST,
            rejection_reason,
            failure_code,
            Some(failure_details),
        ));
    }

    let presentation_data_doc = to_document(&presentation_data).map_err(|e| {
        failure_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Failed to serialize presentation data: {}", e),
            "SERIALIZATION_ERROR",
            None,
        )
    })?;

    let approval_update = doc! {
        "$set": {
            "status": "approved",
            "presentation_data": presentation_data_doc,
            "updated_at": BsonDateTime::from_millis(now.timestamp_millis()),
            "credential_id": &credential_id_to_use,
            "holder_did": &holder_did,
        }
    };

    collection
        .update_one(filter, approval_update)
        .await
        .map_err(|e| {
            failure_response(
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Database error: {}", e),
                "DATABASE_ERROR",
                None,
            )
        })?;

    tracing::info!("Presentation request approved: {}", request_id);

    if let Some(ref cred) = credential_opt {
        if !is_anonymous_mode {
            presentation_data.insert(
                "credential_id".to_string(),
                serde_json::json!(cred.id.clone()),
            );
            presentation_data.insert(
                "ipfs_hash".to_string(),
                serde_json::json!(cred.ipfs_hash.clone()),
            );
            presentation_data.insert(
                "ipfs_gateway_url".to_string(),
                serde_json::json!(cred.ipfs_gateway_url.clone()),
            );
            if let Some(tx_hash) = cred.blockchain_tx_hash.clone() {
                presentation_data.insert("blockchain_tx".to_string(), serde_json::json!(tx_hash));
            }
            if let Some(reference) = cred.blockchain_reference.clone() {
                presentation_data.insert(
                    "blockchain_reference".to_string(),
                    serde_json::json!(reference),
                );
            }
        }

        if let Some(proof_value) = &body.anonymous_proof {
            let unlinkable: UnlinkablePresentation = serde_json::from_value(proof_value.clone())
                .map_err(|e| {
                    failure_response(
                        StatusCode::BAD_REQUEST,
                        format!("Invalid anonymous proof payload: {}", e),
                        "ANONYMOUS_PROOF_ERROR",
                        None,
                    )
                })?;

            let issuer_keys = state
                .db()
                .get_issuer_anonymous_keys(&cred.issuer_did)
                .await
                .map_err(|e| {
                    failure_response(
                        StatusCode::INTERNAL_SERVER_ERROR,
                        format!("Failed to fetch issuer keys: {}", e),
                        "DATABASE_ERROR",
                        None,
                    )
                })?
                .ok_or_else(|| {
                    failure_response(
                        StatusCode::BAD_REQUEST,
                        "Issuer anonymous keys not found for credential",
                        "ANONYMOUS_PROOF_ERROR",
                        None,
                    )
                })?;

            match verify_unlinkable_presentation(&unlinkable, &issuer_keys.public_key) {
                Ok(true) => {
                    presentation_data.insert("anonymous_proof".to_string(), proof_value.clone());
                    presentation_data.insert(
                        "anonymous_revealed_attributes".to_string(),
                        serde_json::json!(unlinkable.revealed_attributes.clone()),
                    );
                    if let Some(meta) = presentation_data.get_mut("_anonymous_metadata") {
                        if let Some(obj) = meta.as_object_mut() {
                            obj.insert(
                                "revealed_attributes".to_string(),
                                serde_json::json!(unlinkable
                                    .revealed_attributes
                                    .keys()
                                    .cloned()
                                    .collect::<Vec<String>>()),
                            );
                        }
                    }
                    anonymous_revealed_attributes = Some(unlinkable.revealed_attributes.clone());
                }
                Ok(false) => {
                    return Err(failure_response(
                        StatusCode::BAD_REQUEST,
                        "Anonymous proof verification failed",
                        "ANONYMOUS_PROOF_INVALID",
                        None,
                    ));
                }
                Err(e) => {
                    return Err(failure_response(
                        StatusCode::BAD_REQUEST,
                        format!("Anonymous proof verification error: {}", e),
                        "ANONYMOUS_PROOF_ERROR",
                        None,
                    ));
                }
            }
        }
    }

    let credential_ids = vec![request.credential_id.clone()];

    let presentation_data_clone = presentation_data.clone();

    let mut presentation = Presentation {
        id: uuid::Uuid::new_v4().to_string(),
        prover_did: holder_did.clone(),
        prover_pseudonym: None,
        verifier_did: request.verifier_did.clone(),
        presentation_type: "credential_presentation".to_string(),
        credential_ids,
        presentation_data,
        jwt: presentation_jwt.clone(),
        status: if final_valid {
            PresentationStatus::Verified
        } else {
            PresentationStatus::Rejected
        },
        created_at: Utc::now(),
        verified_at: Some(Utc::now()),
        is_verified: final_valid,
    };

    // Re-load to embed anonymous metadata and pseudonym before persistence
    let mut stored_presentation = presentation.clone();
    if let Some(meta) = stored_presentation.presentation_data.get("_anonymous_metadata") {
        if meta.get("unlinkable").and_then(|v| v.as_bool()).unwrap_or(false) {
            let pseudonym = build_pairwise_pseudonym(&holder_did, &request.verifier_did, &stored_presentation.id);
            embed_anonymous_mode(&mut stored_presentation.presentation_data, &pseudonym);
            stored_presentation.prover_pseudonym = Some(pseudonym.clone());

            // prepare sanitized metadata
            let mut sanitized_meta = HashMap::new();
            sanitized_meta.insert(
                "summary".to_string(),
                format!("Anonymous presentation for {}", resolved_credential_type),
            );
            sanitized_meta.insert("status".to_string(), "anonymous".to_string());
            sanitized_meta.insert("verifier_name".to_string(), verifier_display.clone());

            let sanitized = sanitize_metadata(&sanitized_meta);
            let mut success_metadata = HashMap::new();
            success_metadata.insert("holder_did".to_string(), holder_did.clone());
            success_metadata.insert("verifier_did".to_string(), request.verifier_did.clone());
            success_metadata.insert("request_id".to_string(), request.request_id.clone());
            success_metadata.insert("credential_type".to_string(), resolved_credential_type.clone());
            success_metadata.insert("presentation_id".to_string(), stored_presentation.id.clone());
            success_metadata.insert("pseudonym".to_string(), pseudonym.clone());

            if let Err(error) = state
                .wallet_activity_service()
                .record_activity(NewWalletActivity {
                    holder_did: holder_did.clone(),
                    activity_type: WalletActivityType::VerificationCompleted,
                    status: WalletActivityStatus::Completed,
                    title: format!("Anonymous verification with {}", verifier_display),
                    description: format!("Verification purpose: {}", request.purpose),
                    metadata: success_metadata,
                    sanitized_metadata: sanitized.clone(),
                    created_at: Some(now),
                })
                .await
            {
                tracing::warn!(
                    error = ?error,
                    "failed to record wallet activity for anonymous presentation"
                );
            }

            // Overwrite stored presentation for persistence
            presentation = stored_presentation.clone();
        }
    }

    if let Err(e) = state.db().save_presentation(&presentation).await {
        tracing::error!("Failed to save presentation: {}", e);
        return Err(failure_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Failed to save presentation: {}", e),
            "DATABASE_ERROR",
            None,
        ));
    }
    tracing::info!(
        "Presentation saved: {} (verifier_did={}, holder_did={}, status={:?})",
        presentation.id,
        presentation.verifier_did,
        presentation.prover_did,
        presentation.status
    );

    let mut verifier_success_metadata = HashMap::new();
    verifier_success_metadata.insert(
        "presentation_id".to_string(),
        presentation.id.clone(),
    );
    let holder_did_display =
        did_to_frontend_format(&holder_did).unwrap_or_else(|_| holder_did.clone());
    verifier_success_metadata.insert("holder_did".to_string(), holder_did_display);
    verifier_success_metadata.insert(
        "credential_type".to_string(),
        resolved_credential_type.clone(),
    );
    verifier_success_metadata.insert(
        "verifier_name".to_string(),
        verifier_display.clone(),
    );
    verifier_success_metadata.insert(
        "request_id".to_string(),
        request.request_id.clone(),
    );
    if let Some(expiry) = presentation
        .presentation_data
        .get("consent_expires_at")
        .and_then(|v| v.as_str())
    {
        verifier_success_metadata.insert("consent_expires_at".to_string(), expiry.to_string());
    }
    if let Some(provided) = presentation
        .presentation_data
        .get("provided_attributes")
        .and_then(|v| v.as_array())
    {
        let attrs: Vec<String> = provided
            .iter()
            .filter_map(|v| v.as_str().map(|s| s.to_string()))
            .collect();
        if let Ok(serialized) = serde_json::to_string(&attrs) {
            verifier_success_metadata.insert("provided_attributes".to_string(), serialized);
        }
    }
    if let Some(revoked) = presentation
        .presentation_data
        .get("revoked_attributes")
        .and_then(|v| v.as_array())
    {
        let attrs: Vec<String> = revoked
            .iter()
            .filter_map(|v| v.as_str().map(|s| s.to_string()))
            .collect();
        if let Ok(serialized) = serde_json::to_string(&attrs) {
            verifier_success_metadata.insert("revoked_attributes".to_string(), serialized);
        }
    }
    if let Some(status_value) = presentation
        .presentation_data
        .get("credential_status")
        .and_then(|v| v.as_str())
    {
        verifier_success_metadata.insert("credential_status".to_string(), status_value.to_string());
    }
    if let Some(ipfs_hash) = presentation
        .presentation_data
        .get("ipfs_hash")
        .and_then(|v| v.as_str())
    {
        verifier_success_metadata.insert("ipfs_hash".to_string(), ipfs_hash.to_string());
    }
    if let Some(ipfs_gateway) = presentation
        .presentation_data
        .get("ipfs_gateway_url")
        .and_then(|v| v.as_str())
    {
        verifier_success_metadata.insert("ipfs_gateway_url".to_string(), ipfs_gateway.to_string());
    }

    record_verifier_activity(
        &state,
        &request.verifier_did,
        VerifierActivityStatus::Success,
        format!("Verification completed for {}", resolved_credential_type),
        format!("Verification purpose: {}", request.purpose),
        verifier_success_metadata,
    )
    .await;

    // Prepare sanitized metadata for non-anonymous scenario (if not already logged)
    if presentation
        .presentation_data
        .get("_anonymous_metadata")
        .and_then(|v| v.get("unlinkable"))
        .and_then(|v| v.as_bool())
        .unwrap_or(false)
    {
        // already handled above
    } else {
        let mut success_metadata = HashMap::new();
        success_metadata.insert("holder_did".to_string(), holder_did.clone());
        success_metadata.insert("verifier_did".to_string(), request.verifier_did.clone());
        success_metadata.insert("request_id".to_string(), request.request_id.clone());
        success_metadata.insert("credential_id".to_string(), credential_id_to_use.clone());
        success_metadata.insert("credential_type".to_string(), resolved_credential_type.clone());
        success_metadata.insert("presentation_id".to_string(), presentation.id.clone());

        let mut success_sanitized = HashMap::new();
        success_sanitized.insert("verifier_name".to_string(), verifier_display.clone());
        success_sanitized.insert("credential_type".to_string(), resolved_credential_type.clone());
        success_sanitized.insert("credential_id".to_string(), credential_id_to_use.clone());
        success_sanitized.insert("status".to_string(), "completed".to_string());
        success_sanitized.insert(
            "summary".to_string(),
            format!("Verification completed with {}", verifier_display),
        );

        if let Err(error) = state
            .wallet_activity_service()
            .record_activity(NewWalletActivity {
                holder_did: holder_did.clone(),
                activity_type: WalletActivityType::VerificationCompleted,
                status: WalletActivityStatus::Completed,
                title: format!("Verification completed with {}", verifier_display),
                description: format!("Verification purpose: {}", request.purpose),
                metadata: success_metadata,
                sanitized_metadata: success_sanitized,
                created_at: Some(now),
            })
            .await
        {
            tracing::warn!(
                error = ?error,
                "failed to record wallet activity for successful presentation"
            );
        }
    }

    let verifier_service = state.verifier_service();
    if let Err(e) = verifier_service
        .update_presentation_status(
            &presentation.id,
            &presentation.verifier_did,
            presentation.status.clone(),
        )
        .await
    {
        tracing::warn!("Failed to confirm presentation status update: {}", e);
    }

    let data_categories: Vec<String> = if let Some(obj) = body.selected_attributes.as_object() {
        obj.keys().map(|k| k.to_string()).collect()
    } else {
        Vec::new()
    };

    let consent_expires_at_str = body.consent_expires_at.clone();
    let consent_expires_at_dt = consent_expires_at_str
        .as_ref()
        .and_then(|s| DateTime::parse_from_rfc3339(s).ok().map(|dt| dt.with_timezone(&Utc)));

    let expires_at = consent_expires_at_dt
        .or_else(|| Some(request.expires_at))
        .or_else(|| {
            presentation_data_clone
                .get("consent_expires_at")
                .and_then(|v| v.as_str())
                .and_then(|s| DateTime::parse_from_rfc3339(s).ok().map(|dt| dt.with_timezone(&Utc)))
        });

    let consent = crate::models::Consent::new(
        holder_did.clone(),
        request.verifier_did.clone(),
        request.purpose.clone(),
        data_categories.clone(),
        request_id.clone(),
        Some(request.verifier_name.clone()),
        expires_at,
    );

    let blockchain_client = state
        .get_blockchain_client()
        .await
        .map_err(|e| failure_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Blockchain client error: {}", e),
            "BLOCKCHAIN_CLIENT_ERROR",
            None,
        ))?;

    let client_lock = blockchain_client.read().await;
    let client = client_lock.as_ref().ok_or_else(|| {
        failure_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            "Blockchain client not initialized",
            "BLOCKCHAIN_CLIENT_ERROR",
            None,
        )
    })?;

    let blockchain_receipt = client
        .grant_consent(
            &holder_did,
            &request.verifier_did,
            &request.purpose,
            &data_categories.join(","),
            1,
            0,
        )
        .await
        .map_err(|e| {
            failure_response(
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Blockchain error: {}", e),
                "BLOCKCHAIN_ERROR",
                None,
            )
        })?;

    tracing::info!(
        "Consent granted on blockchain: tx={:?}",
        blockchain_receipt.transaction_hash
    );

    let consent_collection = db.db.collection::<crate::models::Consent>("consents");
    match consent_collection.insert_one(&consent).await {
        Ok(_) => tracing::info!("Consent created for holder: {}", holder_did),
        Err(e) => tracing::warn!("Failed to create consent: {}", e),
    }

    Ok(Json(serde_json::json!({
        "success": true,
        "request_id": request_id,
        "message": "Presentation approved and sent to verifier",
        "consent": {
            "id": consent.id,
            "holder_did": consent.holder_did,
            "verifier_did": consent.verifier_did,
            "purpose": consent.purpose,
            "data_categories": consent.data_categories,
            "created_at": consent.created_at.to_rfc3339(),
            "expires_at": consent.expires_at.map(|dt| dt.to_rfc3339()),
            "revoked": consent.revoked,
        },
        "anonymous_revealed_attributes": anonymous_revealed_attributes,
    })))
}

async fn reject_presentation_request(
    State(state): State<AppState>,
    Path(request_id): Path<String>,
    Json(body): Json<RejectRequestBody>,
) -> HandlerResult {
    let holder_did = normalize_did(&body.holder_did).map_err(|e| {
        failure_response(
            StatusCode::BAD_REQUEST,
            format!("Invalid holder DID: {}", e),
            "INVALID_HOLDER_DID",
            None,
        )
    })?;
    let mut did_candidates = vec![holder_did.clone()];
    if let Ok(frontend_form) = did_to_frontend_format(&holder_did) {
        if frontend_form != holder_did {
            did_candidates.push(frontend_form);
        }
    }

    tracing::info!("Rejecting presentation request: {}", request_id);

    let db = state.db();
    let collection = db
        .db
        .collection::<VerifierPresentationRequest>("verifier_presentation_requests");

    let filter = doc! {
        "request_id": &request_id,
        "holder_did": { "$in": did_candidates.clone() },
        "status": "pending",
    };

    let now = Utc::now();

    let request = collection
        .find_one(filter.clone())
        .await
        .map_err(|e| failure_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Database error: {}", e),
            "DATABASE_ERROR",
            None,
        ))?
        .ok_or_else(|| failure_response(
            StatusCode::NOT_FOUND,
            "Presentation request not found or already processed",
            "PRESENTATION_REQUEST_NOT_FOUND",
            None,
        ))?;

    let supplied_reason = body.reason.clone();
    let supplied_code = body.error_code.clone();
    let supplied_details = body.details.clone();

    let final_reason = supplied_reason
        .clone()
        .or(request.rejection_reason.clone())
        .unwrap_or_else(|| "Holder rejected request".to_string());

    let final_code = supplied_code
        .clone()
        .or(request.failure_code.clone());

    let final_details = if let Some(details) = supplied_details.clone() {
        Some(details)
    } else {
        request.failure_details.clone()
    };

    let mut presentation_data = request.presentation_data.unwrap_or_else(|| json!({}));
    if !presentation_data.is_object() {
        presentation_data = json!({ "raw": presentation_data });
    }

    if let Some(obj) = presentation_data.as_object_mut() {
        obj.insert("status".to_string(), json!("rejected"));
        obj.insert("rejection_reason".to_string(), json!(final_reason.clone()));
        if let Some(code) = final_code.as_ref() {
            obj.insert("failure_code".to_string(), json!(code));
        }
        if let Some(details_val) = final_details.as_ref() {
            obj.insert("failure_details".to_string(), details_val.clone());
        }
    }

    let presentation_data_doc = to_document(&presentation_data).map_err(|e| {
        failure_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Failed to serialize presentation data: {}", e),
            "SERIALIZATION_ERROR",
            None,
        )
    })?;

    let mut set_doc = doc! {
        "status": "rejected",
        "updated_at": BsonDateTime::from_millis(now.timestamp_millis()),
        "rejection_reason": final_reason.clone(),
        "presentation_data": presentation_data_doc,
    };

    if let Some(code) = final_code.as_ref() {
        set_doc.insert("failure_code", Bson::String(code.clone()));
    }

    if let Some(details_value) = final_details.as_ref() {
        let details_bson = to_bson(details_value).map_err(|e| {
            failure_response(
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Failed to serialize failure details: {}", e),
                "SERIALIZATION_ERROR",
                None,
            )
        })?;
        set_doc.insert("failure_details", details_bson);
    }

    // Ensure we persist holder-provided reason/code even if request already had values
    if let Some(reason_value) = supplied_reason.as_ref() {
        set_doc.insert("rejection_reason", Bson::String(reason_value.clone()));
    }
    if let Some(code_value) = supplied_code.as_ref() {
        set_doc.insert("failure_code", Bson::String(code_value.clone()));
    }
    if let Some(details_value) = supplied_details.as_ref() {
        let details_bson = to_bson(details_value).map_err(|e| {
            failure_response(
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Failed to serialize failure details: {}", e),
                "SERIALIZATION_ERROR",
                None,
            )
        })?;
        set_doc.insert("failure_details", details_bson);
    }

    let update_doc = doc! {
        "$set": set_doc,
    };

    collection
        .update_one(
            doc! {
                "request_id": &request_id,
                "holder_did": { "$in": did_candidates },
                "status": "pending",
            },
            update_doc,
        )
        .await
        .map_err(|e| failure_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Database error: {}", e),
            "DATABASE_ERROR",
            None,
        ))?;

    tracing::info!("Presentation request rejected: {}", request_id);

    // Persist rejected presentation so verifier activity can display failures
    let presentation_map: HashMap<String, serde_json::Value> = presentation_data
        .as_object()
        .map(|obj| obj.clone().into_iter().collect())
        .unwrap_or_else(|| {
            let mut map = HashMap::new();
            map.insert("raw".to_string(), presentation_data.clone());
            map
        });

    let presentation_jwt = build_or_verify_pq_presentation_jwt(
        None,
        &holder_did,
        &request.verifier_did,
        &[],
    )?;

    let rejected_presentation = Presentation {
        id: uuid::Uuid::new_v4().to_string(),
        prover_did: holder_did.clone(),
        prover_pseudonym: None,
        verifier_did: request.verifier_did.clone(),
        presentation_type: "credential_presentation".to_string(),
        credential_ids: vec![request.credential_id.clone()],
        presentation_data: presentation_map,
        jwt: presentation_jwt,
        status: PresentationStatus::Rejected,
        created_at: now,
        verified_at: Some(now),
        is_verified: false,
    };

    if let Err(error) = state.db().save_presentation(&rejected_presentation).await {
        tracing::warn!(
            error = ?error,
            "failed to persist rejected presentation record for request {}",
            request_id
        );
    }

    Ok(Json(json!({
        "success": true,
        "request_id": request_id,
        "status": "rejected",
        "reason": final_reason,
        "error_code": final_code,
        "details": final_details,
        "presentation_data": presentation_data,
    })))
}

async fn check_presentation_status(
    State(state): State<AppState>,
    Path(request_id): Path<String>,
) -> HandlerResult {
    tracing::debug!("Checking status for request: {}", request_id);

    let db = state.db();
    let collection = db
        .db
        .collection::<VerifierPresentationRequest>("verifier_presentation_requests");

    let request = collection
        .find_one(doc! { "request_id": &request_id })
        .await
        .map_err(|e| failure_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Database error: {}", e),
            "DATABASE_ERROR",
            None,
        ))?
        .ok_or_else(|| failure_response(
            StatusCode::NOT_FOUND,
            "Presentation request not found",
            "PRESENTATION_REQUEST_NOT_FOUND",
            None,
        ))?;

    let sanitized = sanitize_presentation_request(&request);

    let holder_pseudonym = request
        .holder_pseudonym
        .clone()
        .unwrap_or_else(|| {
            build_pairwise_pseudonym(
                &request.holder_did,
                &request.verifier_did,
                &request.request_id,
            )
        });

    Ok(Json(json!({
        "success": true,
        "status": request.status.clone(),
        "request_id": request.request_id.clone(),
        "holder_pseudonym": holder_pseudonym,
        "expires_at": request.expires_at.to_rfc3339(),
        "updated_at": request.updated_at.to_rfc3339(),
        "request": sanitized,
        "presentation_data": request.presentation_data,
        "rejection_reason": request.rejection_reason,
        "failure_code": request.failure_code,
        "failure_details": request.failure_details,
    })))
}

async fn debug_all_requests(
    State(state): State<AppState>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    tracing::info!("Fetching ALL presentation requests");

    let db = state.db();
    let collection = db
        .db
        .collection::<VerifierPresentationRequest>("verifier_presentation_requests");

    let mut cursor = collection.find(doc! {}).await.map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Database error: {}", e),
        )
    })?;

    let mut requests = Vec::new();
    use futures::stream::StreamExt;
    let mut count = 0;
    while let Some(result) = cursor.next().await {
        if count >= 10 {
            break;
        }
        match result {
            Ok(request) => {
                tracing::info!(
                    "Found request: id={}, holder_did={}, status={:?}",
                    request.request_id,
                    request.holder_did,
                    request.status
                );
                requests.push(request);
                count += 1;
            }
            Err(e) => {
                tracing::error!("Error reading request: {}", e);
                continue;
            }
        }
    }

    tracing::info!("Total requests returned: {}", requests.len());

    Ok(Json(serde_json::json!({
        "success": true,
        "count": requests.len(),
        "requests": requests
    })))
}

async fn debug_test_query(
    State(state): State<AppState>,
    Path(holder_did): Path<String>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    tracing::info!("Testing query for holder_did: {}", holder_did);

    let db = state.db();
    let collection = db
        .db
        .collection::<VerifierPresentationRequest>("verifier_presentation_requests");

    let filter1 = doc! { "holder_did": &holder_did };
    let count1 = collection
        .count_documents(filter1.clone())
        .await
        .map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Count error: {}", e),
            )
        })?;
    tracing::info!("Found {} requests for holder_did: {}", count1, holder_did);

    let filter2 = doc! { "holder_did": &holder_did, "status": "pending" };
    let count2 = collection
        .count_documents(filter2.clone())
        .await
        .map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Count error: {}", e),
            )
        })?;
    tracing::info!(
        "Found {} requests for holder_did: {} and status: pending",
        count2,
        holder_did
    );

    let filter3 = doc! {
        "holder_did": &holder_did,
        "status": "pending",
        "expires_at": { "$gt": BsonDateTime::now() }
    };
    let count3 = collection
        .count_documents(filter3.clone())
        .await
        .map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Count error: {}", e),
            )
        })?;
    tracing::info!(
        "Found {} requests for holder_did: {} and status: pending and expires_at: {}",
        count3,
        holder_did,
        BsonDateTime::now()
    );

    let sample = collection.find_one(filter1).await.map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Find error: {}", e),
        )
    })?;

    Ok(Json(serde_json::json!({
        "success": true,
        "holder_did": holder_did,
        "test_results": {
            "only_holder_did": count1,
            "with_status_pending": count2,
            "with_expires_at": count3,
        },
        "sample_request": sample,
    })))
}

pub fn routes() -> Router<AppState> {
    Router::<AppState>::new()
        .route("/presentation-requests-debug/all", get(debug_all_requests))
        .route(
            "/presentation-requests-debug/test/:holder_did",
            get(debug_test_query),
        )
        .route("/presentation-requests", post(create_presentation_request))
        .route(
            "/presentation-requests/:request_id/approve",
            post(approve_presentation_request),
        )
        .route(
            "/presentation-requests/:request_id/reject",
            post(reject_presentation_request),
        )
        .route(
            "/presentation-requests/:request_id/status",
            get(check_presentation_status),
        )
        .route(
            "/presentation-requests/:holder_did/pending",
            get(get_pending_requests),
        )
}
