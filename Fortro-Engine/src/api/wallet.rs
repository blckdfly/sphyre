use axum::{
    extract::{Json, Path, State},
    http::StatusCode,
    routing::{get, post, delete},
    Router,
};
use serde::{Deserialize};
use serde_json::json;

use crate::error::AppError;
use crate::services::AppState;
use crate::services::wallet::{
    CreateWalletRequest, ImportCredentialRequest, ShareCredentialRequest, GrantConsentRequest,
};

/// Create wallet routes
pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/", post(create_wallet))
        .route("/:did", get(get_wallet))
        .route("/:did/credentials", get(get_credentials))
        .route("/:did/credentials/import", post(import_credential))
        .route("/:did/credentials/:credential_id", get(get_credential))
        .route("/:did/credentials/:credential_id", delete(delete_credential))
        .route("/:did/credentials/share", post(share_credentials))
        .route("/:did/presentations", get(get_presentations))
        .route("/:did/consents", get(get_consents))
        .route("/:did/consents", post(grant_consent))
        .route("/:did/consents/:consent_id/revoke", post(revoke_consent))
        .route("/:did/statistics", get(get_statistics))
        .route("/:did/backup", post(backup_wallet))
        .route("/restore", post(restore_wallet))
        .route("/scan-qr", post(scan_qr_code))
}

/// Scan QR code request
#[derive(Debug, Deserialize)]
pub struct ScanQrCodeRequest {
    pub qr_data: String,
}

/// Backup wallet request
#[derive(Debug, Deserialize)]
pub struct BackupWalletRequest {
    pub password: String,
}

/// Restore wallet request
#[derive(Debug, Deserialize)]
pub struct RestoreWalletRequest {
    pub backup_data: String,
    pub password: String,
}

/// Create wallet handler
async fn create_wallet(
    State(state): State<AppState>,
    Json(request): Json<CreateWalletRequest>,
) -> Result<(StatusCode, Json<serde_json::Value>), AppError> {
    let wallet_service = state.wallet_service();
    let wallet = wallet_service.create_wallet(request).await?;

    Ok((
        StatusCode::CREATED,
        Json(json!({
            "success": true,
            "message": "Wallet created successfully",
            "wallet": wallet,
        })),
    ))
}

/// Get wallet handler
async fn get_wallet(
    State(state): State<AppState>,
    Path(did): Path<String>,
) -> Result<(StatusCode, Json<serde_json::Value>), AppError> {
    let wallet_service = state.wallet_service();
    let wallet = wallet_service.get_wallet(&did).await?;

    Ok((
        StatusCode::OK,
        Json(json!({
            "success": true,
            "wallet": wallet,
        })),
    ))
}

/// Get credentials handler
async fn get_credentials(
    State(state): State<AppState>,
    Path(did): Path<String>,
) -> Result<(StatusCode, Json<serde_json::Value>), AppError> {
    let wallet_service = state.wallet_service();
    let credentials = wallet_service.get_credential_summaries(&did).await?;

    Ok((
        StatusCode::OK,
        Json(json!({
            "success": true,
            "credentials": credentials,
        })),
    ))
}

/// Get credential handler
async fn get_credential(
    State(state): State<AppState>,
    Path((did, credential_id)): Path<(String, String)>,
) -> Result<(StatusCode, Json<serde_json::Value>), AppError> {
    let credential_service = state.credential_service();
    let credential = credential_service.get_credential_by_id(&credential_id).await?
        .ok_or_else(|| AppError::NotFoundError(format!("Credential with ID {} not found", credential_id)))?;

    // Check if the credential belongs to the wallet
    if credential.owner_did != did {
        return Err(AppError::AccessDeniedError("You can only access your own credentials".to_string()));
    }

    Ok((
        StatusCode::OK,
        Json(json!({
            "success": true,
            "credential": credential,
        })),
    ))
}

/// Import credential handler
async fn import_credential(
    State(state): State<AppState>,
    Path(did): Path<String>,
    Json(request): Json<ImportCredentialRequest>,
) -> Result<(StatusCode, Json<serde_json::Value>), AppError> {
    let wallet_service = state.wallet_service();
    let credential = wallet_service.import_credential(&did, request).await?;

    Ok((
        StatusCode::OK,
        Json(json!({
            "success": true,
            "message": "Credential imported successfully",
            "credential": credential,
        })),
    ))
}

/// Delete credential handler
async fn delete_credential(
    State(state): State<AppState>,
    Path((did, credential_id)): Path<(String, String)>,
) -> Result<(StatusCode, Json<serde_json::Value>), AppError> {
    let wallet_service = state.wallet_service();
    let success = wallet_service.delete_credential(&did, &credential_id).await?;

    Ok((
        StatusCode::OK,
        Json(json!({
            "success": success,
            "message": "Credential deleted successfully",
        })),
    ))
}

