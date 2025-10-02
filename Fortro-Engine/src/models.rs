use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use uuid::Uuid;

// User model
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct User {
    pub did: String,
    pub public_key: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub email: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

impl User {
    pub fn new(did: String, public_key: String) -> Self {
        let now = Utc::now();
        Self {
            did,
            public_key,
            name: None,
            email: None,
            created_at: now,
            updated_at: now,
        }
    }
}

// Credential model
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Credential {
    pub id: String,
    pub issuer_did: String,
    pub owner_did: String,
    pub credential_type: String,
    pub schema_id: String,
    pub credential_data: HashMap<String, serde_json::Value>,
    pub ipfs_hash: Option<String>,
    pub blockchain_reference: Option<String>,
    pub jwt: String,
    pub status: CredentialStatus,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub expires_at: Option<DateTime<Utc>>,
}

impl Credential {
    pub fn new(
        issuer_did: String,
        owner_did: String,
        credential_type: String,
        schema_id: String,
        credential_data: HashMap<String, serde_json::Value>,
        jwt: String,
    ) -> Self {
        let now = Utc::now();
        Self {
            id: Uuid::new_v4().to_string(),
            issuer_did,
            owner_did,
            credential_type,
            schema_id,
            credential_data,
            ipfs_hash: None,
            blockchain_reference: None,
            jwt,
            status: CredentialStatus::Active,
            created_at: now,
            updated_at: now,
            expires_at: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum CredentialStatus {
    #[serde(rename = "active")]
    Active,
    #[serde(rename = "revoked")]
    Revoked,
    #[serde(rename = "expired")]
    Expired,
}

// Credential Request model
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CredentialRequest {
    pub id: String,
    pub user_did: String,
    pub issuer_did: String,
    pub credential_type: String,
    pub schema_id: String,
    pub request_data: HashMap<String, serde_json::Value>,
    pub status: CredentialRequestStatus,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub processed_at: Option<DateTime<Utc>>,
    pub credential_id: Option<String>,
}

impl CredentialRequest {
    pub fn new(
        user_did: String,
        issuer_did: String,
        credential_type: String,
        schema_id: String,
        request_data: HashMap<String, serde_json::Value>,
    ) -> Self {
        let now = Utc::now();
        Self {
            id: Uuid::new_v4().to_string(),
            user_did,
            issuer_did,
            credential_type,
            schema_id,
            request_data,
            status: CredentialRequestStatus::Pending,
            created_at: now,
            updated_at: now,
            processed_at: None,
            credential_id: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum CredentialRequestStatus {
    #[serde(rename = "pending")]
    Pending,
    #[serde(rename = "approved")]
    Approved,
    #[serde(rename = "rejected")]
    Rejected,
    #[serde(rename = "issued")]
    Issued,
}

// Presentation model
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Presentation {
    pub id: String,
    pub prover_did: String,
    pub verifier_did: String,
    pub presentation_type: String,
    pub credential_ids: Vec<String>,
    pub presentation_data: HashMap<String, serde_json::Value>,
    pub jwt: String,
    pub status: PresentationStatus,
    pub created_at: DateTime<Utc>,
    pub verified_at: Option<DateTime<Utc>>,
    pub is_verified: bool,
}

impl Presentation {
    pub fn new(
        prover_did: String,
        verifier_did: String,
        presentation_type: String,
        credential_ids: Vec<String>,
        presentation_data: HashMap<String, serde_json::Value>,
        jwt: String,
    ) -> Self {
        Self {
            id: Uuid::new_v4().to_string(),
            prover_did,
            verifier_did,
            presentation_type,
            credential_ids,
            presentation_data,
            jwt,
            status: PresentationStatus::Pending,
            created_at: Utc::now(),
            verified_at: None,
            is_verified: false,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum PresentationStatus {
    #[serde(rename = "pending")]
    Pending,
    #[serde(rename = "verified")]
    Verified,
    #[serde(rename = "rejected")]
    Rejected,
}

// Presentation Request model
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PresentationRequest {
    pub id: String,
    pub verifier_did: String,
    pub presentation_type: String,
    pub required_credentials: Vec<CredentialRequirement>,
    pub purpose: String,
    pub callback_url: Option<String>,
    pub created_at: DateTime<Utc>,
    pub expires_at: Option<DateTime<Utc>>,
    pub schema_ids: Vec<String>,
    pub recipient_did: Option<String>,
}

impl PresentationRequest {
    pub fn new(
        verifier_did: String,
        presentation_type: String,
        required_credentials: Vec<CredentialRequirement>,
        purpose: String,
        callback_url: Option<String>,
        expires_at: Option<DateTime<Utc>>,
    ) -> Self {
        Self {
            id: Uuid::new_v4().to_string(),
            verifier_did,
            presentation_type,
            required_credentials,
            purpose,
            callback_url,
            created_at: Utc::now(),
            expires_at,
            schema_ids: vec![],
            recipient_did: None,
        }
    }

    pub fn to_qr_data(&self) -> String {
        serde_json::to_string(&self).unwrap_or_default()
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CredentialRequirement {
    pub credential_type: String,
    pub issuer_did: Option<String>,
    pub required_attributes: Vec<String>,
    pub predicate: Option<Predicate>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Predicate {
    pub attribute: String,
    pub predicate_type: PredicateType,
    pub value: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum PredicateType {
    #[serde(rename = ">=")]
    GreaterThanOrEqual,
    #[serde(rename = "<=")]
    LessThanOrEqual,
    #[serde(rename = ">")]
    GreaterThan,
    #[serde(rename = "<")]
    LessThan,
    #[serde(rename = "==")]
    Equal,
    #[serde(rename = "!=")]
    NotEqual,
}

// Credential Offer model
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CredentialOffer {
    pub id: String,
    pub issuer_did: String,
    pub credential_type: String,
    pub schema_id: String,
    pub preview: HashMap<String, serde_json::Value>,
    pub created_at: DateTime<Utc>,
    pub expires_at: Option<DateTime<Utc>>,
    pub credential_id: String,
    pub recipient_did: Option<String>,
}

impl CredentialOffer {
    pub fn new(
        issuer_did: String,
        credential_type: String,
        schema_id: String,
        preview: HashMap<String, serde_json::Value>,
        expires_at: Option<DateTime<Utc>>,
    ) -> Self {
        Self {
            id: Uuid::new_v4().to_string(),
            issuer_did,
            credential_type,
            schema_id,
            preview,
            created_at: Utc::now(),
            expires_at,
            credential_id: "".to_string(),
            recipient_did: None,
        }
    }

    pub fn to_qr_data(&self) -> String {
        serde_json::to_string(&self).unwrap_or_default()
    }
}

// QR Code Data model
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QrCodeData {
    pub id: String,
    pub type_: String,  // "credential-offer" or "presentation-request"
    pub data: serde_json::Value,
    pub created_at: DateTime<Utc>,
    pub expires_at: Option<DateTime<Utc>>,
}

impl QrCodeData {
    pub fn new(
        type_: String,
        data: serde_json::Value,
        expires_at: Option<DateTime<Utc>>,
    ) -> Self {
        Self {
            id: Uuid::new_v4().to_string(),
            type_,
            data,
            created_at: Utc::now(),
            expires_at,
        }
    }

    pub fn is_expired(&self) -> bool {
        if let Some(expires_at) = self.expires_at {
            expires_at < Utc::now()
        } else {
            false
        }
    }
}

// Short URL QR Code model
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ShortUrlQrCode {
    pub id: String,
    pub short_id: String,
    pub qr_type: String,  // "credential-offer" or "presentation-request"
    pub content: serde_json::Value,
    pub created_at: DateTime<Utc>,
    pub expires_at: Option<DateTime<Utc>>,
    pub issuer_verifier_did: String,
}

impl ShortUrlQrCode {
    pub fn new(
        qr_type: String,
        content: serde_json::Value,
        issuer_verifier_did: String,
        expires_at: Option<DateTime<Utc>>,
    ) -> Self {
        let short_id = Uuid::new_v4().to_string().split('-').next().unwrap_or("").to_string();
        Self {
            id: Uuid::new_v4().to_string(),
            short_id,
            qr_type,
            content,
            created_at: Utc::now(),
            expires_at,
            issuer_verifier_did,
        }
    }

    pub fn is_expired(&self) -> bool {
        if let Some(expires_at) = self.expires_at {
            expires_at < Utc::now()
        } else {
            false
        }
    }
}

// Consent Record model
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConsentRecord {
    pub id: String,
    pub user_did: String,
    pub verifier_did: String,
    pub purpose: String,
    pub data_categories: Vec<String>,
    pub access_level: AccessLevel,
    pub expiration_policy: ExpirationPolicy,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub expires_at: Option<DateTime<Utc>>,
    pub revoked: bool,
    pub revoked_at: Option<DateTime<Utc>>,
}

impl ConsentRecord {
    pub fn new(
        user_did: String,
        verifier_did: String,
        purpose: String,
        data_categories: Vec<String>,
        access_level: AccessLevel,
        expiration_policy: ExpirationPolicy,
        expires_at: Option<DateTime<Utc>>,
    ) -> Self {
        let now = Utc::now();
        Self {
            id: Uuid::new_v4().to_string(),
            user_did,
            verifier_did,
            purpose,
            data_categories,
            access_level,
            expiration_policy,
            created_at: now,
            updated_at: now,
            expires_at,
            revoked: false,
            revoked_at: None,
        }
    }

    pub fn is_valid(&self) -> bool {
        if self.revoked {
            return false;
        }

        if let Some(expires_at) = self.expires_at {
            if expires_at < Utc::now() {
                return false;
            }
        }

        true
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum AccessLevel {
    #[serde(rename = "read_only")]
    ReadOnly,
    #[serde(rename = "read_write")]
    ReadWrite,
    #[serde(rename = "full_access")]
    FullAccess,
    #[serde(rename = "one_time")]
    OneTime,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum ExpirationPolicy {
    #[serde(rename = "fixed_date")]
    FixedDate,
    #[serde(rename = "one_time_use")]
    OneTimeUse,
    #[serde(rename = "indefinite")]
    Indefinite,
}

// Schema model
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Schema {
    pub id: String,
    pub name: String,
    pub version: String,
    pub issuer_did: String,
    pub attributes: Vec<SchemaAttribute>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SchemaAttribute {
    pub name: String,
    pub data_type: AttributeDataType,
    pub description: String,
    pub required: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum AttributeDataType {
    #[serde(rename = "string")]
    String,
    #[serde(rename = "number")]
    Number,
    #[serde(rename = "boolean")]
    Boolean,
    #[serde(rename = "date")]
    Date,
    #[serde(rename = "object")]
    Object,
    #[serde(rename = "array")]
    Array,
}

// API Request/Response models
#[derive(Debug, Serialize, Deserialize)]
pub struct ApiResponse<T> {
    pub success: bool,
    pub data: Option<T>,
    pub error: Option<String>,
}

impl<T> ApiResponse<T> {
    pub fn success(data: T) -> Self {
        Self {
            success: true,
            data: Some(data),
            error: None,
        }
    }

    pub fn error(error: String) -> Self {
        Self {
            success: false,
            data: None,
            error: Some(error),
        }
    }
}
