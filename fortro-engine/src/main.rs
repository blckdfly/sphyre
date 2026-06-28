mod api;
mod blockchain;
mod blockchain_legacy;
mod config;
mod db;
mod error;
mod ipfs;
mod meta_tx;
mod middleware;
mod models;
mod services;
mod utils;

use axum::{http::Method, middleware as axum_middleware, Router};
use std::net::SocketAddr;
use tokio::{net::TcpListener, time::Duration};
use tower_http::cors::{AllowOrigin, Any, CorsLayer};
use tower_http::trace::TraceLayer;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

#[tokio::main(flavor = "current_thread")]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    dotenv::dotenv().ok();

    tracing_subscriber::registry()
        .with(tracing_subscriber::EnvFilter::new(
            std::env::var("RUST_LOG").unwrap_or_else(|_| "info,tower_http=debug".into()),
        ))
        .with(tracing_subscriber::fmt::layer())
        .init();

    let config = config::Config::from_env()?;

    let db = db::Database::connect(&config.mongodb_uri).await?;

    let ipfs_client = ipfs::IpfsClient::new(&config.ipfs_api_url)?;

    match blockchain::BlockchainConfig::from_env() {
        Ok(blockchain_config) => {
            match blockchain::init_blockchain_client(blockchain_config).await {
                Ok(_) => tracing::info!("Smart contract blockchain client initialized"),
                Err(e) => tracing::warn!("Failed to initialize blockchain client: {}. Smart contract features will be disabled.", e),
            }
        }
        Err(e) => tracing::warn!("Blockchain config not set: {}. Smart contract features will be disabled.", e),
    }

    let mut eth_client = blockchain_legacy::EthereumClient::new(&config.ethereum_rpc_url)?
        .with_wallet(&config.wallet_private_key)?;
    if let Some(addr) = &config.registry_address {
        match addr.parse::<ethers::types::Address>() {
            Ok(_) => {
                eth_client = eth_client.with_registry_address(addr)?;
            }
            Err(e) => {
                tracing::warn!(
                    "Invalid REGISTRY_ADDRESS '{}': {}. On-chain features that require the SSIRegistry will be disabled until configured with a valid 0x-prefixed 40-hex address.",
                    addr,
                    e
                );
            }
        }
    } else {
        tracing::warn!("REGISTRY_ADDRESS not set. On-chain features that require the SSIRegistry will not work until configured.");
    }

    let blockchain_client_instance = match blockchain::get_blockchain_client().await {
        Ok(client) => Some(client),
        Err(e) => {
            tracing::warn!(
                "Blockchain client not available: {}. Will use legacy client as fallback.",
                e
            );
            None
        }
    };

    // Build application state
    let mut state = services::AppState::new(db, ipfs_client, eth_client);

    if let Some(client) = blockchain_client_instance {
        state = state.with_blockchain_client(client);
        tracing::info!("New blockchain client attached to AppState");
    }

    let app = Router::new()
        .nest("/api", api::routes())
        .route("/api/test", axum::routing::get(|| async { "OK" }))
        .layer(axum_middleware::from_fn_with_state(
            state.clone(),
            middleware::extract_user_did,
        ))
        .layer(TraceLayer::new_for_http())
        .layer(
            CorsLayer::new()
                .allow_origin(AllowOrigin::any())
                .allow_methods([
                    Method::GET,
                    Method::POST,
                    Method::PUT,
                    Method::DELETE,
                    Method::PATCH,
                    Method::OPTIONS,
                ])
                .allow_headers(Any)
                .allow_credentials(false)
                .max_age(std::time::Duration::from_secs(86400)),
        )
        .with_state(state.clone());

    tokio::spawn(async move {
        loop {
            tokio::time::sleep(Duration::from_secs(300)).await;

            match middleware::cleanup_expired_consents(&state).await {
                Ok(count) if count > 0 => {
                    tracing::info!("Cleaned up {} expired consents", count);
                }
                Ok(_) => {
                    tracing::debug!("No expired consents to clean");
                }
                Err(err) => {
                    tracing::warn!("Failed to clean expired consents: {}", err);
                }
            }
        }
    });

    let addr = SocketAddr::from(([0, 0, 0, 0], config.port));
    let listener = TcpListener::bind(addr).await?;
    tracing::info!("Listening on {}", addr);

    axum::serve(listener, app.into_make_service()).await?;

    Ok(())
}
