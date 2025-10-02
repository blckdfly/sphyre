use crate::error::AppError;
use crate::models::{CredentialOffer, PresentationRequest};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use uuid::Uuid;

/// QR code content types
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum QrCodeType {
    #[serde(rename = "credential-offer")]
    CredentialOffer,
    #[serde(rename = "presentation-request")]
    PresentationRequest,
    #[serde(rename = "connection-invitation")]
    ConnectionInvitation,
}

/// QR code content
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QrCodeContent {
    pub id: String,
    pub type_: QrCodeType,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub expires_at: Option<chrono::DateTime<chrono::Utc>>,
    pub callback_url: Option<String>,
    pub data: Value,
}

impl QrCodeContent {
    /// Create a new QR code content
    pub fn new(
        type_: QrCodeType,
        data: Value,
        expires_at: Option<chrono::DateTime<chrono::Utc>>,
        callback_url: Option<String>,
    ) -> Self {
        Self {
            id: Uuid::new_v4().to_string(),
            type_,
            created_at: chrono::Utc::now(),
            expires_at,
            callback_url,
            data,
        }
    }

    /// Convert to JSON string
    pub fn to_json_string(&self) -> Result<String, AppError> {
        serde_json::to_string(self)
            .map_err(|e| AppError::ValidationError(format!("Failed to serialize QR code content: {}", e)))
    }

    /// Parse from JSON string
    pub fn from_json_string(json_str: &str) -> Result<Self, AppError> {
        serde_json::from_str(json_str)
            .map_err(|e| AppError::ValidationError(format!("Failed to parse QR code content: {}", e)))
    }

    /// Check if the QR code is expired
    pub fn is_expired(&self) -> bool {
        if let Some(expires_at) = self.expires_at {
            chrono::Utc::now() > expires_at
        } else {
            false
        }
    }
}

/// Create a QR code content for a credential offer
pub fn create_credential_offer_qr(
    offer: &CredentialOffer,
    callback_url: Option<String>,
) -> Result<QrCodeContent, AppError> {
    let data = serde_json::to_value(offer)
        .map_err(|e| AppError::ValidationError(format!("Failed to serialize credential offer: {}", e)))?;

    Ok(QrCodeContent::new(
        QrCodeType::CredentialOffer,
        data,
        offer.expires_at,
        callback_url,
    ))
}

/// Create a QR code content for a presentation request
pub fn create_presentation_request_qr(
    request: &PresentationRequest,
) -> Result<QrCodeContent, AppError> {
    let data = serde_json::to_value(request)
        .map_err(|e| AppError::ValidationError(format!("Failed to serialize presentation request: {}", e)))?;

    Ok(QrCodeContent::new(
        QrCodeType::PresentationRequest,
        data,
        request.expires_at,
        request.callback_url.clone(),
    ))
}

/// Extract a credential offer from a QR code content
pub fn extract_credential_offer(qr_content: &QrCodeContent) -> Result<CredentialOffer, AppError> {
    if !matches!(qr_content.type_, QrCodeType::CredentialOffer) {
        return Err(AppError::ValidationError(
            "QR code content is not a credential offer".to_string(),
        ));
    }

    if qr_content.is_expired() {
        return Err(AppError::ValidationError("Credential offer is expired".to_string()));
    }

    serde_json::from_value(qr_content.data.clone())
        .map_err(|e| AppError::ValidationError(format!("Failed to parse credential offer: {}", e)))
}

/// Extract a presentation request from a QR code content
pub fn extract_presentation_request(qr_content: &QrCodeContent) -> Result<PresentationRequest, AppError> {
    if !matches!(qr_content.type_, QrCodeType::PresentationRequest) {
        return Err(AppError::ValidationError(
            "QR code content is not a presentation request".to_string(),
        ));
    }

    if qr_content.is_expired() {
        return Err(AppError::ValidationError("Presentation request is expired".to_string()));
    }

    serde_json::from_value(qr_content.data.clone())
        .map_err(|e| AppError::ValidationError(format!("Failed to parse presentation request: {}", e)))
}

/// Extract a connection invitation from a QR code content
pub fn extract_connection_invitation(
    qr_content: &QrCodeContent,
) -> Result<(String, String, String), AppError> {
    if !matches!(qr_content.type_, QrCodeType::ConnectionInvitation) {
        return Err(AppError::ValidationError(
            "QR code content is not a connection invitation".to_string(),
        ));
    }

    if qr_content.is_expired() {
        return Err(AppError::ValidationError("Connection invitation is expired".to_string()));
    }

    let inviter_did = qr_content.data["inviterDid"]
        .as_str()
        .ok_or_else(|| AppError::ValidationError("Missing inviterDid in connection invitation".to_string()))?
        .to_string();

    let label = qr_content.data["label"]
        .as_str()
        .ok_or_else(|| AppError::ValidationError("Missing label in connection invitation".to_string()))?
        .to_string();

    let endpoint = qr_content.data["endpoint"]
        .as_str()
        .ok_or_else(|| AppError::ValidationError("Missing endpoint in connection invitation".to_string()))?
        .to_string();

    Ok((inviter_did, label, endpoint))
}
