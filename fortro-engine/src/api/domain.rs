use axum::{
    extract::{Path, State},
    http::StatusCode,
    routing::{get, post},
    Json, Router,
};
use serde_json::json;
use crate::error::AppError;
use crate::services::issuer::RequestDomainChallengeRequest as IssuerRequestDomainChallengeRequest;
use crate::services::verifier::RequestDomainChallengeRequest as VerifierRequestDomainChallengeRequest;
use crate::services::AppState;

/// Create domain verification router
pub fn create_router() -> Router<AppState> {
    Router::new()
        .route("/challenge/issuer", post(request_issuer_challenge))
        .route("/challenge/verifier", post(request_verifier_challenge))
        .route("/verify/:domain", get(check_domain_status))
}

/// Request domain challenge for issuer
async fn request_issuer_challenge(
    State(state): State<AppState>,
    Json(request): Json<IssuerRequestDomainChallengeRequest>,
) -> Result<(StatusCode, Json<serde_json::Value>), AppError> {
    let issuer_service = state.issuer_service();
    let response = issuer_service.request_domain_challenge(request).await?;

    Ok((
        StatusCode::OK,
        Json(json!({
            "success": true,
            "challenge": response.challenge,
            "instructions": response.instructions,
        })),
    ))
}

/// Request domain challenge for verifier
async fn request_verifier_challenge(
    State(state): State<AppState>,
    Json(request): Json<VerifierRequestDomainChallengeRequest>,
) -> Result<(StatusCode, Json<serde_json::Value>), AppError> {
    let verifier_service = state.verifier_service();
    let response = verifier_service.request_domain_challenge(request).await?;

    Ok((
        StatusCode::OK,
        Json(json!({
            "success": true,
            "challenge": response.challenge,
            "instructions": response.instructions,
        })),
    ))
}

/// Check domain verification status
async fn check_domain_status(
    State(state): State<AppState>,
    Path(domain): Path<String>,
) -> Result<(StatusCode, Json<serde_json::Value>), AppError> {
    let db = &state.db;

    let issuer = db
        .find_one::<serde_json::Value>(
            "issuers",
            bson::doc! { "domain": &domain, "domain_verified": true },
        )
        .await?;

    if issuer.is_some() {
        return Ok((
            StatusCode::OK,
            Json(json!({
                "verified": true,
                "entity_type": "issuer",
                "domain": domain,
            })),
        ));
    }

    // Check verifiers
    let verifier = db
        .find_one::<serde_json::Value>(
            "verifiers",
            bson::doc! { "domain": &domain, "domain_verified": true },
        )
        .await?;

    if verifier.is_some() {
        return Ok((
            StatusCode::OK,
            Json(json!({
                "verified": true,
                "entity_type": "verifier",
                "domain": domain,
            })),
        ));
    }

    Ok((
        StatusCode::OK,
        Json(json!({
            "verified": false,
            "domain": domain,
        })),
    ))
}