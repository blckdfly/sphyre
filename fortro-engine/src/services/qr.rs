use crate::db::Database;
use crate::error::AppError;
use crate::models::{CredentialOffer, PresentationRequest, ShortUrlQrCode};
use crate::utils::qr;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::Arc;

pub struct QrService {
    db: Arc<Database>,
}

impl QrService {
    pub fn new(db: Arc<Database>) -> Self {
        Self { db }
    }

    /// Generate a QR code for a credential offer
    pub async fn generate_credential_offer_qr(
        &self,
        issuer_did: &str,
        credential_id: &str,
        recipient_did: Option<String>,
    ) -> Result<String, AppError> {
        // Get the credential from the database
        let credential = self
            .db
            .get_credential_by_id(credential_id)
            .await?
            .ok_or_else(|| {
                AppError::NotFoundError(format!("Credential with ID {} not found", credential_id))
            })?;

        // Verify that the credential belongs to the issuer
        if credential.issuer_did != issuer_did {
            return Err(AppError::AccessDeniedError(
                "You can only create offers for credentials you issued".to_string(),
            ));
        }

        // Get the issuer info
        let issuer = self
            .db
            .find_one::<HashMap<String, Value>>("issuers", bson::doc! { "id": issuer_did })
            .await?
            .ok_or_else(|| AppError::NotFoundError(format!("Issuer {} not found", issuer_did)))?;

        let issuer_name = issuer
            .get("name")
            .and_then(|v| v.as_str())
            .unwrap_or("Unknown Issuer")
            .to_string();

        // Extract attribute names from credential preview
        let attribute_names: Vec<String> = credential
            .credential_preview
            .as_ref()
            .map(|data| data.keys().cloned().collect())
            .unwrap_or_default();

        // Create issuer_data with issuer name
        let mut issuer_data_map = HashMap::new();
        issuer_data_map.insert(
            "issuer_name".to_string(),
            Value::String(issuer_name.clone()),
        );
        issuer_data_map.insert(
            "credential_type".to_string(),
            Value::String(credential.credential_type.clone()),
        );

        // Create a credential offer with complete data
        let offer = CredentialOffer {
            id: uuid::Uuid::new_v4().to_string(),
            issuer_did: issuer_did.to_string(),
            credential_type: credential.credential_type.clone(),
            schema_id: credential.schema_id.clone(),
            template_id: "".to_string(),
            credential_id: Some(credential_id.to_string()),
            recipient_did: None,
            status: crate::models::OfferStatus::Pending,
            accepted_by_did: None,
            accepted_at: None,
            one_time_used: false,
            issuer_data: Some(issuer_data_map),
            created_at: chrono::Utc::now(),
            expires_at: Some(chrono::Utc::now() + chrono::Duration::hours(24)),
            preview: credential.credential_preview.clone().unwrap_or_default(),
            extensions: credential.extensions.clone(),
        };

        tracing::info!(
            "Generated credential offer: type={}, schema={}, issuer={}, attributes={:?}",
            offer.credential_type,
            offer.schema_id,
            issuer_name,
            attribute_names
        );

        self.db.insert_one("credential_offers", &offer).await?;
        tracing::info!("[QR Service] Saved offer to database: id={}", offer.id);

        // Create a QR code for the offer
        let qr_content = qr::create_credential_offer_qr(&offer, None)?;
        let json_string = qr_content.to_json_string()?;

        crate::utils::qr::generate_qr_image(&json_string)
    }

    pub async fn generate_offer_qr(&self, offer_id: &str) -> Result<String, AppError> {
        let offer = self
            .db
            .find_one::<CredentialOffer>("credential_offers", bson::doc! { "id": offer_id })
            .await?
            .ok_or_else(|| {
                AppError::NotFoundError(format!("Credential offer with ID {} not found", offer_id))
            })?;

        let template = self
            .db
            .find_one::<crate::models::CredentialTemplate>(
                "credential_templates",
                bson::doc! { "id": &offer.template_id },
            )
            .await?
            .ok_or_else(|| {
                AppError::NotFoundError(format!("Template {} not found", offer.template_id))
            })?;

        let holder_fields: Vec<serde_json::Value> = template
            .fields
            .iter()
            .filter(|f| f.source == crate::models::FieldSource::HolderInput)
            .map(|f| {
                serde_json::json!({
                    "name": f.name,
                    "field_type": f.field_type,
                    "required": f.required,
                    "placeholder": f.placeholder,
                    "help_text": f.help_text,
                })
            })
            .collect();

        let issuer = self
            .db
            .find_one::<HashMap<String, Value>>("issuers", bson::doc! { "id": &offer.issuer_did })
            .await?
            .ok_or_else(|| {
                AppError::NotFoundError(format!("Issuer {} not found", offer.issuer_did))
            })?;

        let issuer_name = issuer
            .get("name")
            .and_then(|v| v.as_str())
            .unwrap_or("Unknown Issuer")
            .to_string();

        let qr_data = serde_json::json!({
            "type": "credential_offer",
            "offer_id": offer.id,
            "issuer_did": offer.issuer_did,
            "issuer_name": issuer_name,
            "credential_type": offer.credential_type,
            "schema_id": offer.schema_id,
            "template_id": offer.template_id,
            "holder_fields": holder_fields,
            "issuer_data_preview": offer.issuer_data,
            "preview": offer.preview,
            "expires_at": offer.expires_at,
            "created_at": offer.created_at,
        });

        tracing::info!(
            "Generated offer QR: offer_id={}, credential_type={}, issuer={}, holder_fields_count={}",
            offer.id,
            offer.credential_type,
            issuer_name,
            holder_fields.len()
        );

        let json_string = serde_json::to_string(&qr_data)
            .map_err(|e| AppError::InternalError(format!("Failed to serialize QR data: {}", e)))?;

        crate::utils::qr::generate_qr_image(&json_string)
    }

