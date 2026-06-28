use ethers::prelude::*;
use std::sync::Arc;
use tracing::{error, info, warn};

use super::config::BlockchainConfig;

abigen!(SSIRegistry, "./src/blockchain/abis/SSIRegistry.json");

pub struct BlockchainClient {
    ssi_registry: SSIRegistry<SignerMiddleware<Provider<Http>, LocalWallet>>,
    config: BlockchainConfig,
}

impl BlockchainClient {
    pub async fn new(
        config: BlockchainConfig,
    ) -> Result<Self, Box<dyn std::error::Error + Send + Sync>> {
        config.validate()?;

        info!("Initializing blockchain client...");
        info!("RPC: {}", config.rpc_url);
        info!("Chain ID: {}", config.chain_id);
        info!("Registry: {}", config.ssi_registry_address);

        // Setup provider
        let provider = Provider::<Http>::try_from(&config.rpc_url)?;

        // Verify connection
        let chain_id = provider.get_chainid().await?;
        if chain_id.as_u64() != config.chain_id {
            return Err(format!(
                "Chain ID mismatch: expected {}, got {}",
                config.chain_id, chain_id
            )
            .into());
        }

        // Setup wallet
        let wallet: LocalWallet = config
            .deployer_private_key
            .parse::<LocalWallet>()?
            .with_chain_id(config.chain_id);

        info!("Wallet: {}", wallet.address());

        // Create client
        let client = SignerMiddleware::new(provider, wallet);
        let client = Arc::new(client);

        // Connect to contract
        let address: Address = config.ssi_registry_address.parse()?;
        let ssi_registry = SSIRegistry::new(address, client);

        info!("Blockchain client initialized successfully");

        Ok(Self {
            ssi_registry,
            config,
        })
    }

    /// Get the wallet address
    pub fn wallet_address(&self) -> Address {
        self.ssi_registry.client().address()
    }

    pub async fn register_schema(
        &self,
        schema_id: &Option<String>,
        schema_hash: &str,
    ) -> Result<TransactionReceipt, Box<dyn std::error::Error + Send + Sync>> {
        let id = schema_id.as_ref().map(|s| s.as_str()).unwrap_or("unknown");
        info!("Registering schema on blockchain: {}", id);

        let call = self
            .ssi_registry
            .register_schema(id.to_string(), schema_hash.to_string());

        let pending_tx = call.send().await?;

        info!("Transaction sent: {:?}", pending_tx.tx_hash());

        let receipt = pending_tx.await?.ok_or("Transaction failed")?;

        if let Some(block_num) = receipt.block_number {
            info!("Schema registered in block {}", block_num);
        }
        if let Some(gas_used) = receipt.gas_used {
            info!("Gas used: {}", gas_used);
        }

        Ok(receipt)
    }

    pub async fn get_schema_hash(
        &self,
        schema_id: &str,
    ) -> Result<String, Box<dyn std::error::Error + Send + Sync>> {
        let hash = self
            .ssi_registry
            .get_schema_hash(schema_id.to_string())
            .call()
            .await?;

        Ok(hash)
    }

    pub async fn is_schema_registered(
        &self,
        schema_id: &str,
    ) -> Result<bool, Box<dyn std::error::Error + Send + Sync>> {
        let is_registered = self
            .ssi_registry
            .is_schema_registered(schema_id.to_string())
            .call()
            .await?;

        Ok(is_registered)
    }

    pub async fn register_credential(
        &self,
        did: &str,
        credential_hash: &str,
    ) -> Result<TransactionReceipt, Box<dyn std::error::Error + Send + Sync>> {
        info!("Registering credential on blockchain for DID: {}", did);

        let call = self
            .ssi_registry
            .register_credential(did.to_string(), credential_hash.to_string());

        let pending_tx = call.send().await?;

        info!("Transaction sent: {:?}", pending_tx.tx_hash());

        let receipt = match tokio::time::timeout(tokio::time::Duration::from_secs(60), pending_tx)
            .await
        {
            Ok(Ok(receipt)) => receipt,
            Ok(Err(e)) => return Err(e.into()),
            Err(_) => return Err("Blockchain transaction receipt timeout after 60 seconds".into()),
        };

        let receipt = receipt.ok_or_else(|| {
            Box::<dyn std::error::Error + Send + Sync>::from("Transaction failed")
        })?;

        if let Some(block_num) = receipt.block_number {
            info!("Credential registered in block {}", block_num);
        }
        if let Some(gas_used) = receipt.gas_used {
            info!("Gas used: {}", gas_used);
        }

        Ok(receipt)
    }

