use crate::db::Database;
use crate::error::AppError;
use crate::models::{ConsentRecord, Credential, Presentation, User, AccessLevel, ExpirationPolicy};
use crate::services::credential::CredentialService;
use crate::services::presentation::PresentationService;
use crate::utils::{crypto, did, jwt, qr};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::Arc;
use uuid::Uuid;

/// Wallet service
pub struct WalletService {
    db: Arc<Database>,
    credential_service: CredentialService,
    presentation_service: PresentationService,
}

/// Create wallet request
#[derive(Debug, Deserialize)]
pub struct CreateWalletRequest {
    pub name: Option<String>,
    pub email: Option<String>,
}

/// Import credential request
#[derive(Debug, Deserialize)]
pub struct ImportCredentialRequest {
    pub credential_jwt: String,
}

/// Share credential request
#[derive(Debug, Deserialize)]
pub struct ShareCredentialRequest {
    pub credential_ids: Vec<String>,
    pub disclosed_attributes: HashMap<String, Vec<String>>,
    pub recipient_did: String,
    pub purpose: String,
    pub expiration_policy: ExpirationPolicy,
    pub expires_at: Option<DateTime<Utc>>,
}

/// Grant consent request
#[derive(Debug, Deserialize)]
pub struct GrantConsentRequest {
    pub verifier_did: String,
    pub purpose: String,
    pub data_categories: Vec<String>,
    pub access_level: AccessLevel,
    pub expiration_policy: ExpirationPolicy,
    pub expires_at: Option<DateTime<Utc>>,
}

/// Wallet response
#[derive(Debug, Serialize)]
pub struct WalletResponse {
    pub did: String,
    pub public_key: String,
    pub name: Option<String>,
    pub email: Option<String>,
    pub created_at: DateTime<Utc>,
}

/// Credential summary
#[derive(Debug, Serialize)]
pub struct CredentialSummary {
    pub id: String,
    pub issuer_did: String,
    pub credential_type: String,
    pub issuance_date: DateTime<Utc>,
    pub expiration_date: Option<DateTime<Utc>>,
    pub status: String,
}

/// Wallet statistics
#[derive(Debug, Serialize)]
pub struct WalletStatistics {
    pub total_credentials: usize,
    pub active_credentials: usize,
    pub expired_credentials: usize,
    pub revoked_credentials: usize,
    pub total_presentations: usize,
    pub active_consents: usize,
}

impl WalletService {
    /// Create a new wallet service
    pub fn new(
        db: Arc<Database>,
        credential_service: CredentialService,
        presentation_service: PresentationService,
    ) -> Self {
        Self {
            db,
            credential_service,
            presentation_service,
        }
    }

    /// Create a new wallet
    pub async fn create_wallet(&self, request: CreateWalletRequest) -> Result<WalletResponse, AppError> {
        // Generate a new DID key pair
        let key_pair = did::generate_did()?;

        // Create a new user
        let mut user = User::new(key_pair.did.clone(), key_pair.public_key_base58.clone());
        user.name = request.name;
        user.email = request.email;

        // Save the user to the database
        self.db.create_user(&user).await?;

        Ok(WalletResponse {
            did: user.did,
            public_key: user.public_key,
            name: user.name,
            email: user.email,
            created_at: user.created_at,
        })
    }

    /// Get wallet by DID
    pub async fn get_wallet(&self, did: &str) -> Result<WalletResponse, AppError> {
        let user = self.db.find_user_by_did(did).await?
            .ok_or_else(|| AppError::NotFoundError(format!("Wallet with DID {} not found", did)))?;

        Ok(WalletResponse {
            did: user.did,
            public_key: user.public_key,
            name: user.name,
            email: user.email,
            created_at: user.created_at,
        })
    }

    /// Get credential summaries for a wallet
    pub async fn get_credential_summaries(&self, did: &str) -> Result<Vec<CredentialSummary>, AppError> {
        let credentials = self.credential_service.get_credentials_by_owner(did).await?;

        let summaries = credentials.into_iter().map(|cred| {
            CredentialSummary {
                id: cred.id,
                issuer_did: cred.issuer_did,
                credential_type: cred.credential_type,
                issuance_date: cred.created_at,
                expiration_date: cred.expires_at,
                status: format!("{:?}", cred.status),
            }
        }).collect();

        Ok(summaries)
    }