    pub async fn generate_presentation_request_qr(
        &self,
        verifier_did: &str,
        schema_ids: &[String],
        purpose: &str,
        recipient_did: Option<String>,
    ) -> Result<String, AppError> {
        let request = PresentationRequest {
            id: uuid::Uuid::new_v4().to_string(),
            verifier_did: verifier_did.to_string(),
            presentation_type: "".to_string(),
            schema_ids: schema_ids.to_vec(),
            purpose: purpose.to_string(),
            recipient_did,
            created_at: chrono::Utc::now(),
            expires_at: Some(chrono::Utc::now() + chrono::Duration::hours(24)),
            callback_url: None,
            required_credentials: vec![],
            status: crate::models::PresentationRequestStatus::Pending,
            presentation_data: std::collections::HashMap::new(),
            rejection_reason: None,
            failure_code: None,
            failure_details: None,
            updated_at: chrono::Utc::now(),
            required_predicates: None,
        };

        let qr_content = qr::create_presentation_request_qr(&request)?;
        let json_string = qr_content.to_json_string()?;

        crate::utils::qr::generate_qr_image(&json_string)
    }

    /// Generate a short URL QR code for a credential offer
    pub async fn generate_credential_offer_short_url(
        &self,
        issuer_did: &str,
        credential_id: &str,
        recipient_did: Option<String>,
    ) -> Result<String, AppError> {
        // Get the credential from the database
        let credential = self
            .db
            .get_credential_by_id(credential_id)
            .await?
            .ok_or_else(|| {
                AppError::NotFoundError(format!("Credential with ID {} not found", credential_id))
            })?;

        // Verify that the credential belongs to the issuer
        if credential.issuer_did != issuer_did {
            return Err(AppError::AccessDeniedError(
                "You can only create offers for credentials you issued".to_string(),
            ));
        }

        let offer = CredentialOffer {
            id: uuid::Uuid::new_v4().to_string(),
            issuer_did: issuer_did.to_string(),
            credential_type: credential.credential_type.clone(),
            schema_id: credential.schema_id.clone(),
            template_id: "".to_string(),
            credential_id: Some(credential_id.to_string()),
            recipient_did: None,
            status: crate::models::OfferStatus::Pending,
            accepted_by_did: None,
            accepted_at: None,
            one_time_used: false,
            issuer_data: None,
            created_at: chrono::Utc::now(),
            expires_at: Some(chrono::Utc::now() + chrono::Duration::hours(24)),
            preview: credential.credential_preview.clone().unwrap_or_default(),
            extensions: credential.extensions.clone(),
        };

        let qr_content = qr::create_credential_offer_qr(&offer, None)?;
        let qr_json = qr_content.to_json_string()?;

        // Create a short URL QR code
        let short_url_qr = ShortUrlQrCode::new(
            "credential-offer".to_string(),
            serde_json::from_str(&qr_json)?,
            issuer_did.to_string(),
            offer.expires_at,
        );

        // Save the short URL QR code
        self.db.save_short_url_qr_code(&short_url_qr).await?;

        Ok(short_url_qr.short_id)
    }

    /// Generate a short URL QR code for a presentation request
    pub async fn generate_presentation_request_short_url(
        &self,
        verifier_did: &str,
        schema_ids: &[String],
        purpose: &str,
        recipient_did: Option<String>,
    ) -> Result<String, AppError> {
        let request = PresentationRequest {
            id: uuid::Uuid::new_v4().to_string(),
            verifier_did: verifier_did.to_string(),
            presentation_type: "".to_string(),
            schema_ids: schema_ids.to_vec(),
            purpose: purpose.to_string(),
            recipient_did,
            created_at: chrono::Utc::now(),
            expires_at: Some(chrono::Utc::now() + chrono::Duration::hours(24)),
            callback_url: None,
            required_credentials: vec![],
            status: crate::models::PresentationRequestStatus::Pending,
            presentation_data: std::collections::HashMap::new(),
            rejection_reason: None,
            failure_code: None,
            failure_details: None,
            updated_at: chrono::Utc::now(),
            required_predicates: None,
        };

        let qr_content = qr::create_presentation_request_qr(&request)?;
        let qr_json = qr_content.to_json_string()?;

        let short_url_qr = ShortUrlQrCode::new(
            "presentation-request".to_string(),
            serde_json::from_str(&qr_json)?,
            verifier_did.to_string(),
            request.expires_at,
        );

        self.db.save_short_url_qr_code(&short_url_qr).await?;

        Ok(short_url_qr.short_id)
    }

    /// Resolve a short URL to QR code content
    pub async fn resolve_short_url(&self, short_id: &str) -> Result<Value, AppError> {
        // Find the short URL QR code
        let short_url_qr = self
            .db
            .find_short_url_qr_code_by_short_id(short_id)
            .await?
            .ok_or_else(|| {
                AppError::NotFoundError(format!("QR code with short ID {} not found", short_id))
            })?;

        // Check if the QR code is expired
        if short_url_qr.is_expired() {
            return Err(AppError::ValidationError("QR code has expired".to_string()));
        }

        // Return the QR code content with type
        Ok(json!({
            "type": short_url_qr.qr_type,
            "content": short_url_qr.content
        }))
    }
}
