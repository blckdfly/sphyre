use axum::{
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde_json::json;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum AppError {
    #[error("Configuration error: {0}")]
    ConfigError(String),

    #[error("Database error: {0}")]
    DatabaseError(String),

    #[error("IPFS error: {0}")]
    IpfsError(String),

    #[error("Blockchain error: {0}")]
    BlockchainError(String),

    #[error("SSI error: {0}")]
    SsiError(String),

    #[error("Authentication error: {0}")]
    AuthError(String),

    #[error("Authorization error: {0}")]
    AccessDeniedError(String),

    #[error("Validation error: {0}")]
    ValidationError(String),

    #[error("Not found: {0}")]
    NotFoundError(String),

    #[error("Internal server error: {0}")]
    InternalError(String),
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let (status, error_message) = match self {
            AppError::ConfigError(_) => (StatusCode::INTERNAL_SERVER_ERROR, self.to_string()),
            AppError::DatabaseError(_) => (StatusCode::INTERNAL_SERVER_ERROR, self.to_string()),
            AppError::IpfsError(_) => (StatusCode::INTERNAL_SERVER_ERROR, self.to_string()),
            AppError::BlockchainError(_) => (StatusCode::INTERNAL_SERVER_ERROR, self.to_string()),
            AppError::SsiError(_) => (StatusCode::BAD_REQUEST, self.to_string()),
            AppError::AuthError(_) => (StatusCode::UNAUTHORIZED, self.to_string()),
            AppError::AccessDeniedError(_) => (StatusCode::FORBIDDEN, self.to_string()),
            AppError::ValidationError(_) => (StatusCode::BAD_REQUEST, self.to_string()),
            AppError::NotFoundError(_) => (StatusCode::NOT_FOUND, self.to_string()),
            AppError::InternalError(_) => (StatusCode::INTERNAL_SERVER_ERROR, self.to_string()),
        };

        let body = Json(json!({
            "error": {
                "message": error_message,
                "code": status.as_u16()
            }
        }));

        (status, body).into_response()
    }
}

// Conversion from other error types
impl From<mongodb::error::Error> for AppError {
    fn from(err: mongodb::error::Error) -> Self {
        AppError::DatabaseError(err.to_string())
    }
}

impl From<serde_json::Error> for AppError {
    fn from(err: serde_json::Error) -> Self {
        AppError::ValidationError(err.to_string())
    }
}

impl From<std::io::Error> for AppError {
    fn from(err: std::io::Error) -> Self {
        AppError::InternalError(err.to_string())
    }
}

impl From<web3::Error> for AppError {
    fn from(err: web3::Error) -> Self {
        AppError::BlockchainError(err.to_string())
    }
}

impl From<mongodb::bson::ser::Error> for AppError {
    fn from(err: mongodb::bson::ser::Error) -> Self {
        AppError::DatabaseError(err.to_string())
    }
}

