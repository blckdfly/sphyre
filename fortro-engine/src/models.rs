use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use uuid::Uuid;

use crate::utils::anonymous_credentials::{AnonymousPublicKey, AnonymousSecretKey};

mod datetime_helpers {
    use chrono::{DateTime, Utc};
    use serde::{Deserialize, Deserializer, Serializer};

    #[derive(Deserialize)]
    #[serde(untagged)]
    enum DateTimeValue {
        String(String),
        BsonDateTime {
            #[serde(rename = "$date")]
            date: serde_json::Value,
        },
    }

    fn parse_datetime_value<E>(value: DateTimeValue) -> Result<DateTime<Utc>, E>
    where
        E: serde::de::Error,
    {
        match value {
            DateTimeValue::String(s) => DateTime::parse_from_rfc3339(&s)
                .map(|dt| dt.with_timezone(&Utc))
                .map_err(E::custom),
            DateTimeValue::BsonDateTime { date } => {
                if let Some(obj) = date.as_object() {
                    if let Some(num_long) = obj.get("$numberLong") {
                        if let Some(millis_str) = num_long.as_str() {
                            if let Ok(millis) = millis_str.parse::<i64>() {
                                let secs = millis / 1000;
                                let nsecs = ((millis % 1000) * 1_000_000) as u32;
                                return DateTime::<Utc>::from_timestamp(secs, nsecs)
                                    .ok_or_else(|| E::custom("Invalid timestamp"));
                            }
                        }
                    }
                }
                if let Some(s) = date.as_str() {
                    return DateTime::parse_from_rfc3339(s)
                        .map(|dt| dt.with_timezone(&Utc))
                        .map_err(E::custom);
                }
                Err(E::custom("Invalid DateTime format"))
            }
        }
    }

    pub fn serialize_datetime<S>(dt: &DateTime<Utc>, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        serializer.serialize_str(&dt.to_rfc3339())
    }

    pub fn deserialize_datetime<'de, D>(deserializer: D) -> Result<DateTime<Utc>, D::Error>
    where
        D: Deserializer<'de>,
    {
        
        let value = DateTimeValue::deserialize(deserializer)?;
        parse_datetime_value::<D::Error>(value)
    }

    pub fn serialize_option_datetime<S>(
        value: &Option<DateTime<Utc>>,
        serializer: S,
    ) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        match value {
            Some(dt) => serializer.serialize_some(&dt.to_rfc3339()),
            None => serializer.serialize_none(),
        }
    }

    pub fn deserialize_option_datetime<'de, D>(
        deserializer: D,
    ) -> Result<Option<DateTime<Utc>>, D::Error>
    where
        D: Deserializer<'de>,
    {
        
        let value = Option::<DateTimeValue>::deserialize(deserializer)?;
        match value {
            Some(inner) => parse_datetime_value::<D::Error>(inner).map(Some),
            None => Ok(None),
        }
    }
}

pub use datetime_helpers::{
    deserialize_datetime,
    deserialize_option_datetime,
    serialize_datetime,
    serialize_option_datetime,
};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AnonymousCredentialRecord {
    pub credential_id: String,
    pub a: String,
    pub e: String,
    pub v: String,
    #[serde(default)]
    pub attribute_order: Vec<String>,
}

