use axum::{
    extract::{Path, State},
    Json,
};
use ethers::{
    abi::{encode, Token},
    core::types::Bytes,
    prelude::{Address, U256},
    utils::keccak256,
};
use serde::{Deserialize, Serialize};

use crate::{
    error::AppError,
    meta_tx::{MetaTransactionRequest, MetaTransactionResponse},
    services::AppState,
};

/// Request to register a credential via meta-transaction
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RegisterCredentialRequest {
    pub did: String,
    pub credential_hash: String,
    pub metadata_uri: Option<String>,
    pub signature: Option<String>,
}

/// Request to revoke a credential via meta-transaction
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RevokeCredentialRequest {
    pub did: String,
    pub credential_hash: String,
    pub signature: Option<String>,
}

/// Request to register a DID on-chain
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RegisterDIDRequest {
    pub did: String,
    pub public_key: String,
    pub signature: Option<String>,
}

/// Request to update consent on-chain
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConsentRequest {
    pub user_did: String,
    pub verifier_did: String,
    pub purpose: String,
    pub data_categories: String,
    pub access_level: u8,
    pub expires_at: Option<u64>,
    pub revoke: bool,
    pub signature: Option<String>,
}

/// Response for blockchain operations
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BlockchainResponse {
    pub success: bool,
    pub tx_hash: Option<String>,
    pub block_number: Option<u64>,
    pub error: Option<String>,
}

/// Register a credential on-chain
pub async fn register_credential(
    State(state): State<AppState>,
    Json(request): Json<RegisterCredentialRequest>,
) -> Result<Json<BlockchainResponse>, AppError> {
    let ethereum_client = state.blockchain.as_ref();

    // If meta-tx signature is provided, use meta-transaction path
    if let Some(signature_hex) = request.signature.clone() {
        if !ethereum_client.enable_meta_tx {
            return Err(AppError::ConfigError(
                "Meta-transactions are disabled".to_string(),
            ));
        }

        let relayer = ethereum_client.meta_tx_relayer.as_ref().ok_or_else(|| {
            AppError::ConfigError("Meta-transaction relayer not configured".to_string())
        })?;

        let registry_address_str = ethereum_client.registry_address_str().ok_or_else(|| {
            AppError::ConfigError("SSI Registry address not configured".to_string())
        })?;

        let registry_address = registry_address_str
            .parse::<Address>()
            .map_err(|e| AppError::ValidationError(format!("Invalid registry address: {}", e)))?;

        let issuer_fragment = request
            .did
            .rsplit(':')
            .next()
            .ok_or_else(|| AppError::ValidationError("Invalid DID format".to_string()))?;

        let issuer_address = issuer_fragment.parse::<Address>().map_err(|e| {
            AppError::ValidationError(format!("Invalid issuer address in DID: {}", e))
        })?;

        // Encode registerCredential call data
        let mut call_data = keccak256(b"registerCredential(string,string)")[..4].to_vec();
        let encoded_params = encode(&[
            Token::String(request.did.clone()),
            Token::String(request.credential_hash.clone()),
        ]);
        call_data.extend_from_slice(&encoded_params);
        let call_data = Bytes::from(call_data);

        let forward_request = relayer
            .build_forward_request(
                issuer_address,
                registry_address,
                call_data,
                U256::zero(),
                U256::from(200000u64),
            )
            .await?;

        let signature_clean = signature_hex.trim_start_matches("0x");
        let signature_bytes = hex::decode(signature_clean)
            .map_err(|e| AppError::ValidationError(format!("Invalid signature: {}", e)))?;
        let signature = Bytes::from(signature_bytes);

        let tx_hash = relayer
            .execute_meta_transaction(forward_request, signature)
            .await?;

        let block_number = ethereum_client.get_block_number().await.ok();

        return Ok(Json(BlockchainResponse {
            success: true,
            tx_hash: Some(format!("{:?}", tx_hash)),
            block_number,
            error: None,
        }));
    }

    let tx_hash = ethereum_client
        .register_credential(
            &request.did,
            &request.credential_hash,
            request.metadata_uri.as_deref().unwrap_or(""),
        )
        .await?;

    let block_number = ethereum_client.get_block_number().await.ok();

    Ok(Json(BlockchainResponse {
        success: true,
        tx_hash: Some(format!("{:?}", tx_hash)),
        block_number,
        error: None,
    }))
}

