use crate::error::AppError;
use crate::models::ConsentRecord;
use crate::services::AppState;
use axum::{
    body::Body,
    extract::State,
    http::{Request, StatusCode},
    middleware::Next,
    response::Response,
};
use tracing::{info, warn};

/// Consent enforcement middleware for presentation operations
pub async fn enforce_consent(
    State(state): State<AppState>,
    request: Request<Body>,
    next: Next,
) -> Result<Response, StatusCode> {
    // Extract DIDs from headers
    let holder_did = request
        .headers()
        .get("X-Holder-DID")
        .and_then(|v| v.to_str().ok());

    let verifier_did = request
        .headers()
        .get("X-Verifier-DID")
        .and_then(|v| v.to_str().ok());

    // If DIDs present, check consent
    if let (Some(holder), Some(verifier)) = (holder_did, verifier_did) {
        let verifier_service = state.verifier_service();

        match verifier_service
            .check_consent(verifier, holder, "presentation_verification")
            .await
        {
            Ok(true) => {
                info!("Consent valid for {}  → {}", holder, verifier);
            }
            Ok(false) => {
                warn!(
                    "Consent denied for {} → {}: No valid consent record",
                    holder, verifier
                );
                return Err(StatusCode::FORBIDDEN);
            }
            Err(e) => {
                warn!("Consent check error for {} → {}: {}", holder, verifier, e);
                return Err(StatusCode::INTERNAL_SERVER_ERROR);
            }
        }
    }

    // Continue with request
    Ok(next.run(request).await)
}

/// Consent validation helper
pub async fn validate_consent_for_operation(
    state: &AppState,
    holder_did: &str,
    verifier_did: &str,
    operation: &str,
) -> Result<(), AppError> {
    let verifier_service = state.verifier_service();

    let is_valid = verifier_service
        .check_consent(verifier_did, holder_did, operation)
        .await?;

    if !is_valid {
        return Err(AppError::UnauthorizedError(format!(
            "No valid consent for operation '{}' between holder {} and verifier {}",
            operation, holder_did, verifier_did
        )));
    }

    Ok(())
}

/// Auto-expire consents based on policy
pub async fn cleanup_expired_consents(state: &AppState) -> Result<u64, AppError> {
    use chrono::Utc;
    use mongodb::bson::{self, doc};

    let now = Utc::now();
    let now_bson = bson::to_bson(&now)?;

    // Find all non-revoked legacy consent records that have passed their expiry and are not yet marked expired
    let expired_legacy_consents = state
        .db
        .find_many::<ConsentRecord>(
            "consent_records",
            doc! {
                "revoked": false,
                "expired": { "$ne": true },
                "expires_at": { "$lt": now_bson.clone() },
            },
        )
        .await?;

    // Find all wallet consents that have expired and are not yet marked expired
    let expired_consents = state
        .db
        .find_expired_consents(
            bson::DateTime::from_millis(now.timestamp_millis()),
            None,
            None,
        )
        .await?;

    if expired_legacy_consents.is_empty() && expired_consents.is_empty() {
        return Ok(0);
    }

    let presentation_service = state.presentation_service();
    let mut processed = 0u64;

    for consent in expired_legacy_consents {
        let holder_did = consent.user_did.clone();
        let verifier_did = consent.verifier_did.clone();
        let revoked_attrs = consent.data_categories.clone();

        let update_doc = doc! {
            "$set": {
                "expired": true,
                "expired_at": bson::to_bson(&now)?,
                "updated_at": bson::to_bson(&now)?,
                "data_categories": bson::to_bson(&Vec::<String>::new())?,
            }
        };

        state
            .db
            .update_one(
                "consent_records",
                doc! { "id": &consent.id },
                update_doc,
            )
            .await?;

        // Update any persisted presentations so verifiers see the expired status
        presentation_service
            .update_presentations_after_consent_change(
                &holder_did,
                &verifier_did,
                &revoked_attrs,
                Some(&[]),
                true,
            )
            .await?;

        processed += 1;
    }

    // Process wallet consents
    for consent in expired_consents {
        let holder_did = consent.holder_did.clone();
        let verifier_did = consent.verifier_did.clone();
        let revoked_attrs = consent.data_categories.clone();
        let consent_id = match &consent.id {
            Some(id) => id.clone(),
            None => {
                warn!(
                    "Skipping wallet consent without id for holder {} → verifier {}",
                    holder_did, verifier_did
                );
                continue;
            }
        };

        state
            .db
            .mark_consent_expired(&consent_id, bson::DateTime::from_millis(now.timestamp_millis()))
            .await?;

        presentation_service
            .update_presentations_after_consent_change(
                &holder_did,
                &verifier_did,
                &revoked_attrs,
                Some(&[]),
                true,
            )
            .await?;

        processed += 1;
    }

    info!("Marked {} expired consent(s)", processed);

    Ok(processed)
}