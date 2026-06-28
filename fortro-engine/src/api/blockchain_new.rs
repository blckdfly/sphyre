use axum::{
    extract::{Path, State},
    Json,
};
use serde::{Deserialize, Serialize};

use crate::{error::AppError, services::AppState};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RegisterCredentialRequest {
    pub did: String,
    pub credential_hash: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RevokeCredentialRequest {
    pub did: String,
    pub credential_hash: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RegisterSchemaRequest {
    pub schema_id: String,
    pub schema_hash: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConsentRequest {
    pub user_did: String,
    pub verifier_did: String,
    pub purpose: String,
    pub data_categories: String,
    pub access_level: u8,
    pub expires_at: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BlockchainResponse {
    pub success: bool,
    pub tx_hash: Option<String>,
    pub block_number: Option<u64>,
    pub gas_used: Option<String>,
    pub error: Option<String>,
}

/// Register a credential on blockchain
pub async fn register_credential(
    State(state): State<AppState>,
    Json(request): Json<RegisterCredentialRequest>,
) -> Result<Json<BlockchainResponse>, AppError> {
    let client_lock = state
        .get_blockchain_client()
        .await
        .map_err(|e| AppError::BlockchainError(e))?;

    let client_opt = client_lock.read().await;
    let client = client_opt.as_ref().ok_or_else(|| {
        AppError::BlockchainError("Blockchain client not initialized".to_string())
    })?;

    let receipt = client
        .register_credential(&request.did, &request.credential_hash)
        .await
        .map_err(|e| AppError::BlockchainError(e.to_string()))?;

    Ok(Json(BlockchainResponse {
        success: true,
        tx_hash: Some(format!("{:?}", receipt.transaction_hash)),
        block_number: receipt.block_number.map(|b| b.as_u64()),
        gas_used: receipt.gas_used.map(|g| g.to_string()),
        error: None,
    }))
}

/// Revoke a credential on blockchain
pub async fn revoke_credential(
    State(state): State<AppState>,
    Json(request): Json<RevokeCredentialRequest>,
) -> Result<Json<BlockchainResponse>, AppError> {
    let client_lock = state
        .get_blockchain_client()
        .await
        .map_err(|e| AppError::BlockchainError(e))?;

    let client_opt = client_lock.read().await;
    let client = client_opt.as_ref().ok_or_else(|| {
        AppError::BlockchainError("Blockchain client not initialized".to_string())
    })?;

    let receipt = client
        .revoke_credential(&request.did, &request.credential_hash)
        .await
        .map_err(|e| AppError::BlockchainError(e.to_string()))?;

    Ok(Json(BlockchainResponse {
        success: true,
        tx_hash: Some(format!("{:?}", receipt.transaction_hash)),
        block_number: receipt.block_number.map(|b| b.as_u64()),
        gas_used: receipt.gas_used.map(|g| g.to_string()),
        error: None,
    }))
}

/// Register a schema on blockchain
pub async fn register_schema(
    State(state): State<AppState>,
    Json(request): Json<RegisterSchemaRequest>,
) -> Result<Json<BlockchainResponse>, AppError> {
    let client_lock = state
        .get_blockchain_client()
        .await
        .map_err(|e| AppError::BlockchainError(e))?;

    let client_opt = client_lock.read().await;
    let client = client_opt.as_ref().ok_or_else(|| {
        AppError::BlockchainError("Blockchain client not initialized".to_string())
    })?;

    let receipt = client
        .register_schema(&Some(request.schema_id.clone()), &request.schema_hash)
        .await
        .map_err(|e| AppError::BlockchainError(e.to_string()))?;

    Ok(Json(BlockchainResponse {
        success: true,
        tx_hash: Some(format!("{:?}", receipt.transaction_hash)),
        block_number: receipt.block_number.map(|b| b.as_u64()),
        gas_used: receipt.gas_used.map(|g| g.to_string()),
        error: None,
    }))
}

/// Check if a credential is registered
pub async fn check_credential(
    State(state): State<AppState>,
    Path((did, credential_hash)): Path<(String, String)>,
) -> Result<Json<serde_json::Value>, AppError> {
    let client_lock = state
        .get_blockchain_client()
        .await
        .map_err(|e| AppError::BlockchainError(e))?;

    let client_opt = client_lock.read().await;
    let client = client_opt.as_ref().ok_or_else(|| {
        AppError::BlockchainError("Blockchain client not initialized".to_string())
    })?;

    let is_registered = client
        .is_credential_registered(&did, &credential_hash)
        .await
        .map_err(|e| AppError::BlockchainError(e.to_string()))?;

    let is_revoked = if is_registered {
        client
            .is_credential_revoked(&did, &credential_hash)
            .await
            .unwrap_or(false)
    } else {
        false
    };

    Ok(Json(serde_json::json!({
        "did": did,
        "credentialHash": credential_hash,
        "isRegistered": is_registered,
        "isRevoked": is_revoked,
    })))
}

/// Grant consent on blockchain
pub async fn grant_consent(
    State(state): State<AppState>,
    Json(request): Json<ConsentRequest>,
) -> Result<Json<BlockchainResponse>, AppError> {
    let client_lock = state
        .get_blockchain_client()
        .await
        .map_err(|e| AppError::BlockchainError(e))?;

    let client_opt = client_lock.read().await;
    let client = client_opt.as_ref().ok_or_else(|| {
        AppError::BlockchainError("Blockchain client not initialized".to_string())
    })?;

    let receipt = client
        .grant_consent(
            &request.user_did,
            &request.verifier_did,
            &request.purpose,
            &request.data_categories,
            request.access_level,
            request.expires_at.unwrap_or(0),
        )
        .await
        .map_err(|e| AppError::BlockchainError(e.to_string()))?;

    Ok(Json(BlockchainResponse {
        success: true,
        tx_hash: Some(format!("{:?}", receipt.transaction_hash)),
        block_number: receipt.block_number.map(|b| b.as_u64()),
        gas_used: receipt.gas_used.map(|g| g.to_string()),
        error: None,
    }))
}

/// Revoke consent on blockchain
pub async fn revoke_consent(
    State(state): State<AppState>,
    Json(request): Json<ConsentRequest>,
) -> Result<Json<BlockchainResponse>, AppError> {
    let client_lock = state
        .get_blockchain_client()
        .await
        .map_err(|e| AppError::BlockchainError(e))?;

    let client_opt = client_lock.read().await;
    let client = client_opt.as_ref().ok_or_else(|| {
        AppError::BlockchainError("Blockchain client not initialized".to_string())
    })?;

    let receipt = client
        .revoke_consent(&request.user_did, &request.verifier_did, &request.purpose)
        .await
        .map_err(|e| AppError::BlockchainError(e.to_string()))?;

    Ok(Json(BlockchainResponse {
        success: true,
        tx_hash: Some(format!("{:?}", receipt.transaction_hash)),
        block_number: receipt.block_number.map(|b| b.as_u64()),
        gas_used: receipt.gas_used.map(|g| g.to_string()),
        error: None,
    }))
}

/// Check if consent is valid
pub async fn check_consent(
    State(state): State<AppState>,
    Path((user_did, verifier_did, purpose)): Path<(String, String, String)>,
) -> Result<Json<serde_json::Value>, AppError> {
    let client_lock = state
        .get_blockchain_client()
        .await
        .map_err(|e| AppError::BlockchainError(e))?;

    let client_opt = client_lock.read().await;
    let client = client_opt.as_ref().ok_or_else(|| {
        AppError::BlockchainError("Blockchain client not initialized".to_string())
    })?;

    let is_valid = client
        .is_consent_valid(&user_did, &verifier_did, &purpose)
        .await
        .map_err(|e| AppError::BlockchainError(e.to_string()))?;

    Ok(Json(serde_json::json!({
        "userDid": user_did,
        "verifierDid": verifier_did,
        "purpose": purpose,
        "isValid": is_valid,
    })))
}

/// Get blockchain status
pub async fn get_blockchain_status(
    State(state): State<AppState>,
) -> Result<Json<serde_json::Value>, AppError> {
    let client_lock = state
        .get_blockchain_client()
        .await
        .map_err(|e| AppError::BlockchainError(e))?;

    let client_opt = client_lock.read().await;
    let client = client_opt.as_ref().ok_or_else(|| {
        AppError::BlockchainError("Blockchain client not initialized".to_string())
    })?;

    let (name, version, owner) = client
        .get_contract_info()
        .await
        .map_err(|e| AppError::BlockchainError(e.to_string()))?;

    let wallet_address = client.wallet_address();

    Ok(Json(serde_json::json!({
        "connected": true,
        "contract": {
            "name": name,
            "version": version,
            "owner": format!("{:?}", owner),
        },
        "walletAddress": format!("{:?}", wallet_address),
        "network": "Base Sepolia",
        "chainId": 84532,
    })))
}

use axum::{
    routing::{get, post},
    Router,
};

pub fn routes() -> Router<AppState> {
    Router::new()
        // Credential management
        .route("/credential/register", post(register_credential))
        .route("/credential/revoke", post(revoke_credential))
        .route(
            "/credential/check/:did/:credential_hash",
            get(check_credential),
        )
        // Schema management
        .route("/schema/register", post(register_schema))
        // Consent management
        .route("/consent/grant", post(grant_consent))
        .route("/consent/revoke", post(revoke_consent))
        .route(
            "/consent/check/:user_did/:verifier_did/:purpose",
            get(check_consent),
        )
        // Status
        .route("/status", get(get_blockchain_status))
}
