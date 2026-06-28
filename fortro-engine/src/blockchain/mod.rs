pub mod client;
pub mod config;

pub use client::BlockchainClient;
pub use config::BlockchainConfig;

use once_cell::sync::OnceCell;
use std::sync::Arc;
use tokio::sync::RwLock;

static BLOCKCHAIN_CLIENT: OnceCell<Arc<RwLock<Option<BlockchainClient>>>> = OnceCell::new();

/// Initialize the global blockchain client
pub async fn init_blockchain_client(
    config: BlockchainConfig,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let client = BlockchainClient::new(config).await?;

    BLOCKCHAIN_CLIENT.get_or_init(|| Arc::new(RwLock::new(Some(client))));

    tracing::info!("Global blockchain client initialized");
    Ok(())
}

/// Get the global blockchain client
pub async fn get_blockchain_client() -> Result<Arc<RwLock<Option<BlockchainClient>>>, String> {
    BLOCKCHAIN_CLIENT
        .get()
        .cloned()
        .ok_or_else(|| "Blockchain client not initialized".to_string())
}

/// Check if blockchain client is initialized
pub fn is_blockchain_initialized() -> bool {
    BLOCKCHAIN_CLIENT.get().is_some()
}
