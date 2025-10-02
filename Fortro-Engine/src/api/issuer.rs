use axum::{
    extract::{Json, Path, State, Query},
    http::StatusCode,
    routing::{get, post, put, delete},
    Router,
};
use serde::{Deserialize};
use serde_json::json;
use std::collections::HashMap;
use crate::error::AppError;
use crate::services::AppState;
use crate::services::issuer::{
    CreateIssuerRequest, CreateSchemaRequest, IssueCredentialRequest, 
    CreateCredentialTemplateRequest,
};

/// Create issuer routes
pub fn routes() -> Router<AppState> {
    Router::new()
        // Issuer management
        .route("/", post(create_issuer))
        .route("/:did", get(get_issuer))
        .route("/:did/update", put(update_issuer))

        // Schema management
        .route("/:did/schemas", post(create_schema))
        .route("/:did/schemas", get(list_schemas))
        .route("/:did/schemas/:schema_id", get(get_schema))
        .route("/:did/schemas/:schema_id", put(update_schema))
        .route("/:did/schemas/:schema_id", delete(delete_schema))

        // Credential templates
        .route("/:did/templates", post(create_credential_template))
        .route("/:did/templates", get(list_credential_templates))
        .route("/:did/templates/:template_id", get(get_credential_template))
        .route("/:did/templates/:template_id", put(update_credential_template))
        .route("/:did/templates/:template_id", delete(delete_credential_template))

        // Credential issuance
        .route("/:did/issue", post(|state: State<AppState>, path: Path<String>, json: Json<IssueCredentialRequest>| async move {
            issue_credential(state, path, json).await
        }))
        .route("/:did/credentials", get(list_issued_credentials))
        .route("/:did/credentials/:credential_id", get(get_issued_credential))
        .route("/:did/credentials/:credential_id/revoke", post(revoke_credential))

        // Credential requests from users
        .route("/:did/requests", get(list_credential_requests))
        .route("/:did/requests/:request_id", get(get_credential_request))
        .route("/:did/requests/:request_id/approve", post(|state: State<AppState>, path: Path<(String, String)>| async move {
            approve_credential_request(state, path).await
        }))
        .route("/:did/requests/:request_id/reject", post(|state: State<AppState>, path: Path<(String, String)>, json: Json<Option<String>>| async move {
            reject_credential_request(state, path, json).await
        }))

        // QR code generation
        .route("/:did/qr/credential-offer", post(generate_credential_offer_qr))
        .route("/:did/qr/presentation-request", post(generate_presentation_request_qr))

        // Dashboard statistics
        .route("/:did/statistics", get(get_issuer_statistics))
}

/// Create issuer handler
async fn create_issuer(
    State(state): State<AppState>,
    Json(request): Json<CreateIssuerRequest>,
) -> Result<(StatusCode, Json<serde_json::Value>), AppError> {
    let issuer_service = state.issuer_service();
    let issuer = issuer_service.create_issuer(request).await?;

    Ok((
        StatusCode::CREATED,
        Json(json!({
            "success": true,
            "message": "Issuer created successfully",
            "issuer": issuer,
        })),
    ))
}

/// Get issuer handler
async fn get_issuer(
    State(state): State<AppState>,
    Path(did): Path<String>,
) -> Result<(StatusCode, Json<serde_json::Value>), AppError> {
    let issuer_service = state.issuer_service();
    let issuer = issuer_service.get_issuer(&did).await?;

    Ok((
        StatusCode::OK,
        Json(json!({
            "success": true,
            "issuer": issuer,
        })),
    ))
}

/// Update issuer handler
async fn update_issuer(
    State(state): State<AppState>,
    Path(did): Path<String>,
    Json(request): Json<HashMap<String, serde_json::Value>>,
) -> Result<(StatusCode, Json<serde_json::Value>), AppError> {
    let issuer_service = state.issuer_service();
    let issuer = issuer_service.update_issuer(&did, request).await?;

    Ok((
        StatusCode::OK,
        Json(json!({
            "success": true,
            "message": "Issuer updated successfully",
            "issuer": issuer,
        })),
    ))
}

