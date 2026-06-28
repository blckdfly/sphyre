use crate::blockchain::BlockchainClient;
use crate::db::Database;
use crate::error::AppError;
use crate::ipfs::IpfsClient;
use crate::models::{
    AccessLevel, ConsentRecord, CredentialRequirement, ExpirationPolicy, Presentation,
    PresentationRequest, PresentationStatus, VerifierPresentationRequest,
};
pub(crate) use crate::services::presentation::{
    CreatePresentationRequestRequest, PresentationRequestResponse, PresentationService,
    PresentationVerificationResult, VerifyPresentationRequest,
};
use crate::utils::did_document::build_did_document;
use crate::utils::{did, domain_verification, qr};
use chrono::{DateTime, Duration, Utc};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{collections::HashMap, env, sync::Arc};
use tokio::sync::RwLock;

use mongodb::bson::doc;
use tracing::info;

/// Create verifier request
#[derive(Debug, Deserialize)]
pub struct CreateVerifierRequest {
    pub name: String,
    pub domain: String,
    pub organization: String,
    pub description: Option<String>,
    pub website: Option<String>,
    pub logo_url: Option<String>,
}

/// Domain verification challenge request
#[derive(Debug, Deserialize)]
pub struct RequestDomainChallengeRequest {
    pub domain: String,
    pub method: domain_verification::VerificationMethod,
}

/// Domain verification challenge response
#[derive(Debug, Serialize)]
pub struct DomainChallengeResponse {
    pub challenge: domain_verification::DomainChallenge,
    pub instructions: String,
}

#[derive(Debug, Default)]
pub struct ResendPresentationRequestOptions {
    pub expires_in_minutes: Option<i64>,
}

#[derive(Debug, Serialize)]
pub struct ResendPresentationRequestResult {
    pub request: VerifierPresentationRequest,
    pub qr_payload: serde_json::Value,
}

/// Verifier service
pub struct VerifierService {
    db: Arc<Database>,
    presentation_service: PresentationService,
    ipfs: Arc<IpfsClient>,
    blockchain_client: Option<Arc<RwLock<Option<BlockchainClient>>>>,
}

impl VerifierService {
    /// Create a new verifier service
    pub fn new(
        db: Arc<Database>,
        presentation_service: PresentationService,
        ipfs: Arc<IpfsClient>,
        blockchain_client: Option<Arc<RwLock<Option<BlockchainClient>>>>,
    ) -> Self {
        Self {
            db,
            presentation_service,
            ipfs,
            blockchain_client,
        }
    }

    /// Request domain verification challenge for verifier
    pub async fn request_domain_challenge(
        &self,
        request: RequestDomainChallengeRequest,
    ) -> Result<DomainChallengeResponse, AppError> {
        // Validate domain format
        domain_verification::validate_domain(&request.domain)?;

        // Generate temporary keypair for this challenge
        let key_pair = did::generate_did()?;

        // Create challenge
        let challenge = domain_verification::DomainChallenge::new(
            request.domain.clone(),
            &key_pair.public_key_base58,
            request.method.clone(),
        );

        // Store challenge temporarily in database
        let challenge_doc = json!({
            "domain": challenge.domain,
            "challenge_token": challenge.challenge_token,
            "method": serde_json::to_value(&challenge.method).unwrap(),
            "public_key": key_pair.public_key_base58,
            "private_key_encrypted": key_pair.private_key_base58,
            "created_at": challenge.created_at,
            "expires_at": challenge.expires_at,
            "entity_type": "verifier",
        });

        self.db
            .insert_one("domain_challenges", &challenge_doc)
            .await?;

        let instructions = match challenge.method {
            domain_verification::VerificationMethod::DnsTxt => format!(
                "Add a TXT record to your DNS:\n\nName: _sphyre-verify.{}\nValue: {}\n\nThen call the verify endpoint.",
                challenge.domain, challenge.challenge_token
            ),
            domain_verification::VerificationMethod::WellKnown => format!(
                "Create a file at:\n\nhttps://{}/.well-known/sphyre-verify.txt\n\nContaining: {}\n\nThen call the verify endpoint.",
                challenge.domain, challenge.challenge_token
            ),
        };

        Ok(DomainChallengeResponse {
            challenge,
            instructions,
        })
    }

