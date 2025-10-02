use crate::db::Database;
use crate::error::AppError;
use crate::models::{Credential, CredentialRequirement, Presentation, PresentationRequest, PresentationStatus};
use crate::services::credential::CredentialService;
use crate::utils::{crypto, did, jwt, qr, zk_proofs};
use chrono::{DateTime, Duration, Utc};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::Arc;

/// Presentation service
pub struct PresentationService {
    db: Arc<Database>,
    credential_service: CredentialService,
}

/// Create presentation request
#[derive(Debug, Deserialize)]
pub struct CreatePresentationRequestRequest {
    pub verifier_did: String,
    pub presentation_type: String,
    pub required_credentials: Vec<CredentialRequirement>,
    pub purpose: String,
    pub callback_url: Option<String>,
    pub expires_at: Option<DateTime<Utc>>,
}

/// Submit presentation request
#[derive(Debug, Deserialize)]
pub struct SubmitPresentationRequest {
    pub presentation_request_id: String,
    pub credential_ids: Vec<String>,
    pub disclosed_attributes: HashMap<String, Vec<String>>,
    pub predicate_proofs: Vec<zk_proofs::PredicateProof>,
}

/// Verify presentation request
#[derive(Debug, Deserialize)]
pub struct VerifyPresentationRequest {
    pub presentation_jwt: String,
}

/// Presentation request response
#[derive(Debug, Serialize)]
pub struct PresentationRequestResponse {
    pub request: PresentationRequest,
    pub qr_code_data: String,
}

/// Presentation response
#[derive(Debug, Serialize)]
pub struct PresentationResponse {
    pub presentation: Presentation,
    pub jwt: String,
}

/// Verification result
#[derive(Debug, Serialize)]
pub struct PresentationVerificationResult {
    pub is_valid: bool,
    pub errors: Vec<String>,
    pub prover_did: String,
    pub verifier_did: String,
    pub presentation_type: String,
    pub created_at: DateTime<Utc>,
    pub credential_subjects: Vec<HashMap<String, Value>>,
}

impl PresentationService {
    /// Create a new presentation service
    pub fn new(db: Arc<Database>, credential_service: CredentialService) -> Self {
        Self {
            db,
            credential_service,
        }
    }

    /// Create a presentation request
    pub async fn create_presentation_request(
        &self,
        request: CreatePresentationRequestRequest,
    ) -> Result<PresentationRequestResponse, AppError> {
        // Create a new presentation request
        let presentation_request = PresentationRequest::new(
            request.verifier_did.clone(),
            request.presentation_type.clone(),
            request.required_credentials.clone(),
            request.purpose.clone(),
            request.callback_url.clone(),
            request.expires_at,
        );

        // Create a QR code for the request
        let qr_content = qr::create_presentation_request_qr(&presentation_request)?;
        let qr_code_data = qr_content.to_json_string()?;

        Ok(PresentationRequestResponse {
            request: presentation_request,
            qr_code_data,
        })
    }

    /// Submit a presentation
    pub async fn submit_presentation(
        &self,
        prover_did: &str,
        prover_private_key: &str,
        request: SubmitPresentationRequest,
    ) -> Result<PresentationResponse, AppError> {
        // Get the presentation request
        let presentation_request = self
            .db
            .find_one::<PresentationRequest>(
                "presentation_requests",
                mongodb::bson::doc! { "id": &request.presentation_request_id },
            )
            .await?
            .ok_or_else(|| {
                AppError::NotFoundError(format!(
                    "Presentation request with ID {} not found",
                    request.presentation_request_id
                ))
            })?;

        // Check if the request is expired
        if let Some(expires_at) = presentation_request.expires_at {
            if expires_at < Utc::now() {
                return Err(AppError::ValidationError(
                    "Presentation request is expired".to_string(),
                ));
            }
        }

        // Get the credentials
        let mut credentials = Vec::new();
        let mut credential_jwts = Vec::new();
        let mut presentation_data = HashMap::new();

        for credential_id in &request.credential_ids {
            let credential = self
                .credential_service
                .get_credential_by_id(credential_id)
                .await?
                .ok_or_else(|| {
                    AppError::NotFoundError(format!(
                        "Credential with ID {} not found",
                        credential_id
                    ))
                })?;

            // Check if the credential belongs to the prover
            if credential.owner_did != prover_did {
                return Err(AppError::AccessDeniedError(
                    "You can only present your own credentials".to_string(),
                ));
            }

            // Create selective disclosure for this credential
            let disclosed_attrs = request
                .disclosed_attributes
                .get(credential_id)
                .cloned()
                .unwrap_or_default();

            let disclosed_data = self
                .credential_service
                .create_selective_disclosure(credential_id, &disclosed_attrs)
                .await?;

            // Add to presentation data
            presentation_data.insert(credential_id.clone(), json!(disclosed_data));
            
            credentials.push(credential.clone());
            credential_jwts.push(credential.jwt.clone());
        }

        // Add predicate proofs to presentation data
        for proof in &request.predicate_proofs {
            presentation_data.insert(
                format!("predicate_{}", proof.attribute_name),
                json!(proof),
            );
        }

        // Create a presentation JWT
        let jwt = jwt::create_pq_presentation_jwt(
            prover_did,
            Some(&presentation_request.verifier_did),
            &credential_jwts,
            prover_private_key.as_ref(),
            "dummy_public_key".as_bytes(), // Using dummy public key for demonstration
            Some(3600), // Default to 1 hour
        )?;

        // Create a presentation object
        let presentation = Presentation::new(
            prover_did.to_string(),
            presentation_request.verifier_did.clone(),
            presentation_request.presentation_type.clone(),
            request.credential_ids.clone(),
            presentation_data,
            jwt.clone(),
        );

        // Save the presentation to the database
        self.db.save_presentation(&presentation).await?;

        Ok(PresentationResponse {
            presentation,
            jwt,
        })
    }