/// Create schema handler
async fn create_schema(
    State(state): State<AppState>,
    Path(did): Path<String>,
    Json(request): Json<CreateSchemaRequest>,
) -> Result<(StatusCode, Json<serde_json::Value>), AppError> {
    let schema_service = state.schema_service();
    let schema = schema_service.create_schema(&did, request).await?;

    Ok((
        StatusCode::CREATED,
        Json(json!({
            "success": true,
            "message": "Schema created successfully",
            "schema": schema,
        })),
    ))
}

/// List schemas handler
async fn list_schemas(
    State(state): State<AppState>,
    Path(did): Path<String>,
) -> Result<(StatusCode, Json<serde_json::Value>), AppError> {
    let schema_service = state.schema_service();
    let schemas = schema_service.list_schemas_by_issuer(&did).await?;

    Ok((
        StatusCode::OK,
        Json(json!({
            "success": true,
            "schemas": schemas,
        })),
    ))
}

/// Get schema handler
async fn get_schema(
    State(state): State<AppState>,
    Path((did, schema_id)): Path<(String, String)>,
) -> Result<(StatusCode, Json<serde_json::Value>), AppError> {
    let schema_service = state.schema_service();
    let schema = schema_service.get_schema_by_id(&schema_id).await?
        .ok_or_else(|| AppError::NotFoundError(format!("Schema with ID {} not found", schema_id)))?;

    // Verify that the schema belongs to the issuer
    if schema.issuer_did != did {
        return Err(AppError::AccessDeniedError("You can only access your own schemas".to_string()));
    }

    Ok((
        StatusCode::OK,
        Json(json!({
            "success": true,
            "schema": schema,
        })),
    ))
}

/// Update schema handler
async fn update_schema(
    State(state): State<AppState>,
    Path((did, schema_id)): Path<(String, String)>,
    Json(request): Json<CreateSchemaRequest>,
) -> Result<(StatusCode, Json<serde_json::Value>), AppError> {
    let schema_service = state.schema_service();
    let schema = schema_service.update_schema(&did, &schema_id, request).await?;

    Ok((
        StatusCode::OK,
        Json(json!({
            "success": true,
            "message": "Schema updated successfully",
            "schema": schema,
        })),
    ))
}

/// Delete schema handler
async fn delete_schema(
    State(state): State<AppState>,
    Path((did, schema_id)): Path<(String, String)>,
) -> Result<(StatusCode, Json<serde_json::Value>), AppError> {
    let schema_service = state.schema_service();
    let success = schema_service.delete_schema(&did, &schema_id).await?;

    Ok((
        StatusCode::OK,
        Json(json!({
            "success": success,
            "message": "Schema deleted successfully",
        })),
    ))
}

async fn create_credential_template(
    State(state): State<AppState>,
    Path(did): Path<String>,
    Json(request): Json<CreateCredentialTemplateRequest>,
) -> Result<(StatusCode, Json<serde_json::Value>), AppError> {
    let issuer_service = state.issuer_service();
    let template = issuer_service.create_credential_template(&did, request).await?;

    Ok((
        StatusCode::CREATED,
        Json(json!({
            "success": true,
            "message": "Credential template created successfully",
            "template": template,
        })),
    ))
}

/// List credential templates handler
async fn list_credential_templates(
    State(state): State<AppState>,
    Path(did): Path<String>,
) -> Result<(StatusCode, Json<serde_json::Value>), AppError> {
    let issuer_service = state.issuer_service();
    let templates = issuer_service.list_credential_templates(&did).await?;

    Ok((
        StatusCode::OK,
        Json(json!({
            "success": true,
            "templates": templates,
        })),
    ))
}

