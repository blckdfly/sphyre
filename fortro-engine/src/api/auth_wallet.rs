use axum::{
    extract::{Extension, Json},
    http::StatusCode,
    response::IntoResponse,
};
use std::sync::Arc;
use crate::db::Database;
use crate::error::AppError;
use crate::models::{
    CreateWalletAuthRequest, LoginWalletAuthRequest, WalletAuth,
};
use crate::utils::{auth_token, crypto, did};

pub async fn create_wallet(
    Extension(db): Extension<Arc<Database>>,
    Json(req): Json<CreateWalletAuthRequest>,
) -> Result<impl IntoResponse, AppError> {
    // Hash the auth token for storage
    let auth_hash = auth_token::hash_auth_token(&req.auth_token)?;
    let fingerprint = auth_token::fingerprint_auth_token(&req.auth_token);

    // Check if wallet already exists with this auth token
    if let Some(existing) = db.find_wallet_by_auth_fingerprint(&fingerprint).await? {
        return Err(AppError::ValidationError(
            "Wallet already exists. Please use login instead.".to_string(),
        ));
    }

    // Generate Kyber keypair for encryption
    let (kyber_pub, kyber_priv) = crypto::generate_kyber_keypair()
        .map_err(|e| AppError::InternalError(format!("Failed to generate Kyber keypair: {}", e)))?;

    // Generate Dilithium DID keypair for signing
    let did_pair = did::generate_did()?;

    // Private wallet keys must never be encrypted with a source-code fallback.
    let master_key = std::env::var("MASTER_ENCRYPTION_KEY")
        .map_err(|_| AppError::ConfigError("MASTER_ENCRYPTION_KEY must be set".to_string()))?;

    // Encrypt private keys with master key
    let dilithium_priv_encrypted = crypto::encrypt_with_password(
        did_pair
            .private_key_base58
            .as_ref()
            .ok_or_else(|| AppError::InternalError("Missing private key".to_string()))?
            .as_bytes(),
        &master_key,
    )
    .map_err(|e| AppError::InternalError(format!("Failed to encrypt Dilithium key: {}", e)))?;

    let kyber_priv_encrypted = crypto::encrypt_with_password(&kyber_priv, &master_key)
        .map_err(|e| AppError::InternalError(format!("Failed to encrypt Kyber key: {}", e)))?;

    // Create wallet document
    let wallet = WalletAuth::new(
        auth_hash,
        fingerprint,
        did_pair.did.clone(),
        did_pair.public_key_base58.clone(),
        base64::encode(dilithium_priv_encrypted),
        bs58::encode(&kyber_pub).into_string(),
        base64::encode(kyber_priv_encrypted),
    );

    // Save to database
    db.create_wallet_auth(&wallet).await?;

    tracing::info!("Created new wallet with DID: {}", wallet.did);

    // Return wallet response
    Ok((StatusCode::CREATED, Json(wallet.to_response())))
}

/// Login to existing wallet
pub async fn login_wallet(
    Extension(db): Extension<Arc<Database>>,
    Json(req): Json<LoginWalletAuthRequest>,
) -> Result<impl IntoResponse, AppError> {
    let fingerprint = auth_token::fingerprint_auth_token(&req.auth_token);
    if let Some(wallet) = db.find_wallet_by_auth_fingerprint(&fingerprint).await? {
        if !auth_token::verify_auth_token(&req.auth_token, &wallet.auth_token_hash)? {
            return Err(AppError::UnauthorizedError("Invalid authentication credentials".to_string()));
        }
        let mut updated_wallet = wallet.clone();
        updated_wallet.update_last_login();
        db.update_wallet_auth(&updated_wallet).await?;

        tracing::info!("User logged in with DID: {}", updated_wallet.did);
        return Ok((StatusCode::OK, Json(updated_wallet.to_response())));
    }

    return Err(AppError::NotFoundError(
        "Wallet not found. Please create a new wallet first.".to_string(),
    ));
}

/// Get wallet information by DID
pub async fn get_wallet_by_did(
    Extension(db): Extension<Arc<Database>>,
    did: String,
) -> Result<impl IntoResponse, AppError> {
    let wallet = db
        .find_wallet_by_did(&did)
        .await?
        .ok_or_else(|| AppError::NotFoundError(format!("Wallet not found for DID: {}", did)))?;

    Ok((StatusCode::OK, Json(wallet.to_response())))
}

pub async fn auth_health() -> impl IntoResponse {
    (
        StatusCode::OK,
        Json(serde_json::json!({
            "status": "healthy",
            "service": "auth_wallet",
            "timestamp": chrono::Utc::now().to_rfc3339()
        })),
    )
}
