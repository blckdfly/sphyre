use crate::blockchain::EthereumClient;
use crate::db::Database;
use crate::error::AppError;
use crate::models::{AttributeDataType, Schema, SchemaAttribute};
use crate::utils::crypto;
use chrono::Utc;
use serde::{Deserialize, Serialize};
use serde_json::{Value};
use std::collections::HashMap;
use std::sync::Arc;

/// Schema service
pub struct SchemaService {
    db: Arc<Database>,
    blockchain: Arc<EthereumClient>,
}

/// Create schema request
#[derive(Debug, Deserialize)]
pub struct CreateSchemaRequest {
    pub name: String,
    pub version: String,
    pub attributes: Vec<SchemaAttributeRequest>,
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
    pub fn new(db: Arc<Database>, blockchain: Arc<EthereumClient>) -> Self {
        Self { db, blockchain }
    }

    /// Create a new schema
    pub async fn create_schema(
        &self,
        issuer_did: &str,
        request: CreateSchemaRequest,
    ) -> Result<SchemaResponse, AppError> {
        // Convert attributes
        let attributes = request
            .attributes
            .into_iter()
            .map(|attr| SchemaAttribute {
                name: attr.name,
                data_type: attr.data_type,
                description: attr.description,
                required: attr.required,
            })
            .collect();

        // Create a new schema
        let now = Utc::now();
        let schema_id = format!("{}:{}:{}", issuer_did, request.name, request.version);

        let schema = Schema {
            id: schema_id.clone(),
            name: request.name,
            version: request.version,
            issuer_did: issuer_did.to_string(),
            attributes,
            created_at: now,
            updated_at: now,
        };

        // Save the schema to the database
        self.db
            .insert_one("schemas", &schema)
            .await?;

        // Register the schema on the blockchain
        let schema_json = serde_json::to_string(&schema)
            .map_err(|e| AppError::ValidationError(format!("Failed to serialize schema: {}", e)))?;

        let schema_hash = crypto::hash_to_hex(schema_json.as_bytes());

        let blockchain_tx = match self.blockchain.register_schema(&schema_id, &schema_hash).await {
            Ok(tx_hash) => Some(tx_hash.to_string()),
            Err(e) => {
                tracing::warn!("Failed to register schema on blockchain: {}", e);
                None
            }
        };

        Ok(SchemaResponse {
            schema,
            blockchain_tx,
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

    /// List schemas by issuer (alias for get_schemas_by_issuer)
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
                }
            } else {
                // Unknown attribute - not in schema
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
        let existing_schema = self
            .get_schema_by_id(schema_id)
            .await?
            .ok_or_else(|| {
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
            })
            .collect();

        // Create an updated schema
        let now = Utc::now();
        let new_schema_id = format!("{}:{}:{}", issuer_did, request.name, request.version);

        let schema = Schema {
            id: new_schema_id.clone(),
            name: request.name,
            version: request.version,
            issuer_did: issuer_did.to_string(),
            attributes,
            created_at: existing_schema.created_at,
            updated_at: now,
        };

        // Save the schema to the database
        let schema_doc = mongodb::bson::to_document(&schema)
            .map_err(|e| AppError::ValidationError(format!("Failed to convert schema to document: {}", e)))?;

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

        let blockchain_tx = match self.blockchain.register_schema(&new_schema_id, &schema_hash).await {
            Ok(tx_hash) => Some(tx_hash.to_string()),
            Err(e) => {
                tracing::warn!("Failed to register schema on blockchain: {}", e);
                None
            }
        };

        Ok(SchemaResponse {
            schema,
            blockchain_tx,
        })
    }

    /// Delete a schema
    pub async fn delete_schema(&self, issuer_did: &str, schema_id: &str) -> Result<bool, AppError> {
        // Get the existing schema
        let existing_schema = self
            .get_schema_by_id(schema_id)
            .await?
            .ok_or_else(|| {
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
        // Create a case-insensitive regex search
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
        let schema = self
            .get_schema_by_id(schema_id)
            .await?
            .ok_or_else(|| {
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