/// Revoke a credential on-chain
pub async fn revoke_credential(
    State(state): State<AppState>,
    Json(request): Json<RevokeCredentialRequest>,
) -> Result<Json<BlockchainResponse>, AppError> {
    let ethereum_client = state.blockchain.as_ref();

    let tx_hash = ethereum_client
        .revoke_credential(&request.did, &request.credential_hash)
        .await?;

    let block_number = ethereum_client.get_block_number().await.ok();

    Ok(Json(BlockchainResponse {
        success: true,
        tx_hash: Some(format!("{:?}", tx_hash)),
        block_number,
        error: None,
    }))
}

pub async fn register_credential_relayer(
    State(state): State<AppState>,
    Json(request): Json<RegisterCredentialRequest>,
) -> Result<Json<BlockchainResponse>, AppError> {
    let ethereum_client = state.blockchain.as_ref();

    let tx_hash = ethereum_client
        .register_credential(
            &request.did,
            &request.credential_hash,
            request.metadata_uri.as_deref().unwrap_or(""),
        )
        .await?;

    let block_number = ethereum_client.get_block_number().await.ok();

    Ok(Json(BlockchainResponse {
        success: true,
        tx_hash: Some(format!("{:?}", tx_hash)),
        block_number,
        error: None,
    }))
}

