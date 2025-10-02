use axum::{
    routing::get,
    Router,
    http::StatusCode,
    Json,
    extract::State,
};
use serde_json::json;
use crate::services::AppState;

/// Create health check route
pub fn health_check() -> Router<AppState> {
    Router::new()
        .route("/", get(health_handler))
        .route("/*path", get(health_handler))  // Handle requests with any path suffix
}

/// Health check handler
async fn health_handler(State(state): State<AppState>) -> (StatusCode, Json<serde_json::Value>) {
    // Gather blockchain health info, but do not fail the endpoint if any part errors
    let (block_number, block_err) = match state.blockchain.get_block_number().await {
        Ok(n) => (Some(n), None),
        Err(e) => (None, Some(e.to_string())),
    };

    let wallet_address = state.blockchain.wallet_address();
    let registry_address = state.blockchain.registry_address_str();

    let (registry_accessible, registry_check_err) = match registry_address {
        Some(_) => match state.blockchain.is_registry_accessible().await {
            Ok(v) => (Some(v), None),
            Err(e) => (None, Some(e.to_string())),
        },
        None => (None, None),
    };

    // Fetch chain ID
    let (chain_id, chain_err) = match state.blockchain.get_chain_id().await {
        Ok(id) => (Some(id), None),
        Err(e) => (None, Some(e.to_string())),
    };

    (
        StatusCode::OK,
        Json(json!({
            "status": "ok",
            "message": "Service is running",
            "version": env!("CARGO_PKG_VERSION"),
            "blockchain": {
                "wallet_address": wallet_address,
                "latest_block": block_number,
                "block_error": block_err,
                "chain_id": chain_id,
                "chain_error": chain_err,
                "registry_address": registry_address,
                "registry_accessible": registry_accessible,
                "registry_check_error": registry_check_err
            }
        })),
    )
}