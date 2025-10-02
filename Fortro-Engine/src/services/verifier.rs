use crate::db::Database;
use crate::error::AppError;
use crate::models::{Presentation, PresentationRequest, PresentationStatus, CredentialRequirement, ConsentRecord, AccessLevel, ExpirationPolicy};
pub(crate) use crate::services::presentation::{PresentationService, CreatePresentationRequestRequest, VerifyPresentationRequest, PresentationVerificationResult, PresentationRequestResponse};
use crate::utils::qr;
use chrono::{DateTime, Utc};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::Arc;

/// Verifier service
pub struct VerifierService {
    db: Arc<Database>,
    presentation_service: PresentationService,
}

impl VerifierService {
    /// Create a new verifier service
    pub fn new(db: Arc<Database>, presentation_service: PresentationService) -> Self {
        Self {
            db,
            presentation_service,
        }
    }

    /// Create a presentation request
    pub async fn create_presentation_request(
        &self,
        request: CreatePresentationRequestRequest,
    ) -> Result<PresentationRequestResponse, AppError> {
        self.presentation_service.create_presentation_request(request).await
    }

    /// Verify a presentation
    pub async fn verify_presentation(
        &self,
        request: VerifyPresentationRequest,
    ) -> Result<PresentationVerificationResult, AppError> {
        self.presentation_service.verify_presentation(request).await
    }

    /// Get presentations by verifier
    pub async fn get_presentations_by_verifier(
        &self,
        verifier_did: &str,
    ) -> Result<Vec<Presentation>, AppError> {
        self.presentation_service.get_presentations_by_verifier(verifier_did).await
    }

    /// Get a presentation by ID
    pub async fn get_presentation_by_id(&self, id: &str) -> Result<Option<Presentation>, AppError> {
        self.presentation_service.get_presentation_by_id(id).await
    }

    /// Update presentation status
    pub async fn update_presentation_status(
        &self,
        id: &str,
        verifier_did: &str,
        status: PresentationStatus,
    ) -> Result<bool, AppError> {
        self.presentation_service.update_presentation_status(id, verifier_did, status).await
    }
    /// Request consent from a user
    pub async fn request_consent(
        &self,
        verifier_did: &str,
        user_did: &str,
        purpose: &str,
        data_categories: Vec<String>,
        access_level: AccessLevel,
        expiration_policy: ExpirationPolicy,
        expires_at: Option<DateTime<Utc>>,
    ) -> Result<ConsentRecord, AppError> {
        // Create a consent record
        let consent = ConsentRecord::new(
            user_did.to_string(),
            verifier_did.to_string(),
            purpose.to_string(),
            data_categories,
            access_level,
            expiration_policy,
            expires_at,
        );

        // Save the consent record
        self.db.save_consent_record(&consent).await?;

        Ok(consent)
    }

    /// Check if consent exists and is valid
    pub async fn check_consent(
        &self,
        verifier_did: &str,
        user_did: &str,
        purpose: &str,
    ) -> Result<bool, AppError> {
        // Find consent records for this user and verifier
        let filter = bson::doc! {
            "user_did": user_did,
            "verifier_did": verifier_did,
            "purpose": purpose,
            "revoked": false
        };

        let consent = self.db.find_one::<ConsentRecord>("consent_records", filter).await?;

        // Check if consent exists and is valid
        if let Some(consent) = consent {
            return Ok(consent.is_valid());
        }

        Ok(false)
    }

    /// Get all consents for a verifier
    pub async fn get_consents_for_verifier(
        &self,
        verifier_did: &str,
    ) -> Result<Vec<ConsentRecord>, AppError> {
        let filter = bson::doc! { "verifier_did": verifier_did };
        self.db.find_many("consent_records", filter).await
    }

    /// Generate a QR code for a presentation request
    pub async fn generate_presentation_request_qr(
        &self,
        verifier_did: &str,
        required_credentials: Vec<CredentialRequirement>,
        presentation_type: &str,
        purpose: &str,
        callback_url: Option<String>,
        expires_at: Option<DateTime<Utc>>,
    ) -> Result<String, AppError> {
        // Create a presentation request
        let request = PresentationRequest::new(
            verifier_did.to_string(),
            presentation_type.to_string(),
            required_credentials,
            purpose.to_string(),
            callback_url,
            expires_at,
        );

        // Create a QR code for the request
        let qr_content = qr::create_presentation_request_qr(&request)?;
        qr_content.to_json_string()
    }

    /// Get verifier statistics
    pub async fn get_verifier_statistics(
        &self,
        verifier_did: &str,
    ) -> Result<HashMap<String, Value>, AppError> {
        // Get all presentations for this verifier
        let presentations = self.get_presentations_by_verifier(verifier_did).await?;

        // Count presentations by status
        let total_presentations = presentations.len();
        let pending_presentations = presentations.iter()
            .filter(|p| p.status == PresentationStatus::Pending)
            .count();
        let verified_presentations = presentations.iter()
            .filter(|p| p.status == PresentationStatus::Verified)
            .count();
        let rejected_presentations = presentations.iter()
            .filter(|p| p.status == PresentationStatus::Rejected)
            .count();

        // Get all consents for this verifier
        let consents = self.get_consents_for_verifier(verifier_did).await?;
        let active_consents = consents.iter()
            .filter(|c| c.is_valid())
            .count();
        let revoked_consents = consents.iter()
            .filter(|c| c.revoked)
            .count();

        let mut statistics = HashMap::new();
        statistics.insert("total_presentations".to_string(), json!(total_presentations));
        statistics.insert("pending_presentations".to_string(), json!(pending_presentations));
        statistics.insert("verified_presentations".to_string(), json!(verified_presentations));
        statistics.insert("rejected_presentations".to_string(), json!(rejected_presentations));
        statistics.insert("active_consents".to_string(), json!(active_consents));
        statistics.insert("revoked_consents".to_string(), json!(revoked_consents));

        Ok(statistics)
    }
}