pub async fn revoke_credential_relayer(
    State(state): State<AppState>,
    Json(request): Json<RevokeCredentialRequest>,
) -> Result<Json<BlockchainResponse>, AppError> {
    let ethereum_client = state.blockchain.as_ref();

    let tx_hash = ethereum_client
        .revoke_credential(&request.did, &request.credential_hash)
        .await?;

    let block_number = ethereum_client.get_block_number().await.ok();

    Ok(Json(BlockchainResponse {
        success: true,
        tx_hash: Some(format!("{:?}", tx_hash)),
        block_number,
        error: None,
    }))
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RegisterSchemaRequest {
    pub schema_id: String,
    pub schema_uri: String,
}

pub async fn register_schema_relayer(
    State(state): State<AppState>,
    Json(request): Json<RegisterSchemaRequest>,
) -> Result<Json<BlockchainResponse>, AppError> {
    let ethereum_client = state.blockchain.as_ref();

    // Backend relayer executes directly
    let tx_hash = ethereum_client
        .register_schema(&request.schema_id, &request.schema_uri)
        .await?;

    let block_number = ethereum_client.get_block_number().await.ok();

    Ok(Json(BlockchainResponse {
        success: true,
        tx_hash: Some(format!("{:?}", tx_hash)),
        block_number,
        error: None,
    }))
}

/// Check if a credential is valid on-chain
pub async fn check_credential(
    State(state): State<AppState>,
    Path((did, credential_hash)): Path<(String, String)>,
) -> Result<Json<serde_json::Value>, AppError> {
    let ethereum_client = state.blockchain.as_ref();

    let is_valid = ethereum_client
        .is_credential_registered(&did, &credential_hash)
        .await?;

    let is_revoked = if is_valid {
        false
    } else {
        ethereum_client
            .is_credential_revoked(&did, &credential_hash)
            .await
            .unwrap_or(false)
    };

    Ok(Json(serde_json::json!({
        "did": did,
        "credentialHash": credential_hash,
        "isValid": is_valid,
        "isRevoked": is_revoked,
    })))
}

/// Execute a meta-transaction
pub async fn execute_meta_transaction(
    State(state): State<AppState>,
    Json(request): Json<MetaTransactionRequest>,
) -> Result<Json<MetaTransactionResponse>, AppError> {
    let ethereum_client = state.blockchain.as_ref();

    let relayer = ethereum_client.meta_tx_relayer.as_ref().ok_or_else(|| {
        AppError::ConfigError("Meta-transaction relayer not configured".to_string())
    })?;

    // Parse addresses
    let from = request
        .from
        .parse::<Address>()
        .map_err(|e| AppError::ValidationError(format!("Invalid from address: {}", e)))?;

    let to = request
        .to
        .parse::<Address>()
        .map_err(|e| AppError::ValidationError(format!("Invalid to address: {}", e)))?;

    // Parse data
    let data = if request.data.starts_with("0x") {
        hex::decode(&request.data[2..])
            .map_err(|e| AppError::ValidationError(format!("Invalid hex data: {}", e)))?
    } else {
        hex::decode(&request.data)
            .map_err(|e| AppError::ValidationError(format!("Invalid hex data: {}", e)))?
    };
    let data = Bytes::from(data);

    // Parse value and gas
    let value = request
        .value
        .and_then(|v| v.parse::<U256>().ok())
        .unwrap_or_else(|| U256::zero());

    let gas = request
        .gas
        .and_then(|g| g.parse::<U256>().ok())
        .unwrap_or_else(|| U256::from(200000));

    // Build forward request
    let forward_request = relayer
        .build_forward_request(from, to, data, value, gas)
        .await?;

    // If signature is provided, execute immediately
    if let Some(sig_str) = request.signature {
        let signature = if sig_str.starts_with("0x") {
            hex::decode(&sig_str[2..])
                .map_err(|e| AppError::ValidationError(format!("Invalid signature: {}", e)))?
        } else {
            hex::decode(&sig_str)
                .map_err(|e| AppError::ValidationError(format!("Invalid signature: {}", e)))?
        };
        let signature = Bytes::from(signature);

        // Verify signature
        let is_valid = relayer
            .verify_forward_request(&forward_request, &signature)
            .await?;

        if !is_valid {
            return Ok(Json(MetaTransactionResponse {
                success: false,
                tx_hash: None,
                error: Some("Invalid signature".to_string()),
                nonce: None,
                request_hash: None,
            }));
        }

        // Execute meta-transaction
        let tx_hash = relayer
            .execute_meta_transaction(forward_request.clone(), signature)
            .await?;

        Ok(Json(MetaTransactionResponse {
            success: true,
            tx_hash: Some(format!("{:?}", tx_hash)),
            error: None,
            nonce: Some(format!("{}", forward_request.nonce)),
            request_hash: None,
        }))
    } else {
        // Return the request for user to sign
        let request_hash =
            ethers::utils::keccak256(serde_json::to_vec(&forward_request).map_err(|e| {
                AppError::InternalError(format!("Failed to serialize request: {}", e))
            })?);

        Ok(Json(MetaTransactionResponse {
            success: true,
            tx_hash: None,
            error: None,
            nonce: Some(format!("{}", forward_request.nonce)),
            request_hash: Some(format!("0x{}", hex::encode(request_hash))),
        }))
    }
}

/// Get the current nonce for an address
pub async fn get_nonce(
    State(state): State<AppState>,
    Path(address): Path<String>,
) -> Result<Json<serde_json::Value>, AppError> {
    let ethereum_client = state.blockchain.as_ref();

    let relayer = ethereum_client.meta_tx_relayer.as_ref().ok_or_else(|| {
        AppError::ConfigError("Meta-transaction relayer not configured".to_string())
    })?;

    let addr = address
        .parse::<Address>()
        .map_err(|e| AppError::ValidationError(format!("Invalid address: {}", e)))?;

    let nonce = relayer.get_nonce(addr).await?;

    Ok(Json(serde_json::json!({
        "address": address,
        "nonce": format!("{}", nonce),
    })))
}

/// Get blockchain status
pub async fn get_blockchain_status(
    State(state): State<AppState>,
) -> Result<Json<serde_json::Value>, AppError> {
    let ethereum_client = state.blockchain.as_ref();

    let block_number = ethereum_client.get_block_number().await?;
    let chain_id = ethereum_client.get_chain_id().await?;
    let wallet_address = ethereum_client.wallet_address();
    let registry_address = ethereum_client.registry_address_str();

    let is_registry_accessible = if registry_address.is_some() {
        ethereum_client.is_registry_accessible().await.ok()
    } else {
        None
    };

    Ok(Json(serde_json::json!({
        "connected": true,
        "blockNumber": block_number,
        "chainId": chain_id,
        "walletAddress": wallet_address,
        "registryAddress": registry_address,
        "isRegistryAccessible": is_registry_accessible,
        "metaTransactionsEnabled": ethereum_client.enable_meta_tx,
        "forwarderAddress": ethereum_client.forwarder_address.map(|a| format!("{:?}", a)),
    })))
}

/// Create blockchain API routes
use axum::{
    routing::{get, post},
    Router,
};

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/register-credential", post(register_credential))
        .route("/revoke-credential", post(revoke_credential))
        .route(
            "/register-credential-relayer",
            post(register_credential_relayer),
        )
        .route(
            "/revoke-credential-relayer",
            post(revoke_credential_relayer),
        )
        .route("/register-schema-relayer", post(register_schema_relayer))
        .route("/check/:did/:credential_hash", get(check_credential))
        .route("/meta-transaction", post(execute_meta_transaction))
        .route("/meta-transaction/prepare", post(prepare_meta_transaction))
        .route("/nonce/:address", get(get_nonce))
        .route("/status", get(get_blockchain_status))
}