/// Get credential template handler
async fn get_credential_template(
    State(state): State<AppState>,
    Path((did, template_id)): Path<(String, String)>,
) -> Result<(StatusCode, Json<serde_json::Value>), AppError> {
    let issuer_service = state.issuer_service();
    let template = issuer_service.get_credential_template(&did, &template_id).await?;

    Ok((
        StatusCode::OK,
        Json(json!({
            "success": true,
            "template": template,
        })),
    ))
}

/// Update credential template handler
async fn update_credential_template(
    State(state): State<AppState>,
    Path((did, template_id)): Path<(String, String)>,
    Json(request): Json<HashMap<String, serde_json::Value>>,
) -> Result<(StatusCode, Json<serde_json::Value>), AppError> {
    let issuer_service = state.issuer_service();
    let template = issuer_service.update_credential_template(&did, &template_id, request).await?;

    Ok((
        StatusCode::OK,
        Json(json!({
            "success": true,
            "message": "Credential template updated successfully",
            "template": template,
        })),
    ))
}

/// Delete credential template handler
async fn delete_credential_template(
    State(state): State<AppState>,
    Path((did, template_id)): Path<(String, String)>,
) -> Result<(StatusCode, Json<serde_json::Value>), AppError> {
    let issuer_service = state.issuer_service();
    let success = issuer_service.delete_credential_template(&did, &template_id).await?;

    Ok((
        StatusCode::OK,
        Json(json!({
            "success": success,
            "message": "Credential template deleted successfully",
        })),
    ))
}


/// Issue credential handler
async fn issue_credential(
    State(state): State<AppState>,
    Path(did): Path<String>,
    Json(request): Json<IssueCredentialRequest>,
) -> Result<(StatusCode, Json<serde_json::Value>), AppError> {
    let credential_service = state.credential_service();
    let credential = credential_service.issue_credential(&did, request).await?;

    Ok((
        StatusCode::CREATED,
        Json(json!({
            "success": true,
            "message": "Credential issued successfully",
            "credential": credential,
        })),
    ))
}

/// List issued credentials handler
async fn list_issued_credentials(
    State(state): State<AppState>,
    Path(did): Path<String>,
    Query(params): Query<HashMap<String, String>>,
) -> Result<(StatusCode, Json<serde_json::Value>), AppError> {
    let credential_service = state.credential_service();
    let credentials = credential_service.list_credentials_by_issuer(&did, params).await?;

    Ok((
        StatusCode::OK,
        Json(json!({
            "success": true,
            "credentials": credentials,
        })),
    ))
}

/// Get issued credential handler
async fn get_issued_credential(
    State(state): State<AppState>,
    Path((did, credential_id)): Path<(String, String)>,
) -> Result<(StatusCode, Json<serde_json::Value>), AppError> {
    let credential_service = state.credential_service();
    let credential = credential_service.get_credential_by_id(&credential_id).await?
        .ok_or_else(|| AppError::NotFoundError(format!("Credential with ID {} not found", credential_id)))?;

    if credential.issuer_did != did {
        return Err(AppError::AccessDeniedError("You can only access credentials you issued".to_string()));
    }

    Ok((
        StatusCode::OK,
        Json(json!({
            "success": true,
            "credential": credential,
        })),
    ))
}

/// Revoke credential handler
async fn revoke_credential(
    State(state): State<AppState>,
    Path((did, credential_id)): Path<(String, String)>,
) -> Result<(StatusCode, Json<serde_json::Value>), AppError> {
    let credential_service = state.credential_service();
    let credential = credential_service.revoke_credential(&did, &credential_id).await?;

    Ok((
        StatusCode::OK,
        Json(json!({
            "success": true,
            "message": "Credential revoked successfully",
            "credential": credential,
        })),
    ))
}

