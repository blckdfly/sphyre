pub mod auth;
pub mod health;
pub mod wallet;
pub mod issuer;
pub mod verifier;
pub mod qr;

use axum::Router;
use crate::services::AppState;

/// Create all API routes
pub fn routes() -> Router<AppState> {
    Router::new()
        .nest("/auth", auth::routes())
        .nest("/wallet", wallet::routes())
        .nest("/issuer", issuer::routes())
        .nest("/verifier", verifier::routes())
        .nest("/health", health::health_check())
        .nest("/qr", qr::routes())
}
