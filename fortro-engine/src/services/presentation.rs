use crate::db::Database;
use crate::error::AppError;
use crate::models::{
    Credential, CredentialRequirement, Presentation, PresentationRequest,
    PresentationStatus, VerifierPresentationRequest,
};
use crate::services::credential::CredentialService;
use crate::utils::anonymous_credentials::{
    create_unlinkable_presentation, verify_unlinkable_presentation, AnonymousCredential,
};
use crate::utils::presentation_blinding::create_presentation_session;
use crate::utils::{did, jwt, qr, zk_proofs};
use chrono::{DateTime, Utc};
use mongodb::bson::DateTime as BsonDateTime;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};
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
    #[serde(default)]
    pub required_predicates: Option<Vec<serde_json::Value>>,
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
#[derive(Debug, Clone, Deserialize)]
pub struct VerifyPresentationRequest {
    pub presentation_jwt: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub presentation: Option<String>,
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

    fn validate_evidence(&self, credential: &Credential) -> Vec<String> {
        if credential.evidence_required.is_empty() {
            return Vec::new();
        }

        let attachments = &credential.evidence_attachments;
        if attachments.is_empty() {
            return vec![format!(
                "Credential {} is missing all required evidence",
                credential.id
            )];
        }

        let mut errors = Vec::new();
        let provided_labels: HashSet<String> = attachments
            .iter()
            .map(|att| att.label.to_lowercase())
            .collect();

        for required_label in &credential.evidence_required {
            let normalized = required_label.trim().to_lowercase();
            if !provided_labels.contains(&normalized) {
                errors.push(format!(
                    "Credential {} missing evidence: {}",
                    credential.id, required_label
                ));
            }
        }
        errors
    }

