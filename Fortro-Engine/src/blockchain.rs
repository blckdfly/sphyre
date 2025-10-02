use ethers::{
    prelude::{
        abigen, Address, ContractFactory, LocalWallet, Provider, SignerMiddleware, TransactionRequest,
        U256,
    },
    providers::{Http, Middleware},
    types::{TransactionReceipt, H256},
    abi::parse_abi,
    core::types::Bytes,
};
use std::sync::Arc;

use crate::error::AppError;
use crate::utils::did;

// Generate bindings for the SSI Registry smart contract (interface aligned with ISSIRegistry.sol)
abigen!(
    SSIRegistry,
    r#"[
        function registerCredential(string did, string credentialHash, string metadataURI) external returns (bytes32)
        function revokeCredential(string did, string credentialHash) external returns (bool)
        function isCredentialValid(string did, string credentialHash) external view returns (bool)
        function registerSchema(string schemaId, string schemaURI) external returns (bool)
        function getSchemaURI(string schemaId) external view returns (string)
        function isSchemaRegistered(string schemaId) external view returns (bool)
        function addIssuer(address issuer) external
        function removeIssuer(address issuer) external
        function isIssuer(address issuer) external view returns (bool)
        function addVerifier(address verifier) external
        function removeVerifier(address verifier) external
        function isVerifier(address verifier) external view returns (bool)
    ]"#
);

/// Ethereum client for interacting with the blockchain
pub struct EthereumClient {
    provider: Arc<SignerMiddleware<Provider<Http>, LocalWallet>>,
    registry_address: Option<Address>,
}

impl EthereumClient {
    /// Get the current wallet address used by the client
    pub fn wallet_address(&self) -> String {
        let addr = self.provider.address();
        format!("{:?}", addr)
    }

    /// Get the configured registry address (if any) as hex string
    pub fn registry_address_str(&self) -> Option<String> {
        self.registry_address.map(|a| format!("{:?}", a))
    }

    /// Check whether the configured registry is accessible by calling a simple view
    pub async fn is_registry_accessible(&self) -> Result<bool, AppError> {
        let registry = self.get_registry()?;
        let addr = self.provider.address();
        let res = registry
            .is_verifier(addr)
            .call()
            .await
            .map_err(|e| AppError::BlockchainError(format!("Failed to call registry: {}", e)))?;
        Ok(res)
    }

    /// Get the current chain ID from the provider (useful to confirm L2 network)
    pub async fn get_chain_id(&self) -> Result<u64, AppError> {
        let id = self
            .provider
            .get_chainid()
            .await
            .map_err(|_| AppError::BlockchainError("Failed to get chain ID".to_string()))?;
        Ok(id.as_u64())
    }
}

impl EthereumClient {
    /// Create a new Ethereum client
    pub fn new(rpc_url: &str) -> Result<Self, AppError> {
        let provider = Provider::<Http>::try_from(rpc_url)
            .map_err(|e| AppError::BlockchainError(format!("Failed to create provider: {}", e)))?;

        let wallet = LocalWallet::new(&mut rand::thread_rng());

        let provider = Arc::new(SignerMiddleware::new(provider, wallet));

        Ok(Self {
            provider,
            registry_address: None,
        })
    }

    /// Set the wallet for signing transactions
    pub fn with_wallet(mut self, private_key: &str) -> Result<Self, AppError> {
        let wallet = private_key
            .parse::<LocalWallet>()
            .map_err(|e| AppError::BlockchainError(format!("Invalid private key: {}", e)))?;

        let provider = Provider::<Http>::try_from(self.provider.provider().url().to_string())
            .map_err(|e| AppError::BlockchainError(format!("Failed to create provider: {}", e)))?;

        self.provider = Arc::new(SignerMiddleware::new(provider, wallet));

        Ok(self)
    }

    /// Set the SSI Registry contract address
    pub fn with_registry_address(mut self, address: &str) -> Result<Self, AppError> {
        self.registry_address = Some(
            address
                .parse::<Address>()
                .map_err(|e| AppError::BlockchainError(format!("Invalid address: {}", e)))?,
        );

        Ok(self)
    }

    /// Deploy the SSI Registry contract
    pub async fn deploy_registry(&mut self) -> Result<Address, AppError> {

        let abi_json = r#"[
            "function registerCredential(string did, string credentialHash) public returns (bool)",
            "function revokeCredential(string did, string credentialHash) public returns (bool)",
            "function isCredentialRegistered(string did, string credentialHash) public view returns (bool)",
            "function isCredentialRevoked(string did, string credentialHash) public view returns (bool)",
            "function registerSchema(string schemaId, string schemaHash) public returns (bool)",
            "function getSchemaHash(string schemaId) public view returns (string)",
            "event CredentialRegistered(string indexed did, string credentialHash)",
            "event CredentialRevoked(string indexed did, string credentialHash)",
            "event SchemaRegistered(string indexed schemaId, string schemaHash)"
        ]"#;
        
