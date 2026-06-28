pub(crate) mod auth;
pub(crate) mod credential;
pub(crate) mod issuer;
mod presentation;
mod qr;
mod schema;
pub(crate) mod upload;
pub mod user;
pub mod wallet_activity;
pub mod verifier_activity;
pub(crate) mod verifier;
pub(crate) mod wallet;

use crate::blockchain::BlockchainClient;
use crate::blockchain_legacy::EthereumClient;
use crate::db::Database;
use crate::ipfs::IpfsClient;
use std::sync::Arc;
use tokio::sync::RwLock;

pub use auth::AuthService;
pub use credential::CredentialService;
pub use issuer::IssuerService;
pub use presentation::PresentationService;
pub use qr::QrService;
pub use schema::SchemaService;
pub use upload::UploadService;
pub use user::UserService;
pub use verifier::VerifierService;
pub use verifier_activity::VerifierActivityService;
pub use wallet::WalletService;
pub use wallet_activity::WalletActivityService;

/// Application state shared across services
#[derive(Clone)]
pub struct AppState {
    pub db: Arc<Database>,
    pub ipfs: Arc<IpfsClient>,
    pub blockchain: Arc<EthereumClient>,
    pub blockchain_client: Option<Arc<RwLock<Option<BlockchainClient>>>>,
}

impl AppState {
    /// Create a new application state
    pub fn new(db: Database, ipfs: IpfsClient, blockchain: EthereumClient) -> Self {
        Self {
            db: Arc::new(db),
            ipfs: Arc::new(ipfs),
            blockchain: Arc::new(blockchain),
            blockchain_client: None,
        }
    }

    /// Set the new blockchain client
    pub fn with_blockchain_client(mut self, client: Arc<RwLock<Option<BlockchainClient>>>) -> Self {
        self.blockchain_client = Some(client);
        self
    }

    /// Get the new blockchain client if available
    pub async fn get_blockchain_client(
        &self,
    ) -> Result<Arc<RwLock<Option<BlockchainClient>>>, String> {
        self.blockchain_client
            .clone()
            .ok_or_else(|| "Blockchain client not initialized".to_string())
    }

    /// Get the auth service
    pub fn auth_service(&self) -> AuthService {
        AuthService::new(self.db.clone())
    }

    /// Get the user service
    pub fn user_service(&self) -> UserService {
        UserService::new(self.db.clone())
    }

    /// Get the credential service
    pub fn credential_service(&self) -> CredentialService {
        let mut service =
            CredentialService::new(self.db.clone(), self.ipfs.clone(), self.blockchain.clone());

        // Pass blockchain_client so credentials can be registered on blockchain!
        if let Some(blockchain_client) = &self.blockchain_client {
            service = service.with_blockchain_client(blockchain_client.clone());
        }

        service
    }

    /// Get the issuer service
    pub fn issuer_service(&self) -> IssuerService {
        IssuerService::new(
            self.db.clone(),
            self.credential_service(),
            self.schema_service(),
            self.ipfs.clone(),
            self.blockchain_client.clone(),
        )
    }

    /// Get the presentation service
    pub fn presentation_service(&self) -> PresentationService {
        PresentationService::new(self.db.clone(), self.credential_service())
    }

    /// Get the schema service
    pub fn schema_service(&self) -> SchemaService {
        SchemaService::new(self.db.clone(), self.ipfs.clone(), self.blockchain.clone())
    }

    /// Get the wallet service
    pub fn wallet_service(&self) -> WalletService {
        WalletService::new(
            self.db.clone(),
            self.credential_service(),
            self.presentation_service(),
            self.wallet_activity_service(),
            self.ipfs.clone(),
            self.blockchain_client.clone(),
        )
    }

    /// Get the verifier service
    pub fn verifier_service(&self) -> VerifierService {
        VerifierService::new(
            self.db.clone(),
            self.presentation_service(),
            self.ipfs.clone(),
            self.blockchain_client.clone(),
        )
    }

    /// Get the wallet activity service
    pub fn wallet_activity_service(&self) -> WalletActivityService {
        WalletActivityService::new(self.db.clone())
    }

    /// Get the verifier activity service
    pub fn verifier_activity_service(&self) -> VerifierActivityService {
        VerifierActivityService::new(self.db.clone())
    }

    /// Get the QR service
    pub fn qr_service(&self) -> QrService {
        QrService::new(self.db.clone())
    }

    /// Get the IPFS client
    pub fn ipfs(&self) -> Arc<IpfsClient> {
        self.ipfs.clone()
    }

    /// Get the database client
    pub fn db(&self) -> Arc<Database> {
        self.db.clone()
    }

    /// Get the upload service
    pub fn upload_service(&self) -> UploadService {
        UploadService::new(self.ipfs.clone())
    }
}