    /// Create a new verifier
    pub async fn create_verifier(
        &self,
        request: CreateVerifierRequest,
        challenge_token: &str,
    ) -> Result<HashMap<String, Value>, AppError> {
        // Validate domain
        domain_verification::validate_domain(&request.domain)?;

        // Retrieve the challenge from database
        let challenge_doc = self
            .db
            .find_one::<serde_json::Value>(
                "domain_challenges",
                bson::doc! {
                    "domain": &request.domain,
                    "challenge_token": challenge_token,
                    "entity_type": "verifier",
                },
            )
            .await?
            .ok_or_else(|| AppError::NotFoundError("Domain challenge not found".to_string()))?;

        let challenge = domain_verification::DomainChallenge {
            domain: challenge_doc["domain"].as_str().unwrap().to_string(),
            challenge_token: challenge_doc["challenge_token"]
                .as_str()
                .unwrap()
                .to_string(),
            method: serde_json::from_value(challenge_doc["method"].clone())
                .map_err(|e| AppError::ValidationError(format!("Invalid method: {}", e)))?,
            created_at: challenge_doc["created_at"].as_u64().unwrap(),
            expires_at: challenge_doc["expires_at"].as_u64().unwrap(),
        };

        // Verify domain ownership
        let verification = domain_verification::verify_domain_ownership(&challenge).await?;

        if !verification.verified {
            return Err(AppError::ValidationError(
                "Domain ownership verification failed".to_string(),
            ));
        }

        // Get the keypair from challenge
        let public_key = challenge_doc["public_key"].as_str().unwrap();
        let private_key_encrypted = challenge_doc["private_key_encrypted"].as_str().unwrap();

        // Generate DID from domain + public key
        let verifier_did =
            domain_verification::generate_domain_did("verifier", &request.domain, public_key);

        let did_document = build_did_document(&verifier_did, public_key, "verifier")?;
        let did_doc_cid = self.ipfs.upload_json(&did_document).await?;
        let gateway_base = env::var("IPFS_GATEWAY")
            .unwrap_or_else(|_| "https://gateway.sphyre.tech".to_string());
        let did_doc_gateway_url = format!(
            "{}/ipfs/{}",
            gateway_base.trim_end_matches('/'),
            did_doc_cid
        );

        let now = Utc::now();
        let mut verifier = json!({
            "id": verifier_did,
            "name": request.name,
            "organization": request.organization,
            "domain": request.domain,
            "domain_verified": true,
            "domain_verified_at": verification.verified_at,
            "description": request.description,
            "website": request.website,
            "logo_url": request.logo_url,
            "public_key": public_key,
            "private_key_encrypted": private_key_encrypted,
            "auth_hash": serde_json::Value::Null,
            "created_at": now,
            "updated_at": now,
            "did_doc_cid": did_doc_cid,
            "did_doc_gateway_url": did_doc_gateway_url,
            "blockchain_registered": false,
        });

        if let Some(blockchain_client_lock) = &self.blockchain_client {
            let client_guard = blockchain_client_lock.read().await;
            if let Some(client) = client_guard.as_ref() {
                let verifier_address = client.wallet_address();
                match client
                    .register_verifier_did(
                        verifier["id"].as_str().unwrap_or_default(),
                        verifier_address,
                        verifier["did_doc_cid"].as_str().unwrap_or_default(),
                    )
                    .await
                {
                    Ok(receipt) => {
                        if let Some(obj) = verifier.as_object_mut() {
                            obj.insert("blockchain_registered".into(), json!(true));
                            obj.insert(
                                "blockchain_tx_hash".into(),
                                json!(format!("{:?}", receipt.transaction_hash)),
                            );
                        }
                        tracing::info!("Verifier DID registered on-chain: {}", verifier["id"]);
                    }
                    Err(e) => {
                        tracing::warn!(
                            error = %e,
                            "Failed to register verifier DID on blockchain: {}",
                            verifier["id"].as_str().unwrap_or_default()
                        );
                    }
                }
            } else {
                tracing::debug!("Blockchain client unavailable when creating verifier {}", verifier_did);
            }
        }

        // Save the verifier to the database
        self.db.insert_one("verifiers", &verifier).await?;

        // Delete the used challenge
        self.db
            .delete_one(
                "domain_challenges",
                bson::doc! {
                    "domain": &request.domain,
                    "challenge_token": challenge_token,
                },
            )
            .await?;

        // Convert to HashMap for easier manipulation
        let verifier_map =
            serde_json::from_value::<HashMap<String, Value>>(verifier).map_err(|e| {
                AppError::ValidationError(format!("Failed to convert verifier to map: {}", e))
            })?;

        Ok(verifier_map)
    }

