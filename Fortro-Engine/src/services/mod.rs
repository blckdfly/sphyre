pub(crate) mod auth;
mod credential;
pub(crate) mod issuer;
mod presentation;
mod qr;
mod schema;
mod user;
pub(crate) mod verifier;
pub(crate) mod wallet;

use crate::blockchain::EthereumClient;
use crate::db::Database;
use crate::ipfs::IpfsClient;
use std::sync::Arc;

// Re-export service modules
pub use auth::AuthService;
pub use credential::CredentialService;
pub use issuer::IssuerService;
pub use presentation::PresentationService;
pub use qr::QrService;
pub use schema::SchemaService;
pub use user::UserService;
pub use verifier::VerifierService;
pub use wallet::WalletService;

/// Application state shared across services
#[derive(Clone)]
pub struct AppState {
    pub db: Arc<Database>,
    pub ipfs: Arc<IpfsClient>,
    pub blockchain: Arc<EthereumClient>,
}

impl AppState {
    /// Create a new application state
    pub fn new(db: Database, ipfs: IpfsClient, blockchain: EthereumClient) -> Self {
        Self {
            db: Arc::new(db),
            ipfs: Arc::new(ipfs),
            blockchain: Arc::new(blockchain),
        }
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
        CredentialService::new(
            self.db.clone(),
            self.ipfs.clone(),
            self.blockchain.clone(),
        )
    }

    /// Get the issuer service
    pub fn issuer_service(&self) -> IssuerService {
        IssuerService::new(self.db.clone(), self.credential_service(), self.schema_service())
    }

    /// Get the presentation service
    pub fn presentation_service(&self) -> PresentationService {
        PresentationService::new(
            self.db.clone(),
            self.credential_service(),
        )
    }

    /// Get the schema service
    pub fn schema_service(&self) -> SchemaService {
        SchemaService::new(
            self.db.clone(),
            self.blockchain.clone(),
        )
    }

    /// Get the wallet service
    pub fn wallet_service(&self) -> WalletService {
        WalletService::new(
            self.db.clone(),
            self.credential_service(),
            self.presentation_service(),
        )
    }

    /// Get the verifier service
    pub fn verifier_service(&self) -> VerifierService {
        VerifierService::new(
            self.db.clone(),
            self.presentation_service(),
        )
    }

    /// Get the QR service
    pub fn qr_service(&self) -> QrService {
        QrService::new(self.db.clone())
    }
}
