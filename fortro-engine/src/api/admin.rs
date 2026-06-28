use crate::error::AppError;
use crate::services::AppState;
use axum::{extract::State, http::StatusCode, response::IntoResponse, routing::post, Json, Router};
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct GenerateDIDRequest {
    pub name: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct GenerateDIDResponse {
    pub did: String,
    pub public_key_base58: String,
    pub private_key_base58: String,
    pub key_size: usize,
}

pub async fn generate_did(
    State(_state): State<AppState>,
    Json(_req): Json<GenerateDIDRequest>,
) -> Result<impl IntoResponse, AppError> {
    let did_keypair = crate::utils::did::generate_did()?;

    Ok((
        StatusCode::CREATED,
        Json(GenerateDIDResponse {
            did: did_keypair.did,
            public_key_base58: did_keypair.public_key_base58,
            private_key_base58: did_keypair.private_key_base58.unwrap_or_default(),
            key_size: 2528,
        }),
    ))
}

#[derive(Debug, Serialize, Deserialize)]
pub struct MigrateKeyRequest {
    pub issuer_did: String,
    pub new_private_key_base58: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct MigrateKeyResponse {
    pub issuer_did: String,
    pub status: String,
    pub message: String,
}

pub async fn migrate_issuer_key(
    State(state): State<AppState>,
    Json(req): Json<MigrateKeyRequest>,
) -> Result<impl IntoResponse, AppError> {
    let update = mongodb::bson::doc! {
        "$set": {
            "private_key": &req.new_private_key_base58
        }
    };

    state
        .db
        .update_one(
            "issuers",
            mongodb::bson::doc! { "did": &req.issuer_did },
            update,
        )
        .await?;

    Ok((
        StatusCode::OK,
        Json(MigrateKeyResponse {
            issuer_did: req.issuer_did,
            status: "success".to_string(),
            message: "Private key updated successfully. Dilithium signing now enabled.".to_string(),
        }),
    ))
}

#[derive(Debug, Serialize, Deserialize)]
pub struct RegisterHolderDIDRequest {
    pub holder_did: String,
    pub public_key: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct RegisterHolderDIDResponse {
    pub holder_did: String,
    pub status: String,
    pub message: String,
    pub tx_hash: Option<String>,
    pub holder_role_granted: bool,
    pub verifier_role_granted: bool,
}

pub async fn register_holder_did(
    State(state): State<AppState>,
    Json(req): Json<RegisterHolderDIDRequest>,
) -> Result<impl IntoResponse, AppError> {
    tracing::info!("Registering holder DID on blockchain: {}", req.holder_did);

    let blockchain_client = state
        .get_blockchain_client()
        .await
        .map_err(|e| AppError::BlockchainError(e))?;

    let client_lock = blockchain_client.read().await;
    let client = client_lock.as_ref().ok_or_else(|| {
        AppError::BlockchainError("Blockchain client not initialized".to_string())
    })?;

    let receipt = client
        .grant_consent(
            &req.holder_did,
            "system",
            "holder_registration",
            "HOLDER_ROLE,VERIFIER_ROLE",
            1,
            0,
        )
        .await
        .map_err(|e| AppError::BlockchainError(e.to_string()))?;

    let tx_hash_str = format!("{:?}", receipt.transaction_hash);
    tracing::info!("Holder DID registered on blockchain: tx={}", tx_hash_str);

    let now = chrono::Utc::now();
    let holder_doc = mongodb::bson::doc! {
        "did": &req.holder_did,
        "public_key": &req.public_key,
        "blockchain_registered": true,
        "blockchain_tx_hash": &tx_hash_str,
        "holder_role_granted": true,
        "verifier_role_granted": true,
        "created_at": mongodb::bson::DateTime::from_millis(now.timestamp_millis()),
        "registered_at": mongodb::bson::DateTime::from_millis(now.timestamp_millis()),
    };

    state
        .db
        .insert_one("holders", &holder_doc)
        .await
        .map_err(|e| AppError::InternalError(format!("Failed to store holder: {}", e)))?;

    tracing::info!("Holder DID registered in database: {}", req.holder_did);

    Ok((
        StatusCode::CREATED,
        Json(RegisterHolderDIDResponse {
            holder_did: req.holder_did,
            status: "success".to_string(),
            message: "Holder DID registered on blockchain with roles granted".to_string(),
            tx_hash: Some(tx_hash_str),
            holder_role_granted: true,
            verifier_role_granted: true,
        }),
    ))
}

pub fn admin_routes() -> Router<AppState> {
    Router::new()
        .route("/generate-did", post(generate_did))
        .route("/migrate-key", post(migrate_issuer_key))
        .route("/register-holder-did", post(register_holder_did))
}