/// List credential requests handler
async fn list_credential_requests(
    State(state): State<AppState>,
    Path(did): Path<String>,
    Query(params): Query<HashMap<String, String>>,
) -> Result<(StatusCode, Json<serde_json::Value>), AppError> {
    let issuer_service = state.issuer_service();
    let requests = issuer_service.list_credential_requests(&did, params).await?;

    Ok((
        StatusCode::OK,
        Json(json!({
            "success": true,
            "requests": requests,
        })),
    ))
}

/// Get credential request handler
async fn get_credential_request(
    State(state): State<AppState>,
    Path((did, request_id)): Path<(String, String)>,
) -> Result<(StatusCode, Json<serde_json::Value>), AppError> {
    let issuer_service = state.issuer_service();
    let request = issuer_service.get_credential_request(&did, &request_id).await?;

    Ok((
        StatusCode::OK,
        Json(json!({
            "success": true,
            "request": request,
        })),
    ))
}

/// Approve credential request handler
async fn approve_credential_request(
    State(state): State<AppState>,
    Path((did, request_id)): Path<(String, String)>,
) -> Result<(StatusCode, Json<serde_json::Value>), AppError> {
    let issuer_service = state.issuer_service();
    let credential = issuer_service.approve_credential_request(&did, &request_id).await?;

    Ok((
        StatusCode::OK,
        Json(json!({
            "success": true,
            "message": "Credential request approved and credential issued",
            "credential": credential,
        })),
    ))
}

/// Reject credential request handler
async fn reject_credential_request(
    State(state): State<AppState>,
    Path((did, request_id)): Path<(String, String)>,
    Json(reason): Json<Option<String>>,
) -> Result<(StatusCode, Json<serde_json::Value>), AppError> {
    let issuer_service = state.issuer_service();
    let request = issuer_service.reject_credential_request(&did, &request_id, reason).await?;

    Ok((
        StatusCode::OK,
        Json(json!({
            "success": true,
            "message": "Credential request rejected",
            "request": request,
        })),
    ))
}

/// Generate credential offer QR code handler
#[derive(Debug, Deserialize)]
pub struct CredentialOfferQrRequest {
    pub credential_id: String,
    pub recipient_did: Option<String>,
}

async fn generate_credential_offer_qr(
    State(state): State<AppState>,
    Path(did): Path<String>,
    Json(request): Json<CredentialOfferQrRequest>,
) -> Result<(StatusCode, Json<serde_json::Value>), AppError> {
    let qr_service = state.qr_service();
    let qr_data = qr_service.generate_credential_offer_qr(&did, &request.credential_id, request.recipient_did).await?;

    Ok((
        StatusCode::OK,
        Json(json!({
            "success": true,
            "qr_data": qr_data,
        })),
    ))
}

/// Generate presentation request QR code handler
#[derive(Debug, Deserialize)]
pub struct PresentationRequestQrRequest {
    pub schema_ids: Vec<String>,
    pub purpose: String,
    pub recipient_did: Option<String>,
}

async fn generate_presentation_request_qr(
    State(state): State<AppState>,
    Path(did): Path<String>,
    Json(request): Json<PresentationRequestQrRequest>,
) -> Result<(StatusCode, Json<serde_json::Value>), AppError> {
    let qr_service = state.qr_service();
    let qr_data = qr_service.generate_presentation_request_qr(
        &did, 
        &request.schema_ids, 
        &request.purpose, 
        request.recipient_did
    ).await?;

    Ok((
        StatusCode::OK,
        Json(json!({
            "success": true,
            "qr_data": qr_data,
        })),
    ))
}

/// Get issuer statistics handler
async fn get_issuer_statistics(
    State(state): State<AppState>,
    Path(did): Path<String>,
) -> Result<(StatusCode, Json<serde_json::Value>), AppError> {
    let issuer_service = state.issuer_service();
    let statistics = issuer_service.get_issuer_statistics(&did).await?;

    Ok((
        StatusCode::OK,
        Json(json!({
            "success": true,
            "statistics": statistics,
        })),
    ))
}
