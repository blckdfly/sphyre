use crate::db::Database;
use crate::error::AppError;
use crate::models::{CredentialOffer, CredentialRequest, CredentialRequestStatus};
pub use crate::services::credential::{CredentialService, IssueCredentialRequest};
pub use crate::services::schema::{CreateSchemaRequest, SchemaService};
use crate::utils::qr;
use chrono::{DateTime, Duration, Utc};
use futures::TryStreamExt;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::Arc;
use uuid::Uuid;

/// Create issuer request
#[derive(Debug, Deserialize)]
pub struct CreateIssuerRequest {
    pub name: String,
    pub description: Option<String>,
    pub website: Option<String>,
    pub logo_url: Option<String>,
    pub public_key: String,
}

/// Create credential template request
#[derive(Debug, Deserialize)]
pub struct CreateCredentialTemplateRequest {
    pub name: String,
    pub description: String,
    pub schema_id: String,
    pub default_values: HashMap<String, Value>,
    pub display_config: Option<HashMap<String, Value>>,
}

/// Issuer service
pub struct IssuerService {
    db: Arc<Database>,
    credential_service: CredentialService,
    schema_service: SchemaService,
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
    pub credential_type: String,
    pub schema_id: String,
    pub preview_attributes: HashMap<String, Value>,
    pub expires_at: Option<DateTime<Utc>>,
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

impl IssuerService {
    /// Create a new issuer service
    pub fn new(db: Arc<Database>, credential_service: CredentialService, schema_service: SchemaService) -> Self {
        Self {
            db,
            credential_service,
            schema_service,
        }
    }

    /// Create a new issuer
    pub async fn create_issuer(&self, request: CreateIssuerRequest) -> Result<HashMap<String, Value>, AppError> {
        // Create a new issuer document
        let now = Utc::now();
        let issuer_id = format!("did:fortro:{}", Uuid::new_v4());

        let issuer = json!({
            "id": issuer_id,
            "name": request.name,
            "description": request.description,
            "website": request.website,
            "logo_url": request.logo_url,
            "public_key": request.public_key,
            "created_at": now,
            "updated_at": now,
        });

        // Save the issuer to the database
        self.db
            .insert_one("issuers", &issuer)
            .await?;

        // Convert to HashMap for easier manipulation
        let issuer_map = serde_json::from_value::<HashMap<String, Value>>(issuer)
            .map_err(|e| AppError::ValidationError(format!("Failed to convert issuer to map: {}", e)))?;

        Ok(issuer_map)
    }

    /// Get an issuer by DID
    pub async fn get_issuer(&self, did: &str) -> Result<HashMap<String, Value>, AppError> {
        let issuer = self.db
            .find_one::<HashMap<String, Value>>("issuers", bson::doc! { "id": did })
            .await?
            .ok_or_else(|| AppError::NotFoundError(format!("Issuer with DID {} not found", did)))?;

        Ok(issuer)
    }