    pub async fn is_credential_registered(
        &self,
        did: &str,
        credential_hash: &str,
    ) -> Result<bool, Box<dyn std::error::Error + Send + Sync>> {
        let is_registered = self
            .ssi_registry
            .is_credential_registered(did.to_string(), credential_hash.to_string())
            .call()
            .await?;

        Ok(is_registered)
    }

    pub async fn is_credential_revoked(
        &self,
        did: &str,
        credential_hash: &str,
    ) -> Result<bool, Box<dyn std::error::Error + Send + Sync>> {
        let is_revoked = self
            .ssi_registry
            .is_credential_revoked(did.to_string(), credential_hash.to_string())
            .call()
            .await?;

        Ok(is_revoked)
    }

    pub async fn revoke_credential(
        &self,
        did: &str,
        credential_hash: &str,
    ) -> Result<TransactionReceipt, Box<dyn std::error::Error + Send + Sync>> {
        info!("Revoking credential on blockchain for DID: {}", did);

        let call = self
            .ssi_registry
            .revoke_credential(did.to_string(), credential_hash.to_string());

        let pending_tx = call.send().await?;

        info!("Transaction sent: {:?}", pending_tx.tx_hash());

        let receipt = match tokio::time::timeout(tokio::time::Duration::from_secs(60), pending_tx)
            .await
        {
            Ok(Ok(receipt)) => receipt,
            Ok(Err(e)) => return Err(e.into()),
            Err(_) => return Err("Blockchain transaction receipt timeout after 60 seconds".into()),
        };

        let receipt = receipt.ok_or_else(|| {
            Box::<dyn std::error::Error + Send + Sync>::from("Transaction failed")
        })?;

        if let Some(block_num) = receipt.block_number {
            info!("Credential revoked in block {}", block_num);
        }

        Ok(receipt)
    }

    pub async fn grant_consent(
        &self,
        user_did: &str,
        verifier_did: &str,
        purpose: &str,
        data_categories: &str,
        access_level: u8,
        expires_at: u64,
    ) -> Result<TransactionReceipt, Box<dyn std::error::Error + Send + Sync>> {
        info!("Granting consent on blockchain");
        info!("User: {}", user_did);
        info!("Verifier: {}", verifier_did);

        let call = self.ssi_registry.grant_consent(
            user_did.to_string(),
            verifier_did.to_string(),
            purpose.to_string(),
            data_categories.to_string(),
            access_level,
            U256::from(expires_at),
        );

        let pending_tx = call.send().await?;

        info!("Transaction sent: {:?}", pending_tx.tx_hash());

        let receipt = pending_tx.await?.ok_or("Transaction failed")?;

        if let Some(block_num) = receipt.block_number {
            info!("Consent granted in block {}", block_num);
        }

        Ok(receipt)
    }

    /// Check if consent is valid
    pub async fn is_consent_valid(
        &self,
        user_did: &str,
        verifier_did: &str,
        purpose: &str,
    ) -> Result<bool, Box<dyn std::error::Error + Send + Sync>> {
        let is_valid = self
            .ssi_registry
            .is_consent_valid(
                user_did.to_string(),
                verifier_did.to_string(),
                purpose.to_string(),
            )
            .call()
            .await?;

        Ok(is_valid)
    }

    /// Revoke consent on blockchain
    pub async fn revoke_consent(
        &self,
        user_did: &str,
        verifier_did: &str,
        purpose: &str,
    ) -> Result<TransactionReceipt, Box<dyn std::error::Error + Send + Sync>> {
        info!("Revoking consent on blockchain");

        let call = self.ssi_registry.revoke_consent(
            user_did.to_string(),
            verifier_did.to_string(),
            purpose.to_string(),
        );

        let pending_tx = call.send().await?;

        info!("Transaction sent: {:?}", pending_tx.tx_hash());

        let receipt = pending_tx.await?.ok_or("Transaction failed")?;

        if let Some(block_num) = receipt.block_number {
            info!("Consent revoked in block {}", block_num);
        }

        Ok(receipt)
    }

    pub async fn get_contract_info(
        &self,
    ) -> Result<(String, String, Address), Box<dyn std::error::Error>> {
        let name = self.ssi_registry.name().call().await?;
        let version = self.ssi_registry.version().call().await?;
        let owner = self.ssi_registry.owner().call().await?;

        Ok((name, version, owner))
    }

    pub async fn is_issuer(&self, address: Address) -> Result<bool, Box<dyn std::error::Error>> {
        let is_issuer = self.ssi_registry.is_issuer(address).call().await?;
        Ok(is_issuer)
    }

    pub async fn is_admin(&self, address: Address) -> Result<bool, Box<dyn std::error::Error>> {
        let is_admin = self.ssi_registry.is_admin(address).call().await?;
        Ok(is_admin)
    }

