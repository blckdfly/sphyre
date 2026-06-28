use crate::blockchain_legacy::EthereumClient;
use crate::db::Database;
use crate::error::AppError;
use crate::models::{AttributeDataType, Schema, SchemaAttribute};
use crate::utils::crypto;
use chrono::Utc;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::sync::Arc;

use crate::ipfs::IpfsClient;

/// Schema service
pub struct SchemaService {
    db: Arc<Database>,
    ipfs: Arc<IpfsClient>,
    blockchain: Arc<EthereumClient>,
}

/// Create schema request
#[derive(Debug, Deserialize)]
pub struct CreateSchemaRequest {
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    pub version: String,
    pub attributes: Vec<SchemaAttributeRequest>,

    // Extensions support
    #[serde(default)]
    pub extensions_allowed: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub allowed_extensions: Option<Vec<String>>,

    // Evidence support
    #[serde(default)]
    pub evidence_allowed: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub allowed_evidence: Option<Vec<String>>,
}

/// Schema attribute request
#[derive(Debug, Deserialize)]
pub struct SchemaAttributeRequest {
    pub name: String,
    pub data_type: AttributeDataType,
    pub description: String,
    pub required: bool,
}

/// Schema response
#[derive(Debug, Serialize)]
pub struct SchemaResponse {
    pub schema: Schema,
    pub blockchain_tx: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub on_chain: Option<bool>,
}

/// Validate credential against schema request
#[derive(Debug, Deserialize)]
pub struct ValidateCredentialRequest {
    pub schema_id: String,
    pub credential_data: HashMap<String, Value>,
}

/// Validation result
#[derive(Debug, Serialize)]
pub struct ValidationResult {
    pub is_valid: bool,
    pub errors: Vec<String>,
}

impl SchemaService {
    /// Create a new schema service
    pub fn new(db: Arc<Database>, ipfs: Arc<IpfsClient>, blockchain: Arc<EthereumClient>) -> Self {
        Self {
            db,
            ipfs,
            blockchain,
        }
    }

    /// Create a new schema
    pub async fn create_schema(
        &self,
        issuer_did: &str,
        request: CreateSchemaRequest,
    ) -> Result<SchemaResponse, AppError> {
        let attributes = request
            .attributes
            .into_iter()
            .map(|attr| SchemaAttribute {
                name: attr.name,
                data_type: attr.data_type,
                description: attr.description,
                required: attr.required,
                pattern: None,
                min_length: None,
                max_length: None,
                enum_values: None,
            })
            .collect();

        // Create a new schema
        let now = Utc::now();
        let schema_id = format!("{}:{}:{}", issuer_did, request.name, request.version);

        let schema = Schema {
            id: schema_id.clone(),
            name: request.name,
            description: request.description,
            version: request.version,
            issuer_did: issuer_did.to_string(),
            attributes,
            extensions_allowed: request.extensions_allowed.unwrap_or(false),
            allowed_extensions: request.allowed_extensions,
            evidence_allowed: request.evidence_allowed.unwrap_or(false),
            allowed_evidence: request.allowed_evidence,
            ipfs_hash: None,
            ipfs_gateway_url: None,
            created_at: now,
            updated_at: now,
            blockchain_tx: None,
            on_chain: false,
        };

        // Register the schema on the blockchain
        let schema_json = serde_json::to_string(&schema)
            .map_err(|e| AppError::ValidationError(format!("Failed to serialize schema: {}", e)))?;

        let schema_hash = crypto::hash_to_hex(schema_json.as_bytes());

        let blockchain_tx = match self
            .blockchain
            .register_schema(&schema_id, &schema_hash)
            .await
        {
            Ok(tx_hash) => Some(tx_hash.to_string()),
            Err(e) => {
                tracing::warn!("Failed to register schema on blockchain: {}", e);
                None
            }
        };

        tracing::info!("Uploading schema to IPFS for decentralized backup...");
        let mut schema_updated = schema.clone();

        match self.ipfs.upload(schema_json.as_bytes()).await {
            Ok(ipfs_hash) => {
                // Use configured gateway URL
                let gateway_base = std::env::var("IPFS_GATEWAY")
                    .unwrap_or_else(|_| "https://gateway.sphyre.tech".to_string());
                let gateway_url = format!("{}/ipfs/{}", gateway_base, ipfs_hash);
                schema_updated.ipfs_hash = Some(ipfs_hash.clone());
                schema_updated.ipfs_gateway_url = Some(gateway_url.clone());
                tracing::info!(
                    "Schema uploaded to IPFS: {} (Gateway: {})",
                    ipfs_hash,
                    gateway_url
                );
            }
            Err(e) => {
                tracing::warn!(
                    "Failed to upload schema to IPFS: {}. Continuing without IPFS backup.",
                    e
                );
            }
        };

        if let Some(ref tx_hash) = blockchain_tx {
            schema_updated.blockchain_tx = Some(tx_hash.clone());
            schema_updated.on_chain = true;
            tracing::info!("Schema blockchain_tx will be saved: {}", tx_hash);
        }

        self.db.insert_one("schemas", &schema_updated).await?;

        Ok(SchemaResponse {
            schema: schema_updated.clone(),
            blockchain_tx: blockchain_tx.clone(),
            id: Some(schema_updated.id.clone()),
            on_chain: Some(blockchain_tx.is_some()),
        })
    }