    /// Update an issuer
    pub async fn update_issuer(&self, did: &str, updates: HashMap<String, Value>) -> Result<HashMap<String, Value>, AppError> {

        // Create an update document
        let mut update_doc = bson::Document::new();

        // Add each field from the updates
        for (key, value) in updates {
            // Skip the id field
            if key == "id" {
                continue;
            }

            // Convert the value to BSON
            let bson_value = bson::to_bson(&value)
                .map_err(|e| AppError::ValidationError(format!("Failed to convert value to BSON: {}", e)))?;

            update_doc.insert(key, bson_value);
        }

        // Add the updated_at field
        update_doc.insert("updated_at", bson::to_bson(&Utc::now())
            .map_err(|e| AppError::ValidationError(format!("Failed to convert date to BSON: {}", e)))?);

        // Update the issuer in the database
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
    pub async fn create_credential_template(&self, issuer_did: &str, request: CreateCredentialTemplateRequest) -> Result<HashMap<String, Value>, AppError> {
        // Verify that the issuer exists
        let _issuer = self.get_issuer(issuer_did).await?;

        // Verify that the schema exists
        let _schema = self.schema_service.get_schema_by_id(&request.schema_id).await?
            .ok_or_else(|| AppError::NotFoundError(format!("Schema with ID {} not found", request.schema_id)))?;

        // Create a new template document
        let now = Utc::now();
        let template_id = Uuid::new_v4().to_string();

        let template = json!({
            "id": template_id,
            "issuer_did": issuer_did,
            "name": request.name,
            "description": request.description,
            "schema_id": request.schema_id,
            "default_values": request.default_values,
            "display_config": request.display_config,
            "created_at": now,
            "updated_at": now,
        });

        // Save the template to the database
        self.db
            .insert_one("credential_templates", &template)
            .await?;

        // Convert to HashMap for easier manipulation
        let template_map = serde_json::from_value::<HashMap<String, Value>>(template)
            .map_err(|e| AppError::ValidationError(format!("Failed to convert template to map: {}", e)))?;

        Ok(template_map)
    }

    /// List credential templates for an issuer
    pub async fn list_credential_templates(&self, issuer_did: &str) -> Result<Vec<HashMap<String, Value>>, AppError> {
        let templates = self.db
            .find_many::<HashMap<String, Value>>("credential_templates", bson::doc! { "issuer_did": issuer_did })
            .await?;

        Ok(templates)
    }

    /// Get a credential template by ID
    pub async fn get_credential_template(&self, issuer_did: &str, template_id: &str) -> Result<HashMap<String, Value>, AppError> {
        let template = self.db
            .find_one::<HashMap<String, Value>>("credential_templates", bson::doc! { "id": template_id, "issuer_did": issuer_did })
            .await?
            .ok_or_else(|| AppError::NotFoundError(format!("Template with ID {} not found", template_id)))?;

        Ok(template)
    }

    /// Update a credential template
    pub async fn update_credential_template(&self, issuer_did: &str, template_id: &str, updates: HashMap<String, Value>) -> Result<HashMap<String, Value>, AppError> {
        // Get the existing template
        let _existing_template = self.get_credential_template(issuer_did, template_id).await?;

        // Create an update document
        let mut update_doc = bson::Document::new();

        // Add each field from the updates
        for (key, value) in updates {
            if key == "id" || key == "issuer_did" {
                continue;
            }

            // Convert the value to BSON
            let bson_value = bson::to_bson(&value)
                .map_err(|e| AppError::ValidationError(format!("Failed to convert value to BSON: {}", e)))?;

            update_doc.insert(key, bson_value);
        }

        // Add the updated_at field
        update_doc.insert("updated_at", bson::to_bson(&Utc::now())
            .map_err(|e| AppError::ValidationError(format!("Failed to convert date to BSON: {}", e)))?);

        // Update the template in the database
        self.db
            .update_one(
                "credential_templates",
                bson::doc! { "id": template_id, "issuer_did": issuer_did },
                bson::doc! { "$set": update_doc },
            )
            .await?;

        // Get the updated template
        self.get_credential_template(issuer_did, template_id).await
    }

    /// Delete a credential template
    pub async fn delete_credential_template(&self, issuer_did: &str, template_id: &str) -> Result<bool, AppError> {
        // Verify that the template exists and belongs to the issuer
        let _template = self.get_credential_template(issuer_did, template_id).await?;

        // Delete the template from the database
        let result = self.db
            .delete_one("credential_templates", bson::doc! { "id": template_id, "issuer_did": issuer_did })
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
        let filtered_requests = all_requests.into_iter().filter(|request| {
            // Filter by status if provided
            if let Some(status) = params.get("status") {
                let status_matches = match status.as_str() {
                    "pending" => request.status == CredentialRequestStatus::Pending,
                    "approved" => request.status == CredentialRequestStatus::Approved,
                    "rejected" => request.status == CredentialRequestStatus::Rejected,
                    "issued" => request.status == CredentialRequestStatus::Issued,
                    _ => true, // Invalid status, don't filter
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
        }).collect::<Vec<_>>();

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
        let request = self.get_credential_request_by_id(request_id).await?
            .ok_or_else(|| AppError::NotFoundError(format!("Credential request with ID {} not found", request_id)))?;

        // Verify that the request is for this issuer
        if request.issuer_did != issuer_did {
            return Err(AppError::AccessDeniedError("You can only approve your own credential requests".to_string()));
        }

        // Verify that the request is pending
        if request.status != CredentialRequestStatus::Pending {
            return Err(AppError::ValidationError(format!("Credential request is not pending, current status: {:?}", request.status)));
        }

        // Create a process request
        let process_request = ProcessCredentialRequestRequest {
            request_id: request_id.to_string(),
            approve: true,
            reason: None,
        };

        let issuer_private_key = "dummy_private_key";

        // Process the request
        self.process_credential_request(issuer_did, issuer_private_key, process_request).await
    }

    /// Reject a credential request
    pub async fn reject_credential_request(
        &self,
        issuer_did: &str,
        request_id: &str,
        reason: Option<String>,
    ) -> Result<CredentialRequest, AppError> {
        // Get the credential request
        let request = self.get_credential_request_by_id(request_id).await?
            .ok_or_else(|| AppError::NotFoundError(format!("Credential request with ID {} not found", request_id)))?;

        // Verify that the request is for this issuer
        if request.issuer_did != issuer_did {
            return Err(AppError::AccessDeniedError("You can only reject your own credential requests".to_string()));
        }

        // Verify that the request is pending
        if request.status != CredentialRequestStatus::Pending {
            return Err(AppError::ValidationError(format!("Credential request is not pending, current status: {:?}", request.status)));
        }

        // Create a process request
        let process_request = ProcessCredentialRequestRequest {
            request_id: request_id.to_string(),
            approve: false,
            reason,
        };

        let issuer_private_key = "dummy_private_key";

        // Process the request
        self.process_credential_request(issuer_did, issuer_private_key, process_request).await
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
            .find_one::<CredentialRequest>("credential_requests", bson::doc! { "id": &request.request_id })
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
            // Issue the credential
            let issue_request = IssueCredentialRequest {
                credential_type: credential_request.credential_type.clone(),
                schema_id: credential_request.schema_id.clone(),
                subject_did: credential_request.user_did.clone(),
                attributes: credential_request.request_data.clone(),
                expiration_date: Some(Utc::now() + Duration::days(365)), // Default to 1 year
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

    /// Create a credential offer
    pub async fn create_credential_offer(
        &self,
        issuer_did: &str,
        request: CreateCredentialOfferRequest,
        callback_url: Option<String>,
    ) -> Result<CredentialOfferResponse, AppError> {
        // Create a new credential offer
        let offer = CredentialOffer::new(
            issuer_did.to_string(),
            request.credential_type.clone(),
            request.schema_id.clone(),
            request.preview_attributes.clone(),
            request.expires_at,
        );

        // Create a QR code for the offer
        let qr_content = qr::create_credential_offer_qr(&offer, callback_url)?;
        let qr_code_data = qr_content.to_json_string()?;

        Ok(CredentialOfferResponse {
            offer,
            qr_code_data,
        })
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
        let request = self.get_credential_request_by_id(request_id).await?
            .ok_or_else(|| AppError::NotFoundError(format!("Credential request with ID {} not found", request_id)))?;

        // Verify that the request is for this issuer
        if request.issuer_did != issuer_did {
            return Err(AppError::AccessDeniedError("You can only access your own credential requests".to_string()));
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
    pub async fn get_issuer_statistics(&self, issuer_did: &str) -> Result<HashMap<String, Value>, AppError> {
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
            .count_documents(
                bson::doc! { "issuer_did": issuer_did, "status": "pending" },
            )
            .await
            .map_err(|e| {
                AppError::DatabaseError(format!("Failed to count pending requests: {}", e))
            })?;

        // Count approved requests
        let approved_requests = self
            .db
            .credential_requests()
            .count_documents(
                bson::doc! { "issuer_did": issuer_did, "status": "approved" },
            )
            .await
            .map_err(|e| {
                AppError::DatabaseError(format!("Failed to count approved requests: {}", e))
            })?;

        // Count rejected requests
        let rejected_requests = self
            .db
            .credential_requests()
            .count_documents(
                bson::doc! { "issuer_did": issuer_did, "status": "rejected" },
            )
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
}
