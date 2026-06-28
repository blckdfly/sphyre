use crate::blockchain::BlockchainClient;
use crate::db::Database;
use crate::error::AppError;
use crate::ipfs::IpfsClient;
use crate::models::{
    CredentialOffer, CredentialRequest, CredentialRequestStatus, CredentialTemplate, FieldSource,
    Schema, TemplateField,
};
pub use crate::services::credential::{
    CredentialEvidenceInput, CredentialService, IssueCredentialRequest,
};
pub use crate::services::schema::{CreateSchemaRequest, SchemaService};
use crate::utils::did_document::build_did_document;
use crate::utils::{did, domain_verification};
use chrono::{Duration, Utc};
use futures::TryStreamExt;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{collections::HashMap, env, sync::Arc};
use tokio::sync::RwLock;

/// Create issuer request
#[derive(Debug, Deserialize)]
pub struct CreateIssuerRequest {
    pub name: String,
    pub domain: String,
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

/// Create credential template request
#[derive(Debug, Deserialize)]
pub struct CreateCredentialTemplateRequest {
    pub name: String,
    pub description: String,
    pub schema_id: String,
    pub fields: Vec<TemplateField>,
    #[serde(default)]
    pub evidence_required: Vec<String>,
    #[serde(default)]
    pub extensions: Vec<String>,
}

/// Issuer service
pub struct IssuerService {
    db: Arc<Database>,
    credential_service: CredentialService,
    schema_service: SchemaService,
    ipfs: Arc<IpfsClient>,
    blockchain_client: Option<Arc<RwLock<Option<BlockchainClient>>>>,
}

/// Process credential request
#[derive(Debug, Deserialize)]
pub struct ProcessCredentialRequestRequest {
    pub request_id: String,
    pub approve: bool,
    pub reason: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct CreateCredentialOfferRequest {
    pub template_id: String,
    pub issuer_data: HashMap<String, Value>,
    #[serde(default)]
    pub expiration_hours: Option<i64>,
}

/// Credential request response
#[derive(Debug, Serialize)]
pub struct CredentialRequestResponse {
    pub request: CredentialRequest,
}

/// Credential offer response
#[derive(Debug, Serialize)]
pub struct CredentialOfferResponse {
    pub offer: CredentialOffer,
    pub qr_code_data: String,
}

/// Validate template against schema
pub fn validate_template_against_schema(
    fields: &[TemplateField],
    evidence: &[String],
    extensions: &[String],
    schema: &Schema,
) -> Result<(), AppError> {
    for attr in &schema.attributes {
        if attr.required {
            let found = fields
                .iter()
                .any(|f| f.name == attr.name && !f.is_extension);

            if !found {
                return Err(AppError::ValidationError(format!(
                    "Template must include required attribute: {}",
                    attr.name
                )));
            }
        }
    }

    for field in fields {
        if field.field_type.eq_ignore_ascii_case("file")
            && field.source != FieldSource::HolderInput
        {
            return Err(AppError::ValidationError(format!(
                "Field '{}' is a file upload and must be marked as holder_input",
                field.name
            )));
        }

        if field.is_extension {
            if !schema.extensions_allowed {
                return Err(AppError::ValidationError(format!(
                    "Field '{}' is marked as extension but schema doesn't allow extensions",
                    field.name
                )));
            }

            if let Some(allowed) = &schema.allowed_extensions {
                if !allowed.contains(&field.name) {
                    return Err(AppError::ValidationError(format!(
                        "Extension '{}' is not in schema's allowed extensions list",
                        field.name
                    )));
                }
            }
        } else {
            let schema_attr = schema.attributes.iter().find(|a| a.name == field.name);

            if schema_attr.is_none() {
                return Err(AppError::ValidationError(format!(
                    "Field '{}' is not defined in schema and not marked as extension",
                    field.name
                )));
            }
        }
    }

    for ev in evidence {
        if !schema.evidence_allowed {
            return Err(AppError::ValidationError(
                "Schema doesn't allow evidence but template requires it".to_string(),
            ));
        }

        if let Some(allowed) = &schema.allowed_evidence {
            if !allowed.contains(ev) {
                return Err(AppError::ValidationError(format!(
                    "Evidence type '{}' is not allowed by schema",
                    ev
                )));
            }
        }
    }

    if !extensions.is_empty() {
        if !schema.extensions_allowed {
            return Err(AppError::ValidationError(
                "Schema doesn't allow extensions but template includes them".to_string(),
            ));
        }

        if let Some(allowed) = &schema.allowed_extensions {
            for ext in extensions {
                if !allowed.contains(ext) {
                    return Err(AppError::ValidationError(format!(
                        "Extension '{}' is not in schema's allowed extensions list",
                        ext
                    )));
                }
            }
        }
    }

    Ok(())
}

impl IssuerService {
    pub fn new(
        db: Arc<Database>,
        credential_service: CredentialService,
        schema_service: SchemaService,
        ipfs: Arc<IpfsClient>,
        blockchain_client: Option<Arc<RwLock<Option<BlockchainClient>>>>,
    ) -> Self {
        Self {
            db,
            credential_service,
            schema_service,
            ipfs,
            blockchain_client,
        }
    }

