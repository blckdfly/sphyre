use std::collections::{HashMap, HashSet};
use std::sync::Arc;

use base64::{engine::general_purpose, Engine as _};
use chrono::{DateTime, Utc};
use once_cell::sync::OnceCell;
use tracing::{info, warn};

use crate::db::Database;
use crate::error::AppError;
use crate::models::{WalletActivity, WalletActivityStatus, WalletActivityType};
use crate::utils::crypto;

const MAX_TEXT_LENGTH: usize = 240;
const MAX_METADATA_VALUE_LENGTH: usize = 240;

pub struct WalletActivityService {
    db: Arc<Database>,
}

pub struct NewWalletActivity {
    pub holder_did: String,
    pub activity_type: WalletActivityType,
    pub status: WalletActivityStatus,
    pub title: String,
    pub description: String,
    pub metadata: HashMap<String, String>,
    pub sanitized_metadata: HashMap<String, String>,
    pub created_at: Option<DateTime<Utc>>,
}

impl WalletActivityService {
    pub fn new(db: Arc<Database>) -> Self {
        Self { db }
    }

    pub async fn record_activity(&self, input: NewWalletActivity) -> Result<WalletActivity, AppError> {
        let created_at = input.created_at.unwrap_or_else(Utc::now);
        let updated_at = created_at;

        let sanitized_title = sanitize_text(&input.title, MAX_TEXT_LENGTH);
        let sanitized_description = sanitize_text(&input.description, MAX_TEXT_LENGTH);
        let title_hash = crypto::hash_to_hex(sanitized_title.as_bytes());
        let description_hash = crypto::hash_to_hex(sanitized_description.as_bytes());

        let metadata_hashes = hash_metadata(&input.metadata);
        let mut sanitized_metadata = sanitize_metadata(input.sanitized_metadata);
        sanitized_metadata
            .entry("title".to_string())
            .or_insert_with(|| sanitized_title.clone());
        sanitized_metadata
            .entry("description".to_string())
            .or_insert_with(|| sanitized_description.clone());

        let encrypted_metadata = encrypt_sanitized_metadata(&sanitized_metadata)?;
        let should_store_plaintext = encrypted_metadata.is_none();

        let mut stored_activity = WalletActivity {
            id: uuid::Uuid::new_v4().to_string(),
            holder_did: input.holder_did,
            activity_type: input.activity_type,
            status: input.status,
            title_hash,
            description_hash,
            metadata_hashes,
            sanitized_metadata: if should_store_plaintext {
                Some(sanitized_metadata.clone())
            } else {
                None
            },
            sanitized_metadata_encrypted: encrypted_metadata.clone(),
            created_at,
            updated_at,
        };

        self.db.save_wallet_activity(&stored_activity).await?;

        stored_activity.sanitized_metadata = Some(sanitized_metadata);
        if encrypted_metadata.is_none() {
            stored_activity.sanitized_metadata_encrypted = None;
        }
        Ok(stored_activity)
    }

    pub async fn list_activities(
        &self,
        holder_did: &str,
        limit: Option<i64>,
    ) -> Result<Vec<WalletActivity>, AppError> {
        let mut activities = self
            .db
            .find_wallet_activities_by_holder(holder_did, limit)
            .await?;

        for activity in activities.iter_mut() {
            if activity.sanitized_metadata.is_some() {
                continue;
            }

            if let Some(ref encrypted) = activity.sanitized_metadata_encrypted {
                match decrypt_sanitized_metadata(encrypted) {
                    Ok(Some(map)) => activity.sanitized_metadata = Some(map),
                    Ok(None) => {
                        // Encryption disabled, no action required.
                        activity.sanitized_metadata_encrypted = None;
                    }
                    Err(error) => {
                        warn!(
                            error = ?error,
                            "Failed to decrypt sanitized metadata for wallet activity {}",
                            activity.id
                        );
                    }
                }
            }
        }

        Ok(activities)
    }
}

