use serde::Deserialize;
use std::env;
use crate::error::AppError;

#[derive(Debug, Clone, Deserialize)]
pub struct Config {
    pub mongodb_uri: String,
    pub ipfs_api_url: String,
    pub ethereum_rpc_url: String,
    pub port: u16,
    pub jwt_expiration: u64,
    pub issuer_did: String,
    pub issuer_private_key: String,
    pub jwt_secret: String,
    pub cors_allowed_origins: Option<Vec<String>>,
    pub registry_address: Option<String>,
}

impl Config {
    pub fn from_env() -> Result<Self, AppError> {
        Ok(Self {
            mongodb_uri: env::var("MONGODB_URI")
                .map_err(|_| AppError::ConfigError("MONGODB_URI must be set".to_string()))?,
            ipfs_api_url: env::var("IPFS_API_URL")
                .map_err(|_| AppError::ConfigError("IPFS_API_URL must be set".to_string()))?,
            ethereum_rpc_url: env::var("ETHEREUM_RPC_URL")
                .map_err(|_| AppError::ConfigError("ETHEREUM_RPC_URL must be set".to_string()))?,
            port: env::var("PORT")
                .unwrap_or_else(|_| "3000".to_string())
                .parse()
                .map_err(|_| AppError::ConfigError("PORT must be a valid number".to_string()))?,
            jwt_secret: env::var("JWT_SECRET")
                .map_err(|_| AppError::ConfigError("JWT_SECRET must be set".to_string()))?,
            jwt_expiration: env::var("JWT_EXPIRATION")
                .unwrap_or_else(|_| "86400".to_string()) // Default: 24 hours
                .parse()
                .map_err(|_| AppError::ConfigError("JWT_EXPIRATION must be a valid number".to_string()))?,
            issuer_did: env::var("ISSUER_DID")
                .map_err(|_| AppError::ConfigError("ISSUER_DID must be set".to_string()))?,
            issuer_private_key: env::var("ISSUER_PRIVATE_KEY")
                .map_err(|_| AppError::ConfigError("ISSUER_PRIVATE_KEY must be set".to_string()))?,
            cors_allowed_origins: env::var("CORS_ALLOWED_ORIGINS").ok().map(|s| {
                s.split(',')
                    .map(|o| o.trim())
                    .filter(|o| !o.is_empty())
                    .map(|o| o.to_string())
                    .collect::<Vec<_>>()
            }).filter(|v| !v.is_empty()),
            registry_address: env::var("REGISTRY_ADDRESS").ok().filter(|s| !s.trim().is_empty()),
        })
    }
}