    /// Create a presentation request
    pub async fn create_presentation_request(
        &self,
        request: CreatePresentationRequestRequest,
    ) -> Result<PresentationRequestResponse, AppError> {
        let presentation_request = PresentationRequest::new(
            request.verifier_did.clone(),
            request.presentation_type.clone(),
            request.required_credentials.clone(),
            request.purpose.clone(),
            request.callback_url.clone(),
            request.expires_at,
            request.required_predicates,
        );

        self.db
            .insert_one("presentation_requests", &presentation_request)
            .await?;

        tracing::info!(
            "Presentation request saved to MongoDB: {}",
            presentation_request.id
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

        let mut anonymous_presentations = Vec::new();

        for credential in &credentials {
            if let Some(anon_record) = &credential.anonymous_credential {
                let revealed = request
                    .disclosed_attributes
                    .get(&credential.id)
                    .cloned()
                    .unwrap_or_default();

                if !revealed.is_empty() {
                    let revealed_map: HashMap<String, String> = revealed
                        .iter()
                        .filter_map(|attr| {
                            credential
                                .credential_preview
                                .as_ref()
                                .and_then(|preview| preview.get(attr))
                                .map(|value| (attr.clone(), value.to_string()))
                        })
                        .collect();

                    if !revealed_map.is_empty() {
                        let anon_credential = AnonymousCredential {
                            a: hex::decode(&anon_record.a).map_err(|e| {
                                AppError::InternalError(format!(
                                    "Failed to decode anonymous credential component A: {}",
                                    e
                                ))
                            })?,
                            e: hex::decode(&anon_record.e).map_err(|e| {
                                AppError::InternalError(format!(
                                    "Failed to decode anonymous credential component E: {}",
                                    e
                                ))
                            })?,
                            v: hex::decode(&anon_record.v).map_err(|e| {
                                AppError::InternalError(format!(
                                    "Failed to decode anonymous credential component V: {}",
                                    e
                                ))
                            })?,
                            credential_id: credential.id.clone(),
                            attribute_order: if !anon_record.attribute_order.is_empty() {
                                anon_record.attribute_order.clone()
                            } else {
                                let mut fallback = revealed_map.keys().cloned().collect::<Vec<_>>();
                                fallback.sort();
                                fallback
                            },
                        };

                        let issuer_keys = self
                            .db
                            .get_issuer_anonymous_keys(&credential.issuer_did)
                            .await?
                            .ok_or_else(|| {
                                AppError::ValidationError(
                                    "Anonymous credential missing issuer key material".to_string(),
                                )
                            })?;

                        let unlinkable = create_unlinkable_presentation(
                            &anon_credential,
                            revealed_map,
                            &issuer_keys.public_key,
                        )?;

                        presentation_data.insert(
                            format!("{}_anonymous_proof", credential.id),
                            serde_json::to_value(&unlinkable).map_err(|e| {
                                AppError::InternalError(format!(
                                    "Failed to serialize anonymous presentation: {}",
                                    e
                                ))
                            })?,
                        );

                        anonymous_presentations.push((unlinkable, issuer_keys.public_key.clone()));
                    }
                }
            }
        }

        // Add predicate proofs to presentation data
        for proof in &request.predicate_proofs {
            presentation_data.insert(format!("predicate_{}", proof.attribute_name), json!(proof));
        }

        // Create unlinkable presentation
        tracing::info!("Creating anonymous, unlinkable presentation...");

        // Generate unique presentation ID and session
        let presentation_session = create_presentation_session(3600).map_err(|e| {
            AppError::SsiError(format!("Failed to create presentation session: {}", e))
        })?;

        tracing::info!(
            "Presentation session created: {}",
            presentation_session.session_id
        );

        // Add unlinkability metadata to presentation data
        presentation_data.insert(
            "_anonymous_metadata".to_string(),
            json!({
                "presentation_id": presentation_session.session_id,
                "presentation_mode": "anonymous",
                "unlinkable": true,
                "timestamp": Utc::now().timestamp(),
                "session_expires_at": presentation_session.expires_at
            }),
        );

        // Create a presentation JWT
        let jwt = jwt::create_pq_presentation_jwt(
            prover_did,
            Some(&presentation_request.verifier_did),
            &credential_jwts,
            prover_private_key.as_ref(),
            "dummy_public_key".as_bytes(),
            Some(3600),
        )?;

        // Create a presentation object
        let mut presentation = Presentation::new(
            prover_did.to_string(),
            presentation_request.verifier_did.clone(),
            presentation_request.presentation_type.clone(),
            request.credential_ids.clone(),
            presentation_data,
            jwt.clone(),
        );

        // Embed pseudonym for anonymous mode presentations to avoid leaking holder DID
        if presentation
            .presentation_data
            .get("_anonymous_metadata")
            .and_then(|meta| meta.get("unlinkable"))
            .and_then(|flag| flag.as_bool())
            .unwrap_or(false)
        {
            let pseudonym = did::build_pairwise_pseudonym(
                prover_did,
                &presentation_request.verifier_did,
                &presentation.id,
            );

            presentation.prover_pseudonym = Some(pseudonym.clone());
            presentation
                .presentation_data
                .insert("pseudonymous_prover".to_string(), serde_json::json!(pseudonym.clone()));

            if let Some(serde_json::Value::Object(meta_obj)) = presentation
                .presentation_data
                .get_mut("_anonymous_metadata")
            {
                meta_obj.insert(
                    "prover_pseudonym".to_string(),
                    serde_json::Value::String(pseudonym),
                );
            }
        }

        tracing::info!("Anonymous presentation created successfully");
        tracing::info!(
            "Presentation ID: {} (unique per presentation)",
            presentation_session.session_id
        );
        tracing::info!("Unlinkability: Guaranteed (different ID each time)");

        self.db.save_presentation(&presentation).await?;

        Ok(PresentationResponse { presentation, jwt })
    }

        async fn expire_consents_if_needed(
        &self,
        holder_did: Option<&str>,
        verifier_did: Option<&str>,
    ) -> Result<(), AppError> {
        let now = Utc::now();
        let now_bson = BsonDateTime::from_millis(now.timestamp_millis());

        let expired_consents = self
            .db
            .find_expired_consents(now_bson, holder_did, verifier_did)
            .await?;

        if expired_consents.is_empty() {
            return Ok(());
        }

        for consent in expired_consents {
            let Some(consent_id) = consent.id.as_deref() else {
                tracing::warn!(
                    "Skipping expired consent without id for holder {} to verifier {}",
                    consent.holder_did, consent.verifier_did
                );
                continue;
            };

            self.db
                .mark_consent_expired(consent_id, now_bson)
                .await?;

            self.update_presentations_after_consent_change(
                &consent.holder_did,
                &consent.verifier_did,
                &consent.data_categories,
                Some(&[]),
                true,
            )
            .await?;
        }
        Ok(())
    }

    pub async fn verify_presentation(
        &self,
        request: VerifyPresentationRequest,
    ) -> Result<PresentationVerificationResult, AppError> {
        let mut errors = Vec::new();
        let mut is_valid = true;
        let mut credential_subjects = Vec::new();
        let mut anonymous_subjects = Vec::new();

        tracing::info!("Verifying presentation...");

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

        let mut anonymous_validation_errors = Vec::new();
        let is_anonymous_presentation = presentation_data
            .get("_anonymous_metadata")
            .and_then(|meta| meta.get("unlinkable"))
            .and_then(|flag| flag.as_bool())
            .unwrap_or(false);

        if let Some(anonymous_metadata) = presentation_data.get("_anonymous_metadata") {
            if let Some(presentation_id) = anonymous_metadata.get("presentation_id") {
                tracing::info!("Anonymous presentation detected");
                tracing::info!("Presentation ID: {}", presentation_id);
                tracing::info!("Unlinkability: This presentation cannot be correlated with others");
            }

            if let Some(map) = presentation_data.as_object() {
                for (key, value) in map {
                    if key.ends_with("_anonymous_proof") {
                        let unlinkable: crate::utils::anonymous_credentials::UnlinkablePresentation =
                            serde_json::from_value(value.clone()).map_err(|e| {
                                AppError::ValidationError(format!(
                                    "Invalid anonymous presentation payload: {}",
                                    e
                                ))
                            })?;

                        let credential_id = key.trim_end_matches("_anonymous_proof");
                        let credential = self
                            .credential_service
                            .get_credential_by_id(credential_id)
                            .await?
                            .ok_or_else(|| {
                                AppError::NotFoundError(format!(
                                    "Credential {} referenced in anonymous proof not found",
                                    credential_id
                                ))
                            })?;

                        let issuer_keys = self
                            .db
                            .get_issuer_anonymous_keys(&credential.issuer_did)
                            .await?
                            .ok_or_else(|| {
                                AppError::ValidationError(
                                    "Missing issuer anonymous keys for verification".to_string(),
                                )
                            })?;

                        match verify_unlinkable_presentation(&unlinkable, &issuer_keys.public_key)
                        {
                            Ok(true) => {}
                            Ok(false) => {
                                anonymous_validation_errors.push(format!(
                                    "Anonymous presentation verification failed for credential {}",
                                    credential_id
                                ));
                            }
                            Err(e) => {
                                anonymous_validation_errors.push(format!(
                                    "Anonymous presentation verification error for credential {}: {}",
                                    credential_id, e
                                ));
                            }
                        }
                    }
                }
            }
        }

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

        let created_at = Utc::now();

        // Verify the JWT signature
        match jwt::verify_pq_jwt(&request.presentation_jwt) {
            Ok(_) => {}
            Err(e) => {
                errors.push(format!("JWT signature verification failed: {}", e));
                is_valid = false;
            }
        }

        let mut request_required_attributes: Vec<String> = Vec::new();
        let mut request_required_attribute_values: HashMap<String, Vec<String>> = HashMap::new();

        if let Some(request_id_value) = presentation_data.get("request_id").and_then(|v| v.as_str()) {
            if let Some(original_request) = self
                .db
                .find_one::<VerifierPresentationRequest>(
                    "verifier_presentation_requests",
                    mongodb::bson::doc! { "request_id": request_id_value },
                )
                .await?
            {
                request_required_attributes = original_request.required_attributes.clone();
                if let Some(values) = original_request.required_attribute_values.clone() {
                    request_required_attribute_values = values;
                }
            }
        }

        let mut disclosed_attribute_map: HashMap<String, String> = HashMap::new();
        let mut requested_disclosures_by_credential: HashMap<String, HashSet<String>> =
            HashMap::new();

        // Verify each credential in the presentation
        if let Some(credentials_array) = presentation_data["verifiableCredential"].as_array() {
            for credential_jwt in credentials_array {
                if let Some(jwt_str) = credential_jwt.as_str() {
                    let credential_data = jwt::extract_credential(jwt_str)?;
                    if let Some(credential_id) = credential_data["id"].as_str() {
                        if let Some(requested_attrs) = presentation_data
                            .get(credential_id)
                            .and_then(|value| value.as_object())
                        {
                            let whitelist = requested_attrs
                                .keys()
                                .filter(|key| !key.starts_with('_'))
                                .map(|key| key.trim().to_lowercase())
                                .collect::<HashSet<String>>();

                            if !whitelist.is_empty() {
                                requested_disclosures_by_credential
                                    .insert(credential_id.to_string(), whitelist);
                            }
                        }
                    }
                }
            }
        }

        // Verify each credential in the presentation
        if let Some(credentials_array) = presentation_data["verifiableCredential"].as_array() {
            for credential_jwt in credentials_array {
                if let Some(jwt_str) = credential_jwt.as_str() {
                    // Verify the credential
                    let verify_request = crate::services::credential::VerifyCredentialRequest {
                        credential_jwt: jwt_str.to_string(),
                    };

                    match self
                        .credential_service
                        .verify_credential(verify_request)
                        .await
                    {
                        Ok(result) => {
                            if !result.is_valid {
                                errors.push(format!(
                                    "Credential verification failed: {:?}",
                                    result.errors
                                ));
                                is_valid = false;
                            }

                            // Extract credential subject
                            let credential_data = jwt::extract_credential(jwt_str)?;
                            let credential_id = credential_data["id"].as_str().map(|s| s.to_string());

                            let anonymous_proof_value = credential_id
                                .as_ref()
                                .and_then(|id| {
                                    presentation_data
                                        .get(&format!("{}_anonymous_proof", id))
                                });

                            if let Some(proof_value) = anonymous_proof_value.and_then(|v| v.as_object()) {
                                if let Some(revealed) = proof_value
                                    .get("revealed_attributes")
                                    .and_then(|val| val.as_object())
                                {
                                    let mut revealed_names = Vec::new();
                                    for (key, value) in revealed {
                                        let normalized = key.trim().to_lowercase();
                                        let value_str = value
                                            .as_str()
                                            .map(|s| s.to_string())
                                            .unwrap_or_else(|| value.to_string());
                                        disclosed_attribute_map.insert(normalized, value_str);
                                        revealed_names.push(Value::String(key.clone()));
                                    }

                                    if let Some(id) = credential_id.as_ref() {
                                        if !revealed_names.is_empty() {
                                            let mut entry = HashMap::new();
                                            entry.insert(
                                                "credential_id".to_string(),
                                                Value::String(id.clone()),
                                            );
                                            entry.insert(
                                                "revealed_attributes".to_string(),
                                                Value::Array(revealed_names),
                                            );
                                            anonymous_subjects.push(entry);
                                        }
                                    }
                                }

                                // Skip leaking raw credential subjects when anonymous proof is used
                                continue;
                            }

                            if let Some(subject) = credential_data["credentialSubject"].as_object()
                            {
                                let disclosed_attribute_whitelist = credential_id
                                    .as_ref()
                                    .and_then(|id| requested_disclosures_by_credential.get(id));

                                let mut subject_map = HashMap::new();
                                for (key, value) in subject {
                                    if key != "id" {
                                        let normalized_key = key.trim().to_lowercase();

                                        let mut attribute_allowed = true;
                                        if let Some(whitelist) = disclosed_attribute_whitelist {
                                            attribute_allowed = whitelist.contains(&normalized_key);
                                        } else if !request_required_attributes.is_empty()
                                            || !request_required_attribute_values.is_empty()
                                        {
                                            attribute_allowed = request_required_attributes
                                                .iter()
                                                .any(|attr| attr.trim().eq_ignore_ascii_case(key))
                                                || request_required_attribute_values
                                                    .keys()
                                                    .any(|attr| attr.trim().eq_ignore_ascii_case(key));
                                        }

                                        if !attribute_allowed {
                                            continue;
                                        }

                                        if let Some(val_str) = value.as_str() {
                                            disclosed_attribute_map
                                                .insert(normalized_key.clone(), val_str.to_string());
                                        } else {
                                            disclosed_attribute_map
                                                .insert(normalized_key.clone(), value.to_string());
                                        }
                                        subject_map.insert(key.clone(), value.clone());
                                    }
                                }
                                if !subject_map.is_empty() {
                                    credential_subjects.push(subject_map);
                                }
                            }

                            if let Some(credential_id) = credential_data["id"].as_str() {
                                if let Some(db_credential) = self
                                    .credential_service
                                    .get_credential_by_id(credential_id)
                                    .await?
                                {
                                    let evidence_errors = self.validate_evidence(&db_credential);
                                    if !evidence_errors.is_empty() {
                                        is_valid = false;
                                        errors.extend(evidence_errors);
                                    }
                                } else {
                                    errors.push(format!(
                                        "Credential {} referenced in presentation not found",
                                        credential_id
                                    ));
                                    is_valid = false;
                                }
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

        if !request_required_attributes.is_empty() || !request_required_attribute_values.is_empty() {
            let mut requirement_errors = Vec::new();

            for attribute in &request_required_attributes {
                let normalized_attr = attribute.trim().to_lowercase();
                if normalized_attr.is_empty() {
                    continue;
                }

                if disclosed_attribute_map.contains_key(&normalized_attr) {
                    continue;
                }

                let exists_case_insensitive = disclosed_attribute_map.keys().any(|provided| {
                    provided.trim().eq_ignore_ascii_case(&normalized_attr)
                        || provided.trim().eq_ignore_ascii_case(attribute)
                });

                if !exists_case_insensitive {
                    requirement_errors.push(format!("Required attribute '{}' is missing", attribute));
                }
            }

            for (attribute, allowed_values) in &request_required_attribute_values {
                let normalized_attr = attribute.trim().to_lowercase();
                match disclosed_attribute_map.get(&normalized_attr).or_else(|| {
                    disclosed_attribute_map.iter().find_map(|(key, value)| {
                        if key.eq_ignore_ascii_case(&normalized_attr) {
                            Some(value)
                        } else {
                            None
                        }
                    })
                }) {
                    Some(actual_value) => {
                        let is_match = allowed_values.iter().any(|candidate| {
                            candidate.trim().eq_ignore_ascii_case(actual_value)
                                || candidate.trim().to_lowercase() == actual_value.trim().to_lowercase()
                        });

                        if !is_match {
                            requirement_errors.push(format!(
                                "Attribute '{}' value '{}' does not match allowed values: {}",
                                attribute, actual_value, allowed_values.join(", ")
                            ));
                        }
                    }
                    None => {
                        let accepted = allowed_values.join(", ");
                        requirement_errors.push(format!(
                            "Attribute '{}' is missing or not disclosed. Expected values: {}",
                            attribute, accepted
                        ));
                    }
                }
            }

            if !requirement_errors.is_empty() {
                is_valid = false;
                errors.extend(requirement_errors);
            }
        }

        // Verify predicate proofs if any
        if let Some(predicates) = presentation_data["predicateProofs"].as_array() {
            for predicate in predicates {
                if let Ok(proof) =
                    serde_json::from_value::<zk_proofs::PredicateProof>(predicate.clone())
                {
                    match zk_proofs::verify_predicate_proof(&proof) {
                        Ok(valid) => {
                            if !valid {
                                errors.push(format!(
                                    "Predicate proof verification failed for attribute {}",
                                    proof.attribute_name
                                ));
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

        if !anonymous_validation_errors.is_empty() {
            is_valid = false;
            errors.extend(anonymous_validation_errors);
        }

        let final_subjects = if is_anonymous_presentation {
            anonymous_subjects
        } else {
            credential_subjects
        };

        Ok(PresentationVerificationResult {
            is_valid,
            errors,
            prover_did,
            verifier_did,
            presentation_type,
            created_at,
            credential_subjects: final_subjects,
        })
    }

    /// Get presentations by verifier
    pub async fn get_presentations_by_verifier(
        &self,
        verifier_did: &str,
    ) -> Result<Vec<Presentation>, AppError> {
        self.expire_consents_if_needed(None, Some(verifier_did)).await?;
        self.db.find_presentations_by_verifier(verifier_did).await
    }

    /// Get presentations by prover
    pub async fn get_presentations_by_prover(
        &self,
        prover_did: &str,
    ) -> Result<Vec<Presentation>, AppError> {
        self.expire_consents_if_needed(Some(prover_did), None).await?;
        self.db.find_presentations_by_prover(prover_did).await
    }

    /// Mark presentations as revoked when a credential is revoked from the holder wallet.
    pub async fn update_presentations_after_credential_revoke(
        &self,
        holder_did: &str,
        credential_id: &str,
    ) -> Result<(), AppError> {
        let presentations = self
            .db
            .find_presentations_by_prover(holder_did)
            .await?
            .into_iter()
            .filter(|presentation| presentation.credential_ids.contains(&credential_id.to_string()))
            .collect::<Vec<_>>();

        if presentations.is_empty() {
            return Ok(());
        }

        for mut presentation in presentations.into_iter() {
            let provided_initial: Vec<String> = presentation
                .presentation_data
                .get("provided_attributes")
                .and_then(|value| serde_json::from_value::<Vec<String>>(value.clone()).ok())
                .unwrap_or_default();

            let mut revoked_attributes: HashSet<String> = presentation
                .presentation_data
                .get("revoked_attributes")
                .and_then(|value| serde_json::from_value::<Vec<String>>(value.clone()).ok())
                .unwrap_or_default()
                .into_iter()
                .collect();

            for attr in &provided_initial {
                revoked_attributes.insert(attr.clone());
            }

            let mut revoked_attributes = revoked_attributes.into_iter().collect::<Vec<_>>();
            revoked_attributes.sort();
            revoked_attributes.dedup();

            presentation
                .presentation_data
                .insert("provided_attributes".to_string(), json!(Vec::<String>::new()));
            presentation
                .presentation_data
                .insert("revoked_attributes".to_string(), json!(revoked_attributes));
            presentation
                .presentation_data
                .insert("credential_status".to_string(), json!("revoked"));
            presentation
                .presentation_data
                .insert("credential_revoked_at".to_string(), json!(Utc::now().to_rfc3339()));

            let mut revoked_ids: HashSet<String> = presentation
                .presentation_data
                .get("revoked_credential_ids")
                .and_then(|value| serde_json::from_value::<Vec<String>>(value.clone()).ok())
                .unwrap_or_default()
                .into_iter()
                .collect();
            revoked_ids.insert(credential_id.to_string());

            presentation
                .presentation_data
                .insert("revoked_credential_ids".to_string(), json!(revoked_ids.into_iter().collect::<Vec<_>>()));

            self.db.save_presentation(&presentation).await?;
        }

        Ok(())
    }

    /// Update presentations after consent revocation to reflect active and revoked attributes
    pub async fn update_presentations_after_consent_change(
        &self,
        holder_did: &str,
        verifier_did: &str,
        newly_revoked: &[String],
        remaining_allowed: Option<&[String]>,
        expired_consent: bool,
    ) -> Result<(), AppError> {
        let presentations = self
            .db
            .find_presentations_by_prover(holder_did)
            .await?
            .into_iter()
            .filter(|presentation| presentation.verifier_did == verifier_did)
            .collect::<Vec<_>>();

        if presentations.is_empty() {
            return Ok(());
        }

        let revoked_set: HashSet<String> = newly_revoked.iter().cloned().collect();
        let remaining_vec: Option<Vec<String>> = remaining_allowed.map(|attrs| attrs.to_vec());
        let remaining_set = remaining_vec
            .as_ref()
            .map(|attrs| attrs.iter().cloned().collect::<HashSet<String>>());

        for mut presentation in presentations.into_iter() {
            let provided_initial: Vec<String> = presentation
                .presentation_data
                .get("provided_attributes")
                .and_then(|value| serde_json::from_value::<Vec<String>>(value.clone()).ok())
                .unwrap_or_default();

            let mut provided_active = provided_initial.clone();

            if let Some(active_set) = remaining_set.as_ref() {
                provided_active.retain(|attr| active_set.contains(attr));
            } else {
                provided_active.clear();
            }

            let mut revoked_attributes: HashSet<String> = presentation
                .presentation_data
                .get("revoked_attributes")
                .and_then(|value| serde_json::from_value::<Vec<String>>(value.clone()).ok())
                .unwrap_or_default()
                .into_iter()
                .collect();

            for attr in &provided_initial {
                if !provided_active.contains(attr) {
                    revoked_attributes.insert(attr.clone());
                }
            }

            for attr in &revoked_set {
                revoked_attributes.insert(attr.clone());
            }

            let was_provided_before = !provided_initial.is_empty();

            provided_active.sort();
            provided_active.dedup();

            let mut revoked_attributes = revoked_attributes.into_iter().collect::<Vec<_>>();
            revoked_attributes.sort();
            revoked_attributes.dedup();

            let mut credential_status = if let Some(active_vec) = remaining_vec.as_ref() {
                if active_vec.is_empty() {
                    "revoked"
                } else if provided_active.is_empty() {
                    if was_provided_before {
                        "expired"
                    } else {
                        "active"
                    }
                } else {
                    "active"
                }
            } else if provided_active.is_empty() && was_provided_before {
                "revoked"
            } else {
                "active"
            };

            let mut consent_status = "active";
            if expired_consent {
                consent_status = "expired";
                credential_status = "expired";
                provided_active.clear();
            } else if let Some(active_vec) = remaining_vec.as_ref() {
                if active_vec.is_empty() {
                    consent_status = "revoked";
                }
            } else if provided_active.is_empty() && was_provided_before {
                consent_status = "revoked";
            }

            presentation
                .presentation_data
                .insert("provided_attributes".to_string(), json!(provided_active));
            presentation
                .presentation_data
                .insert("revoked_attributes".to_string(), json!(revoked_attributes));
            presentation
                .presentation_data
                .insert("credential_status".to_string(), json!(credential_status));
            presentation
                .presentation_data
                .insert("consent_status".to_string(), json!(consent_status));
            presentation
                .presentation_data
                .insert("consent_last_updated_at".to_string(), json!(Utc::now().to_rfc3339()));

            self.db.save_presentation(&presentation).await?;
        }

        Ok(())
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
        let presentation = self.get_presentation_by_id(id).await?.ok_or_else(|| {
            AppError::NotFoundError(format!("Presentation with ID {} not found", id))
        })?;

        // Check if the verifier is authorized to update the status
        if presentation.verifier_did != verifier_did {
            return Err(AppError::AccessDeniedError(
                "Only the verifier can update the presentation status".to_string(),
            ));
        }

        // Update the presentation status and metadata
        let mut updated_presentation = presentation.clone();
        updated_presentation.status = status.clone();

        if status == PresentationStatus::Verified {
            updated_presentation.verified_at = Some(Utc::now());
            updated_presentation.is_verified = true;

            if let Some(credentials_value) =
                updated_presentation.presentation_data.get("credentials")
            {
                if let Ok(credentials_vec) =
                    serde_json::from_value::<Vec<serde_json::Value>>(credentials_value.clone())
                {
                    let mut provided_attributes = Vec::new();
                    let mut revoked_attributes = Vec::new();
                    let mut credential_status = "active".to_string();

                    for cred in &credentials_vec {
                        if let Some(subject) =
                            cred.get("credentialSubject").and_then(|cs| cs.as_object())
                        {
                            for key in subject.keys() {
                                if key != "id" && !key.starts_with('_') {
                                    provided_attributes.push(key.clone());
                                }
                            }
                        }

                        if let Some(status_field) = cred.get("status").and_then(|s| s.as_str()) {
                            if status_field == "revoked" {
                                credential_status = "revoked".to_string();
                            }
                        }

                        if let Some(cred_status) =
                            cred.get("credentialStatus").and_then(|cs| cs.as_object())
                        {
                            if let Some(revoked) =
                                cred_status.get("revoked").and_then(|r| r.as_array())
                            {
                                for attr in revoked {
                                    if let Some(attr_str) = attr.as_str() {
                                        revoked_attributes.push(attr_str.to_string());
                                    }
                                }
                            }
                        }
                    }

                    provided_attributes.sort();
                    provided_attributes.dedup();
                    revoked_attributes.sort();
                    revoked_attributes.dedup();

                    updated_presentation.presentation_data.insert(
                        "provided_attributes".to_string(),
                        json!(provided_attributes),
                    );
                    updated_presentation
                        .presentation_data
                        .insert("revoked_attributes".to_string(), json!(revoked_attributes));
                    updated_presentation
                        .presentation_data
                        .insert("credential_status".to_string(), json!(credential_status));
                }
            }
        } else {
            updated_presentation.is_verified = false;
        }

        // Save the updated presentation
        self.db.save_presentation(&updated_presentation).await?;

        Ok(true)
    }

    pub async fn get_presentation_request_by_id(
        &self,
        id: &str,
    ) -> Result<Option<PresentationRequest>, AppError> {
        self.db
            .find_one::<PresentationRequest>(
                "presentation_requests",
                mongodb::bson::doc! { "id": id },
            )
            .await
    }

    pub async fn create_presentation(
        &self,
        verifier_did: &str,
        holder_did: &str,
        credentials: Vec<serde_json::Value>,
        request_id: Option<String>,
    ) -> Result<Presentation, AppError> {
        let credential_ids: Vec<String> = credentials
            .iter()
            .filter_map(|c| {
                c.get("id")
                    .and_then(|id| id.as_str())
                    .map(|s| s.to_string())
            })
            .collect();

        let mut provided_attributes = Vec::new();
        let mut revoked_attributes = Vec::new();
        let mut credential_status = "active".to_string();

        for cred in &credentials {
            // Extract attributes from credentialSubject
            if let Some(subject) = cred.get("credentialSubject").and_then(|cs| cs.as_object()) {
                for key in subject.keys() {
                    if key != "id" && !key.starts_with("_") {
                        provided_attributes.push(key.clone());
                    }
                }
            }

            // Check credential status field
            if let Some(status) = cred.get("status").and_then(|s| s.as_str()) {
                if status == "revoked" {
                    credential_status = "revoked".to_string();
                    tracing::warn!("Credential marked as revoked");
                }
            }

            // Check expiration date
            if let Some(expires_str) = cred.get("expirationDate").and_then(|e| e.as_str()) {
                if let Ok(expires_dt) = DateTime::parse_from_rfc3339(expires_str) {
                    if expires_dt < chrono::DateTime::<chrono::FixedOffset>::from(Utc::now()) {
                        credential_status = "expired".to_string();
                        tracing::warn!("Credential has expired");
                    }
                }
            }

            // Check for revoked attributes in credentialStatus
            if let Some(cred_status) = cred.get("credentialStatus").and_then(|cs| cs.as_object()) {
                if let Some(revoked) = cred_status.get("revoked").and_then(|r| r.as_array()) {
                    for attr in revoked {
                        if let Some(attr_str) = attr.as_str() {
                            revoked_attributes.push(attr_str.to_string());
                        }
                    }
                }
            }
        }

        // Remove duplicates
        provided_attributes.sort();
        provided_attributes.dedup();
        revoked_attributes.sort();
        revoked_attributes.dedup();

        tracing::info!(
            "Extracted {} provided attributes, {} revoked attributes, status: {}",
            provided_attributes.len(),
            revoked_attributes.len(),
            credential_status
        );

        // Build presentation data from credentials
        let mut presentation_data = HashMap::new();
        presentation_data.insert("request_id".to_string(), json!(request_id));
        presentation_data.insert("credentials".to_string(), json!(credentials));
        presentation_data.insert("timestamp".to_string(), json!(Utc::now().to_rfc3339()));

        presentation_data.insert(
            "required_attributes".to_string(),
            json!(Vec::<String>::new()),
        );
        presentation_data.insert(
            "provided_attributes".to_string(),
            json!(provided_attributes),
        );
        presentation_data.insert("revoked_attributes".to_string(), json!(revoked_attributes));
        presentation_data.insert("credential_status".to_string(), json!(credential_status));
        presentation_data.insert("consent_status".to_string(), json!("active"));

        let presentation = Presentation {
            id: uuid::Uuid::new_v4().to_string(),
            prover_did: holder_did.to_string(),
            prover_pseudonym: None,
            verifier_did: verifier_did.to_string(),
            presentation_type: "credential_presentation".to_string(),
            credential_ids,
            presentation_data,
            jwt: format!("jwt_{}", uuid::Uuid::new_v4()),
            status: PresentationStatus::Pending,
            created_at: Utc::now(),
            verified_at: None,
            is_verified: false,
        };

        let mut presentation = presentation;

        if let Some(pseudonym) = presentation
            .presentation_data
            .get("holder_pseudonym")
            .and_then(|value| value.as_str())
            .or_else(|| {
                presentation
                    .presentation_data
                    .get("pseudonymous_prover")
                    .and_then(|value| value.as_str())
            })
        {
            presentation.prover_pseudonym = Some(pseudonym.to_string());
        }

        self.db.save_presentation(&presentation).await?;

        Ok(presentation)
    }
}
