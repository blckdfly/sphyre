use axum::{
    extract::{Json, State},
    http::StatusCode,
    routing::post,
    Router,
};
use serde::{Deserialize, Serialize};
use serde_json::json;

use crate::error::AppError;
use crate::services::AppState;
use crate::services::auth::{RegisterRequest, LoginRequest, GenerateDIDRequest};

/// Create auth routes
pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/register", post(register))
        .route("/login", post(login))
        .route("/challenge", post(generate_challenge))
        .route("/verify-challenge", post(verify_challenge))
        .route("/generate-did", post(generate_did))
}

/// Register request handler
async fn register(
    State(state): State<AppState>,
    Json(request): Json<RegisterRequest>,
) -> Result<(StatusCode, Json<serde_json::Value>), AppError> {
    let auth_service = state.auth_service();
    let user = auth_service.register(request).await?;

    Ok((
        StatusCode::CREATED,
        Json(json!({
            "success": true,
            "message": "User registered successfully",
            "user": user,
        })),
    ))
}

/// Login request handler
async fn login(
    State(state): State<AppState>,
    Json(request): Json<LoginRequest>,
) -> Result<(StatusCode, Json<serde_json::Value>), AppError> {
    let auth_service = state.auth_service();
    let auth_response = auth_service.login(request).await?;

    Ok((
        StatusCode::OK,
        Json(json!({
            "success": true,
            "message": "Login successful",
            "user": auth_response.user,
            "token": auth_response.token,
        })),
    ))
}

/// Challenge request
#[derive(Debug, Deserialize)]
pub struct ChallengeRequest {
    pub did: String,
}

/// Challenge response
#[derive(Debug, Serialize)]
pub struct ChallengeResponse {
    pub challenge: String,
    pub expires_at: String,
}

/// Generate challenge handler
async fn generate_challenge(
    State(state): State<AppState>,
    Json(request): Json<ChallengeRequest>,
) -> Result<(StatusCode, Json<serde_json::Value>), AppError> {
    let auth_service = state.auth_service();
    let challenge = auth_service.generate_challenge(&request.did).await?;

    Ok((
        StatusCode::OK,
        Json(json!({
            "success": true,
            "challenge": challenge.challenge,
            "expires_at": challenge.expires_at,
        })),
    ))
}

/// Verify challenge request
#[derive(Debug, Deserialize)]
pub struct VerifyChallengeRequest {
    pub did: String,
    pub challenge: String,
    pub signature: String,
}

/// Verify challenge handler
async fn verify_challenge(
    State(state): State<AppState>,
    Json(request): Json<VerifyChallengeRequest>,
) -> Result<(StatusCode, Json<serde_json::Value>), AppError> {
    let auth_service = state.auth_service();
    let (user, token) = auth_service.verify_challenge(
        &request.did,
        &request.challenge,
        &request.signature,
    ).await?;

    Ok((
        StatusCode::OK,
        Json(json!({
            "success": true,
            "message": "Challenge verified successfully",
            "user": user,
            "token": token,
        })),
    ))
}

/// Generate DID handler
async fn generate_did(
    State(state): State<AppState>,
    Json(request): Json<GenerateDIDRequest>,
) -> Result<(StatusCode, Json<serde_json::Value>), AppError> {
    let auth_service = state.auth_service();
    let did_document = auth_service.create_did_document(request).await?;

    Ok((
        StatusCode::OK,
        Json(json!({
            "success": true,
            "message": "DID generated successfully",
            "did_document": did_document,
        })),
    ))
}