    /// Get a schema by ID
    pub async fn get_schema_by_id(&self, id: &str) -> Result<Option<Schema>, AppError> {
        self.db
            .find_one::<Schema>("schemas", mongodb::bson::doc! { "id": id })
            .await
    }

    /// Get schemas by issuer
    pub async fn get_schemas_by_issuer(&self, issuer_did: &str) -> Result<Vec<Schema>, AppError> {
        self.db
            .find_many::<Schema>("schemas", mongodb::bson::doc! { "issuer_did": issuer_did })
            .await
    }

    /// List schemas by issuer
    pub async fn list_schemas_by_issuer(&self, issuer_did: &str) -> Result<Vec<Schema>, AppError> {
        self.get_schemas_by_issuer(issuer_did).await
    }

    /// Validate credential data against a schema
    pub async fn validate_credential(
        &self,
        request: ValidateCredentialRequest,
    ) -> Result<ValidationResult, AppError> {
        let mut errors = Vec::new();
        let mut is_valid = true;

        // Get the schema
        let schema = self
            .get_schema_by_id(&request.schema_id)
            .await?
            .ok_or_else(|| {
                AppError::NotFoundError(format!("Schema with ID {} not found", request.schema_id))
            })?;

        // Check required attributes
        for attr in &schema.attributes {
            if attr.required && !request.credential_data.contains_key(&attr.name) {
                errors.push(format!("Required attribute {} is missing", attr.name));
                is_valid = false;
            }
        }

        // Validate attribute types
        for (name, value) in &request.credential_data {
            if let Some(attr) = schema.attributes.iter().find(|a| &a.name == name) {
                match attr.data_type {
                    AttributeDataType::String => {
                        if !value.is_string() {
                            errors.push(format!("Attribute {} must be a string", name));
                            is_valid = false;
                        }
                    }
                    AttributeDataType::Number => {
                        if !value.is_number() {
                            errors.push(format!("Attribute {} must be a number", name));
                            is_valid = false;
                        }
                    }
                    AttributeDataType::Boolean => {
                        if !value.is_boolean() {
                            errors.push(format!("Attribute {} must be a boolean", name));
                            is_valid = false;
                        }
                    }
                    AttributeDataType::Date => {
                        if !value.is_string() {
                            errors.push(format!("Attribute {} must be a date string", name));
                            is_valid = false;
                        } else if let Some(date_str) = value.as_str() {
                            if chrono::DateTime::parse_from_rfc3339(date_str).is_err() {
                                errors.push(format!(
                                    "Attribute {} must be a valid RFC3339 date",
                                    name
                                ));
                                is_valid = false;
                            }
                        }
                    }
                    AttributeDataType::Object => {
                        if !value.is_object() {
                            errors.push(format!("Attribute {} must be an object", name));
                            is_valid = false;
                        }
                    }
                    AttributeDataType::Array => {
                        if !value.is_array() {
                            errors.push(format!("Attribute {} must be an array", name));
                            is_valid = false;
                        }
                    }
                    AttributeDataType::Email => {
                        if !value.is_string() {
                            errors.push(format!("Attribute {} must be an email string", name));
                            is_valid = false;
                        }
                    }
                    AttributeDataType::Url => {
                        if !value.is_string() {
                            errors.push(format!("Attribute {} must be a URL string", name));
                            is_valid = false;
                        }
                    }
                    AttributeDataType::File => {
                        if !value.is_string() {
                            errors
                                .push(format!("Attribute {} must be a file path/URL string", name));
                            is_valid = false;
                        }
                    }
                }
            } else {
                // Unknown attribute
                errors.push(format!("Attribute {} is not defined in the schema", name));
                is_valid = false;
            }
        }

        Ok(ValidationResult { is_valid, errors })
    }