    /// Import a credential
    pub async fn import_credential(
        &self,
        owner_did: &str,
        request: ImportCredentialRequest,
    ) -> Result<Credential, AppError> {
        // Verify the credential
        let verify_request = crate::services::credential::VerifyCredentialRequest {
            credential_jwt: request.credential_jwt.clone(),
        };

        let verification_result = self.credential_service.verify_credential(verify_request).await?;

        if !verification_result.is_valid {
            return Err(AppError::ValidationError(format!(
                "Invalid credential: {:?}",
                verification_result.errors
            )));
        }

        // Check if the credential is issued to this wallet
        if verification_result.subject_did != owner_did {
            return Err(AppError::ValidationError(
                "Credential is not issued to this wallet".to_string(),
            ));
        }

        // Extract credential data
        let credential_data = jwt::extract_credential(&request.credential_jwt)?;

        // Create a credential object
        let mut credential = Credential::new(
            verification_result.issuer_did.clone(),
            owner_did.to_string(),
            verification_result.credential_type.clone(),
            "".to_string(), // Schema ID not available from JWT
            credential_data["credentialSubject"]["claims"]
                .as_object()
                .map(|obj| {
                    obj.iter()
                        .map(|(k, v)| (k.clone(), v.clone()))
                        .collect::<HashMap<String, Value>>()
                })
                .unwrap_or_default(),
            request.credential_jwt.clone(),
        );

        // Set expiration date if available
        credential.expires_at = verification_result.expiration_date;

        // Save the credential to the database
        self.db.save_credential(&credential).await?;

        Ok(credential)
    }

    /// Share credentials
    pub async fn share_credentials(
        &self,
        owner_did: &str,
        private_key: &str,
        request: ShareCredentialRequest,
    ) -> Result<String, AppError> {
        // Check if all credentials exist and belong to the owner
        for credential_id in &request.credential_ids {
            let credential = self.credential_service.get_credential_by_id(credential_id).await?
                .ok_or_else(|| AppError::NotFoundError(format!("Credential with ID {} not found", credential_id)))?;

            if credential.owner_did != owner_did {
                return Err(AppError::AccessDeniedError(
                    "You can only share your own credentials".to_string(),
                ));
            }
        }

        // Create a presentation
        let presentation_request = crate::services::presentation::SubmitPresentationRequest {
            presentation_request_id: Uuid::new_v4().to_string(), // Dummy ID for direct sharing
            credential_ids: request.credential_ids.clone(),
            disclosed_attributes: request.disclosed_attributes.clone(),
            predicate_proofs: Vec::new(), // No predicate proofs for direct sharing
        };

        let presentation_response = self.presentation_service
            .submit_presentation(owner_did, private_key, presentation_request)
            .await?;

        // Create a consent record
        let consent = ConsentRecord::new(
            owner_did.to_string(),
            request.recipient_did.clone(),
            request.purpose.clone(),
            request.credential_ids.clone(),
            AccessLevel::ReadOnly, // Default access level
            request.expiration_policy.clone(),
            request.expires_at,
        );

        // Save the consent record
        self.db.save_consent_record(&consent).await?;

        // Return the presentation JWT
        Ok(presentation_response.jwt)
    }

    /// Get presentations for a wallet
    pub async fn get_presentations(&self, did: &str) -> Result<Vec<Presentation>, AppError> {
        self.presentation_service.get_presentations_by_prover(did).await
    }

    /// Get consent records for a wallet
    pub async fn get_consent_records(&self, did: &str) -> Result<Vec<ConsentRecord>, AppError> {
        self.db.find_consent_records_by_user(did).await
    }

    /// Revoke consent
    pub async fn revoke_consent(&self, did: &str, consent_id: &str) -> Result<bool, AppError> {
        self.db.revoke_consent(consent_id, did).await
    }

    /// Grant consent
    pub async fn grant_consent(
        &self,
        user_did: &str,
        request: GrantConsentRequest,
    ) -> Result<ConsentRecord, AppError> {
        let consent = ConsentRecord::new(
            user_did.to_string(),
            request.verifier_did.clone(),
            request.purpose.clone(),
            request.data_categories.clone(),
            request.access_level,
            request.expiration_policy,
            request.expires_at,
        );

        // Save the consent record
        self.db.save_consent_record(&consent).await?;

        Ok(consent)
    }

    /// Get wallet statistics
    pub async fn get_wallet_statistics(&self, did: &str) -> Result<WalletStatistics, AppError> {
        // Get all credentials
        let credentials = self.credential_service.get_credentials_by_owner(did).await?;

        // Count credentials by status
        let total_credentials = credentials.len();
        let active_credentials = credentials.iter()
            .filter(|c| c.status == crate::models::CredentialStatus::Active)
            .count();
        let expired_credentials = credentials.iter()
            .filter(|c| c.status == crate::models::CredentialStatus::Expired)
            .count();
        let revoked_credentials = credentials.iter()
            .filter(|c| c.status == crate::models::CredentialStatus::Revoked)
            .count();

        // Get presentations
        let presentations = self.presentation_service.get_presentations_by_prover(did).await?;
        let total_presentations = presentations.len();

        // Get active consents
        let all_consents = self.db.find_consent_records_by_user(did).await?;
        let active_consents = all_consents.iter()
            .filter(|c| c.is_valid())
            .count();

        Ok(WalletStatistics {
            total_credentials,
            active_credentials,
            expired_credentials,
            revoked_credentials,
            total_presentations,
            active_consents,
        })
    }

    /// Delete a credential
    pub async fn delete_credential(&self, did: &str, credential_id: &str) -> Result<bool, AppError> {
        self.credential_service.delete_credential(did, credential_id).await
    }

