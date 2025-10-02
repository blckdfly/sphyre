use axum::{
    extract::{Json, Path, State, Query},
    http::StatusCode,
    routing::{get, post, put},
    Router,
};
use serde::{Deserialize};
use serde_json::json;
use std::collections::HashMap;

use crate::error::AppError;
use crate::models::{PresentationStatus, CredentialRequirement, AccessLevel, ExpirationPolicy};
use crate::services::AppState;
use crate::services::verifier::{CreatePresentationRequestRequest, VerifyPresentationRequest};

/// Create verifier routes
pub fn routes() -> Router<AppState> {
    Router::new()
        // Presentation requests
        .route("/requests", post(create_presentation_request))
        .route("/requests/:id", get(get_presentation_request))
        
        // Presentations
        .route("/presentations", get(list_presentations))
        .route("/presentations/:id", get(get_presentation))
        .route("/presentations/:id/verify", post(verify_presentation))
        .route("/presentations/:id/status", put(update_presentation_status))
        
        // Consent management
        .route("/consents", get(list_consents))
        .route("/consents/request", post(request_consent))
        .route("/consents/check", post(check_consent))
        
        // QR code generation
        .route("/qr/presentation-request", post(generate_presentation_request_qr))
        
        // Statistics
        .route("/:did/statistics", get(get_verifier_statistics))
}

/// Create presentation request handler
async fn create_presentation_request(
    State(state): State<AppState>,
    Json(request): Json<CreatePresentationRequestRequest>,
) -> Result<(StatusCode, Json<serde_json::Value>), AppError> {
    let verifier_service = state.verifier_service();
    let response = verifier_service.create_presentation_request(request).await?;

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
    let request = presentation_service.get_presentation_by_id(&id).await?
        .ok_or_else(|| AppError::NotFoundError(format!("Presentation request with ID {} not found", id)))?;

    Ok((
        StatusCode::OK,
        Json(json!({
            "success": true,
            "request": request,
        })),
    ))
}

/// List presentations handler
async fn list_presentations(
    State(state): State<AppState>,
    Query(params): Query<HashMap<String, String>>,
) -> Result<(StatusCode, Json<serde_json::Value>), AppError> {
    let verifier_did = params.get("verifier_did")
        .ok_or_else(|| AppError::ValidationError("verifier_did parameter is required".to_string()))?;
    
    let verifier_service = state.verifier_service();
    let presentations = verifier_service.get_presentations_by_verifier(verifier_did).await?;

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
    let presentation = verifier_service.get_presentation_by_id(&id).await?
        .ok_or_else(|| AppError::NotFoundError(format!("Presentation with ID {} not found", id)))?;

    Ok((
        StatusCode::OK,
        Json(json!({
            "success": true,
            "presentation": presentation,
        })),
    ))
}

/// Verify presentation handler
async fn verify_presentation(
    State(state): State<AppState>,
    Json(request): Json<VerifyPresentationRequest>,
) -> Result<(StatusCode, Json<serde_json::Value>), AppError> {
    let verifier_service = state.verifier_service();
    let result = verifier_service.verify_presentation(request).await?;

    Ok((
        StatusCode::OK,
        Json(json!({
            "success": true,
            "verification_result": result,
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
    Json(request): Json<UpdatePresentationStatusRequest>,
) -> Result<(StatusCode, Json<serde_json::Value>), AppError> {
    let verifier_service = state.verifier_service();
    let success = verifier_service.update_presentation_status(&id, &request.verifier_did, request.status).await?;

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
    let verifier_did = params.get("verifier_did")
        .ok_or_else(|| AppError::ValidationError("verifier_did parameter is required".to_string()))?;
    
    let verifier_service = state.verifier_service();
    let consents = verifier_service.get_consents_for_verifier(verifier_did).await?;

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
    let consent = verifier_service.request_consent(
        &request.verifier_did,
        &request.user_did,
        &request.purpose,
        request.data_categories,
        request.access_level,
        request.expiration_policy,
        request.expires_at,
    ).await?;

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
    let has_consent = verifier_service.check_consent(
        &request.verifier_did,
        &request.user_did,
        &request.purpose,
    ).await?;

    Ok((
        StatusCode::OK,
        Json(json!({
            "success": true,
            "has_consent": has_consent,
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
}

/// Generate presentation request QR code handler
async fn generate_presentation_request_qr(
    State(state): State<AppState>,
    Json(request): Json<GeneratePresentationRequestQrRequest>,
) -> Result<(StatusCode, Json<serde_json::Value>), AppError> {
    let verifier_service = state.verifier_service();
    let qr_data = verifier_service.generate_presentation_request_qr(
        &request.verifier_did,
        request.required_credentials,
        &request.presentation_type,
        &request.purpose,
        request.callback_url,
        request.expires_at,
    ).await?;

    Ok((
        StatusCode::OK,
        Json(json!({
            "success": true,
            "qr_data": qr_data,
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