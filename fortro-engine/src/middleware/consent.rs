use crate::db::Database;
use crate::error::AppError;
use crate::models::{AccessLevel, ConsentRecord, ExpirationPolicy};
use chrono::Utc;
use std::sync::Arc;
use tracing::{info, warn};

/// Consent middleware for access control enforcement
pub struct ConsentMiddleware {
    db: Arc<Database>,
}

impl ConsentMiddleware {
    pub fn new(db: Arc<Database>) -> Self {
        Self { db }
    }
    pub async fn enforce(
        &self,
        holder_did: &str,
        verifier_did: &str,
        operation: &str,
    ) -> Result<(), AppError> {
        // Find active consent
        let consent = self
            .db
            .find_one::<ConsentRecord>(
                "consent_records",
                mongodb::bson::doc! {
                    "user_did": holder_did,
                    "verifier_did": verifier_did,
                    "revoked": false,
                },
            )
            .await?;

        let consent = consent.ok_or_else(|| {
            warn!(
                "No consent found for holder {} and verifier {}",
                holder_did, verifier_did
            );
            AppError::ValidationError("No valid consent found for this operation".to_string())
        })?;

        // Check expiration first
        if !consent.is_valid() {
            warn!("Consent {} has expired", consent.id);
            // Mark consent as expired and update presentations
            self.mark_consent_expired(&consent).await?;
            return Err(AppError::ValidationError("Consent has expired".to_string()));
        }

        // Enforce access level
        self.enforce_access_level(&consent, operation).await?;

        // Handle one-time use policy
        if consent.expiration_policy == ExpirationPolicy::OneTimeUse {
            info!("Auto-revoking one-time use consent: {}", consent.id);
            self.revoke_consent(&consent.id).await?;
        }

        info!("Access control check passed for consent: {}", consent.id);
        Ok(())
    }

    async fn enforce_access_level(
        &self,
        consent: &ConsentRecord,
        operation: &str,
    ) -> Result<(), AppError> {
        match consent.access_level {
            AccessLevel::ReadOnly => {
                if operation != "read" && operation != "presentation_verification" {
                    warn!(
                        "Access denied: ReadOnly consent attempted {} operation",
                        operation
                    );
                    return Err(AppError::ValidationError(
                        "Consent only allows read operations".to_string(),
                    ));
                }
            }
            AccessLevel::Write => {
                if operation == "delete" {
                    warn!("Access denied: Write consent attempted delete operation");
                    return Err(AppError::ValidationError(
                        "Consent does not allow delete operations".to_string(),
                    ));
                }
            }
            AccessLevel::ReadWrite => {
                if operation == "delete" {
                    warn!("Access denied: ReadWrite consent attempted delete operation");
                    return Err(AppError::ValidationError(
                        "Consent does not allow delete operations".to_string(),
                    ));
                }
            }
            AccessLevel::OneTime => {
                info!("OneTime access level will auto-revoke after this operation");
            }
            AccessLevel::Delete => {
                info!("Delete access level all operations permitted");
            }
            AccessLevel::FullAccess => {
                info!("FullAccess level all operations permitted");
            }
        }

        Ok(())
    }

    /// Revoke a consent record
    async fn revoke_consent(&self, consent_id: &str) -> Result<(), AppError> {
        let now = Utc::now();
        self.db
            .update_one(
                "consent_records",
                mongodb::bson::doc! { "id": consent_id },
                mongodb::bson::doc! {
                    "$set": {
                        "revoked": true,
                        "revoked_at": mongodb::bson::to_bson(&now)?,
                    }
                },
            )
            .await?;

        info!("Consent {} has been auto-revoked", consent_id);
        Ok(())
    }

    /// Mark a consent as expired and update related presentations
    async fn mark_consent_expired(&self, consent: &ConsentRecord) -> Result<(), AppError> {
        let now = Utc::now();

        self.db
            .update_one(
                "consent_records",
                mongodb::bson::doc! { "id": &consent.id },
                mongodb::bson::doc! {
                    "$set": {
                        "expired": true,
                        "expired_at": mongodb::bson::to_bson(&now)?,
                        "data_categories": mongodb::bson::to_bson(&Vec::<String>::new())?,
                        "updated_at": mongodb::bson::to_bson(&now)?,
                    }
                },
            )
            .await?;

        info!("Consent {} marked as expired", consent.id);

        Ok(())
    }

    pub async fn is_consent_valid(
        &self,
        holder_did: &str,
        verifier_did: &str,
    ) -> Result<bool, AppError> {
        let consent = self
            .db
            .find_one::<ConsentRecord>(
                "consent_records",
                mongodb::bson::doc! {
                    "user_did": holder_did,
                    "verifier_did": verifier_did,
                    "revoked": false,
                },
            )
            .await?;

        if let Some(consent) = consent {
            Ok(consent.is_valid())
        } else {
            Ok(false)
        }
    }

    /// Auto-clean expired consents
    pub async fn cleanup_expired_consents(&self) -> Result<usize, AppError> {
        let now = Utc::now();
        let now_bson = mongodb::bson::to_bson(&now)?;

        // Find all expired but not yet revoked consents
        let expired_consents = self
            .db
            .find_many::<ConsentRecord>(
                "consent_records",
                mongodb::bson::doc! {
                    "revoked": false,
                    "expires_at": { "$lt": now_bson },
                },
            )
            .await?;

        let count = expired_consents.len();

        // Auto-revoke them
        for consent in expired_consents {
            self.revoke_consent(&consent.id).await?;
        }

        if count > 0 {
            info!("Cleaned up {} expired consents", count);
        }

        Ok(count)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
}