        // Placeholder bytecode (this would be the actual compiled bytecode in a real implementation)
        let bytecode_hex = "0x608060405234801561001057600080fd5b50610b0a806100206000396000f3fe608060405234801561001057600080fd5b50600436106100575760003560e01c80634e5a5a591461005c57806354fd4d501461008c5780636b8ff574146100aa578063b2bdfa7b146100c8578063ba40f5b9146100e6575b600080fd5b61007660048036038101906100719190610787565b610116565b60405161008391906107c9565b60405180910390f35b61009461017a565b6040516100a191906107c9565b60405180910390f35b6100b26101b8565b6040516100bf91906107c9565b60405180910390f35b6100d06101f6565b6040516100dd91906108a5565b60405180910390f35b61010060048036038101906100fb9190610787565b61021c565b60405161010d91906107c9565b60405180910390f35b60606000826040516020016101299190610a6d565b604051602081830303815290604052805190602001209050600180826040516101519190610a84565b908152602001604051809103902080546101699061094e565b80601f0160208091040260200160405190810160405280929190818152602001828054610195";
        
        // Parse ABI using parse_abi and convert bytecode from hex to bytes
        let parsed_abi = parse_abi(&[abi_json]).map_err(|e| AppError::BlockchainError(format!("Failed to parse ABI: {}", e)))?;
        let parsed_bytecode = Bytes::from(hex::decode(bytecode_hex.trim_start_matches("0x")).map_err(|e| AppError::BlockchainError(format!("Failed to decode bytecode: {}", e)))?);
        
        let factory = ContractFactory::new(parsed_abi, parsed_bytecode, self.provider.clone());

        let contract = factory
            .deploy(())
            .map_err(|e| AppError::BlockchainError("Failed to deploy contract".to_string()))?
            .send()
            .await
            .map_err(|e| AppError::BlockchainError("Failed to send deployment transaction:".to_string()))?;

        let address = contract.address();
        self.registry_address = Some(address);

        tracing::info!("Deployed SSI Registry contract at: {}", address);

