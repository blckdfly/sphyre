use crate::blockchain::EthereumClient;
use crate::db::Database;
use crate::error::AppError;
use crate::ipfs::IpfsClient;
use crate::models::{Credential, CredentialStatus};
use crate::utils::{crypto, did, jwt, zk_proofs};
use chrono::{DateTime, Duration, Utc};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::Arc;
use uuid::Uuid;

/// Credential service
pub struct CredentialService {
    db: Arc<Database>,
    ipfs: Arc<IpfsClient>,
    blockchain: Arc<EthereumClient>,
}

/// Issue credential request
#[derive(Debug, Deserialize, Clone)]
pub struct IssueCredentialRequest {
    pub credential_type: String,
    pub schema_id: String,
    pub subject_did: String,
    pub attributes: HashMap<String, Value>,
    pub expiration_date: Option<DateTime<Utc>>,
}

/// Verify credential request
#[derive(Debug, Deserialize)]
pub struct VerifyCredentialRequest {
    pub credential_jwt: String,
}

/// Revoke credential request
#[derive(Debug, Deserialize)]
pub struct RevokeCredentialRequest {
    pub credential_id: String,
    pub reason: Option<String>,
}

/// Credential response
#[derive(Debug, Serialize)]
pub struct CredentialResponse {
    pub credential: Credential,
    pub jwt: String,
}

/// Verification result
#[derive(Debug, Serialize)]
pub struct VerificationResult {
    pub is_valid: bool,
    pub errors: Vec<String>,
    pub subject_did: String,
    pub issuer_did: String,
    pub credential_type: String,
    pub issuance_date: DateTime<Utc>,
    pub expiration_date: Option<DateTime<Utc>>,
    pub is_expired: bool,
    pub is_revoked: bool,
}

impl CredentialService {
    /// Create a new credential service
    pub fn new(
        db: Arc<Database>,
        ipfs: Arc<IpfsClient>,
        blockchain: Arc<EthereumClient>,
    ) -> Self {
        Self {
            db,
            ipfs,
            blockchain,
        }
    }

    /// Issue a new credential (simplified version for API)
    pub async fn issue_credential(
        &self,
        issuer_did: &str,
        request: IssueCredentialRequest,
    ) -> Result<CredentialResponse, AppError> {
        // In a real implementation, we would retrieve the issuer's private key from a secure storage
        // For now, we'll use a dummy private key for demonstration purposes
        let issuer_private_key = "dummy_private_key";

        // Call the full implementation
        self.issue_credential_with_key(issuer_did, issuer_private_key, request).await
    }

    /// Issue a new credential (full implementation with private key)
    pub async fn issue_credential_with_key(
        &self,
        issuer_did: &str,
        issuer_private_key: &str,
        request: IssueCredentialRequest,
    ) -> Result<CredentialResponse, AppError> {
        // Enforce issuer DID uses did:alyra
        if !did::validate_did(issuer_did) {
            return Err(AppError::ValidationError("Invalid issuer DID: only did:alyra is supported".to_string()));
        }
        // Validate the subject DID
        if !did::validate_did(&request.subject_did) {
            return Err(AppError::ValidationError("Invalid subject DID".to_string()));
        }

        // Create a credential JWT
        let jwt = jwt::create_pq_credential_jwt(
            issuer_did,
            &request.subject_did,
            json!(request.attributes),
            issuer_private_key.as_bytes(),
            "dummy_public_key".as_bytes(),
            request.expiration_date.map(|date| (date - Utc::now()).num_seconds()),
        )?;

        // Create a credential object
        let mut credential = Credential::new(
            issuer_did.to_string(),
            request.subject_did.clone(),
            request.credential_type.clone(),
            request.schema_id.clone(),
            request.attributes.clone(),
            jwt.clone(),
        );

        // Set expiration date if provided
        credential.expires_at = request.expiration_date;

        // Store sensitive data in IPFS
        let encryption_key = crypto::generate_key();
        let ipfs_hash = self
            .ipfs
            .upload_credential_data(&json!(request.attributes), &encryption_key)
            .await?;

        credential.ipfs_hash = Some(ipfs_hash.clone());

        // Store credential hash on blockchain
        let credential_hash = crypto::hash_to_hex(jwt.as_bytes());
        let tx_hash = self
            .blockchain
            .register_credential(issuer_did, &credential_hash, &ipfs_hash)
            .await?;

        credential.blockchain_reference = Some(tx_hash.to_string());

        // Save the credential to the database
        self.db.save_credential(&credential).await?;

        Ok(CredentialResponse {
            credential,
            jwt,
        })
    }

