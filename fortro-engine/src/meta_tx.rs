use crate::error::AppError;
use ethers::{
    abi::Token,
    prelude::{
        abigen, Address, Eip712, EthAbiCodec, EthAbiType, LocalWallet, Provider, SignerMiddleware,
        H256, U256,
    },
    providers::{Http, Middleware},
    signers::Signer,
    types::{
        transaction::eip712::{EIP712Domain, Eip712},
        Bytes, TransactionRequest,
    },
    utils::{hex, keccak256},
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ForwardRequest {
    pub from: Address,
    pub to: Address,
    pub value: U256,
    pub gas: U256,
    pub nonce: U256,
    pub data: Bytes,
}

abigen!(
    MinimalForwarder,
    r#"[
        function getNonce(address from) external view returns (uint256)
    ]"#
);

/// EIP-712 typed data for forward request
#[derive(Debug, Clone, Serialize, Deserialize, Eip712, EthAbiType, EthAbiCodec)]
#[eip712(
    name = "MinimalForwarder",
    version = "1",
    chain_id = 84532,
    verifying_contract = "0x0000000000000000000000000000000000000000"
)]
pub struct ForwardRequestTyped {
    pub from: Address,
    pub to: Address,
    pub value: U256,
    pub gas: U256,
    pub nonce: U256,
    #[serde(with = "bytes_serde")]
    pub data: Bytes,
}

/// Helper for bytes serialization
mod bytes_serde {
    use super::*;
    use serde::{Deserializer, Serializer};

    pub fn serialize<S>(bytes: &Bytes, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        let hex_string = format!("0x{}", hex::encode(bytes));
        serializer.serialize_str(&hex_string)
    }

    pub fn deserialize<'de, D>(deserializer: D) -> Result<Bytes, D::Error>
    where
        D: Deserializer<'de>,
    {
        let hex_string = String::deserialize(deserializer)?;
        let hex_str = hex_string.trim_start_matches("0x");
        let bytes = hex::decode(hex_str).map_err(serde::de::Error::custom)?;
        Ok(Bytes::from(bytes))
    }
}

/// Meta-transaction relayer for gasless transactions
pub struct MetaTransactionRelayer {
    provider: Arc<SignerMiddleware<Provider<Http>, LocalWallet>>,
    pub forwarder_address: Address,
    pub chain_id: u64,
}

impl MetaTransactionRelayer {
    /// Create a new meta-transaction relayer
    pub fn new(
        provider: Arc<SignerMiddleware<Provider<Http>, LocalWallet>>,
        forwarder_address: Address,
        chain_id: u64,
    ) -> Self {
        Self {
            provider,
            forwarder_address,
            chain_id,
        }
    }

    /// Get the current nonce for an address
    pub async fn get_nonce(&self, from: Address) -> Result<U256, AppError> {
        let forwarder = MinimalForwarder::new(self.forwarder_address, self.provider.clone());

        let nonce = forwarder
            .get_nonce(from)
            .call()
            .await
            .map_err(|e| AppError::BlockchainError(format!("Failed to get nonce: {}", e)))?;

        Ok(nonce)
    }

    /// Build a forward request
    pub async fn build_forward_request(
        &self,
        from: Address,
        to: Address,
        data: Bytes,
        value: U256,
        gas: U256,
    ) -> Result<ForwardRequestTyped, AppError> {
        let nonce = self.get_nonce(from).await?;

        Ok(ForwardRequestTyped {
            from,
            to,
            value,
            gas,
            nonce,
            data,
        })
    }

    /// Create EIP-712 domain for signing
    fn get_domain(&self) -> EIP712Domain {
        EIP712Domain {
            name: Some("MinimalForwarder".to_string()),
            version: Some("1".to_string()),
            chain_id: Some(U256::from(self.chain_id)),
            verifying_contract: Some(self.forwarder_address),
            salt: None,
        }
    }

    /// Sign a forward request
    pub async fn sign_forward_request(
        &self,
        request: &ForwardRequestTyped,
        signer: &LocalWallet,
    ) -> Result<Bytes, AppError> {
        // Create the typed data hash
        let domain = self.get_domain();
        let encoded = request
            .encode_eip712()
            .map_err(|e| AppError::BlockchainError(format!("Failed to encode EIP-712: {}", e)))?;

        let signature = signer
            .sign_message(&encoded[..])
            .await
            .map_err(|e| AppError::BlockchainError(format!("Failed to sign: {}", e)))?;

        Ok(signature.to_vec().into())
    }

    /// Verify a forward request signature
    pub async fn verify_forward_request(
        &self,
        request: &ForwardRequestTyped,
        signature: &Bytes,
    ) -> Result<bool, AppError> {
        // Encode the ForwardRequest struct as ABI tuple
        let request_tuple = Token::Tuple(vec![
            Token::Address(request.from),
            Token::Address(request.to),
            Token::Uint(request.value),
            Token::Uint(request.gas),
            Token::Uint(request.nonce),
            Token::Bytes(request.data.to_vec()),
        ]);

        let function_selector =
            keccak256(b"verify((address,address,uint256,uint256,uint256,bytes),bytes)")[..4]
                .to_vec();
        let encoded_params =
            ethers::abi::encode(&[request_tuple, Token::Bytes(signature.to_vec())]);

        let mut calldata = function_selector;
        calldata.extend_from_slice(&encoded_params);

        // Make static call to contract
        let tx = TransactionRequest::new()
            .to(self.forwarder_address)
            .data(calldata);

        let result =
            self.provider.call(&tx.into(), None).await.map_err(|e| {
                AppError::BlockchainError(format!("Failed to verify signature: {}", e))
            })?;

        // Decode bool response
        if result.len() >= 32 {
            let is_valid = result[31] == 1;
            Ok(is_valid)
        } else {
            Err(AppError::BlockchainError(
                "Invalid response from verify call".to_string(),
            ))
        }
    }