        Ok(address)
    }

    /// Get the SSI Registry contract instance
    fn get_registry(&self) -> Result<SSIRegistry<SignerMiddleware<Provider<Http>, LocalWallet>>, AppError> {
        let address = self.registry_address
            .ok_or_else(|| AppError::BlockchainError("Registry address not set".to_string()))?;

        Ok(SSIRegistry::new(address, self.provider.clone()))
    }

    /// Register a credential on the blockchain
    /// metadata_uri is typically an IPFS URI/hash for the credential metadata
    pub async fn register_credential(&self, did: &str, credential_hash: &str, metadata_uri: &str) -> Result<H256, AppError> {
            // Enforce did:alyra usage across blockchain interactions
            if !did::validate_did(did) { 
                return Err(AppError::ValidationError("Invalid DID: only did:alyra is supported".to_string()));
            }
        let registry = self.get_registry()?;

        let pending_tx = registry
            .register_credential(did.to_string(), credential_hash.to_string(), metadata_uri.to_string());

        let tx = pending_tx
            .send()
            .await
            .map_err(|e| AppError::BlockchainError(format!("Failed to register credential: {}", e)))?;

        let receipt = tx
            .await
            .map_err(|e| AppError::BlockchainError(format!("Failed to get transaction receipt: {}", e)))?
            .ok_or_else(|| AppError::BlockchainError("Transaction not found".to_string()))?;

        let tx_hash = receipt.transaction_hash;

        tracing::info!("Registered credential for DID {} with hash {} and metadata {}", did, credential_hash, metadata_uri);

        Ok(tx_hash)
    }

    /// Revoke a credential on the blockchain
    pub async fn revoke_credential(&self, did: &str, credential_hash: &str) -> Result<H256, AppError> {
            if !did::validate_did(did) {
                return Err(AppError::ValidationError("Invalid DID: only did:alyra is supported".to_string()));
            }
        let registry = self.get_registry()?;

        let pending_tx = registry
            .revoke_credential(did.to_string(), credential_hash.to_string());

        let tx = pending_tx
            .send()
            .await
            .map_err(|e| AppError::BlockchainError(format!("Failed to revoke credential: {}", e)))?;

        let receipt = tx
            .await
            .map_err(|e| AppError::BlockchainError(format!("Failed to get transaction receipt: {}", e)))?
            .ok_or_else(|| AppError::BlockchainError("Transaction not found".to_string()))?;

        let tx_hash = receipt.transaction_hash;

        tracing::info!("Revoked credential for DID {} with hash {}", did, credential_hash);

        Ok(tx_hash)
    }

    /// Check if a credential is registered/valid on the blockchain
    pub async fn is_credential_registered(&self, did: &str, credential_hash: &str) -> Result<bool, AppError> {
            if !did::validate_did(did) {
                return Err(AppError::ValidationError("Invalid DID: only did:alyra is supported".to_string()));
            }
        let registry = self.get_registry()?;

        let result = registry
            .is_credential_valid(did.to_string(), credential_hash.to_string())
            .call()
            .await
            .map_err(|e| AppError::BlockchainError(format!("Failed to check credential validity: {}", e)))?;

        Ok(result)
    }

    /// Check if a credential is revoked on the blockchain (compatibility wrapper)
    pub async fn is_credential_revoked(&self, did: &str, credential_hash: &str) -> Result<bool, AppError> {
        let is_valid = self.is_credential_registered(did, credential_hash).await?;
        Ok(!is_valid)
    }

    /// Register a schema on the blockchain
    pub async fn register_schema(&self, schema_id: &str, schema_hash: &str) -> Result<H256, AppError> {
        let registry = self.get_registry()?;

        let pending_tx = registry
            .register_schema(schema_id.to_string(), schema_hash.to_string());

        let tx = pending_tx
            .send()
            .await
            .map_err(|e| AppError::BlockchainError(format!("Failed to register schema: {}", e)))?;

        let receipt = tx
            .await
            .map_err(|e| AppError::BlockchainError(format!("Failed to get transaction receipt: {}", e)))?
            .ok_or_else(|| AppError::BlockchainError("Transaction not found".to_string()))?;

        let tx_hash = receipt.transaction_hash;

        tracing::info!("Registered schema {} with hash {}", schema_id, schema_hash);

        Ok(tx_hash)
    }

    /// Get a schema URI from the blockchain (returns whatever was stored; previously called 'hash')
    pub async fn get_schema_hash(&self, schema_id: &str) -> Result<String, AppError> {
        let registry = self.get_registry()?;

        let result = registry
            .get_schema_uri(schema_id.to_string())
            .call()
            .await
            .map_err(|e| AppError::BlockchainError(format!("Failed to get schema URI: {}", e)))?;

        Ok(result)
    }

    /// Send Ether to an address
    pub async fn send_ether(&self, to: &str, amount: f64) -> Result<H256, AppError> {
        let to_address = to
            .parse::<Address>()
            .map_err(|e| AppError::BlockchainError(format!("Invalid address: {}", e)))?;

        let amount_wei = U256::from_dec_str(&format!("{}", (amount * 1e18) as u64))
            .map_err(|e| AppError::BlockchainError(format!("Invalid amount: {}", e)))?;

        let tx = TransactionRequest::new()
            .to(to_address)
            .value(amount_wei);

        let tx_hash = self.provider
            .send_transaction(tx, None)
            .await
            .map_err(|e| AppError::BlockchainError("Failed to send transaction".to_string()))?
            .tx_hash();

        tracing::info!("Sent {} ETH to {}", amount, to);

        Ok(tx_hash)
    }

    /// Get the balance of an address
    pub async fn get_balance(&self, address: &str) -> Result<f64, AppError> {
        let address = address
            .parse::<Address>()
            .map_err(|e| AppError::BlockchainError(format!("Invalid address: {}", e)))?;

        let balance = self.provider
            .get_balance(address, None)
            .await
            .map_err(|e| AppError::BlockchainError("Failed to get balance".to_string()))?;

        // Convert from wei to ether
        let balance_eth = balance.as_u128() as f64 / 1e18;

        Ok(balance_eth)
    }

    /// Get the current block number
    pub async fn get_block_number(&self) -> Result<u64, AppError> {
        let block_number = self.provider
            .get_block_number()
            .await
            .map_err(|e| AppError::BlockchainError("Failed to get block number".to_string()))?;

        Ok(block_number.as_u64())
    }

    /// Wait for a transaction to be confirmed
    pub async fn wait_for_transaction(&self, tx_hash: H256) -> Result<Option<TransactionReceipt>, AppError> {
        let receipt = self.provider
            .get_transaction_receipt(tx_hash)
            .await
            .map_err(|e| AppError::BlockchainError("Failed to get transaction receipt".to_string()))?;

        Ok(receipt)
    }
}