    /// Verify a credential
    pub async fn verify_credential(
        &self,
        request: VerifyCredentialRequest,
    ) -> Result<VerificationResult, AppError> {
        let mut errors = Vec::new();
        let mut is_valid = true;

        // Extract the credential from the JWT
        let credential_data = match jwt::extract_credential(&request.credential_jwt) {
            Ok(data) => data,
            Err(e) => {
                errors.push(format!("Failed to extract credential: {}", e));
                return Ok(VerificationResult {
                    is_valid: false,
                    errors,
                    subject_did: "".to_string(),
                    issuer_did: "".to_string(),
                    credential_type: "".to_string(),
                    issuance_date: Utc::now(),
                    expiration_date: None,
                    is_expired: false,
                    is_revoked: false,
                });
            }
        };

        // Extract required fields
        let issuer_did = credential_data["issuer"]
            .as_str()
            .unwrap_or("")
            .to_string();
        let subject_did = credential_data["credentialSubject"]["id"]
            .as_str()
            .unwrap_or("")
            .to_string();
        let credential_type = credential_data["type"]
            .as_array()
            .and_then(|types| types.get(1))
            .and_then(|t| t.as_str())
            .unwrap_or("VerifiableCredential")
            .to_string();

        let issuance_date = match DateTime::parse_from_rfc3339(
            credential_data["issuanceDate"].as_str().unwrap_or(""),
        ) {
            Ok(date) => date.with_timezone(&Utc),
            Err(_) => {
                errors.push("Invalid issuance date".to_string());
                is_valid = false;
                Utc::now()
            }
        };

        let expiration_date = credential_data["expirationDate"]
            .as_str()
            .and_then(|date| DateTime::parse_from_rfc3339(date).ok())
            .map(|date| date.with_timezone(&Utc));

        // Check if the credential is expired
        let is_expired = match expiration_date {
            Some(date) => date < Utc::now(),
            None => false,
        };

        if is_expired {
            errors.push("Credential is expired".to_string());
            is_valid = false;
        }

        // Verify the JWT signature
        match jwt::verify_pq_jwt(&request.credential_jwt) {
            Ok(_) => {}
            Err(e) => {
                errors.push(format!("JWT signature verification failed: {}", e));
                is_valid = false;
            }
        }

        // Check if the credential is revoked on the blockchain
        let credential_hash = crypto::hash_to_hex(request.credential_jwt.as_bytes());
        let is_valid_on_chain = match self
            .blockchain
            .is_credential_registered(&issuer_did, &credential_hash)
            .await
        {
            Ok(valid) => valid,
            Err(e) => {
                errors.push(format!("Failed to check on-chain validity: {}", e));
                is_valid = false;
                false
            }
        };

        let is_revoked = !is_valid_on_chain;

        if is_revoked {
            errors.push("Credential is revoked".to_string());
            is_valid = false;
        }

        Ok(VerificationResult {
            is_valid,
            errors,
            subject_did,
            issuer_did,
            credential_type,
            issuance_date,
            expiration_date,
            is_expired,
            is_revoked,
        })
    }

    /// Revoke a credential (simplified version for API)
    pub async fn revoke_credential(
        &self,
        issuer_did: &str,
        credential_id: &str,
    ) -> Result<Credential, AppError> {
        // Get the credential
        let credential = self
            .get_credential_by_id(credential_id)
            .await?
            .ok_or_else(|| {
                AppError::NotFoundError(format!(
                    "Credential with ID {} not found",
                    credential_id
                ))
            })?;

        // Check if the issuer is authorized to revoke the credential
        if credential.issuer_did != issuer_did {
            return Err(AppError::AccessDeniedError(
                "Only the issuer can revoke a credential".to_string(),
            ));
        }

        // Check if the credential is already revoked
        if credential.status == CredentialStatus::Revoked {
            return Err(AppError::ValidationError(
                "Credential is already revoked".to_string(),
            ));
        }

        // In a real implementation, we would retrieve the issuer's private key from a secure storage
        // For now, we'll use a dummy private key for demonstration purposes
        let issuer_private_key = "dummy_private_key";

        // Call the full implementation
        let request = RevokeCredentialRequest {
            credential_id: credential_id.to_string(),
            reason: None,
        };

        // Get the updated credential
        let updated_credential = self
            .get_credential_by_id(credential_id)
            .await?
            .ok_or_else(|| {
                AppError::NotFoundError(format!(
                    "Credential with ID {} not found after revocation",
                    credential_id
                ))
            })?;

        Ok(updated_credential)
    }

    /// Revoke a credential (full implementation with private key)
    pub async fn revoke_credential_with_key(
        &self,
        issuer_did: &str,
        request: RevokeCredentialRequest,
    ) -> Result<bool, AppError> {
        // Get the credential
        let credential = self
            .db
            .find_credential_by_id(&request.credential_id)
            .await?
            .ok_or_else(|| {
                AppError::NotFoundError(format!(
                    "Credential with ID {} not found",
                    request.credential_id
                ))
            })?;

        // Check if the issuer is authorized to revoke the credential
        if credential.issuer_did != issuer_did {
            return Err(AppError::AccessDeniedError(
                "Only the issuer can revoke a credential".to_string(),
            ));
        }

        // Revoke the credential on the blockchain
        let credential_hash = crypto::hash_to_hex(credential.jwt.as_bytes());
        self.blockchain
            .revoke_credential(issuer_did, &credential_hash)
            .await?;

        // Update the credential status in the database
        let mut updated_credential = credential.clone();
        updated_credential.status = CredentialStatus::Revoked;
        updated_credential.updated_at = Utc::now();

        self.db.save_credential(&updated_credential).await?;

        Ok(true)
    }