/// Prepare meta-transaction for frontend signing
pub async fn prepare_meta_transaction(
    State(state): State<AppState>,
    Json(request): Json<MetaTransactionRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    let ethereum_client = state.blockchain.as_ref();

    let relayer = ethereum_client.meta_tx_relayer.as_ref().ok_or_else(|| {
        AppError::ConfigError("Meta-transaction relayer not configured".to_string())
    })?;

    // Parse addresses
    let from = request
        .from
        .parse::<Address>()
        .map_err(|e| AppError::ValidationError(format!("Invalid from address: {}", e)))?;

    let to = request
        .to
        .parse::<Address>()
        .map_err(|e| AppError::ValidationError(format!("Invalid to address: {}", e)))?;

    // Parse data
    let data = if request.data.starts_with("0x") {
        hex::decode(&request.data[2..])
            .map_err(|e| AppError::ValidationError(format!("Invalid hex data: {}", e)))?
    } else {
        hex::decode(&request.data)
            .map_err(|e| AppError::ValidationError(format!("Invalid hex data: {}", e)))?
    };
    let data = Bytes::from(data);

    // Parse value and gas
    let value = request
        .value
        .and_then(|v| v.parse::<U256>().ok())
        .unwrap_or_else(|| U256::zero());

    let gas = request
        .gas
        .and_then(|g| g.parse::<U256>().ok())
        .unwrap_or_else(|| U256::from(200000));

    // Build forward request
    let forward_request = relayer
        .build_forward_request(from, to, data, value, gas)
        .await?;

    // Create EIP-712 typed data for frontend
    let domain_separator = crate::meta_tx::create_domain_separator(
        "MinimalForwarder",
        "1",
        relayer.chain_id,
        relayer.forwarder_address,
    );

    let struct_hash = crate::meta_tx::hash_forward_request(&forward_request);
    let typed_data_hash = crate::meta_tx::create_typed_data_hash(&domain_separator, &struct_hash);

    Ok(Json(serde_json::json!({
        "success": true,
        "forwardRequest": {
            "from": format!("{:?}", forward_request.from),
            "to": format!("{:?}", forward_request.to),
            "value": forward_request.value.to_string(),
            "gas": forward_request.gas.to_string(),
            "nonce": forward_request.nonce.to_string(),
            "data": format!("0x{}", hex::encode(&forward_request.data)),
        },
        "domain": {
            "name": "MinimalForwarder",
            "version": "1",
            "chainId": relayer.chain_id,
            "verifyingContract": format!("{:?}", relayer.forwarder_address),
        },
        "typedDataHash": format!("0x{}", hex::encode(typed_data_hash)),
        "domainSeparator": format!("0x{}", hex::encode(domain_separator)),
        "structHash": format!("0x{}", hex::encode(struct_hash)),
    })))
}