impl AnonymousCredentialRecord {
    pub fn new(
        credential_id: String,
        a: Vec<u8>,
        e: Vec<u8>,
        v: Vec<u8>,
        attribute_order: Vec<String>,
    ) -> Self {
        Self {
            credential_id,
            a: hex::encode(a),
            e: hex::encode(e),
            v: hex::encode(v),
            attribute_order,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IssuerAnonymousKeys {
    pub issuer_did: String,
    pub attribute_count: usize,
    pub public_key: AnonymousPublicKey,
    pub secret_key: AnonymousSecretKey,
    #[serde(serialize_with = "serialize_datetime", deserialize_with = "deserialize_datetime")]
    pub created_at: DateTime<Utc>,
    #[serde(serialize_with = "serialize_datetime", deserialize_with = "deserialize_datetime")]
    pub updated_at: DateTime<Utc>,
}

// User model
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct User {
    pub did: String,
    pub public_key: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub username: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub email: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub image_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub did_doc_cid: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub did_doc_gateway_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub blockchain_registered: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub blockchain_tx_hash: Option<String>,
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
            username: None,
            email: None,
            image_url: None,
            did_doc_cid: None,
            did_doc_gateway_url: None,
            blockchain_registered: None,
            blockchain_tx_hash: None,
            created_at: now,
            updated_at: now,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Credential {
    pub id: String,
    pub issuer_did: String,
    pub owner_did: String,
    pub credential_type: String,
    pub schema_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub credential_preview: Option<HashMap<String, serde_json::Value>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub credential_preview_encrypted: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub anonymous_credential: Option<AnonymousCredentialRecord>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub anonymous_master_secret: Option<String>,
    pub ipfs_hash: String,
    pub ipfs_gateway_url: String,
    pub credential_hash: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub blockchain_tx_hash: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub blockchain_reference: Option<String>,

    pub jwt: String,
    pub status: CredentialStatus,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub bbs_signature: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bbs_public_key: Option<String>,
    pub signature_type: String,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub kyber_public_key: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub kyber_secret_key: Option<String>,
    #[serde(default)]
    pub kyber_encrypted: bool,

    #[serde(default)]
    pub evidence_attachments: Vec<CredentialEvidence>,

    #[serde(default)]
    pub evidence_required: Vec<String>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub evidence_status: Option<EvidenceStatus>,

    #[serde(default)]
    pub extensions: Vec<String>,

    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub expires_at: Option<DateTime<Utc>>,
    pub subject_did: Option<String>,
    pub revocation_blockchain_tx: Option<String>,
}

impl Credential {
    pub fn new(
        issuer_did: String,
        owner_did: String,
        credential_type: String,
        schema_id: String,
        ipfs_hash: String,
        ipfs_gateway_url: String,
        credential_hash: String,
        jwt: String,
        credential_preview: Option<HashMap<String, serde_json::Value>>,
    ) -> Self {
        let now = Utc::now();
        let raw_id = Uuid::new_v4().simple().to_string();
        let formatted_id = format!("aly:{}", raw_id);

        Self {
            id: formatted_id,
            issuer_did,
            owner_did: owner_did.clone(),
            credential_type,
            schema_id,
            credential_preview,
            credential_preview_encrypted: None,
            anonymous_credential: None,
            anonymous_master_secret: None,
            ipfs_hash,
            ipfs_gateway_url,
            credential_hash,
            blockchain_tx_hash: None,
            blockchain_reference: None,
            jwt,
            status: CredentialStatus::Active,
            bbs_signature: None,
            bbs_public_key: None,
            signature_type: "bbs+".to_string(),
            kyber_public_key: None,
            kyber_secret_key: None,
            kyber_encrypted: false,
            evidence_attachments: Vec::new(),
            evidence_required: Vec::new(),
            evidence_status: None,
            extensions: Vec::new(),
            created_at: now,
            updated_at: now,
            expires_at: None,
            subject_did: Some(owner_did),
            revocation_blockchain_tx: None,
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

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum EvidenceStatus {
    Pending,
    Provided,
    Verified,
}

impl Default for EvidenceStatus {
    fn default() -> Self {
        EvidenceStatus::Pending
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct CredentialEvidence {
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
    pub ipfs_hash: Option<String>,
    pub credential_hash: Option<String>,
    pub subject_did: Option<String>,
    pub blockchain_tx: Option<String>,
    pub on_chain: bool,
    #[serde(default)]
    pub template_id: Option<String>,
    #[serde(default)]
    pub evidence: Vec<CredentialEvidence>,
    #[serde(default)]
    pub evidence_required: Vec<String>,
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
            user_did: user_did.clone(),
            issuer_did,
            credential_type,
            schema_id,
            request_data,
            status: CredentialRequestStatus::Pending,
            created_at: now,
            updated_at: now,
            processed_at: None,
            credential_id: None,
            ipfs_hash: None,
            credential_hash: None,
            subject_did: Some(user_did),
            blockchain_tx: None,
            on_chain: false,
            template_id: None,
            evidence: Vec::new(),
            evidence_required: Vec::new(),
        }
    }

    /// Create with template_id
    pub fn with_template(
        user_did: String,
        issuer_did: String,
        credential_type: String,
        schema_id: String,
        request_data: HashMap<String, serde_json::Value>,
        template_id: String,
    ) -> Self {
        let mut req = Self::new(
            user_did,
            issuer_did,
            credential_type,
            schema_id,
            request_data,
        );
        req.template_id = Some(template_id);
        req
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
    #[serde(skip_serializing_if = "Option::is_none")]
    pub prover_pseudonym: Option<String>,
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
            prover_pseudonym: None,
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
    Rejected, // Holder explicitly rejected the request
    #[serde(rename = "failed")]
    Failed, // Presentation didn't meet requirements (predicate/attribute mismatch)
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "lowercase")]
pub enum PresentationRequestStatus {
    #[default]
    #[serde(rename = "pending")]
    Pending,
    #[serde(rename = "approved")]
    Approved,
    #[serde(rename = "rejected")]
    Rejected,
    #[serde(rename = "expired")]
    Expired,
}

impl ToString for PresentationRequestStatus {
    fn to_string(&self) -> String {
        match self {
            PresentationRequestStatus::Pending => "pending".to_string(),
            PresentationRequestStatus::Approved => "approved".to_string(),
            PresentationRequestStatus::Rejected => "rejected".to_string(),
            PresentationRequestStatus::Expired => "expired".to_string(),
        }
    }
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
    #[serde(default)]
    pub status: PresentationRequestStatus,
    #[serde(default)]
    pub presentation_data: HashMap<String, serde_json::Value>,
    #[serde(default)]
    pub rejection_reason: Option<String>,
    #[serde(default)]
    pub failure_code: Option<String>,
    #[serde(default)]
    pub failure_details: Option<serde_json::Value>,
    #[serde(default)]
    pub updated_at: DateTime<Utc>,
    #[serde(default)]
    pub required_predicates: Option<Vec<serde_json::Value>>,
}

impl PresentationRequest {
    pub fn new(
        verifier_did: String,
        presentation_type: String,
        required_credentials: Vec<CredentialRequirement>,
        purpose: String,
        callback_url: Option<String>,
        expires_at: Option<DateTime<Utc>>,
        required_predicates: Option<Vec<serde_json::Value>>,
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
            status: PresentationRequestStatus::Pending,
            presentation_data: HashMap::new(),
            rejection_reason: None,
            failure_code: None,
            failure_details: None,
            updated_at: Utc::now(),
            required_predicates,
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

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum FieldSource {
    #[serde(rename = "holder_input")]
    HolderInput,

    #[serde(rename = "issuer_input")]
    IssuerInput,

    #[serde(rename = "system_generated")]
    SystemGenerated,

    #[serde(rename = "derived")]
    Derived,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum OfferStatus {
    #[serde(rename = "pending")]
    Pending,

    #[serde(rename = "accepted")]
    Accepted,

    #[serde(rename = "expired")]
    Expired,

    #[serde(rename = "revoked")]
    Revoked,

    #[serde(rename = "completed")]
    Completed,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CredentialOffer {
    pub id: String,
    pub issuer_did: String,
    pub credential_type: String,
    pub schema_id: String,
    pub template_id: String,
    pub preview: HashMap<String, serde_json::Value>,
    pub created_at: DateTime<Utc>,
    pub expires_at: Option<DateTime<Utc>>,

    pub recipient_did: Option<String>,
    pub status: OfferStatus,
    pub accepted_by_did: Option<String>,
    pub accepted_at: Option<DateTime<Utc>>,
    pub one_time_used: bool,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub issuer_data: Option<HashMap<String, serde_json::Value>>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub credential_id: Option<String>,

    #[serde(default)]
    pub extensions: Vec<String>,
}

impl CredentialOffer {
    pub fn new(
        issuer_did: String,
        credential_type: String,
        schema_id: String,
        template_id: String,
        preview: HashMap<String, serde_json::Value>,
        issuer_data: HashMap<String, serde_json::Value>,
        expires_at: Option<DateTime<Utc>>,
    ) -> Self {
        Self {
            id: Uuid::new_v4().to_string(),
            issuer_did,
            credential_type,
            schema_id,
            template_id,
            preview,
            created_at: Utc::now(),
            expires_at,
            recipient_did: None,
            status: OfferStatus::Pending,
            accepted_by_did: None,
            accepted_at: None,
            one_time_used: false,
            issuer_data: Some(issuer_data),
            credential_id: None,
            extensions: Vec::new(),
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
    pub type_: String,
    pub data: serde_json::Value,
    pub created_at: DateTime<Utc>,
    pub expires_at: Option<DateTime<Utc>>,
}

impl QrCodeData {
    pub fn new(type_: String, data: serde_json::Value, expires_at: Option<DateTime<Utc>>) -> Self {
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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ShortUrlQrCode {
    pub id: String,
    pub short_id: String,
    pub qr_type: String,
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
        let short_id = Uuid::new_v4()
            .to_string()
            .split('-')
            .next()
            .unwrap_or("")
            .to_string();
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
    #[serde(default)]
    pub verifier_name: Option<String>,
    pub purpose: String,
    pub data_categories: Vec<String>,
    pub access_level: AccessLevel,
    pub expiration_policy: ExpirationPolicy,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    #[serde(default)]
    pub expires_at: Option<DateTime<Utc>>,
    pub revoked: bool,
    #[serde(default)]
    pub revoked_at: Option<DateTime<Utc>>,
    #[serde(default)]
    pub expired: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub expired_at: Option<DateTime<Utc>>,
    #[serde(default)]
    pub blockchain_tx: Option<String>,
    #[serde(default)]
    pub on_chain: bool,
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
            verifier_name: None,
            purpose,
            data_categories,
            access_level,
            expiration_policy,
            created_at: now,
            updated_at: now,
            expires_at,
            revoked: false,
            revoked_at: None,
            expired: false,
            expired_at: None,
            blockchain_tx: None,
            on_chain: false,
        }
    }

    pub fn is_valid(&self) -> bool {
        if self.revoked || self.expired {
            return false;
        }

        if let Some(expires_at) = self.expires_at {
            if expires_at <= Utc::now() {
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
    #[serde(rename = "write")]
    Write,
    #[serde(rename = "delete")]
    Delete,
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
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    pub version: String,
    pub issuer_did: String,
    pub attributes: Vec<SchemaAttribute>,

    // Extensions support
    #[serde(default)]
    pub extensions_allowed: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub allowed_extensions: Option<Vec<String>>,

    // Evidence support
    #[serde(default)]
    pub evidence_allowed: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub allowed_evidence: Option<Vec<String>>,

    // IPFS storage (for decentralized backup)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ipfs_hash: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ipfs_gateway_url: Option<String>,

    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub blockchain_tx: Option<String>,
    pub on_chain: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SchemaAttribute {
    pub name: String,
    pub data_type: AttributeDataType,
    pub description: String,
    pub required: bool,

    // Optional validation rules
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pattern: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub min_length: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_length: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub enum_values: Option<Vec<String>>,
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
    #[serde(rename = "email")]
    Email,
    #[serde(rename = "url")]
    Url,
    #[serde(rename = "file")]
    File,
    #[serde(rename = "object")]
    Object,
    #[serde(rename = "array")]
    Array,
}

// Credential Template model
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CredentialTemplate {
    pub id: String,
    pub name: String,
    pub description: String,
    pub schema_id: String,
    pub issuer_did: String,
    pub fields: Vec<TemplateField>,
    #[serde(default)]
    pub evidence_required: Vec<String>,
    #[serde(default)]
    pub extensions: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ipfs_hash: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ipfs_gateway_url: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    #[serde(default = "default_true")]
    pub active: bool,
}

fn default_true() -> bool {
    true
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TemplateField {
    pub name: String,
    pub field_type: String,
    pub required: bool,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub placeholder: Option<String>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub help_text: Option<String>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub pattern: Option<String>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub min_length: Option<usize>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_length: Option<usize>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub default_value: Option<String>,

    #[serde(default)]
    pub is_extension: bool,

    #[serde(default = "default_field_source")]
    pub source: FieldSource,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub readonly_in_holder: Option<bool>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub options: Option<Vec<String>>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub formula: Option<String>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub min: Option<i32>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub max: Option<i32>,
}

fn default_field_source() -> FieldSource {
    FieldSource::HolderInput
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PredicateRequirement {
    pub attribute: String,
    pub operator: String,
    pub value: i64,
    pub predicate_type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VerificationPreset {
    pub id: String,
    pub name: String,
    pub description: String,
    pub verifier_did: String,

    pub preset_type: String,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub required_predicates: Option<Vec<PredicateRequirement>>,

    pub required_attributes: Vec<String>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub requested_attributes: Option<Vec<String>>,

    #[serde(default)]
    pub is_system: bool,

    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

impl VerificationPreset {
    pub fn new(
        name: String,
        description: String,
        verifier_did: String,
        preset_type: String,
        required_attributes: Vec<String>,
    ) -> Self {
        let now = Utc::now();
        Self {
            id: Uuid::new_v4().to_string(),
            name,
            description,
            verifier_did,
            preset_type,
            required_predicates: None,
            required_attributes,
            requested_attributes: None,
            is_system: false,
            created_at: now,
            updated_at: now,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum VerifierPresentationRequestStatus {
    Pending,
    Approved,
    Rejected,
    Expired,
}

impl Default for VerifierPresentationRequestStatus {
    fn default() -> Self {
        VerifierPresentationRequestStatus::Pending
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VerifierPresentationRequest {
    pub request_id: String,
    pub verifier_did: String,
    pub verifier_name: String,
    pub holder_did: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub holder_pseudonym: Option<String>,
    pub credential_id: String,
    pub purpose: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub required_predicates: Option<Vec<serde_json::Value>>,
    pub required_attributes: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub requested_attributes: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub presentation_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub required_issuers: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub required_attribute_values: Option<HashMap<String, Vec<String>>>,
    pub status: VerifierPresentationRequestStatus,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub presentation_data: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rejection_reason: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub failure_code: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub failure_details: Option<serde_json::Value>,
    #[serde(
        serialize_with = "serialize_datetime",
        deserialize_with = "deserialize_datetime"
    )]
    pub created_at: DateTime<Utc>,
    #[serde(
        serialize_with = "serialize_datetime",
        deserialize_with = "deserialize_datetime"
    )]
    pub expires_at: DateTime<Utc>,
    #[serde(
        serialize_with = "serialize_datetime",
        deserialize_with = "deserialize_datetime"
    )]
    pub updated_at: DateTime<Utc>,
}

impl VerifierPresentationRequest {
    pub fn new(
        verifier_did: String,
        verifier_name: String,
        holder_did: String,
        credential_id: String,
        purpose: String,
        required_attributes: Vec<String>,
        required_predicates: Option<Vec<serde_json::Value>>,
        required_attribute_values: Option<HashMap<String, Vec<String>>>,
    ) -> Self {
        let now = Utc::now();
        let expires_at = now + chrono::Duration::minutes(5);

        let normalized_required_attributes: Vec<String> = required_attributes
            .into_iter()
            .filter_map(|attr| {
                let trimmed = attr.trim();
                if trimmed.is_empty() {
                    None
                } else {
                    Some(trimmed.to_string())
                }
            })
            .collect();

        let normalized_required_attribute_values = required_attribute_values.and_then(|map| {
            let mut sanitized = HashMap::new();

            for (attr, values) in map {
                let attr_trimmed = attr.trim();
                if attr_trimmed.is_empty() {
                    continue;
                }

                let normalized_values: Vec<String> = values
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

                if !normalized_values.is_empty() {
                    sanitized.insert(attr_trimmed.to_string(), normalized_values);
                }
            }

            if sanitized.is_empty() {
                None
            } else {
                Some(sanitized)
            }
        });

        Self {
            request_id: Uuid::new_v4().to_string(),
            verifier_did,
            verifier_name,
            holder_did,
            holder_pseudonym: None,
            credential_id,
            purpose,
            required_predicates,
            required_attributes: normalized_required_attributes,
            requested_attributes: None,
            required_issuers: None,
            required_attribute_values: normalized_required_attribute_values,
            presentation_id: None,
            status: VerifierPresentationRequestStatus::Pending,
            presentation_data: None,
            rejection_reason: None,
            failure_code: None,
            failure_details: None,
            created_at: now,
            expires_at,
            updated_at: now,
        }
    }
}

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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WalletAuth {
    #[serde(rename = "_id", skip_serializing_if = "Option::is_none")]
    pub id: Option<mongodb::bson::oid::ObjectId>,

    pub auth_token_hash: String,
    #[serde(default)]
    pub auth_token_fingerprint: String,
    pub did: String,
    pub dilithium_public_key: String,
    pub dilithium_private_key_encrypted: String,
    pub kyber_public_key: String,
    pub kyber_private_key_encrypted: String,
    pub created_at: DateTime<Utc>,
    pub last_login: DateTime<Utc>,
    pub credentials: Vec<CredentialReference>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub encrypted_seed_blob: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub encrypted_seed_updated_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CredentialReference {
    pub id: String,
    pub credential_type: String,
    pub issuer_did: String,
    pub ipfs_hash: String,
    pub issued_at: DateTime<Utc>,
    pub expires_at: Option<DateTime<Utc>>,
    pub status: String,
}

/// Request to create new wallet
#[derive(Debug, Deserialize)]
pub struct CreateWalletAuthRequest {
    pub auth_token: String,
}

/// Request to login to existing wallet
#[derive(Debug, Deserialize)]
pub struct LoginWalletAuthRequest {
    pub auth_token: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WalletAuthResponse {
    pub did: String,
    pub public_key: String,
    pub kyber_public_key: String,
    pub created_at: String,
    pub credential_count: usize,
    pub has_encrypted_seed: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub encrypted_seed_updated_at: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct WalletStatistics {
    pub total_credentials: usize,
    pub active_credentials: usize,
    pub expired_credentials: usize,
    pub revoked_credentials: usize,
    pub total_presentations: usize,
    pub active_consents: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum WalletActivityType {
    CredentialRequested,
    OfferReceived,
    OfferAccepted,
    OfferRejected,
    CredentialIssued,
    CredentialPresented,
    VerificationCompleted,
    CredentialRevoked,
    AccessRequested,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum WalletActivityStatus {
    Pending,
    Completed,
    Failed,
    Rejected,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum VerifierActivityStatus {
    Success,
    Failed,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum VerifierActivityType {
    Verification,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VerifierActivity {
    pub id: String,
    pub verifier_did: String,
    pub activity_type: VerifierActivityType,
    pub status: VerifierActivityStatus,
    pub title: String,
    pub description: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub metadata: Option<HashMap<String, String>>,
    #[serde(serialize_with = "serialize_datetime", deserialize_with = "deserialize_datetime")]
    pub created_at: DateTime<Utc>,
    #[serde(serialize_with = "serialize_datetime", deserialize_with = "deserialize_datetime")]
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WalletActivity {
    pub id: String,
    pub holder_did: String,
    pub activity_type: WalletActivityType,
    pub status: WalletActivityStatus,
    /// SHA-256 hash of activity title for storage
    pub title_hash: String,
    /// SHA-256 hash of activity description for storage
    pub description_hash: String,
    /// Map of metadata keys to SHA-256 hashes of their values
    #[serde(default)]
    pub metadata_hashes: HashMap<String, String>,
    /// Sanitized metadata for display (encrypted at rest).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub sanitized_metadata: Option<HashMap<String, String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub sanitized_metadata_encrypted: Option<String>,
    #[serde(serialize_with = "serialize_datetime", deserialize_with = "deserialize_datetime")]
    pub created_at: DateTime<Utc>,
    #[serde(serialize_with = "serialize_datetime", deserialize_with = "deserialize_datetime")]
    pub updated_at: DateTime<Utc>,
}

impl WalletAuth {
    pub fn new(
        auth_token_hash: String,
        auth_token_fingerprint: String,
        did: String,
        dilithium_public_key: String,
        dilithium_private_key_encrypted: String,
        kyber_public_key: String,
        kyber_private_key_encrypted: String,
    ) -> Self {
        let now = Utc::now();
        Self {
            id: None,
            auth_token_hash,
            auth_token_fingerprint,
            did,
            dilithium_public_key,
            dilithium_private_key_encrypted,
            kyber_public_key,
            kyber_private_key_encrypted,
            created_at: now,
            last_login: now,
            credentials: vec![],
            encrypted_seed_blob: None,
            encrypted_seed_updated_at: None,
        }
    }

    pub fn to_response(&self) -> WalletAuthResponse {
        WalletAuthResponse {
            did: self.did.clone(),
            public_key: self.dilithium_public_key.clone(),
            kyber_public_key: self.kyber_public_key.clone(),
            created_at: self.created_at.to_rfc3339(),
            credential_count: self.credentials.len(),
            has_encrypted_seed: self.encrypted_seed_blob.is_some(),
            encrypted_seed_updated_at: self
                .encrypted_seed_updated_at
                .map(|dt| dt.to_rfc3339()),
        }
    }

    /// Add credential reference
    pub fn add_credential(&mut self, credential_ref: CredentialReference) {
        self.credentials.push(credential_ref);
    }

    /// Update last login timestamp
    pub fn update_last_login(&mut self) {
        self.last_login = Utc::now();
    }
}

// Consent model for tracking data sharing consents
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Consent {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    pub holder_did: String,
    pub verifier_did: String,
    pub purpose: String,
    pub data_categories: Vec<String>,
    #[serde(
        serialize_with = "serialize_datetime",
        deserialize_with = "deserialize_datetime"
    )]
    pub created_at: DateTime<Utc>,
    #[serde(
        default,
        serialize_with = "serialize_option_datetime",
        deserialize_with = "deserialize_option_datetime",
        skip_serializing_if = "Option::is_none"
    )]
    pub expires_at: Option<DateTime<Utc>>,

    #[serde(default)]
    pub revoked: bool,
    #[serde(
        default,
        serialize_with = "serialize_option_datetime",
        deserialize_with = "deserialize_option_datetime",
        skip_serializing_if = "Option::is_none"
    )]
    pub revoked_at: Option<DateTime<Utc>>,
    pub presentation_request_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub verifier_name: Option<String>,
}

impl Consent {
    pub fn new(
        holder_did: String,
        verifier_did: String,
        purpose: String,
        data_categories: Vec<String>,
        presentation_request_id: String,
        verifier_name: Option<String>,
        expires_at: Option<DateTime<Utc>>,
    ) -> Self {
        let now = Utc::now();
        Self {
            id: Some(Uuid::new_v4().to_string()),
            holder_did,
            verifier_did,
            purpose,
            data_categories,
            created_at: now,
            expires_at,
            revoked: false,
            revoked_at: None,
            presentation_request_id,
            verifier_name,
        }
    }

    /// Revoke consent
    pub fn revoke(&mut self) {
        self.revoked = true;
        self.revoked_at = Some(Utc::now());
    }

    /// Check if consent is still valid
    pub fn is_valid(&self) -> bool {
        if self.revoked {
            return false;
        }

        if let Some(expires_at) = self.expires_at {
            if Utc::now() > expires_at {
                return false;
            }
        }

        true
    }
}
