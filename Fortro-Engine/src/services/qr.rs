use crate::error::AppError;
use crate::models::{CredentialOffer, PresentationRequest, ShortUrlQrCode};
use crate::utils::qr;
use crate::db::Database;
use serde_json::{json, Value};
use std::sync::Arc;

/// QR code service for generating and parsing QR codes
pub struct QrService {
    db: Arc<Database>,
}

impl QrService {
    /// Create a new QR service
    pub fn new(db: Arc<Database>) -> Self {
        Self { db }
    }

    /// Generate a QR code for a credential offer
    pub async fn generate_credential_offer_qr(
        &self,
        issuer_did: &str,
        credential_id: &str,
        recipient_did: Option<String>,
    ) -> Result<String, AppError> {
        // Get the credential from the database
        let credential = self.db.get_credential_by_id(credential_id).await?
            .ok_or_else(|| AppError::NotFoundError(format!("Credential with ID {} not found", credential_id)))?;

        // Verify that the credential belongs to the issuer
        if credential.issuer_did != issuer_did {
            return Err(AppError::AccessDeniedError("You can only create offers for credentials you issued".to_string()));
        }

        // Create a credential offer
        let offer = CredentialOffer {
            id: uuid::Uuid::new_v4().to_string(),
            issuer_did: issuer_did.to_string(),
            credential_type: "".to_string(),
            schema_id: "".to_string(),
            credential_id: credential_id.to_string(),
            recipient_did,
            created_at: chrono::Utc::now(),
            expires_at: Some(chrono::Utc::now() + chrono::Duration::hours(24)),
            preview: Default::default(),
        };

        // Create a QR code for the offer
        let qr_content = qr::create_credential_offer_qr(&offer, None)?;
        qr_content.to_json_string()
    }

    /// Generate a QR code for a presentation request
    pub async fn generate_presentation_request_qr(
        &self,
        verifier_did: &str,
        schema_ids: &[String],
        purpose: &str,
        recipient_did: Option<String>,
    ) -> Result<String, AppError> {
        // Create a presentation request
        let request = PresentationRequest {
            id: uuid::Uuid::new_v4().to_string(),
            verifier_did: verifier_did.to_string(),
            presentation_type: "".to_string(),
            schema_ids: schema_ids.to_vec(),
            purpose: purpose.to_string(),
            recipient_did,
            created_at: chrono::Utc::now(),
            expires_at: Some(chrono::Utc::now() + chrono::Duration::hours(24)),
            callback_url: None,
            required_credentials: vec![],
        };

        // Create a QR code for the request
        let qr_content = qr::create_presentation_request_qr(&request)?;
        qr_content.to_json_string()
    }

    /// Generate a short URL QR code for a credential offer
    pub async fn generate_credential_offer_short_url(
        &self,
        issuer_did: &str,
        credential_id: &str,
        recipient_did: Option<String>,
    ) -> Result<String, AppError> {
        // Get the credential from the database
        let credential = self.db.get_credential_by_id(credential_id).await?
            .ok_or_else(|| AppError::NotFoundError(format!("Credential with ID {} not found", credential_id)))?;

        // Verify that the credential belongs to the issuer
        if credential.issuer_did != issuer_did {
            return Err(AppError::AccessDeniedError("You can only create offers for credentials you issued".to_string()));
        }

        // Create a credential offer
        let offer = CredentialOffer {
            id: uuid::Uuid::new_v4().to_string(),
            issuer_did: issuer_did.to_string(),
            credential_type: credential.credential_type.clone(),
            schema_id: credential.schema_id.clone(),
            credential_id: credential_id.to_string(),
            recipient_did,
            created_at: chrono::Utc::now(),
            expires_at: Some(chrono::Utc::now() + chrono::Duration::hours(24)),
            preview: Default::default(),
        };

        // Create a QR code for the offer
        let qr_content = qr::create_credential_offer_qr(&offer, None)?;
        let qr_json = qr_content.to_json_string()?;

        // Create a short URL QR code
        let short_url_qr = ShortUrlQrCode::new(
            "credential-offer".to_string(),
            serde_json::from_str(&qr_json)?,
            issuer_did.to_string(),
            offer.expires_at,
        );

        // Save the short URL QR code
        self.db.save_short_url_qr_code(&short_url_qr).await?;

        Ok(short_url_qr.short_id)
    }

    /// Generate a short URL QR code for a presentation request
    pub async fn generate_presentation_request_short_url(
        &self,
        verifier_did: &str,
        schema_ids: &[String],
        purpose: &str,
        recipient_did: Option<String>,
    ) -> Result<String, AppError> {
        // Create a presentation request
        let request = PresentationRequest {
            id: uuid::Uuid::new_v4().to_string(),
            verifier_did: verifier_did.to_string(),
            presentation_type: "".to_string(),
            schema_ids: schema_ids.to_vec(),
            purpose: purpose.to_string(),
            recipient_did,
            created_at: chrono::Utc::now(),
            expires_at: Some(chrono::Utc::now() + chrono::Duration::hours(24)),
            callback_url: None,
            required_credentials: vec![],
        };

        // Create a QR code for the request
        let qr_content = qr::create_presentation_request_qr(&request)?;
        let qr_json = qr_content.to_json_string()?;

        // Create a short URL QR code
        let short_url_qr = ShortUrlQrCode::new(
            "presentation-request".to_string(),
            serde_json::from_str(&qr_json)?,
            verifier_did.to_string(),
            request.expires_at,
        );

        // Save the short URL QR code
        self.db.save_short_url_qr_code(&short_url_qr).await?;

        Ok(short_url_qr.short_id)
    }

    /// Resolve a short URL to QR code content
    pub async fn resolve_short_url(&self, short_id: &str) -> Result<Value, AppError> {
        // Find the short URL QR code
        let short_url_qr = self.db.find_short_url_qr_code_by_short_id(short_id).await?
            .ok_or_else(|| AppError::NotFoundError(format!("QR code with short ID {} not found", short_id)))?;

        // Check if the QR code is expired
        if short_url_qr.is_expired() {
            return Err(AppError::ValidationError("QR code has expired".to_string()));
        }

        // Return the QR code content with type
        Ok(json!({
            "type": short_url_qr.qr_type,
            "content": short_url_qr.content
        }))
    }
}