    /// Update a verifier
    pub async fn update_verifier(
        &self,
        did: &str,
        updates: HashMap<String, Value>,
    ) -> Result<HashMap<String, Value>, AppError> {
        // Create an update document
        let mut update_doc = bson::Document::new();

        // Add each field from the updates
        for (key, value) in updates {
            // Skip the id field
            if key == "id" {
                continue;
            }

            // Convert the value to BSON
            let bson_value = bson::to_bson(&value).map_err(|e| {
                AppError::ValidationError(format!("Failed to convert value to BSON: {}", e))
            })?;

            update_doc.insert(key, bson_value);
        }

        // Add the updated_at field
        update_doc.insert(
            "updated_at",
            bson::to_bson(&Utc::now()).map_err(|e| {
                AppError::ValidationError(format!("Failed to convert date to BSON: {}", e))
            })?,
        );

        // Update the verifier in the database
        self.db
            .update_one(
                "verifiers",
                bson::doc! { "id": did },
                bson::doc! { "$set": update_doc },
            )
            .await?;

        // Get the updated verifier
        self.get_verifier(did).await
    }

    /// Get verifier information by DID
    pub async fn get_verifier(&self, did: &str) -> Result<HashMap<String, Value>, AppError> {
        let verifier = self
            .db
            .find_one::<HashMap<String, Value>>("verifiers", bson::doc! { "id": did })
            .await?
            .ok_or_else(|| {
                AppError::NotFoundError(format!("Verifier with DID {} not found", did))
            })?;

        Ok(verifier)
    }

    /// Create a presentation request
    pub async fn create_presentation_request(
        &self,
        request: CreatePresentationRequestRequest,
    ) -> Result<PresentationRequestResponse, AppError> {
        self.presentation_service
            .create_presentation_request(request)
            .await
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
        self.presentation_service
            .get_presentations_by_verifier(verifier_did)
            .await
    }

    pub async fn resend_presentation_request(
        &self,
        presentation_id: &str,
        options: ResendPresentationRequestOptions,
    ) -> Result<ResendPresentationRequestResult, AppError> {
        let presentation = self
            .presentation_service
            .get_presentation_by_id(presentation_id)
            .await?
            .ok_or_else(|| {
                AppError::NotFoundError(format!(
                    "Presentation with ID {} not found",
                    presentation_id
                ))
            })?;

        if presentation.status != PresentationStatus::Verified {
            return Err(AppError::ValidationError(
                "Only verified presentations can be resent".to_string(),
            ));
        }

        let request_id = presentation
            .presentation_data
            .get("request_id")
            .and_then(|value| value.as_str())
            .ok_or_else(|| {
                AppError::ValidationError(
                    "Presentation is missing the original request identifier".to_string(),
                )
            })?;

        let original_request = self
            .db
            .find_one::<VerifierPresentationRequest>(
                "verifier_presentation_requests",
                doc! { "request_id": request_id },
            )
            .await?
            .ok_or_else(|| {
                AppError::NotFoundError(format!(
                    "Original presentation request {} not found",
                    request_id
                ))
            })?;

        if original_request.holder_did != presentation.prover_did {
            return Err(AppError::ValidationError(
                "Presentation holder does not match original request".to_string(),
            ));
        }

        let mut new_request = VerifierPresentationRequest::new(
            original_request.verifier_did.clone(),
            original_request.verifier_name.clone(),
            original_request.holder_did.clone(),
            original_request.credential_id.clone(),
            original_request.purpose.clone(),
            original_request.required_attributes.clone(),
            original_request.required_predicates.clone(),
            original_request.required_attribute_values.clone(),
        );

        new_request.required_predicates = original_request.required_predicates.clone();
        new_request.requested_attributes = original_request.requested_attributes.clone();
        new_request.presentation_id = Some(presentation.id.clone());

        if let Some(minutes) = options.expires_in_minutes {
            if minutes > 0 {
                new_request.expires_at = Utc::now() + Duration::minutes(minutes);
            }
        }

        self.db
            .insert_one("verifier_presentation_requests", &new_request)
            .await?;

        info!(
            "Created resend presentation request {} from original {}",
            new_request.request_id, request_id
        );

        let qr_payload = json!({
            "type": "presentation_request",
            "request_id": new_request.request_id,
            "verifier_did": new_request.verifier_did,
            "verifier_name": new_request.verifier_name,
            "required_attributes": new_request.required_attributes,
            "purpose": new_request.purpose,
            "presentation_id": new_request.presentation_id,
            "expires_at": new_request.expires_at.to_rfc3339(),
        });

        Ok(ResendPresentationRequestResult {
            request: new_request,
            qr_payload,
        })
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
        self.presentation_service
            .update_presentation_status(id, verifier_did, status)
            .await
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
        let consent = ConsentRecord::new(
            user_did.to_string(),
            verifier_did.to_string(),
            purpose.to_string(),
            data_categories,
            access_level,
            expiration_policy,
            expires_at,
        );

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
        let filter = bson::doc! {
            "user_did": user_did,
            "verifier_did": verifier_did,
            "purpose": purpose,
            "revoked": false
        };

        let consent = self
            .db
            .find_one::<ConsentRecord>("consent_records", filter)
            .await?;

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
            None, // No predicates for this method
        );