    /// Request domain verification challenge
    pub async fn request_domain_challenge(
        &self,
        request: RequestDomainChallengeRequest,
    ) -> Result<DomainChallengeResponse, AppError> {
        domain_verification::validate_domain(&request.domain)?;

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
            "entity_type": "issuer",
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

    pub async fn create_issuer(
        &self,
        request: CreateIssuerRequest,
        challenge_token: &str,
    ) -> Result<HashMap<String, Value>, AppError> {
        domain_verification::validate_domain(&request.domain)?;

        let challenge_doc = self
            .db
            .find_one::<serde_json::Value>(
                "domain_challenges",
                bson::doc! {
                    "domain": &request.domain,
                    "challenge_token": challenge_token,
                    "entity_type": "issuer",
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

        let verification = domain_verification::verify_domain_ownership(&challenge).await?;

        if !verification.verified {
            return Err(AppError::ValidationError(
                "Domain ownership verification failed".to_string(),
            ));
        }

        let public_key = challenge_doc["public_key"].as_str().unwrap();
        let private_key_encrypted = challenge_doc["private_key_encrypted"].as_str().unwrap();
        let issuer_did =
            domain_verification::generate_domain_did("issuer", &request.domain, public_key);

        let did_document = build_did_document(&issuer_did, public_key, "issuer")?;
        let did_doc_cid = self.ipfs.upload_json(&did_document).await?;
        let gateway_base = env::var("IPFS_GATEWAY")
            .unwrap_or_else(|_| "https://gateway.sphyre.tech".to_string());
        let did_doc_gateway_url = format!(
            "{}/ipfs/{}",
            gateway_base.trim_end_matches('/'),
            did_doc_cid
        );

        let now = Utc::now();
        let mut issuer = json!({
            "id": issuer_did,
            "name": request.name,
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
                let issuer_address = client.wallet_address();
                match client
                    .register_issuer_did(
                        issuer["id"].as_str().unwrap_or_default(),
                        issuer_address,
                        issuer["did_doc_cid"].as_str().unwrap_or_default(),
                    )
                    .await
                {
                    Ok(receipt) => {
                        if let Some(obj) = issuer.as_object_mut() {
                            obj.insert("blockchain_registered".into(), json!(true));
                            obj.insert(
                                "blockchain_tx_hash".into(),
                                json!(format!("{:?}", receipt.transaction_hash)),
                            );
                        }
                        tracing::info!("Issuer DID registered on-chain: {}", issuer["id"]);
                    }
                    Err(e) => {
                        tracing::warn!(
                            error = %e,
                            "Failed to register issuer DID on blockchain: {}",
                            issuer["id"].as_str().unwrap_or_default()
                        );
                    }
                }
            } else {
                tracing::debug!("Blockchain client unavailable when creating issuer {}", issuer_did);
            }
        }

        self.db.insert_one("issuers", &issuer).await?;

        self.db
            .delete_one(
                "domain_challenges",
                bson::doc! {
                    "domain": &request.domain,
                    "challenge_token": challenge_token,
                },
            )
            .await?;

        let issuer_map = serde_json::from_value::<HashMap<String, Value>>(issuer).map_err(|e| {
            AppError::ValidationError(format!("Failed to convert issuer to map: {}", e))
        })?;

        Ok(issuer_map)
    }

    /// Get an issuer by DID
    pub async fn get_issuer(&self, did: &str) -> Result<HashMap<String, Value>, AppError> {
        let issuer = self
            .db
            .find_one::<HashMap<String, Value>>("issuers", bson::doc! { "id": did })
            .await?
            .ok_or_else(|| AppError::NotFoundError(format!("Issuer with DID {} not found", did)))?;

        Ok(issuer)
    }

    pub async fn update_issuer(
        &self,
        did: &str,
        updates: HashMap<String, Value>,
    ) -> Result<HashMap<String, Value>, AppError> {
        let mut update_doc = bson::Document::new();

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

        update_doc.insert(
            "updated_at",
            bson::to_bson(&Utc::now()).map_err(|e| {
                AppError::ValidationError(format!("Failed to convert date to BSON: {}", e))
            })?,
        );

        self.db
            .update_one(
                "issuers",
                bson::doc! { "id": did },
                bson::doc! { "$set": update_doc },
            )
            .await?;

        // Get the updated issuer
        self.get_issuer(did).await
    }

    /// Create a credential template
    pub async fn create_credential_template(
        &self,
        issuer_did: &str,
        request: CreateCredentialTemplateRequest,
    ) -> Result<CredentialTemplate, AppError> {
        // Verify that the issuer exists
        let _issuer = self.get_issuer(issuer_did).await?;

        let CreateCredentialTemplateRequest {
            name,
            description,
            schema_id,
            fields,
            evidence_required,
            extensions,
        } = request;

        // Get schema and validate
        let schema = self
            .schema_service
            .get_schema_by_id(&schema_id)
            .await?
            .ok_or_else(|| AppError::NotFoundError(format!("Schema {} not found", schema_id)))?;

        let normalized_fields: Vec<TemplateField> = fields
            .into_iter()
            .map(|mut field| {
                if field.field_type.eq_ignore_ascii_case("file") {
                    field.source = FieldSource::HolderInput;
                }
                field
            })
            .collect();

        // Validate template against schema
        validate_template_against_schema(
            &normalized_fields,
            &evidence_required,
            &extensions,
            &schema,
        )?;

        // Create template
        let now = Utc::now();
        let mut template = CredentialTemplate {
            id: format!("template-{}", uuid::Uuid::new_v4()),
            name,
            description,
            schema_id,
            issuer_did: issuer_did.to_string(),
            fields: normalized_fields,
            evidence_required,
            extensions,
            ipfs_hash: None,
            ipfs_gateway_url: None,
            created_at: now,
            updated_at: now,
            active: true,
        };

        // Upload template definition to IPFS for decentralized backup
        match self
            .ipfs
            .upload_json(&template)
            .await
        {
            Ok(ipfs_hash) => {
                let gateway_base = env::var("IPFS_GATEWAY")
                    .unwrap_or_else(|_| "https://gateway.sphyre.tech".to_string());
                let gateway_url = format!("{}/ipfs/{}", gateway_base.trim_end_matches('/'), ipfs_hash);
                template.ipfs_hash = Some(ipfs_hash.clone());
                template.ipfs_gateway_url = Some(gateway_url);
                tracing::info!("Credential template uploaded to IPFS: {}", ipfs_hash);
            }
            Err(error) => {
                tracing::warn!(
                    "Failed to upload credential template {} to IPFS: {}",
                    template.id,
                    error
                );
            }
        }

        // Save to database
        self.db
            .insert_one("credential_templates", &template)
            .await?;

        Ok(template)
    }

    /// List credential templates for an issuer
    pub async fn list_credential_templates(
        &self,
        issuer_did: &str,
    ) -> Result<Vec<HashMap<String, Value>>, AppError> {
        let templates = self
            .db
            .find_many::<HashMap<String, Value>>(
                "credential_templates",
                bson::doc! { "issuer_did": issuer_did },
            )
            .await?;

        Ok(templates)
    }

    /// Get a credential template by ID
    pub async fn get_credential_template(
        &self,
        issuer_did: &str,
        template_id: &str,
    ) -> Result<CredentialTemplate, AppError> {
        let template = self
            .db
            .find_one::<CredentialTemplate>(
                "credential_templates",
                bson::doc! { "id": template_id, "issuer_did": issuer_did },
            )
            .await?
            .ok_or_else(|| {
                AppError::NotFoundError(format!("Template with ID {} not found", template_id))
            })?;

        Ok(template)
    }

    /// Get templates by schema
    pub async fn get_templates_by_schema(
        &self,
        schema_id: &str,
    ) -> Result<Vec<CredentialTemplate>, AppError> {
        let templates = self
            .db
            .find_many::<CredentialTemplate>(
                "credential_templates",
                bson::doc! { "schema_id": schema_id, "active": true },
            )
            .await?;

        Ok(templates)
    }

    /// Get all active templates
    pub async fn get_all_templates(&self) -> Result<Vec<CredentialTemplate>, AppError> {
        let templates = self
            .db
            .find_many::<CredentialTemplate>("credential_templates", bson::doc! { "active": true })
            .await?;

        Ok(templates)
    }

    /// Get template by ID
    pub async fn get_template(
        &self,
        template_id: &str,
        issuer_did: &str,
    ) -> Result<CredentialTemplate, AppError> {
        let template = self
            .db
            .find_one::<CredentialTemplate>(
                "credential_templates",
                bson::doc! { "id": template_id, "issuer_did": issuer_did, "active": true },
            )
            .await?
            .ok_or_else(|| {
                AppError::NotFoundError(format!("Template {} not found", template_id))
            })?;

        Ok(template)
    }

    /// Get templates by schema with issuer information
    pub async fn get_templates_by_schema_with_issuer(
        &self,
        schema_id: &str,
    ) -> Result<Vec<serde_json::Value>, AppError> {
        // Get templates
        let templates = self
            .db
            .find_many::<CredentialTemplate>(
                "credential_templates",
                bson::doc! { "schema_id": schema_id, "active": true },
            )
            .await?;

        // Enrich with issuer info
        let mut enriched_templates = Vec::new();

        for template in templates {
            // Get issuer details
            let issuer = self
                .db
                .find_one::<serde_json::Value>("issuers", bson::doc! { "id": &template.issuer_did })
                .await?;

            if let Some(issuer_doc) = issuer {
                let mut template_json = serde_json::to_value(&template).map_err(|e| {
                    AppError::ValidationError(format!("Failed to serialize template: {}", e))
                })?;

                // Add issuer information
                if let Some(obj) = template_json.as_object_mut() {
                    obj.insert("issuerName".to_string(), issuer_doc["name"].clone());
                    obj.insert("issuerDomain".to_string(), issuer_doc["domain"].clone());

                    if let Some(website) = issuer_doc.get("website") {
                        obj.insert("issuerWebsite".to_string(), website.clone());
                    }

                    if let Some(logo_url) = issuer_doc.get("logo_url") {
                        obj.insert("issuerLogoUrl".to_string(), logo_url.clone());
                    }

                    if let Some(description) = issuer_doc.get("description") {
                        obj.insert("issuerDescription".to_string(), description.clone());
                    }
                }

                enriched_templates.push(template_json);
            }
        }

        Ok(enriched_templates)
    }

    /// Get all templates with issuer information
    pub async fn get_all_templates_with_issuer(&self) -> Result<Vec<serde_json::Value>, AppError> {
        // Get all templates
        let templates = self
            .db
            .find_many::<CredentialTemplate>("credential_templates", bson::doc! { "active": true })
            .await?;

        // Enrich with issuer info
        let mut enriched_templates = Vec::new();

        for template in templates {
            // Get issuer details
            let issuer = self
                .db
                .find_one::<serde_json::Value>("issuers", bson::doc! { "id": &template.issuer_did })
                .await?;

            if let Some(issuer_doc) = issuer {
                let mut template_json = serde_json::to_value(&template).map_err(|e| {
                    AppError::ValidationError(format!("Failed to serialize template: {}", e))
                })?;

                // Add issuer information
                if let Some(obj) = template_json.as_object_mut() {
                    obj.insert("issuerName".to_string(), issuer_doc["name"].clone());
                    obj.insert("issuerDomain".to_string(), issuer_doc["domain"].clone());

                    if let Some(website) = issuer_doc.get("website") {
                        obj.insert("issuerWebsite".to_string(), website.clone());
                    }

                    if let Some(logo_url) = issuer_doc.get("logo_url") {
                        obj.insert("issuerLogoUrl".to_string(), logo_url.clone());
                    }

                    if let Some(description) = issuer_doc.get("description") {
                        obj.insert("issuerDescription".to_string(), description.clone());
                    }
                }

                enriched_templates.push(template_json);
            }
        }

        Ok(enriched_templates)
    }

    /// Update a credential template
    pub async fn update_credential_template(
        &self,
        issuer_did: &str,
        template_id: &str,
        updates: HashMap<String, Value>,
    ) -> Result<CredentialTemplate, AppError> {
        // Get the existing template
        let existing_template = self
            .get_credential_template(issuer_did, template_id)
            .await?;

        // Create an update document
        let mut update_doc = bson::Document::new();

        // Add each field from the updates
        for (key, value) in updates.into_iter() {
            if key == "id" || key == "issuer_did" {
                continue;
            }

            if key == "extensions" {
                if let Value::Array(exts) = value {
                    let schema = self
                        .schema_service
                        .get_schema_by_id(&existing_template.schema_id)
                        .await?
                        .ok_or_else(|| AppError::NotFoundError("Schema not found".to_string()))?;

                    let extensions: Vec<String> = exts
                        .into_iter()
                        .filter_map(|v| v.as_str().map(|s| s.to_string()))
                        .collect();

                    validate_template_against_schema(
                        &existing_template.fields,
                        &existing_template.evidence_required,
                        &extensions,
                        &schema,
                    )?;
                    update_doc.insert("extensions", bson::to_bson(&extensions)?);
                }
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

        // Update the template in the database
        self.db
            .update_one(
                "credential_templates",
                bson::doc! { "id": template_id, "issuer_did": issuer_did },
                bson::doc! { "$set": update_doc },
            )
            .await?;

        // Get the updated template and refresh IPFS backup
        let mut updated_template = self
            .get_credential_template(issuer_did, template_id)
            .await?;

        let mut upload_snapshot = updated_template.clone();
        upload_snapshot.ipfs_hash = None;
        upload_snapshot.ipfs_gateway_url = None;

        match self.ipfs.upload_json(&upload_snapshot).await {
            Ok(ipfs_hash) => {
                let gateway_base = env::var("IPFS_GATEWAY")
                    .unwrap_or_else(|_| "https://gateway.sphyre.tech".to_string());
                let gateway_url = format!("{}/ipfs/{}", gateway_base.trim_end_matches('/'), ipfs_hash);

                updated_template.ipfs_hash = Some(ipfs_hash.clone());
                updated_template.ipfs_gateway_url = Some(gateway_url.clone());

                self.db
                    .update_one(
                        "credential_templates",
                        bson::doc! { "id": template_id, "issuer_did": issuer_did },
                        bson::doc! { "$set": {
                            "ipfs_hash": &ipfs_hash,
                            "ipfs_gateway_url": &gateway_url,
                        }},
                    )
                    .await?;

                tracing::info!(
                    "Credential template {} re-uploaded to IPFS: {}",
                    template_id,
                    ipfs_hash
                );
            }
            Err(error) => {
                tracing::warn!(
                    "Failed to refresh IPFS backup for template {}: {}",
                    template_id,
                    error
                );
            }
        }

        Ok(updated_template)
    }

    /// Delete a credential template
    pub async fn delete_credential_template(
        &self,
        issuer_did: &str,
        template_id: &str,
    ) -> Result<bool, AppError> {
        let _template = self
            .get_credential_template(issuer_did, template_id)
            .await?;

        let result = self
            .db
            .delete_one(
                "credential_templates",
                bson::doc! { "id": template_id, "issuer_did": issuer_did },
            )
            .await?;

        Ok(result)
    }

    /// Get credential requests for an issuer
    pub async fn get_credential_requests_for_issuer(
        &self,
        issuer_did: &str,
    ) -> Result<Vec<CredentialRequest>, AppError> {
        self.db.find_credential_requests_by_issuer(issuer_did).await
    }

    /// List credential requests for an issuer with filtering
    pub async fn list_credential_requests(
        &self,
        issuer_did: &str,
        params: HashMap<String, String>,
    ) -> Result<Vec<CredentialRequest>, AppError> {
        // Get all requests for this issuer
        let all_requests = self.get_credential_requests_for_issuer(issuer_did).await?;

        // Filter the requests based on the parameters
        let filtered_requests = all_requests
            .into_iter()
            .filter(|request| {
                // Filter by status if provided
                if let Some(status) = params.get("status") {
                    let status_matches = match status.as_str() {
                        "pending" => request.status == CredentialRequestStatus::Pending,
                        "approved" => request.status == CredentialRequestStatus::Approved,
                        "rejected" => request.status == CredentialRequestStatus::Rejected,
                        "issued" => request.status == CredentialRequestStatus::Issued,
                        _ => true,
                    };

                    if !status_matches {
                        return false;
                    }
                }

                // Filter by user DID if provided
                if let Some(user_did) = params.get("user_did") {
                    if request.user_did != *user_did {
                        return false;
                    }
                }

                // Filter by schema ID if provided
                if let Some(schema_id) = params.get("schema_id") {
                    if request.schema_id != *schema_id {
                        return false;
                    }
                }

                // Filter by credential type if provided
                if let Some(credential_type) = params.get("credential_type") {
                    if request.credential_type != *credential_type {
                        return false;
                    }
                }

                true
            })
            .collect::<Vec<_>>();

        Ok(filtered_requests)
    }

    /// Get credential requests for a user
    pub async fn get_credential_requests_for_user(
        &self,
        user_did: &str,
    ) -> Result<Vec<CredentialRequest>, AppError> {
        self.db.find_credential_requests_by_user(user_did).await
    }

    /// Approve a credential request
    pub async fn approve_credential_request(
        &self,
        issuer_did: &str,
        request_id: &str,
    ) -> Result<CredentialRequest, AppError> {
        // Get the credential request
        let request = self
            .get_credential_request_by_id(request_id)
            .await?
            .ok_or_else(|| {
                AppError::NotFoundError(format!(
                    "Credential request with ID {} not found",
                    request_id
                ))
            })?;

        // Verify that the request is for this issuer
        if request.issuer_did != issuer_did {
            return Err(AppError::AccessDeniedError(
                "You can only approve your own credential requests".to_string(),
            ));
        }

        // Verify that the request is pending
        if request.status != CredentialRequestStatus::Pending {
            return Err(AppError::ValidationError(format!(
                "Credential request is not pending, current status: {:?}",
                request.status
            )));
        }

        // Create a process request
        let process_request = ProcessCredentialRequestRequest {
            request_id: request_id.to_string(),
            approve: true,
            reason: None,
        };

        let issuer_private_key = "MHcCAQEEIBzFxKC2KGaw+hQLKe8GTFFGVPno0FJ2vnggh5bN0qcgoAoGCCqGSM49AwEHoUQDQgAErltVqmiDOw4C3vbWKRPunqEyoVGj5trhSopY+IPW7ksD4zeVse7CB2elgcQorS/YYcF1AL7jLX6o6p5TWHeETA";

        // Process the request
        self.process_credential_request(issuer_did, issuer_private_key, process_request)
            .await
    }

    /// Reject a credential request
    pub async fn reject_credential_request(
        &self,
        issuer_did: &str,
        request_id: &str,
        reason: Option<String>,
    ) -> Result<CredentialRequest, AppError> {
        // Get the credential request
        let request = self
            .get_credential_request_by_id(request_id)
            .await?
            .ok_or_else(|| {
                AppError::NotFoundError(format!(
                    "Credential request with ID {} not found",
                    request_id
                ))
            })?;

        // Verify that the request is for this issuer
        if request.issuer_did != issuer_did {
            return Err(AppError::AccessDeniedError(
                "You can only reject your own credential requests".to_string(),
            ));
        }

        // Verify that the request is pending
        if request.status != CredentialRequestStatus::Pending {
            return Err(AppError::ValidationError(format!(
                "Credential request is not pending, current status: {:?}",
                request.status
            )));
        }

        // Create a process request
        let process_request = ProcessCredentialRequestRequest {
            request_id: request_id.to_string(),
            approve: false,
            reason,
        };

        let issuer_private_key = "dummy_private_key";

        // Process the request
        self.process_credential_request(issuer_did, issuer_private_key, process_request)
            .await
    }

    /// Process a credential request
    pub async fn process_credential_request(
        &self,
        issuer_did: &str,
        issuer_private_key: &str,
        request: ProcessCredentialRequestRequest,
    ) -> Result<CredentialRequest, AppError> {
        // Get the credential request
        let credential_request = self
            .db
            .find_one::<CredentialRequest>(
                "credential_requests",
                bson::doc! { "id": &request.request_id },
            )
            .await?
            .ok_or_else(|| {
                AppError::NotFoundError(format!(
                    "Credential request with ID {} not found",
                    request.request_id
                ))
            })?;

        // Check if the issuer is authorized to process the request
        if credential_request.issuer_did != issuer_did {
            return Err(AppError::AccessDeniedError(
                "Only the issuer can process this credential request".to_string(),
            ));
        }

        // Check if the request is already processed
        if credential_request.status != CredentialRequestStatus::Pending {
            return Err(AppError::ValidationError(
                "Credential request has already been processed".to_string(),
            ));
        }

        // Update the request status
        let mut updated_request = credential_request.clone();
        updated_request.processed_at = Some(Utc::now());

        if request.approve {
            let extensions = if let Some(template_id) = &credential_request.template_id {
                match self.get_credential_template(issuer_did, template_id).await {
                    Ok(template) => template.extensions.clone(),
                    Err(err) => {
                        tracing::warn!(
                            "Failed to load template {} for request {}: {}",
                            template_id, credential_request.id, err
                        );
                        Vec::new()
                    }
                }
            } else {
                Vec::new()
            };

            let evidence_inputs = credential_request
                .evidence
                .iter()
                .map(|attachment| CredentialEvidenceInput {
                    label: attachment.label.clone(),
                    filename: attachment.filename.clone(),
                    ipfs_hash: attachment.ipfs_hash.clone(),
                    gateway_url: attachment.gateway_url.clone(),
                    content_type: attachment.content_type.clone(),
                    size: attachment.size,
                })
                .collect::<Vec<_>>();

            // Issue the credential
            let issue_request = IssueCredentialRequest {
                credential_type: credential_request.credential_type.clone(),
                schema_id: credential_request.schema_id.clone(),
                subject_did: Some(credential_request.user_did.clone()),
                template_id: credential_request.template_id.clone(),
                attributes: credential_request.request_data.clone(),
                expiration_date: Some(Utc::now() + Duration::days(365)),
                evidence: evidence_inputs,
                evidence_required: credential_request.evidence_required.clone(),
                extensions,
            };

            let credential_response = self
                .credential_service
                .issue_credential_with_key(issuer_did, issuer_private_key, issue_request)
                .await?;

            // Update the request with the credential ID
            updated_request.status = CredentialRequestStatus::Issued;
            updated_request.credential_id = Some(credential_response.credential.id.clone());
        } else {
            // Reject the request
            updated_request.status = CredentialRequestStatus::Rejected;
        }

        // Save the updated request
        self.db.save_credential_request(&updated_request).await?;

        Ok(updated_request)
    }

    pub async fn create_credential_offer(
        &self,
        issuer_did: &str,
        request: CreateCredentialOfferRequest,
    ) -> Result<CredentialOffer, AppError> {
        // Get template
        let template = self
            .get_credential_template(issuer_did, &request.template_id)
            .await?;

        // Validate issuer_data contains only issuer_input fields
        for (field_name, _) in &request.issuer_data {
            let field = template
                .fields
                .iter()
                .find(|f| &f.name == field_name)
                .ok_or_else(|| {
                    AppError::ValidationError(format!(
                        "Field '{}' not found in template",
                        field_name
                    ))
                })?;

            // Check field source
            if field.source != crate::models::FieldSource::IssuerInput {
                return Err(AppError::ValidationError(format!(
                    "Field '{}' is not an issuer_input field",
                    field_name
                )));
            }
        }

        // Get schema
        let schema = self
            .schema_service
            .get_schema_by_id(&template.schema_id)
            .await?
            .ok_or_else(|| AppError::NotFoundError("Schema not found".to_string()))?;

        // Build preview
        let mut preview = HashMap::new();
        preview.insert("credential_type".to_string(), json!(template.name));
        preview.insert("issuer_name".to_string(), json!(issuer_did));
        preview.insert(
            "fields_to_fill".to_string(),
            json!(template
                .fields
                .iter()
                .filter(|f| f.source == crate::models::FieldSource::HolderInput)
                .map(|f| &f.name)
                .collect::<Vec<_>>()),
        );
        if !template.extensions.is_empty() {
            preview.insert("extensions".to_string(), json!(template.extensions));
        }

        // Create offer
        let expires_at = Some(Utc::now() + Duration::hours(request.expiration_hours.unwrap_or(24)));

        let mut offer = CredentialOffer::new(
            issuer_did.to_string(),
            template.name.clone(),
            template.schema_id.clone(),
            request.template_id.clone(),
            preview,
            request.issuer_data.clone(),
            expires_at,
        );
        offer.extensions = template.extensions.clone();

        // Save offer to database
        self.db.insert_one("credential_offers", &offer).await?;

        tracing::info!(
            "Created credential offer: id={}, template={}, expires_at={:?}",
            offer.id,
            request.template_id,
            expires_at
        );

        Ok(offer)
    }

    /// Get a credential request by ID
    pub async fn get_credential_request_by_id(
        &self,
        request_id: &str,
    ) -> Result<Option<CredentialRequest>, AppError> {
        self.db
            .find_one::<CredentialRequest>("credential_requests", bson::doc! { "id": request_id })
            .await
    }

    /// Get a credential request by ID and issuer DID
    pub async fn get_credential_request(
        &self,
        issuer_did: &str,
        request_id: &str,
    ) -> Result<CredentialRequest, AppError> {
        let request = self
            .get_credential_request_by_id(request_id)
            .await?
            .ok_or_else(|| {
                AppError::NotFoundError(format!(
                    "Credential request with ID {} not found",
                    request_id
                ))
            })?;

        // Verify that the request is for this issuer
        if request.issuer_did != issuer_did {
            return Err(AppError::AccessDeniedError(
                "You can only access your own credential requests".to_string(),
            ));
        }

        Ok(request)
    }

    /// Count pending credential requests for an issuer
    pub async fn count_pending_requests(&self, issuer_did: &str) -> Result<u64, AppError> {
        let filter = bson::doc! {
            "issuer_did": issuer_did,
            "status": "pending"
        };

        let count = self
            .db
            .credential_requests()
            .count_documents(filter)
            .await
            .map_err(|e| {
                AppError::DatabaseError(format!("Failed to count pending requests: {}", e))
            })?;

        Ok(count)
    }

    /// Get recent credential requests for an issuer
    pub async fn get_recent_requests(
        &self,
        issuer_did: &str,
        limit: i64,
    ) -> Result<Vec<CredentialRequest>, AppError> {
        let filter = bson::doc! { "issuer_did": issuer_did };
        let options = mongodb::options::FindOptions::builder()
            .sort(bson::doc! { "created_at": -1 })
            .limit(limit)
            .build();

        let cursor = self
            .db
            .credential_requests()
            .find(filter)
            .await
            .map_err(|e| {
                AppError::DatabaseError(format!("Failed to get recent requests: {}", e))
            })?;

        cursor
            .try_collect()
            .await
            .map_err(|e| AppError::DatabaseError(format!("Failed to collect requests: {}", e)))
    }

    /// Get statistics for an issuer
    pub async fn get_issuer_statistics(
        &self,
        issuer_did: &str,
    ) -> Result<HashMap<String, Value>, AppError> {
        // Count total requests
        let total_requests = self
            .db
            .credential_requests()
            .count_documents(bson::doc! { "issuer_did": issuer_did })
            .await
            .map_err(|e| {
                AppError::DatabaseError(format!("Failed to count total requests: {}", e))
            })?;

        // Count pending requests
        let pending_requests = self
            .db
            .credential_requests()
            .count_documents(bson::doc! { "issuer_did": issuer_did, "status": "pending" })
            .await
            .map_err(|e| {
                AppError::DatabaseError(format!("Failed to count pending requests: {}", e))
            })?;

        // Count approved requests
        let approved_requests = self
            .db
            .credential_requests()
            .count_documents(bson::doc! { "issuer_did": issuer_did, "status": "approved" })
            .await
            .map_err(|e| {
                AppError::DatabaseError(format!("Failed to count approved requests: {}", e))
            })?;

        // Count rejected requests
        let rejected_requests = self
            .db
            .credential_requests()
            .count_documents(bson::doc! { "issuer_did": issuer_did, "status": "rejected" })
            .await
            .map_err(|e| {
                AppError::DatabaseError(format!("Failed to count rejected requests: {}", e))
            })?;

        // Count issued credentials
        let issued_credentials = self
            .db
            .credentials()
            .count_documents(bson::doc! { "issuer_did": issuer_did })
            .await
            .map_err(|e| {
                AppError::DatabaseError(format!("Failed to count issued credentials: {}", e))
            })?;

        let mut statistics = HashMap::new();
        statistics.insert("total_requests".to_string(), json!(total_requests));
        statistics.insert("pending_requests".to_string(), json!(pending_requests));
        statistics.insert("approved_requests".to_string(), json!(approved_requests));
        statistics.insert("rejected_requests".to_string(), json!(rejected_requests));
        statistics.insert("issued_credentials".to_string(), json!(issued_credentials));

        Ok(statistics)
    }

    /// Set auth hash for issuer (after seed phrase setup)
    pub async fn set_auth_hash(&self, did: &str, auth_token: &str) -> Result<(), AppError> {
        use crate::utils::auth_token;

        // Hash the auth token
        let auth_hash = auth_token::hash_auth_token(auth_token)?;

        // Update issuer with auth hash
        let now = bson::to_bson(&Utc::now()).map_err(|e| {
            AppError::ValidationError(format!("Failed to convert date to BSON: {}", e))
        })?;

        self.db
            .update_one(
                "issuers",
                bson::doc! { "id": did },
                bson::doc! { "$set": { "auth_hash": auth_hash, "updated_at": now } },
            )
            .await?;

        Ok(())
    }

    /// Authenticate issuer with auth token
    pub async fn authenticate(
        &self,
        did: &str,
        auth_token: &str,
    ) -> Result<HashMap<String, Value>, AppError> {
        use crate::utils::auth_token;

        // Get issuer
        let issuer = self.get_issuer(did).await?;

        // Check if auth_hash exists
        let stored_hash = issuer
            .get("auth_hash")
            .and_then(|v| v.as_str())
            .ok_or_else(|| {
                AppError::UnauthorizedError("No authentication set up for this issuer".to_string())
            })?;

        // Verify auth token
        if !auth_token::verify_auth_token(auth_token, stored_hash)? {
            return Err(AppError::UnauthorizedError(
                "Invalid authentication credentials".to_string(),
            ));
        }

        Ok(issuer)
    }
}