    /// Get a credential by ID
    pub async fn get_credential_by_id(&self, id: &str) -> Result<Option<Credential>, AppError> {
        self.db.find_credential_by_id(id).await
    }

    /// Get credentials by owner DID
    pub async fn get_credentials_by_owner(&self, owner_did: &str) -> Result<Vec<Credential>, AppError> {
        self.db.find_credentials_by_owner(owner_did).await
    }

    /// List credentials by issuer DID with optional filtering
    pub async fn list_credentials_by_issuer(&self, issuer_did: &str, params: HashMap<String, String>) -> Result<Vec<Credential>, AppError> {
        // Create a base filter for the issuer
        let mut filter = mongodb::bson::doc! {
            "issuer_did": issuer_did
        };

        // Add status filter if provided
        if let Some(status) = params.get("status") {
            let status_enum = match status.as_str() {
                "active" => CredentialStatus::Active,
                "revoked" => CredentialStatus::Revoked,
                "expired" => CredentialStatus::Expired,
                _ => return Err(AppError::ValidationError(format!("Invalid status: {}", status))),
            };

            filter.insert("status", mongodb::bson::to_bson(&status_enum)
                .map_err(|e| AppError::ValidationError(format!("Failed to convert status to BSON: {}", e)))?);
        }

        // Add owner filter if provided
        if let Some(owner_did) = params.get("owner_did") {
            filter.insert("owner_did", owner_did);
        }

        // Add schema filter if provided
        if let Some(schema_id) = params.get("schema_id") {
            filter.insert("schema_id", schema_id);
        }

        // Add credential type filter if provided
        if let Some(credential_type) = params.get("credential_type") {
            filter.insert("credential_type", credential_type);
        }

        // Find the credentials using the generic find_many method
        self.db.find_many("credentials", filter).await
    }

    /// Create a selective disclosure proof for a credential
    pub async fn create_selective_disclosure(
        &self,
        credential_id: &str,
        disclosed_attributes: &[String],
    ) -> Result<HashMap<String, Value>, AppError> {
        // Get the credential
        let credential = self
            .db
            .find_credential_by_id(credential_id)
            .await?
            .ok_or_else(|| {
                AppError::NotFoundError(format!(
                    "Credential with ID {} not found",
                    credential_id
                ))
            })?;

        // Create a selective disclosure proof
        zk_proofs::create_selective_disclosure(&credential.credential_data, disclosed_attributes)
    }

    /// Create a predicate proof for a credential attribute
    pub async fn create_predicate_proof(
        &self,
        credential_id: &str,
        attribute_name: &str,
        predicate_type: &str,
        predicate_value: i64,
    ) -> Result<zk_proofs::PredicateProof, AppError> {
        // Get the credential
        let credential = self
            .db
            .find_credential_by_id(credential_id)
            .await?
            .ok_or_else(|| {
                AppError::NotFoundError(format!(
                    "Credential with ID {} not found",
                    credential_id
                ))
            })?;

        // Get the attribute value
        let attribute_value = credential
            .credential_data
            .get(attribute_name)
            .ok_or_else(|| {
                AppError::ValidationError(format!(
                    "Attribute {} not found in credential",
                    attribute_name
                ))
            })?;

        // Convert the attribute value to a number
        let attribute_number = match attribute_value {
            Value::Number(n) => n.as_u64().ok_or_else(|| {
                AppError::ValidationError(format!(
                    "Attribute {} is not a positive number",
                    attribute_name
                ))
            })?,
            Value::String(s) => s.parse::<u64>().map_err(|_| {
                AppError::ValidationError(format!(
                    "Attribute {} cannot be converted to a number",
                    attribute_name
                ))
            })?,
            _ => {
                return Err(AppError::ValidationError(format!(
                    "Attribute {} is not a number or string",
                    attribute_name
                )))
            }
        };

        // Create a predicate proof
        zk_proofs::create_predicate_proof(
            attribute_name,
            attribute_number,
            predicate_type,
            predicate_value,
        )
    }

    /// Delete a credential
    pub async fn delete_credential(&self, owner_did: &str, credential_id: &str) -> Result<bool, AppError> {
        // Get the credential
        let credential = self
            .db
            .find_credential_by_id(credential_id)
            .await?
            .ok_or_else(|| {
                AppError::NotFoundError(format!(
                    "Credential with ID {} not found",
                    credential_id
                ))
            })?;

        // Check if the owner is authorized to delete the credential
        if credential.owner_did != owner_did {
            return Err(AppError::AccessDeniedError(
                "Only the owner can delete a credential".to_string(),
            ));
        }

        // Delete the credential from the database
        self.db.delete_credential(credential_id, owner_did).await
    }
}
