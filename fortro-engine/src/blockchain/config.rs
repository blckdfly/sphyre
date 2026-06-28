use serde::Deserialize;
use std::env;

#[derive(Debug, Clone, Deserialize)]
pub struct BlockchainConfig {
    pub rpc_url: String,
    pub chain_id: u64,
    pub deployer_private_key: String,
    pub ssi_registry_address: String,
    pub forwarder_address: String,
    pub factory_address: String,
}

impl BlockchainConfig {
    pub fn from_env() -> Result<Self, String> {
        Ok(Self {
            rpc_url: env::var("BLOCKCHAIN_RPC_URL")
                .map_err(|_| "BLOCKCHAIN_RPC_URL not set".to_string())?,
            chain_id: env::var("BLOCKCHAIN_CHAIN_ID")
                .map_err(|_| "BLOCKCHAIN_CHAIN_ID not set".to_string())?
                .parse()
                .map_err(|_| "Invalid BLOCKCHAIN_CHAIN_ID".to_string())?,
            deployer_private_key: env::var("BLOCKCHAIN_DEPLOYER_PRIVATE_KEY")
                .map_err(|_| "BLOCKCHAIN_DEPLOYER_PRIVATE_KEY not set".to_string())?,
            ssi_registry_address: env::var("SSI_REGISTRY_ADDRESS")
                .map_err(|_| "SSI_REGISTRY_ADDRESS not set".to_string())?,
            forwarder_address: env::var("MINIMAL_FORWARDER_ADDRESS")
                .unwrap_or_else(|_| "0x288931F05b8f89412a0166239e13318d757aEb0b".to_string()),
            factory_address: env::var("SSI_FACTORY_ADDRESS")
                .unwrap_or_else(|_| "0x7019cdB79cbcB4Fdc74C5B32128210F6109C568B".to_string()),
        })
    }

    pub fn validate(&self) -> Result<(), String> {
        if self.rpc_url.is_empty() {
            return Err("RPC URL cannot be empty".to_string());
        }
        if self.deployer_private_key.is_empty() {
            return Err("Deployer private key cannot be empty".to_string());
        }
        if self.ssi_registry_address.is_empty() {
            return Err("SSI Registry address cannot be empty".to_string());
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_config_validation() {
        let config = BlockchainConfig {
            rpc_url: "https://sepolia.base.org".to_string(),
            chain_id: 84532,
            deployer_private_key: "test_key".to_string(),
            ssi_registry_address: "0x03cF2e9d16F8b920bbB7973471771e78CB9a3347".to_string(),
            forwarder_address: "0x38faeA77f79293DBF300ba23bDBfcdb0f21ECe40".to_string(),
            factory_address: "0x4D4308d5EECA5005Cc601675b255601Dfb323bF4".to_string(),
        };

        assert!(config.validate().is_ok());
    }
}
