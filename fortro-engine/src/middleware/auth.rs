use crate::services::AppState;
use axum::{
    body::Body,
    extract::State,
    http::{header, Request, StatusCode},
    middleware::Next,
    response::Response,
};
use jsonwebtoken::{decode, Algorithm, DecodingKey, Validation};
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct Claims {
    pub did: String,
    pub exp: usize,
    pub iat: usize,
}

/// Extract user DID from JWT token
pub async fn extract_user_did(
    State(_state): State<AppState>,
    mut request: Request<Body>,
    next: Next,
) -> Result<Response, StatusCode> {
    // Get token from Authorization header
    let token = request
        .headers()
        .get(header::AUTHORIZATION)
        .and_then(|auth_header| auth_header.to_str().ok())
        .and_then(|auth_value| {
            if auth_value.starts_with("Bearer ") {
                Some(auth_value[7..].to_owned())
            } else {
                None
            }
        });

    // Also check X-User-DID header
    let did_header = request
        .headers()
        .get("X-User-DID")
        .and_then(|h| h.to_str().ok())
        .map(|s| s.to_owned());

    // If we have a token, validate it
    if let Some(token) = token {
        match std::env::var("JWT_SECRET") {
            Ok(jwt_secret) => {
                let validation = Validation::new(Algorithm::HS256);
                let token_data = decode::<Claims>(
                    &token,
                    &DecodingKey::from_secret(jwt_secret.as_bytes()),
                    &validation,
                );

                match token_data {
                    Ok(data) => {
                        request.extensions_mut().insert(data.claims.did.clone());
                    }
                    Err(e) => {
                        tracing::warn!("Invalid JWT token: {:?}", e);
                        if let Some(did) = did_header {
                            request.extensions_mut().insert(did);
                        }
                    }
                }
            }
            Err(_) => {
                tracing::warn!("JWT_SECRET is not configured; skipping JWT validation");
                if let Some(did) = did_header {
                    request.extensions_mut().insert(did);
                }
            }
        }
    } else if let Some(did) = did_header {
        request.extensions_mut().insert(did);
    }

    Ok(next.run(request).await)
}

/// Middleware that requires authentication
pub async fn require_auth(request: Request<Body>, next: Next) -> Result<Response, StatusCode> {
    let has_did = request.extensions().get::<String>().is_some();

    if !has_did {
        return Err(StatusCode::UNAUTHORIZED);
    }

    Ok(next.run(request).await)
}

/// Helper to get DID from request extensions in handlers
pub fn get_user_did(request: &Request<Body>) -> Option<String> {
    request.extensions().get::<String>().cloned()
}
