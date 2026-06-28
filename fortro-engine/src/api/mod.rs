pub mod admin;
pub mod auth;
mod auth_wallet;
mod blockchain;
mod blockchain_new;
pub mod consent;
pub mod credential_request;
pub mod did;
pub mod domain;
pub mod health;
pub mod issuer;
pub mod presentation_request;
pub mod qr;
pub mod verifier;
pub mod wallet;

use crate::services::AppState;
use axum::Router;

/// Create all API routes
pub fn routes() -> Router<AppState> {
    Router::new()
        .nest("/auth", auth::routes())
        .nest(
            "/wallet",
            credential_request::routes()
                .merge(wallet::routes())
                .merge(presentation_request::routes()),
        )
        .nest("/issuer", issuer::routes())
        .nest("/verifier", verifier::routes())
        .nest("/domain", domain::create_router())
        .nest("/did", did::routes())
        .nest("/health", health::health_check())
        .nest("/qr", qr::routes())
        .nest("/admin", admin::admin_routes())
        .nest("/blockchain-legacy", blockchain::routes())
        .nest("/blockchain", blockchain_new::routes())
}
