use crate::blockchain::BlockchainClient;
use crate::blockchain_legacy::EthereumClient;
use crate::db::Database;
use crate::error::AppError;
use crate::ipfs::IpfsClient;
use crate::models::{
    AnonymousCredentialRecord, Credential, CredentialEvidence, CredentialStatus, EvidenceStatus,
    IssuerAnonymousKeys,
};
use crate::utils::anonymous_credentials::{
    create_blind_request, create_unlinkable_presentation, generate_anonymous_keypair,
    generate_master_secret, issue_anonymous_credential, AnonymousCredential, UnlinkablePresentation,
};
use crate::utils::bbs_plus::{bbs_sign, generate_bbs_keypair};
use crate::utils::{credential_preview, crypto, did, jwt, zk_proofs};
use chrono::{DateTime, Utc};
use mongodb::bson::doc;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;

/// Credential service
pub struct CredentialService {
    db: Arc<Database>,
    ipfs: Arc<IpfsClient>,
    blockchain: Arc<EthereumClient>,
    blockchain_client: Option<Arc<RwLock<Option<BlockchainClient>>>>,
}

#[derive(Debug, Deserialize, Clone)]
pub struct IssueCredentialRequest {
    pub credential_type: String,
    pub schema_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub subject_did: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub template_id: Option<String>,
    pub attributes: HashMap<String, Value>,
    pub expiration_date: Option<DateTime<Utc>>,
    #[serde(default)]
    pub evidence: Vec<CredentialEvidenceInput>,
    #[serde(default)]
    pub evidence_required: Vec<String>,
    #[serde(default)]
    pub extensions: Vec<String>,
}

#[derive(Debug, Deserialize, Clone)]
pub struct CredentialEvidenceInput {
    pub label: String,
    pub filename: String,
    pub ipfs_hash: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub gateway_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content_type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub size: Option<u64>,
}