    /// Update a schema
    pub async fn update_schema(
        &self,
        issuer_did: &str,
        schema_id: &str,
        request: CreateSchemaRequest,
    ) -> Result<SchemaResponse, AppError> {
        // Get the existing schema
        let existing_schema = self.get_schema_by_id(schema_id).await?.ok_or_else(|| {
            AppError::NotFoundError(format!("Schema with ID {} not found", schema_id))
        })?;

        // Check if the issuer is authorized to update the schema
        if existing_schema.issuer_did != issuer_did {
            return Err(AppError::AccessDeniedError(
                "Only the issuer can update the schema".to_string(),
            ));
        }

        // Convert attributes
        let attributes = request
            .attributes
            .into_iter()
            .map(|attr| SchemaAttribute {
                name: attr.name,
                data_type: attr.data_type,
                description: attr.description,
                required: attr.required,
                pattern: None,
                min_length: None,
                max_length: None,
                enum_values: None,
            })
            .collect();

        // Create an updated schema
        let now = Utc::now();
        let new_schema_id = format!("{}:{}:{}", issuer_did, request.name, request.version);

        let extensions_allowed = request
            .extensions_allowed
            .unwrap_or(existing_schema.extensions_allowed);
        let allowed_extensions = if extensions_allowed {
            request
                .allowed_extensions
                .or(existing_schema.allowed_extensions)
        } else {
            None
        };

        let evidence_allowed = request
            .evidence_allowed
            .unwrap_or(existing_schema.evidence_allowed);
        let allowed_evidence = if evidence_allowed {
            request
                .allowed_evidence
                .or(existing_schema.allowed_evidence)
        } else {
            None
        };

        let schema = Schema {
            id: new_schema_id.clone(),
            name: request.name,
            description: request.description.or(existing_schema.description),
            version: request.version,
            issuer_did: issuer_did.to_string(),
            attributes,
            extensions_allowed,
            allowed_extensions,
            evidence_allowed,
            allowed_evidence,
            ipfs_hash: existing_schema.ipfs_hash,
            ipfs_gateway_url: existing_schema.ipfs_gateway_url,
            created_at: existing_schema.created_at,
            updated_at: now,
            blockchain_tx: None,
            on_chain: false,
        };

        // Save the schema to the database
        let schema_doc = mongodb::bson::to_document(&schema).map_err(|e| {
            AppError::ValidationError(format!("Failed to convert schema to document: {}", e))
        })?;

        self.db
            .update_one(
                "schemas",
                mongodb::bson::doc! { "id": schema_id },
                mongodb::bson::doc! { "$set": schema_doc },
            )
            .await?;

        // Register the updated schema on the blockchain
        let schema_json = serde_json::to_string(&schema)
            .map_err(|e| AppError::ValidationError(format!("Failed to serialize schema: {}", e)))?;

        let schema_hash = crypto::hash_to_hex(schema_json.as_bytes());

        let blockchain_tx = match self
            .blockchain
            .register_schema(&new_schema_id, &schema_hash)
            .await
        {
            Ok(tx_hash) => Some(tx_hash.to_string()),
            Err(e) => {
                tracing::warn!("Failed to register schema on blockchain: {}", e);
                None
            }
        };

        if let Some(ref tx_hash) = blockchain_tx {
            let _ = self
                .db
                .update_one(
                    "schemas",
                    mongodb::bson::doc! { "id": &new_schema_id },
                    mongodb::bson::doc! {
                        "$set": {
                            "blockchain_tx": tx_hash,
                            "on_chain": true,
                        }
                    },
                )
                .await;
            tracing::info!("Schema blockchain_tx updated in DB: {}", tx_hash);
        }

        Ok(SchemaResponse {
            schema: schema.clone(),
            blockchain_tx: blockchain_tx.clone(),
            id: Some(schema.id.clone()),
            on_chain: Some(blockchain_tx.is_some()),
        })
    }

    /// Delete a schema
    pub async fn delete_schema(&self, issuer_did: &str, schema_id: &str) -> Result<bool, AppError> {
        // Get the existing schema
        let existing_schema = self.get_schema_by_id(schema_id).await?.ok_or_else(|| {
            AppError::NotFoundError(format!("Schema with ID {} not found", schema_id))
        })?;

        // Check if the issuer is authorized to delete the schema
        if existing_schema.issuer_did != issuer_did {
            return Err(AppError::AccessDeniedError(
                "Only the issuer can delete the schema".to_string(),
            ));
        }

        // Delete the schema from the database
        self.db
            .delete_one("schemas", mongodb::bson::doc! { "id": schema_id })
            .await
    }

    /// Search schemas
    pub async fn search_schemas(&self, query: &str) -> Result<Vec<Schema>, AppError> {
        let regex_query = format!(".*{}.*", regex::escape(query));

        let filter = mongodb::bson::doc! {
            "$or": [
                { "name": { "$regex": &regex_query, "$options": "i" } },
                { "id": { "$regex": &regex_query, "$options": "i" } },
                { "attributes.name": { "$regex": &regex_query, "$options": "i" } }
            ]
        };

        self.db.find_many("schemas", filter).await
    }

    /// Verify schema on blockchain
    pub async fn verify_schema_on_blockchain(&self, schema_id: &str) -> Result<bool, AppError> {
        // Get the schema
        let schema = self.get_schema_by_id(schema_id).await?.ok_or_else(|| {
            AppError::NotFoundError(format!("Schema with ID {} not found", schema_id))
        })?;

        // Get the schema hash from the blockchain
        let blockchain_hash = self.blockchain.get_schema_hash(schema_id).await?;

        // Calculate the hash of the schema
        let schema_json = serde_json::to_string(&schema)
            .map_err(|e| AppError::ValidationError(format!("Failed to serialize schema: {}", e)))?;

        let schema_hash = crypto::hash_to_hex(schema_json.as_bytes());

        // Compare the hashes
        Ok(blockchain_hash == schema_hash)
    }
}