    /// Register a holder DID on-chain and grant HOLDER_ROLE to the associated address
    pub async fn register_holder_did(
        &self,
        holder_did: &str,
        holder_address: Address,
        did_doc_cid: &str,
    ) -> Result<TransactionReceipt, Box<dyn std::error::Error + Send + Sync>> {
        info!("Registering holder DID on blockchain: {} -> {}", holder_did, holder_address);

        let call = self.ssi_registry.register_holder_did(
            holder_did.to_string(),
            holder_address,
            did_doc_cid.to_string(),
        );

        let pending_tx = call.send().await?;
        info!("Transaction sent for registerHolderDID: {:?}", pending_tx.tx_hash());

        let receipt = pending_tx.await?.ok_or("Transaction failed")?;

        if let Some(block_num) = receipt.block_number {
            info!("Holder DID registered in block {}", block_num);
        }

        Ok(receipt)
    }

    /// Register an issuer DID on-chain and grant ISSUER_ROLE to the associated address
    pub async fn register_issuer_did(
        &self,
        issuer_did: &str,
        issuer_address: Address,
        did_doc_cid: &str,
    ) -> Result<TransactionReceipt, Box<dyn std::error::Error + Send + Sync>> {
        info!("Registering issuer DID on blockchain: {} -> {}", issuer_did, issuer_address);

        let call = self.ssi_registry.register_issuer_did(
            issuer_did.to_string(),
            issuer_address,
            did_doc_cid.to_string(),
        );

        let pending_tx = call.send().await?;
        info!("Transaction sent for registerIssuerDID: {:?}", pending_tx.tx_hash());

        let receipt = pending_tx.await?.ok_or("Transaction failed")?;

        if let Some(block_num) = receipt.block_number {
            info!("Issuer DID registered in block {}", block_num);
        }

        Ok(receipt)
    }

    /// Register a verifier DID on-chain and grant VERIFIER_ROLE to the associated address
    pub async fn register_verifier_did(
        &self,
        verifier_did: &str,
        verifier_address: Address,
        did_doc_cid: &str,
    ) -> Result<TransactionReceipt, Box<dyn std::error::Error + Send + Sync>> {
        info!(
            "Registering verifier DID on blockchain: {} -> {}",
            verifier_did, verifier_address
        );

        let call = self.ssi_registry.register_verifier_did(
            verifier_did.to_string(),
            verifier_address,
            did_doc_cid.to_string(),
        );

        let pending_tx = call.send().await?;
        info!(
            "Transaction sent for registerVerifierDID: {:?}",
            pending_tx.tx_hash()
        );

        let receipt = pending_tx.await?.ok_or("Transaction failed")?;

        if let Some(block_num) = receipt.block_number {
            info!("Verifier DID registered in block {}", block_num);
        }

        Ok(receipt)
    }

    /// Get DID info (associated address and DID document CID) from the registry
    pub async fn get_did_info(
        &self,
        did: &str,
    ) -> Result<(Address, String), Box<dyn std::error::Error + Send + Sync>> {
        let (associated_address, did_doc_cid) =
            self.ssi_registry.get_did_info(did.to_string()).call().await?;

        Ok((associated_address, did_doc_cid))
    }

    pub async fn get_metadata_uri(
        &self,
        _did: &str,
        _credential_hash: &str,
    ) -> Result<Option<String>, Box<dyn std::error::Error + Send + Sync>> {
        warn!("get_metadata_uri not implemented on SSI registry; returning None");
        Ok(None)
    }

    pub async fn get_registration_tx_hash(
        &self,
        _did: &str,
        _credential_hash: &str,
    ) -> Result<Option<String>, Box<dyn std::error::Error + Send + Sync>> {
        warn!("get_registration_tx_hash not implemented on SSI registry; returning None");
        Ok(None)
    }
}

pub async fn retry_operation<F, Fut, T>(
    operation: F,
    max_retries: u32,
) -> Result<T, Box<dyn std::error::Error>>
where
    F: Fn() -> Fut,
    Fut: std::future::Future<Output = Result<T, Box<dyn std::error::Error>>>,
{
    let mut retries = 0;
    loop {
        match operation().await {
            Ok(result) => return Ok(result),
            Err(e) => {
                retries += 1;
                if retries >= max_retries {
                    error!("Operation failed after {} retries: {}", max_retries, e);
                    return Err(e);
                }
                warn!("Operation failed (attempt {}), retrying: {}", retries, e);
                tokio::time::sleep(tokio::time::Duration::from_secs(2 * retries as u64)).await;
            }
        }
    }
}
