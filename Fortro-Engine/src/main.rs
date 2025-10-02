mod api;
mod config;
mod db;
mod blockchain;
mod ipfs;
mod models;
mod services;
mod utils;
mod error;

use std::net::SocketAddr;
use axum::{
    Router,
};
use tower_http::cors::{Any, CorsLayer, AllowOrigin};
use hyper::http::HeaderValue;
use tower_http::trace::TraceLayer;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

#[tokio::main(flavor = "current_thread")]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Load environment variables
    dotenv::dotenv().ok();

    // Initialize tracing
    tracing_subscriber::registry()
        .with(tracing_subscriber::EnvFilter::new(
            std::env::var("RUST_LOG").unwrap_or_else(|_| "info,tower_http=debug".into()),
        ))
        .with(tracing_subscriber::fmt::layer())
        .init();

    // Initialize configuration
    let config = config::Config::from_env()?;

    // Initialize database connection
    let db = db::Database::connect(&config.mongodb_uri).await?;

    // Initialize IPFS client
    let ipfs_client = ipfs::IpfsClient::new(&config.ipfs_api_url)?;

    // Initialize Ethereum client with wallet and optional registry address
    let mut eth_client = blockchain::EthereumClient::new(&config.ethereum_rpc_url)?
        .with_wallet(&config.issuer_private_key)?;
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

    // Build application state
    let state = services::AppState::new(db, ipfs_client, eth_client);

    // Build our application with routes
    let app = Router::new()
        .nest("/api", api::routes())
        .route("/api/test", axum::routing::get(|| async { "OK" }))
        // Add middleware
        .layer(TraceLayer::new_for_http())
        .layer({
            // Build CORS based on configuration
            if let Some(origins) = &config.cors_allowed_origins {
                let header_values: Vec<HeaderValue> = origins
                    .iter()
                    .filter_map(|o| HeaderValue::from_str(o).ok())
                    .collect();
                if header_values.is_empty() {
                    CorsLayer::new()
                        .allow_origin(Any)
                        .allow_methods(Any)
                        .allow_headers(Any)
                } else {
                    CorsLayer::new()
                        .allow_origin(AllowOrigin::list(header_values))
                        .allow_methods(Any)
                        .allow_headers(Any)
                }
            } else {
                CorsLayer::new()
                    .allow_origin(Any)
                    .allow_methods(Any)
                    .allow_headers(Any)
            }
        })
        .with_state(state);

    // Run the server
    let addr = SocketAddr::from(([0, 0, 0, 0], config.port));
    tracing::info!("Listening on {}", addr);
    axum::Server::bind(&addr)
        .serve(app.into_make_service())
        .await?;

    Ok(())
}