/// Share credentials handler
async fn share_credentials(
    State(state): State<AppState>,
    Path(did): Path<String>,
    Json(request): Json<ShareCredentialRequest>,
) -> Result<(StatusCode, Json<serde_json::Value>), AppError> {
    // In a real implementation, we would extract the private key from a secure source
    // For this example, we'll use a dummy key
    let private_key = "dummy_key";
    
    let wallet_service = state.wallet_service();
    let jwt = wallet_service.share_credentials(&did, private_key, request).await?;

    Ok((
        StatusCode::OK,
        Json(json!({
            "success": true,
            "message": "Credentials shared successfully",
            "jwt": jwt,
        })),
    ))
}

/// Get presentations handler
async fn get_presentations(
    State(state): State<AppState>,
    Path(did): Path<String>,
) -> Result<(StatusCode, Json<serde_json::Value>), AppError> {
    let wallet_service = state.wallet_service();
    let presentations = wallet_service.get_presentations(&did).await?;

    Ok((
        StatusCode::OK,
        Json(json!({
            "success": true,
            "presentations": presentations,
        })),
    ))
}

/// Get consents handler
async fn get_consents(
    State(state): State<AppState>,
    Path(did): Path<String>,
) -> Result<(StatusCode, Json<serde_json::Value>), AppError> {
    let wallet_service = state.wallet_service();
    let consents = wallet_service.get_consent_records(&did).await?;

    Ok((
        StatusCode::OK,
        Json(json!({
            "success": true,
            "consents": consents,
        })),
    ))
}

/// Grant consent handler
async fn grant_consent(
    State(state): State<AppState>,
    Path(did): Path<String>,
    Json(request): Json<GrantConsentRequest>,
) -> Result<(StatusCode, Json<serde_json::Value>), AppError> {
    let wallet_service = state.wallet_service();
    let consent = wallet_service.grant_consent(&did, request).await?;

    Ok((
        StatusCode::OK,
        Json(json!({
            "success": true,
            "message": "Consent granted successfully",
            "consent": consent,
        })),
    ))
}

/// Revoke consent handler
async fn revoke_consent(
    State(state): State<AppState>,
    Path((did, consent_id)): Path<(String, String)>,
) -> Result<(StatusCode, Json<serde_json::Value>), AppError> {
    let wallet_service = state.wallet_service();
    let success = wallet_service.revoke_consent(&did, &consent_id).await?;

    Ok((
        StatusCode::OK,
        Json(json!({
            "success": success,
            "message": "Consent revoked successfully",
        })),
    ))
}

/// Get statistics handler
async fn get_statistics(
    State(state): State<AppState>,
    Path(did): Path<String>,
) -> Result<(StatusCode, Json<serde_json::Value>), AppError> {
    let wallet_service = state.wallet_service();
    let statistics = wallet_service.get_wallet_statistics(&did).await?;

    Ok((
        StatusCode::OK,
        Json(json!({
            "success": true,
            "statistics": statistics,
        })),
    ))
}

/// Backup wallet handler
async fn backup_wallet(
    State(state): State<AppState>,
    Path(did): Path<String>,
    Json(request): Json<BackupWalletRequest>,
) -> Result<(StatusCode, Json<serde_json::Value>), AppError> {
    let wallet_service = state.wallet_service();
    let backup_data = wallet_service.generate_backup(&did, &request.password).await?;

    Ok((
        StatusCode::OK,
        Json(json!({
            "success": true,
            "message": "Wallet backup generated successfully",
            "backup_data": backup_data,
        })),
    ))
}

/// Restore wallet handler
async fn restore_wallet(
    State(state): State<AppState>,
    Json(request): Json<RestoreWalletRequest>,
) -> Result<(StatusCode, Json<serde_json::Value>), AppError> {
    let wallet_service = state.wallet_service();
    let wallet = wallet_service.restore_backup(&request.backup_data, &request.password).await?;

    Ok((
        StatusCode::OK,
        Json(json!({
            "success": true,
            "message": "Wallet restored successfully",
            "wallet": wallet,
        })),
    ))
}

/// Scan QR code handler
async fn scan_qr_code(
    State(state): State<AppState>,
    Json(request): Json<ScanQrCodeRequest>,
) -> Result<(StatusCode, Json<serde_json::Value>), AppError> {
    let wallet_service = state.wallet_service();
    let result = wallet_service.scan_qr_code(&request.qr_data).await?;

    Ok((
        StatusCode::OK,
        Json(json!({
            "success": true,
            "result": result,
        })),
    ))
}