    /// Execute a meta-transaction
    pub async fn execute_meta_transaction(
        &self,
        request: ForwardRequestTyped,
        signature: Bytes,
    ) -> Result<H256, AppError> {
        // First verify the signature
        let is_valid = self.verify_forward_request(&request, &signature).await?;
        if !is_valid {
            return Err(AppError::BlockchainError("Invalid signature".to_string()));
        }

        // Encode the ForwardRequest struct as ABI tuple
        let request_tuple = Token::Tuple(vec![
            Token::Address(request.from),
            Token::Address(request.to),
            Token::Uint(request.value),
            Token::Uint(request.gas),
            Token::Uint(request.nonce),
            Token::Bytes(request.data.to_vec()),
        ]);

        let function_selector =
            keccak256(b"execute((address,address,uint256,uint256,uint256,bytes),bytes)")[..4]
                .to_vec();
        let encoded_params =
            ethers::abi::encode(&[request_tuple, Token::Bytes(signature.to_vec())]);

        let mut calldata = function_selector;
        calldata.extend_from_slice(&encoded_params);

        let tx = TransactionRequest::new()
            .to(self.forwarder_address)
            .data(calldata)
            .value(request.value)
            .gas(300000u64);

        let pending_tx = self
            .provider
            .send_transaction(tx, None)
            .await
            .map_err(|e| {
                AppError::BlockchainError(format!("Failed to send meta-transaction: {}", e))
            })?;

        let receipt = pending_tx
            .await
            .map_err(|e| AppError::BlockchainError(format!("Failed to get receipt: {}", e)))?
            .ok_or_else(|| AppError::BlockchainError("Transaction not found".to_string()))?;

        Ok(receipt.transaction_hash)
    }
}

/// Request structure for meta-transaction API
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MetaTransactionRequest {
    pub from: String,
    pub to: String,
    pub data: String,
    pub value: Option<String>,
    pub gas: Option<String>,
    pub signature: Option<String>,
}

/// Response structure for meta-transaction API
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MetaTransactionResponse {
    pub success: bool,
    pub tx_hash: Option<String>,
    pub error: Option<String>,
    pub nonce: Option<String>,
    pub request_hash: Option<String>,
}

/// Helper function to create EIP-712 domain separator
pub fn create_domain_separator(
    name: &str,
    version: &str,
    chain_id: u64,
    verifying_contract: Address,
) -> [u8; 32] {
    let domain_type_hash = keccak256(
        b"EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)",
    );
    let name_hash = keccak256(name.as_bytes());
    let version_hash = keccak256(version.as_bytes());

    let mut chain_id_bytes = [0u8; 32];
    U256::from(chain_id).to_big_endian(&mut chain_id_bytes);

    let mut encoded = Vec::new();
    encoded.extend_from_slice(&domain_type_hash);
    encoded.extend_from_slice(&name_hash);
    encoded.extend_from_slice(&version_hash);
    encoded.extend_from_slice(&chain_id_bytes);
    encoded.extend_from_slice(&[0u8; 12]);
    encoded.extend_from_slice(verifying_contract.as_bytes());

    keccak256(&encoded)
}

/// Helper function to create ForwardRequest struct hash
pub fn hash_forward_request(request: &ForwardRequestTyped) -> [u8; 32] {
    let type_hash = keccak256(b"ForwardRequest(address from,address to,uint256 value,uint256 gas,uint256 nonce,bytes data)");
    let data_hash = keccak256(&request.data);

    let mut value_bytes = [0u8; 32];
    request.value.to_big_endian(&mut value_bytes);

    let mut gas_bytes = [0u8; 32];
    request.gas.to_big_endian(&mut gas_bytes);

    let mut nonce_bytes = [0u8; 32];
    request.nonce.to_big_endian(&mut nonce_bytes);

    let mut encoded = Vec::new();
    encoded.extend_from_slice(&type_hash);
    encoded.extend_from_slice(&[0u8; 12]);
    encoded.extend_from_slice(request.from.as_bytes());
    encoded.extend_from_slice(&[0u8; 12]);
    encoded.extend_from_slice(request.to.as_bytes());
    encoded.extend_from_slice(&value_bytes);
    encoded.extend_from_slice(&gas_bytes);
    encoded.extend_from_slice(&nonce_bytes);
    encoded.extend_from_slice(&data_hash);

    keccak256(&encoded)
}

/// Create EIP-712 typed data hash for signing
pub fn create_typed_data_hash(domain_separator: &[u8; 32], struct_hash: &[u8; 32]) -> [u8; 32] {
    let mut message = Vec::new();
    message.push(0x19);
    message.push(0x01);
    message.extend_from_slice(domain_separator);
    message.extend_from_slice(struct_hash);

    keccak256(&message)
}