    /// Verify a presentation
    pub async fn verify_presentation(
        &self,
        request: VerifyPresentationRequest,
    ) -> Result<PresentationVerificationResult, AppError> {
        let mut errors = Vec::new();
        let mut is_valid = true;
        let mut credential_subjects = Vec::new();

        // Extract the presentation from the JWT
        let presentation_data = match jwt::extract_presentation(&request.presentation_jwt) {
            Ok(data) => data,
            Err(e) => {
                errors.push(format!("Failed to extract presentation: {}", e));
                return Ok(PresentationVerificationResult {
                    is_valid: false,
                    errors,
                    prover_did: "".to_string(),
                    verifier_did: "".to_string(),
                    presentation_type: "".to_string(),
                    created_at: Utc::now(),
                    credential_subjects: Vec::new(),
                });
            }
        };

        // Extract required fields
        let prover_did = presentation_data["holder"]
            .as_str()
            .unwrap_or("")
            .to_string();
        let verifier_did = jwt::decode_jwt_unverified(&request.presentation_jwt)?
            .1
            .aud
            .unwrap_or_default();
        let presentation_type = presentation_data["type"]
            .as_array()
            .and_then(|types| types.get(1))
            .and_then(|t| t.as_str())
            .unwrap_or("VerifiablePresentation")
            .to_string();
        
        let created_at = Utc::now(); // JWT doesn't include creation time in the presentation itself

        // Verify the JWT signature
        match jwt::verify_pq_jwt(&request.presentation_jwt) {
            Ok(_) => {}
            Err(e) => {
                errors.push(format!("JWT signature verification failed: {}", e));
                is_valid = false;
            }
        }

        // Verify each credential in the presentation
        if let Some(credentials) = presentation_data["verifiableCredential"].as_array() {
            for credential_jwt in credentials {
                if let Some(jwt_str) = credential_jwt.as_str() {
                    // Verify the credential
                    let verify_request = crate::services::credential::VerifyCredentialRequest {
                        credential_jwt: jwt_str.to_string(),
                    };
                    
                    match self.credential_service.verify_credential(verify_request).await {
                        Ok(result) => {
                            if !result.is_valid {
                                errors.push(format!("Credential verification failed: {:?}", result.errors));
                                is_valid = false;
                            }
                            
                            // Extract credential subject
                            let credential_data = jwt::extract_credential(jwt_str)?;
                            if let Some(subject) = credential_data["credentialSubject"].as_object() {
                                let mut subject_map = HashMap::new();
                                for (key, value) in subject {
                                    if key != "id" {
                                        subject_map.insert(key.clone(), value.clone());
                                    }
                                }
                                credential_subjects.push(subject_map);
                            }
                        }
                        Err(e) => {
                            errors.push(format!("Failed to verify credential: {}", e));
                            is_valid = false;
                        }
                    }
                }
            }
        }

        // Verify predicate proofs if any
        if let Some(predicates) = presentation_data["predicateProofs"].as_array() {
            for predicate in predicates {
                if let Ok(proof) = serde_json::from_value::<zk_proofs::PredicateProof>(predicate.clone()) {
                    match zk_proofs::verify_predicate_proof(&proof) {
                        Ok(valid) => {
                            if !valid {
                                errors.push(format!("Predicate proof verification failed for attribute {}", proof.attribute_name));
                                is_valid = false;
                            }
                        }
                        Err(e) => {
                            errors.push(format!("Failed to verify predicate proof: {}", e));
                            is_valid = false;
                        }
                    }
                }
            }
        }

        Ok(PresentationVerificationResult {
            is_valid,
            errors,
            prover_did,
            verifier_did,
            presentation_type,
            created_at,
            credential_subjects,
        })
    }

    /// Get presentations by verifier
    pub async fn get_presentations_by_verifier(
        &self,
        verifier_did: &str,
    ) -> Result<Vec<Presentation>, AppError> {
        self.db.find_presentations_by_verifier(verifier_did).await
    }

    /// Get presentations by prover
    pub async fn get_presentations_by_prover(
        &self,
        prover_did: &str,
    ) -> Result<Vec<Presentation>, AppError> {
        self.db.find_presentations_by_prover(prover_did).await
    }

    /// Get a presentation by ID
    pub async fn get_presentation_by_id(&self, id: &str) -> Result<Option<Presentation>, AppError> {
        self.db
            .find_one::<Presentation>("presentations", mongodb::bson::doc! { "id": id })
            .await
    }

    /// Update presentation status
    pub async fn update_presentation_status(
        &self,
        id: &str,
        verifier_did: &str,
        status: PresentationStatus,
    ) -> Result<bool, AppError> {
        // Get the presentation
        let presentation = self
            .get_presentation_by_id(id)
            .await?
            .ok_or_else(|| AppError::NotFoundError(format!("Presentation with ID {} not found", id)))?;

        // Check if the verifier is authorized to update the status
        if presentation.verifier_did != verifier_did {
            return Err(AppError::AccessDeniedError(
                "Only the verifier can update the presentation status".to_string(),
            ));
        }

        // Update the presentation status
        let mut updated_presentation = presentation.clone();
        updated_presentation.status = status.clone();

        if status == PresentationStatus::Verified {
            updated_presentation.verified_at = Some(Utc::now());
            updated_presentation.is_verified = true;
        }

        // Save the updated presentation
        self.db.save_presentation(&updated_presentation).await?;

        Ok(true)
    }
}