impl CredentialEvidenceInput {
    pub fn to_model(&self) -> CredentialEvidence {
        CredentialEvidence {
            label: self.label.clone(),
            filename: self.filename.clone(),
            ipfs_hash: self.ipfs_hash.clone(),
            gateway_url: self.gateway_url.clone(),
            content_type: self.content_type.clone(),
            size: self.size,
        }
    }
}

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
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ipfs_hash: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ipfs_gateway_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub blockchain_tx_hash: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub credential_hash: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub subject_did: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub blockchain_tx: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub on_chain: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub anonymous_credential: Option<AnonymousCredentialRecord>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub anonymous_master_secret: Option<String>,
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
    pub fn new(db: Arc<Database>, ipfs: Arc<IpfsClient>, blockchain: Arc<EthereumClient>) -> Self {
        Self {
            db,
            ipfs,
            blockchain,
            blockchain_client: None,
        }
    }

    pub fn with_blockchain_client(mut self, client: Arc<RwLock<Option<BlockchainClient>>>) -> Self {
        self.blockchain_client = Some(client);
        self
    }

    pub async fn issue_credential(
        &self,
        issuer_did: &str,
        request: IssueCredentialRequest,
    ) -> Result<CredentialResponse, AppError> {
        let issuer_private_key = "MHcCAQEEIBzFxKC2KGaw+hQLKe8GTFFGVPno0FJ2vnggh5bN0qcgoAoGCCqGSM49AwEHoUQDQgAErltVqmiDOw4C3vbWKRPunqEyoVGj5trhSopY+IPW7ksD4zeVse7CB2elgcQorS/YYcF1AL7jLX6o6p5TWHeETA";

        self.issue_credential_with_key(issuer_did, issuer_private_key, request)
            .await
    }

    pub async fn issue_credential_with_key(
        &self,
        issuer_did: &str,
        issuer_private_key: &str,
        request: IssueCredentialRequest,
    ) -> Result<CredentialResponse, AppError> {
        if !did::validate_did(issuer_did) {
            return Err(AppError::ValidationError(
                "Invalid issuer DID: only did:alyra is supported".to_string(),
            ));
        }

        let mut subject_did = request
            .subject_did
            .clone()
            .unwrap_or_else(|| "did:alyra:holder:pending".to_string());

        if !subject_did.starts_with("did:alyra:holder:pending") {
            subject_did = crate::utils::did_compat::normalize_did(&subject_did)
                .map_err(|e| AppError::ValidationError(format!("Invalid subject DID: {}", e)))?;
        }

        if !subject_did.starts_with("did:alyra:holder:pending") && !did::validate_did(&subject_did)
        {
            return Err(AppError::ValidationError("Invalid subject DID".to_string()));
        }

        let jwt = jwt::create_pq_credential_jwt(
            issuer_did,
            &subject_did,
            json!(request.attributes),
            issuer_private_key.as_bytes(),
            "dummy_public_key".as_bytes(),
            request
                .expiration_date
                .map(|date| (date - Utc::now()).num_seconds()),
        )?;

        tracing::info!("Generating BBS+ signature for credential");

        let mut attribute_keys: Vec<String> = request.attributes.keys().cloned().collect();
        attribute_keys.sort();

        let messages: Vec<String> = attribute_keys
            .iter()
            .map(|key| request.attributes.get(key).unwrap().to_string())
            .collect();

        let (bbs_public_key, bbs_secret_key) = generate_bbs_keypair(messages.len())
            .map_err(|e| AppError::SsiError(format!("Failed to generate BBS+ keypair: {}", e)))?;

        let bbs_signature = bbs_sign(&messages, &bbs_secret_key, &bbs_public_key)
            .map_err(|e| AppError::SsiError(format!("Failed to create BBS+ signature: {}", e)))?;

        // Serialize BBS+ data to hex strings for storage
        let bbs_signature_hex = hex::encode(serde_json::to_vec(&bbs_signature).map_err(|e| {
            AppError::InternalError(format!("Failed to serialize BBS+ signature: {}", e))
        })?);

        let bbs_public_key_hex = hex::encode(serde_json::to_vec(&bbs_public_key).map_err(|e| {
            AppError::InternalError(format!("Failed to serialize BBS+ public key: {}", e))
        })?);

        tracing::info!("BBS+ signature generated successfully");

        let mut credential_subject = json!({
            "id": subject_did,
            "type": request.credential_type,
            "claims": request.attributes,
        });

        if !request.extensions.is_empty() {
            if let Some(obj) = credential_subject.as_object_mut() {
                obj.insert("extensions".to_string(), json!(request.extensions));
            }
        }

        let verifiable_credential = json!({
            "@context": [
                "https://www.w3.org/2018/credentials/v1",
                "https://sphyre.tech/credentials/v1"
            ],
            "type": ["VerifiableCredential", request.credential_type],
            "issuer": issuer_did,
            "issuanceDate": Utc::now().to_rfc3339(),
            "expirationDate": request.expiration_date.map(|d| d.to_rfc3339()),
            "credentialSubject": credential_subject,
            "credentialEvidence": request.evidence.iter().map(|att| json!({
                "label": att.label,
                "filename": att.filename,
                "ipfs_hash": att.ipfs_hash,
                "gateway_url": att.gateway_url,
                "content_type": att.content_type,
                "size": att.size,
            })).collect::<Vec<_>>(),
            "evidenceRequired": request.evidence_required,
            "proof": {
                "type": "Dilithium2Signature2025",
                "created": Utc::now().to_rfc3339(),
                "proofPurpose": "assertionMethod",
                "verificationMethod": format!("{}#keys-1", issuer_did),
                "jws": jwt.clone()
            }
        });

        let (ipfs_hash, kyber_public_key_hex, kyber_secret_key_hex) = self
            .ipfs
            .upload_credential_with_kyber(&verifiable_credential)
            .await?;

        tracing::info!(
            "Credential uploaded to IPFS with Kyber encryption: {}",
            ipfs_hash
        );

        let gateway_url = std::env::var("IPFS_GATEWAY")
            .unwrap_or_else(|_| "https://gateway.sphyre.tech".to_string());
        let ipfs_gateway_url = format!("{}/ipfs/{}", gateway_url, ipfs_hash);

        let credential_hash = crypto::hash_to_hex(
            serde_json::to_string(&verifiable_credential)
                .map_err(|e| {
                    AppError::InternalError(format!("Failed to serialize for hash: {}", e))
                })?
                .as_bytes(),
        );

        let credential_preview = {
            let mut preview = HashMap::new();

            for (key, value) in &request.attributes {
                preview.insert(key.clone(), value.clone());
            }

            if preview.is_empty() {
                preview.insert(
                    "credential_type".to_string(),
                    json!(request.credential_type.clone()),
                );
            }

            if preview.is_empty() {
                None
            } else {
                Some(preview)
            }
        };

        let preview_for_response = credential_preview.clone();

        let mut credential = Credential::new(
            issuer_did.to_string(),
            subject_did.clone(),
            request.credential_type.clone(),
            request.schema_id.clone(),
            ipfs_hash.clone(),
            ipfs_gateway_url.clone(),
            credential_hash.clone(),
            jwt.clone(),
            None,
        );
        credential.bbs_signature = Some(bbs_signature_hex);
        credential.bbs_public_key = Some(bbs_public_key_hex);
        credential.signature_type = "bbs+".to_string();

        credential.kyber_public_key = Some(kyber_public_key_hex.clone());
        credential.kyber_secret_key = Some(kyber_secret_key_hex.clone());
        credential.kyber_encrypted = true;

        credential.evidence_required = request.evidence_required.clone();
        credential.evidence_attachments = request
            .evidence
            .iter()
            .map(|att| att.to_model())
            .collect();
        if !credential.evidence_attachments.is_empty() {
            credential.evidence_status = Some(EvidenceStatus::Provided);
        }
        credential.extensions = request.extensions.clone();

        let mut anonymous_record_response: Option<AnonymousCredentialRecord> = None;
        let mut anonymous_master_secret_response: Option<String> = None;

        if let (Some(preview_map), Some(pub_key_hex)) = (
            credential_preview.as_ref(),
            credential.kyber_public_key.as_ref(),
        ) {
            credential.credential_preview_encrypted = Some(
                credential_preview::encrypt_preview_map(preview_map, pub_key_hex)?,
            );
        }

        if !request.attributes.is_empty() {
            let attribute_strings: HashMap<String, String> = request
                .attributes
                .iter()
                .map(|(key, value)| {
                    let string_value = match value {
                        Value::String(s) => s.clone(),
                        Value::Number(n) => n.to_string(),
                        Value::Bool(b) => b.to_string(),
                        Value::Null => "null".to_string(),
                        other => other.to_string(),
                    };
                    (key.clone(), string_value)
                })
                .collect();

            if !attribute_strings.is_empty() {
                let mut attribute_order: Vec<String> = attribute_strings.keys().cloned().collect();
                attribute_order.sort();

                let attr_count = attribute_order.len();
                let existing_keys = self
                    .db
                    .get_issuer_anonymous_keys(issuer_did)
                    .await?;

                let issuer_keys_record = if let Some(mut record) = existing_keys {
                    if record.attribute_count != attr_count {
                        let keypair = generate_anonymous_keypair(attr_count).map_err(|e| {
                            AppError::SsiError(format!(
                                "Failed to generate anonymous keypair: {}",
                                e
                            ))
                        })?;
                        record.attribute_count = attr_count;
                        record.public_key = keypair.public_key;
                        record.secret_key = keypair.secret_key;
                        record.updated_at = Utc::now();
                        record
                    } else {
                        record.updated_at = Utc::now();
                        record
                    }
                } else {
                    let keypair = generate_anonymous_keypair(attr_count).map_err(|e| {
                        AppError::SsiError(format!(
                            "Failed to generate anonymous keypair: {}",
                            e
                        ))
                    })?;
                    IssuerAnonymousKeys {
                        issuer_did: issuer_did.to_string(),
                        attribute_count: attr_count,
                        public_key: keypair.public_key,
                        secret_key: keypair.secret_key,
                        created_at: Utc::now(),
                        updated_at: Utc::now(),
                    }
                };

                self.db
                    .upsert_issuer_anonymous_keys(&issuer_keys_record)
                    .await?;

                let master_secret = generate_master_secret();
                let blind_request = create_blind_request(&master_secret).map_err(|e| {
                    AppError::SsiError(format!(
                        "Failed to create blind credential request: {}",
                        e
                    ))
                })?;

                let anonymous_credential = issue_anonymous_credential(
                    &attribute_strings,
                    &issuer_keys_record.public_key,
                    &issuer_keys_record.secret_key,
                    &blind_request,
                    Some(&attribute_order),
                )
                .map_err(|e| {
                    AppError::SsiError(format!(
                        "Failed to issue anonymous credential: {}",
                        e
                    ))
                })?;

                let anon_record = AnonymousCredentialRecord::new(
                    credential.id.clone(),
                    anonymous_credential.a.clone(),
                    anonymous_credential.e.clone(),
                    anonymous_credential.v.clone(),
                    attribute_order.clone(),
                );

                credential.anonymous_credential = Some(anon_record.clone());
                let master_secret_hex = hex::encode(master_secret);
                credential.anonymous_master_secret = Some(master_secret_hex.clone());
                anonymous_record_response = Some(anon_record);
                anonymous_master_secret_response = Some(master_secret_hex);
            }
        }

        credential.expires_at = request.expiration_date;

        // Blockchain transaction hash will be set by API layer after registration
        credential.blockchain_tx_hash = None;

        tracing::info!(
            "Saving credential to MongoDB: id={}, owner_did={}, type={}",
            credential.id,
            credential.owner_did,
            request.credential_type
        );

        self.db.save_credential(&credential).await?;

        tracing::info!(
            "Credential saved: collection=credentials, id={}, owner_did={}",
            credential.id,
            credential.owner_did
        );

        let mut credential_updated = credential.clone();
        credential_updated.credential_preview = preview_for_response;
        if let Some(blockchain_client_lock) = &self.blockchain_client {
            let client_opt = blockchain_client_lock.read().await;
            if let Some(client) = client_opt.as_ref() {
                match client
                    .register_credential(&subject_did, &credential_hash)
                    .await
                {
                    Ok(receipt) => {
                        credential_updated.blockchain_tx_hash =
                            Some(format!("{:?}", receipt.transaction_hash));

                        self.db.db.collection::<Credential>("credentials")
                            .update_one(
                                mongodb::bson::doc! { "id": &credential_updated.id },
                                mongodb::bson::doc! { "$set": { "blockchain_tx_hash": &credential_updated.blockchain_tx_hash } },
                            )
                            .await?;

                        tracing::info!(
                            "Credential registered on blockchain: tx={:?}, block={}",
                            receipt.transaction_hash,
                            receipt.block_number.map(|b| b.as_u64()).unwrap_or(0)
                        );
                    }
                    Err(e) => {
                        tracing::warn!("Failed to register credential on blockchain: {}", e);
                    }
                }
            } else {
                tracing::debug!(
                    "Blockchain client not available, credential saved to MongoDB only"
                );
            }
        }

        if !subject_did.starts_with("did:alyra:holder:pending") {
            let update_result = self
                .db
                .update_one(
                    "credential_offers",
                    mongodb::bson::doc! {
                        "recipient_did": &subject_did,
                        "status": "accepted",
                        "credential_type": &request.credential_type,
                    },
                    mongodb::bson::doc! {
                        "$set": {
                            "status": "completed",
                            "credential_id": &credential.id,
                        }
                    },
                )
                .await;

            if update_result.is_ok() {
                tracing::info!(
                    "Marked credential offer as completed for holder {}",
                    subject_did
                );
            }
        }

        tracing::info!("Credential issued successfully: IPFS={}", ipfs_hash);

        Ok(CredentialResponse {
            credential: credential_updated.clone(),
            jwt: jwt.clone(),
            ipfs_hash: Some(ipfs_hash.clone()),
            ipfs_gateway_url: Some(ipfs_gateway_url),
            blockchain_tx_hash: credential_updated.blockchain_tx_hash.clone(),
            credential_hash: Some(credential_hash.clone()),
            subject_did: Some(subject_did.clone()),
            blockchain_tx: None,
            id: Some(credential_updated.id.clone()),
            on_chain: credential_updated.blockchain_tx_hash.as_ref().map(|_| true),
            anonymous_credential: anonymous_record_response,
            anonymous_master_secret: anonymous_master_secret_response,
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
        let issuer_did = credential_data["issuer"].as_str().unwrap_or("").to_string();
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

    /// Revoke a credential
    pub async fn revoke_credential(
        &self,
        issuer_did: &str,
        credential_id: &str,
    ) -> Result<Credential, AppError> {
        tracing::info!(
            "Revoking credential: id={}, issuer={}",
            credential_id,
            issuer_did
        );

        let mut credential = self
            .get_credential_by_id(credential_id)
            .await?
            .ok_or_else(|| {
                tracing::error!("Credential not found: {}", credential_id);
                AppError::NotFoundError(format!("Credential with ID {} not found", credential_id))
            })?;

        // Check if the issuer is authorized to revoke the credential
        if credential.issuer_did != issuer_did {
            tracing::error!(
                "Issuer mismatch: {} != {}",
                credential.issuer_did,
                issuer_did
            );
            return Err(AppError::AccessDeniedError(
                "Only the issuer can revoke a credential".to_string(),
            ));
        }

        // Check if the credential is already revoked
        if credential.status == CredentialStatus::Revoked {
            tracing::warn!("Credential already revoked: {}", credential_id);
            return Err(AppError::ValidationError(
                "Credential is already revoked".to_string(),
            ));
        }

        credential.status = CredentialStatus::Revoked;
        credential.updated_at = Utc::now();

        tracing::info!("Updating credential status to Revoked: {}", credential_id);

        // Save updated credential to database
        self.db.save_credential(&credential).await?;

        tracing::info!(
            "Credential revoked and saved to database: {}",
            credential_id
        );

        Ok(credential)
    }

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
    pub async fn get_credentials_by_owner(
        &self,
        owner_did: &str,
    ) -> Result<Vec<Credential>, AppError> {
        self.db.find_credentials_by_owner(owner_did).await
    }

    /// List credentials by issuer DID with optional filtering
    pub async fn list_credentials_by_issuer(
        &self,
        issuer_did: &str,
        params: HashMap<String, String>,
    ) -> Result<Vec<Credential>, AppError> {
        tracing::info!("Fetching credentials for issuer_did: {}", issuer_did);

        let normalized_issuer_did =
            crate::utils::did_compat::normalize_did(issuer_did).map_err(|e| {
                tracing::error!("Failed to normalize issuer_did {}: {}", issuer_did, e);
                AppError::ValidationError(format!("Invalid issuer DID: {}", e))
            })?;

        tracing::info!(
            "Fetching credentials for issuer_did: {} (normalized: {})",
            issuer_did,
            normalized_issuer_did
        );

        // Create a base filter for the issuer
        let mut filter = mongodb::bson::doc! {
            "issuer_did": &normalized_issuer_did
        };

        // Add status filter if provided
        if let Some(status) = params.get("status") {
            let status_enum = match status.as_str() {
                "active" => CredentialStatus::Active,
                "revoked" => CredentialStatus::Revoked,
                "expired" => CredentialStatus::Expired,
                _ => {
                    return Err(AppError::ValidationError(format!(
                        "Invalid status: {}",
                        status
                    )))
                }
            };

            filter.insert(
                "status",
                mongodb::bson::to_bson(&status_enum).map_err(|e| {
                    AppError::ValidationError(format!("Failed to convert status to BSON: {}", e))
                })?,
            );
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
        let credentials = self.db.find_many("credentials", filter).await?;

        tracing::info!(
            "Found {} credentials for issuer: {}",
            credentials.len(),
            normalized_issuer_did
        );

        Ok(credentials)
    }

    /// Create a selective disclosure proof for a credential
    pub async fn create_selective_disclosure(
        &self,
        credential_id: &str,
        disclosed_attributes: &[String],
    ) -> Result<HashMap<String, Value>, AppError> {
        // Get the credential metadata
        let credential = self
            .db
            .find_credential_by_id(credential_id)
            .await?
            .ok_or_else(|| {
                AppError::NotFoundError(format!("Credential with ID {} not found", credential_id))
            })?;

        let full_credential = if credential.kyber_encrypted {
            let kyber_secret_key = credential.kyber_secret_key.as_ref().ok_or_else(|| {
                AppError::ValidationError("Kyber secret key not found".to_string())
            })?;
            self.ipfs
                .get_credential_with_kyber(&credential.ipfs_hash, kyber_secret_key)
                .await?
        } else {
            self.ipfs.get_json::<Value>(&credential.ipfs_hash).await?
        };

        let credential_data: HashMap<String, Value> = full_credential
            .get("credentialSubject")
            .and_then(|cs| cs.get("claims"))
            .and_then(|c| c.as_object())
            .ok_or_else(|| AppError::IpfsError("Invalid credential format in IPFS".to_string()))?
            .iter()
            .map(|(k, v)| (k.clone(), v.clone()))
            .collect();

        let bbs_signature_hex = credential.bbs_signature.as_ref().ok_or_else(|| {
            AppError::SsiError("Credential does not have BBS+ signature".to_string())
        })?;

        let bbs_public_key_hex = credential.bbs_public_key.as_ref().ok_or_else(|| {
            AppError::SsiError("Credential does not have BBS+ public key".to_string())
        })?;

        let bbs_signature_bytes = hex::decode(bbs_signature_hex).map_err(|e| {
            AppError::InternalError(format!("Failed to decode BBS+ signature: {}", e))
        })?;

        let bbs_signature = serde_json::from_slice(&bbs_signature_bytes).map_err(|e| {
            AppError::InternalError(format!("Failed to deserialize BBS+ signature: {}", e))
        })?;

        let bbs_public_key_bytes = hex::decode(bbs_public_key_hex).map_err(|e| {
            AppError::InternalError(format!("Failed to decode BBS+ public key: {}", e))
        })?;

        let bbs_public_key = serde_json::from_slice(&bbs_public_key_bytes).map_err(|e| {
            AppError::InternalError(format!("Failed to deserialize BBS+ public key: {}", e))
        })?;

        tracing::info!("Creating BBS+ selective disclosure proof");

        zk_proofs::create_selective_disclosure(
            &credential_data,
            disclosed_attributes,
            &bbs_signature,
            &bbs_public_key,
        )
    }

    /// Create a predicate proof for a credential attribute
    pub async fn create_predicate_proof(
        &self,
        credential_id: &str,
        attribute_name: &str,
        operator: &str,
        value: i64,
    ) -> Result<HashMap<String, Value>, AppError> {
        // Get the credential from the store
        let credential = self
            .db
            .find_credential_by_id(credential_id)
            .await?
            .ok_or_else(|| {
                AppError::NotFoundError(format!("Credential with ID {} not found", credential_id))
            })?;

        let full_credential = if credential.kyber_encrypted {
            let kyber_secret_key = credential.kyber_secret_key.as_ref().ok_or_else(|| {
                AppError::ValidationError("Kyber secret key not found".to_string())
            })?;
            self.ipfs
                .get_credential_with_kyber(&credential.ipfs_hash, kyber_secret_key)
                .await?
        } else {
            self.ipfs.get_json::<Value>(&credential.ipfs_hash).await?
        };

        let credential_data = full_credential
            .get("credentialSubject")
            .and_then(|cs| cs.get("claims"))
            .and_then(|c| c.as_object())
            .ok_or_else(|| AppError::IpfsError("Invalid credential format in IPFS".to_string()))?;

        // Get the attribute value
        let attribute_value = credential_data.get(attribute_name).ok_or_else(|| {
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
        let proof =
            zk_proofs::create_predicate_proof(attribute_name, attribute_number, operator, value)?;

        // Convert proof to HashMap for response
        let mut result = HashMap::new();
        result.insert("proof_type".to_string(), json!("predicate"));
        result.insert("attribute".to_string(), json!(attribute_name));
        result.insert("operator".to_string(), json!(operator));
        result.insert("proof".to_string(), json!(proof));

        Ok(result)
    }

    /// Delete a credential
    pub async fn delete_credential(
        &self,
        owner_did: &str,
        credential_id: &str,
    ) -> Result<bool, AppError> {
        // Get the credential
        let credential = self
            .db
            .find_credential_by_id(credential_id)
            .await?
            .ok_or_else(|| {
                AppError::NotFoundError(format!("Credential with ID {} not found", credential_id))
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

    pub async fn build_anonymous_presentation(
        &self,
        credential: &Credential,
        attributes: &[String],
    ) -> Result<Option<UnlinkablePresentation>, AppError> {
        let anon_record = match &credential.anonymous_credential {
            Some(record) => record,
            None => return Ok(None),
        };

        let preview_map = credential_preview::get_plain_preview(credential)?;

        let mut revealed_map = HashMap::new();
        if let Some(preview) = preview_map.as_ref() {
            for key in attributes {
                let value_opt = preview
                    .get(key)
                    .or_else(|| credential_preview::find_value_case_insensitive(preview, key));

                if let Some(value) = value_opt {
                    let string_value = match value {
                        Value::String(s) => s.clone(),
                        Value::Number(n) => n.to_string(),
                        Value::Bool(b) => b.to_string(),
                        Value::Null => "null".to_string(),
                        other => other.to_string(),
                    };
                    revealed_map.insert(key.clone(), string_value);
                }
            }
        }

        if revealed_map.is_empty() {
            return Ok(None);
        }

        let issuer_keys = self
            .db
            .get_issuer_anonymous_keys(&credential.issuer_did)
            .await?
            .ok_or_else(|| {
                AppError::ValidationError(
                    "Issuer anonymous key material not found for credential".to_string(),
                )
            })?;

        let anonymous_credential = AnonymousCredential {
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

        let presentation = create_unlinkable_presentation(
            &anonymous_credential,
            revealed_map,
            &issuer_keys.public_key,
        )?;

        Ok(Some(presentation))
    }
}