        // Create a QR code for the request
        let qr_content = qr::create_presentation_request_qr(&request)?;
        qr_content.to_json_string()
    }

    pub async fn generate_presentation_request_qr_short_url(
        &self,
        verifier_did: &str,
        required_credentials: Vec<CredentialRequirement>,
        presentation_type: &str,
        purpose: &str,
        callback_url: Option<String>,
        expires_at: Option<DateTime<Utc>>,
        required_attribute_values: Option<HashMap<String, Vec<String>>>,
        required_predicates: Option<Vec<serde_json::Value>>,
    ) -> Result<String, AppError> {
        use crate::models::{ShortUrlQrCode, VerifierPresentationRequest};

        // Create a presentation request
        let request = PresentationRequest::new(
            verifier_did.to_string(),
            presentation_type.to_string(),
            required_credentials.clone(),
            purpose.to_string(),
            callback_url.clone(),
            expires_at,
            required_predicates.clone(),
        );

        let required_attributes = required_credentials
            .iter()
            .flat_map(|cr| cr.required_attributes.clone())
            .collect::<Vec<_>>();

        let filtered_attribute_values = required_attribute_values.and_then(|map| {
            let allowed_set: std::collections::HashSet<String> = required_attributes
                .iter()
                .map(|attr| attr.trim().to_lowercase())
                .collect();

            let filtered = map
                .into_iter()
                .filter_map(|(attr, values)| {
                    let normalized_attr = attr.trim();
                    if normalized_attr.is_empty() {
                        return None;
                    }

                    let attr_key = normalized_attr.to_lowercase();
                    if !allowed_set.contains(&attr_key) {
                        return None;
                    }

                    let sanitized_values: Vec<String> = values
                        .into_iter()
                        .filter_map(|value| {
                            let trimmed = value.trim();
                            if trimmed.is_empty() {
                                None
                            } else {
                                Some(trimmed.to_string())
                            }
                        })
                        .collect();

                    if sanitized_values.is_empty() {
                        None
                    } else {
                        Some((normalized_attr.to_string(), sanitized_values))
                    }
                })
                .collect::<HashMap<_, _>>();

            if filtered.is_empty() {
                None
            } else {
                Some(filtered)
            }
        });

        let mut verifier_request = VerifierPresentationRequest::new(
            verifier_did.to_string(),
            "Verifier".to_string(),
            "".to_string(),
            "".to_string(),
            purpose.to_string(),
            required_attributes,
            required_predicates,
            filtered_attribute_values,
        );

        verifier_request.request_id = request.id.clone();
        verifier_request.expires_at =
            expires_at.unwrap_or_else(|| Utc::now() + chrono::Duration::minutes(15));

        let collection = self
            .db
            .db
            .collection::<VerifierPresentationRequest>("verifier_presentation_requests");
        collection
            .insert_one(&verifier_request)
            .await
            .map_err(|e| {
                AppError::InternalError(format!("Failed to save presentation request: {}", e))
            })?;

        tracing::info!(
            "Created VerifierPresentationRequest in database: {}",
            verifier_request.request_id
        );

        // Create QR content
        let qr_content = qr::create_presentation_request_qr(&request)?;
        let qr_json = qr_content.to_json_string()?;

        // Create a short URL QR code
        let short_url_qr = ShortUrlQrCode::new(
            "presentation-request".to_string(),
            serde_json::from_str(&qr_json)?,
            verifier_did.to_string(),
            expires_at,
        );

        // Save the short URL QR code
        self.db
            .save_short_url_qr_code(&short_url_qr)
            .await
            .map_err(|e| AppError::InternalError(format!("Failed to save QR code: {}", e)))?;

        let base_url =
            std::env::var("BASE_URL").unwrap_or_else(|_| "https://api.sphyre.tech/api".to_string());
        let base_url = base_url.trim_end_matches('/');
        let short_url = format!("{}/qr/resolve/{}", base_url, short_url_qr.short_id);

        tracing::info!(
            "Generated short URL for presentation request: {} (verifier: {})",
            short_url,
            verifier_did
        );

        Ok(short_url)
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
        let pending_presentations = presentations
            .iter()
            .filter(|p| p.status == PresentationStatus::Pending)
            .count();
        let verified_presentations = presentations
            .iter()
            .filter(|p| p.status == PresentationStatus::Verified)
            .count();
        let rejected_presentations = presentations
            .iter()
            .filter(|p| p.status == PresentationStatus::Rejected)
            .count();

        // Get all consents for this verifier
        let consents = self.get_consents_for_verifier(verifier_did).await?;
        let active_consents = consents.iter().filter(|c| c.is_valid()).count();
        let revoked_consents = consents.iter().filter(|c| c.revoked).count();

        let mut statistics = HashMap::new();
        statistics.insert(
            "total_presentations".to_string(),
            json!(total_presentations),
        );
        statistics.insert(
            "pending_presentations".to_string(),
            json!(pending_presentations),
        );
        statistics.insert(
            "verified_presentations".to_string(),
            json!(verified_presentations),
        );
        statistics.insert(
            "rejected_presentations".to_string(),
            json!(rejected_presentations),
        );
        statistics.insert("active_consents".to_string(), json!(active_consents));
        statistics.insert("revoked_consents".to_string(), json!(revoked_consents));

        Ok(statistics)
    }

    pub async fn get_presentation_request_by_id(
        &self,
        id: &str,
    ) -> Result<Option<PresentationRequest>, AppError> {
        self.presentation_service
            .get_presentation_request_by_id(id)
            .await
    }

    /// Create presentation from holder submission
    pub async fn create_presentation(
        &self,
        verifier_did: &str,
        holder_did: &str,
        credentials: Vec<serde_json::Value>,
        request_id: Option<String>,
    ) -> Result<Presentation, AppError> {
        self.presentation_service
            .create_presentation(verifier_did, holder_did, credentials, request_id)
            .await
    }

    /// Set auth hash for verifier
    pub async fn set_auth_hash(&self, did: &str, auth_token: &str) -> Result<(), AppError> {
        use crate::utils::auth_token;

        // Hash the auth token
        let auth_hash = auth_token::hash_auth_token(auth_token)?;

        // Update verifier with auth hash
        let now = bson::to_bson(&Utc::now()).map_err(|e| {
            AppError::ValidationError(format!("Failed to convert date to BSON: {}", e))
        })?;

        self.db
            .update_one(
                "verifiers",
                bson::doc! { "id": did },
                bson::doc! { "$set": { "auth_hash": auth_hash, "updated_at": now } },
            )
            .await?;

        Ok(())
    }

    /// Authenticate verifier with auth token
    pub async fn authenticate(
        &self,
        did: &str,
        auth_token: &str,
    ) -> Result<HashMap<String, Value>, AppError> {
        use crate::utils::auth_token;

        // Get verifier
        let verifier = self.get_verifier(did).await?;

        // Check if auth_hash exists
        let stored_hash = verifier
            .get("auth_hash")
            .and_then(|v| v.as_str())
            .ok_or_else(|| {
                AppError::UnauthorizedError(
                    "No authentication set up for this verifier".to_string(),
                )
            })?;

        // Verify auth token
        if !auth_token::verify_auth_token(auth_token, stored_hash)? {
            return Err(AppError::UnauthorizedError(
                "Invalid authentication credentials".to_string(),
            ));
        }

        Ok(verifier)
    }
}