    /// Scan a QR code
    pub async fn scan_qr_code(&self, qr_data: &str) -> Result<Value, AppError> {
        let qr_content = qr::QrCodeContent::from_json_string(qr_data)?;

        match qr_content.type_ {
            qr::QrCodeType::CredentialOffer => {
                let offer = qr::extract_credential_offer(&qr_content)?;
                Ok(json!({
                    "type": "credential_offer",
                    "offer": offer
                }))
            }
            qr::QrCodeType::PresentationRequest => {
                let request = qr::extract_presentation_request(&qr_content)?;
                Ok(json!({
                    "type": "presentation_request",
                    "request": request
                }))
            }
            qr::QrCodeType::ConnectionInvitation => {
                let (inviter_did, label, endpoint) = qr::extract_connection_invitation(&qr_content)?;
                Ok(json!({
                    "type": "connection_invitation",
                    "invitation": {
                        "inviter_did": inviter_did,
                        "label": label,
                        "endpoint": endpoint
                    }
                }))
            }
        }
    }

    /// Generate a backup of the wallet
    pub async fn generate_backup(&self, did: &str, password: &str) -> Result<String, AppError> {
        // Get user data
        let user = self.db.find_user_by_did(did).await?
            .ok_or_else(|| AppError::NotFoundError(format!("Wallet with DID {} not found", did)))?;

        // Get credentials
        let credentials = self.credential_service.get_credentials_by_owner(did).await?;

        // Get presentations
        let presentations = self.presentation_service.get_presentations_by_prover(did).await?;

        // Get consent records
        let consents = self.db.find_consent_records_by_user(did).await?;

        // Create backup data
        let backup_data = json!({
            "user": user,
            "credentials": credentials,
            "presentations": presentations,
            "consents": consents,
            "backup_date": Utc::now()
        });

        // Encrypt the backup data
        let backup_json = serde_json::to_string(&backup_data)
            .map_err(|e| AppError::ValidationError(format!("Failed to serialize backup data: {}", e)))?;

        let encrypted_backup = crypto::encrypt_with_password(backup_json.as_bytes(), password)
            .map_err(|e| AppError::ValidationError(format!("Failed to encrypt backup: {}", e)))?;

        // Encode as base64
        let backup_base64 = base64::encode(&encrypted_backup);

        Ok(backup_base64)
    }

    /// Restore a wallet from backup
    pub async fn restore_backup(&self, backup_data: &str, password: &str) -> Result<WalletResponse, AppError> {
        // Decode from base64
        let encrypted_backup = base64::decode(backup_data)
            .map_err(|e| AppError::ValidationError(format!("Invalid backup data: {}", e)))?;

        // Decrypt the backup data
        let backup_json = crypto::decrypt_with_password(&encrypted_backup, password)
            .map_err(|e| AppError::ValidationError(format!("Failed to decrypt backup: {}", e)))?;

        let backup_str = String::from_utf8(backup_json)
            .map_err(|e| AppError::ValidationError(format!("Invalid backup data: {}", e)))?;

        let backup: Value = serde_json::from_str(&backup_str)
            .map_err(|e| AppError::ValidationError(format!("Invalid backup format: {}", e)))?;

        // Extract user data
        let user: User = serde_json::from_value(backup["user"].clone())
            .map_err(|e| AppError::ValidationError(format!("Invalid user data in backup: {}", e)))?;

        // Check if the user already exists
        let existing_user = self.db.find_user_by_did(&user.did).await?;
        if existing_user.is_some() {
            return Err(AppError::ValidationError(format!(
                "Wallet with DID {} already exists",
                user.did
            )));
        }

        // Save the user
        self.db.create_user(&user).await?;

        // Extract and save credentials
        if let Some(credentials) = backup["credentials"].as_array() {
            for credential_value in credentials {
                let credential: Credential = serde_json::from_value(credential_value.clone())
                    .map_err(|e| AppError::ValidationError(format!("Invalid credential data in backup: {}", e)))?;

                self.db.save_credential(&credential).await?;
            }
        }

        // Extract and save presentations
        if let Some(presentations) = backup["presentations"].as_array() {
            for presentation_value in presentations {
                let presentation: Presentation = serde_json::from_value(presentation_value.clone())
                    .map_err(|e| AppError::ValidationError(format!("Invalid presentation data in backup: {}", e)))?;

                self.db.save_presentation(&presentation).await?;
            }
        }

        // Extract and save consent records
        if let Some(consents) = backup["consents"].as_array() {
            for consent_value in consents {
                let consent: ConsentRecord = serde_json::from_value(consent_value.clone())
                    .map_err(|e| AppError::ValidationError(format!("Invalid consent data in backup: {}", e)))?;

                self.db.save_consent_record(&consent).await?;
            }
        }

        Ok(WalletResponse {
            did: user.did,
            public_key: user.public_key,
            name: user.name,
            email: user.email,
            created_at: user.created_at,
        })
    }
}