fn get_activity_encryption_key() -> Result<Option<[u8; 32]>, AppError> {
    static KEY: OnceCell<Option<[u8; 32]>> = OnceCell::new();

    KEY.get_or_try_init(|| {
        let raw = match std::env::var("WALLET_ACTIVITY_ENCRYPTION_KEY") {
            Ok(value) if !value.trim().is_empty() => value,
            _ => {
                info!("WALLET_ACTIVITY_ENCRYPTION_KEY not set; storing sanitized metadata without encryption");
                return Ok(None);
            }
        };

        let decoded = general_purpose::STANDARD
            .decode(raw.trim())
            .map_err(|e| AppError::ConfigError(format!(
                "Failed to decode WALLET_ACTIVITY_ENCRYPTION_KEY: {}",
                e
            )))?;

        if decoded.len() != 32 {
            return Err(AppError::ConfigError(
                "WALLET_ACTIVITY_ENCRYPTION_KEY must decode to 32 bytes".to_string(),
            ));
        }

        let mut key = [0u8; 32];
        key.copy_from_slice(&decoded);
        Ok(Some(key))
    })
    .copied()
}

fn encrypt_sanitized_metadata(
    sanitized_metadata: &HashMap<String, String>,
) -> Result<Option<String>, AppError> {
    let serialized = serde_json::to_vec(sanitized_metadata)
        .map_err(|e| AppError::InternalError(format!("Failed to serialize metadata: {}", e)))?;

    let Some(key) = get_activity_encryption_key()? else {
        return Ok(None);
    };

    let encrypted = crypto::encrypt(&serialized, &key)
        .map_err(|e| AppError::InternalError(format!("Failed to encrypt metadata: {}", e)))?;

    Ok(Some(general_purpose::STANDARD.encode(encrypted)))
}

fn decrypt_sanitized_metadata(
    encrypted: &str,
) -> Result<Option<HashMap<String, String>>, AppError> {
    let Some(key) = get_activity_encryption_key()? else {
        warn!("Wallet activity encryption key missing during decrypt; skipping metadata restoration");
        return Ok(None);
    };

    let ciphertext = general_purpose::STANDARD
        .decode(encrypted)
        .map_err(|e| AppError::InternalError(format!("Failed to decode metadata: {}", e)))?;

    let decrypted = crypto::decrypt(&ciphertext, &key)
        .map_err(|e| AppError::InternalError(format!("Failed to decrypt metadata: {}", e)))?;

    let map = serde_json::from_slice(&decrypted)
        .map_err(|e| AppError::InternalError(format!("Failed to deserialize metadata: {}", e)))?;

    Ok(Some(map))
}

fn sanitize_text(value: &str, max_len: usize) -> String {
    let clean: String = value
        .chars()
        .filter(|c| !c.is_control() || matches!(c, '\n' | '\r' | '\t'))
        .collect();
    let trimmed = clean.trim();
    if trimmed.is_empty() {
        return String::new();
    }
    trimmed.chars().take(max_len).collect()
}

fn sanitize_metadata(metadata: HashMap<String, String>) -> HashMap<String, String> {
    let allowed_keys: HashSet<&'static str> = [
        "title",
        "description",
        "issuer_name",
        "verifier_name",
        "verifier_did",
        "credential_type",
        "schema_id",
        "template_id",
        "offer_id",
        "credential_id",
        "status",
        "summary",
        "tx_hash",
        "request_id",
        "purpose",
        "expires_at",
    ]
    .into_iter()
    .collect();

    metadata
        .into_iter()
        .filter_map(|(key, value)| {
            let normalized_key = key.trim().to_lowercase();
            if normalized_key.is_empty() {
                return None;
            }
            if !allowed_keys.contains(normalized_key.as_str()) {
                return None;
            }
            let sanitized_value = sanitize_text(&value, MAX_METADATA_VALUE_LENGTH);
            if sanitized_value.is_empty() {
                None
            } else {
                Some((normalized_key, sanitized_value))
            }
        })
        .collect()
}

fn hash_metadata(metadata: &HashMap<String, String>) -> HashMap<String, String> {
    metadata
        .iter()
        .filter_map(|(key, value)| {
            let normalized_key = key.trim().to_lowercase();
            if normalized_key.is_empty() {
                return None;
            }
            let sanitized_value = sanitize_text(value, MAX_METADATA_VALUE_LENGTH);
            if sanitized_value.is_empty() {
                return None;
            }
            let hash = crypto::hash_to_hex(sanitized_value.as_bytes());
            Some((normalized_key, hash))
        })
        .collect()
}
