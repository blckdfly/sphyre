use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
    routing::{get, post},
    Json, Router,
};
use serde::{Deserialize};
use serde_json::{json};

use crate::error::AppError;
use crate::services::AppState;

/// Request models
#[derive(Debug, Deserialize)]
pub struct CredentialOfferRequest {
    pub issuer_did: String,
    pub credential_id: String,
    pub recipient_did: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct PresentationRequestRequest {
    pub verifier_did: String,
    pub schema_ids: Vec<String>,
    pub purpose: String,
    pub recipient_did: Option<String>,
}

/// QR code routes
pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/resolve/:short_id", get(resolve_short_url))
        .route("/credential-offer", post(generate_credential_offer_short_url))
        .route("/presentation-request", post(generate_presentation_request_short_url))
}

/// Resolve a short URL to QR code content
async fn resolve_short_url(
    State(state): State<AppState>,
    Path(short_id): Path<String>,
) -> Result<impl IntoResponse, AppError> {
    let qr_service = state.qr_service();
    let content = qr_service.resolve_short_url(&short_id).await?;

    Ok((StatusCode::OK, Json(content)))
}

/// Generate a short URL for a credential offer
async fn generate_credential_offer_short_url(
    State(state): State<AppState>,
    Json(request): Json<CredentialOfferRequest>,
) -> Result<impl IntoResponse, AppError> {
    let qr_service = state.qr_service();
    let short_id = qr_service.generate_credential_offer_short_url(
        &request.issuer_did,
        &request.credential_id,
        request.recipient_did,
    ).await?;

    // Construct the full URL that will be encoded in the QR code
    let base_url = std::env::var("BASE_URL").unwrap_or_else(|_| "http://localhost:3000".to_string());
    let qr_url = format!("{}/qr/resolve/{}", base_url, short_id);

    Ok((StatusCode::OK, Json(json!({
        "success": true,
        "short_id": short_id,
        "qr_url": qr_url,
    }))))
}

/// Generate a short URL for a presentation request
async fn generate_presentation_request_short_url(
    State(state): State<AppState>,
    Json(request): Json<PresentationRequestRequest>,
) -> Result<impl IntoResponse, AppError> {
    let qr_service = state.qr_service();
    let short_id = qr_service.generate_presentation_request_short_url(
        &request.verifier_did,
        &request.schema_ids,
        &request.purpose,
        request.recipient_did,
    ).await?;

    // Construct the full URL that will be encoded in the QR code
    let base_url = std::env::var("BASE_URL").unwrap_or_else(|_| "http://localhost:3000".to_string());
    let qr_url = format!("{}/qr/resolve/{}", base_url, short_id);

    Ok((StatusCode::OK, Json(json!({
        "success": true,
        "short_id": short_id,
        "qr_url": qr_url,
    }))))
}
