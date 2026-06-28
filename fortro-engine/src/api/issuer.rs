use crate::blockchain;
use crate::error::AppError;
use crate::services::issuer::{
    CreateCredentialOfferRequest, CreateCredentialTemplateRequest, CreateIssuerRequest,
    CreateSchemaRequest, IssueCredentialRequest,
};
use crate::services::AppState;
use axum::{
    extract::{Json, Multipart, Path, Query, State},
    http::StatusCode,
    routing::{delete, get, post, put},
    Router,
};
use mongodb::bson::doc;
use serde::Deserialize;
use serde_json::json;
use std::collections::HashMap;
use tracing::{info, warn};

/// Create issuer routes
pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/", post(create_issuer))
        .route("/:did", get(get_issuer))
        .route("/:did/update", put(update_issuer))
        .route("/:did/upload-photo", post(upload_profile_photo))
        .route("/:did/upload-logo", post(upload_logo))

        // Authentication endpoints
        .route("/:did/set-auth", post(set_auth_hash))
        .route("/:did/authenticate", post(authenticate_issuer))

        // Schema management
        .route("/:did/schemas", post(create_schema))
        .route("/:did/schemas", get(list_schemas))
        .route("/:did/schemas/:schema_id", get(get_schema))
        .route("/:did/schemas/:schema_id", put(update_schema))
        .route("/:did/schemas/:schema_id", delete(delete_schema))

        // Credential templates
        .route("/templates", get(get_templates))
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

        // Credential offers
        .route("/:did/offers", post(create_credential_offer).get(list_offers))
        .route("/:did/offers/:offer_id/qr", get(generate_offer_qr))

        // QR code generation
        .route("/:did/qr/credential-offer", post(generate_credential_offer_qr))
        .route("/:did/qr/presentation-request", post(generate_presentation_request_qr))

        // Dashboard statistics
        .route("/:did/statistics", get(get_issuer_statistics))
}

/// Create issuer request with challenge token
#[derive(Debug, Deserialize)]
struct CreateIssuerWithChallengeRequest {
    #[serde(flatten)]
    issuer: CreateIssuerRequest,
    challenge_token: String,
}

/// Create issuer handler
async fn create_issuer(
    State(state): State<AppState>,
    Json(request): Json<CreateIssuerWithChallengeRequest>,
) -> Result<(StatusCode, Json<serde_json::Value>), AppError> {
    let issuer_service = state.issuer_service();
    let issuer = issuer_service
        .create_issuer(request.issuer, &request.challenge_token)
        .await?;

    if let Ok(blockchain_client_lock) = blockchain::get_blockchain_client().await {
        let client_opt = blockchain_client_lock.read().await;
        if let Some(client) = client_opt.as_ref() {
            let issuer_address = client.wallet_address();

            match client.is_issuer(issuer_address).await {
                Ok(is_issuer) => {
                    if is_issuer {
                        info!("Issuer has issuer role: {:?}", issuer_address);
                    } else {
                        warn!("Issuer does not have issuer role: {:?}", issuer_address);
                    }
                }
                Err(e) => {
                    warn!("Failed to check issuer role: {}", e);
                }
            }
        }
    }

    Ok((
        StatusCode::CREATED,
        Json(json!({
            "success": true,
            "message": "Issuer created successfully with verified domain",
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
    let mut schema = schema_service.create_schema(&did, request).await?;

    // NEW: Register schema on blockchain
    if let Ok(client_lock) = blockchain::get_blockchain_client().await {
        if let Some(client) = client_lock.read().await.as_ref() {
            use sha2::{Digest, Sha256};
            let mut hasher = Sha256::new();
            hasher.update(
                serde_json::to_string(&schema)
                    .unwrap_or_default()
                    .as_bytes(),
            );
            let result = hasher.finalize();
            let schema_hash = format!("ipfs://Qm{}", hex::encode(&result[0..16]));

            match client.register_schema(&schema.id, &schema_hash).await {
                Ok(receipt) => {
                    info!(
                        "Schema registered on blockchain: {:?}",
                        receipt.transaction_hash
                    );
                    schema.blockchain_tx = Some(format!("0x{:x}", receipt.transaction_hash));
                    schema.on_chain = Some(true);
                }
                Err(e) => {
                    warn!("Failed to register schema on blockchain: {}. Continuing without blockchain.", e);
                    schema.on_chain = Some(false);
                }
            }
        }
    }

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
    let schema = schema_service
        .get_schema_by_id(&schema_id)
        .await?
        .ok_or_else(|| {
            AppError::NotFoundError(format!("Schema with ID {} not found", schema_id))
        })?;

    // Verify that the schema belongs to the issuer
    if schema.issuer_did != did {
        return Err(AppError::AccessDeniedError(
            "You can only access your own schemas".to_string(),
        ));
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
    let schema = schema_service
        .update_schema(&did, &schema_id, request)
        .await?;

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

/// Query parameters for template search
#[derive(Debug, Deserialize)]
struct TemplateQuery {
    schema_id: Option<String>,
}

async fn get_templates(
    State(state): State<AppState>,
    Query(query): Query<TemplateQuery>,
) -> Result<(StatusCode, Json<serde_json::Value>), AppError> {
    let issuer_service = state.issuer_service();

    let templates = if let Some(schema_id) = query.schema_id {
        issuer_service
            .get_templates_by_schema_with_issuer(&schema_id)
            .await?
    } else {
        issuer_service.get_all_templates_with_issuer().await?
    };

    Ok((
        StatusCode::OK,
        Json(json!({
            "success": true,
            "templates": templates
        })),
    ))
}

async fn create_credential_template(
    State(state): State<AppState>,
    Path(did): Path<String>,
    Json(request): Json<CreateCredentialTemplateRequest>,
) -> Result<(StatusCode, Json<serde_json::Value>), AppError> {
    let issuer_service = state.issuer_service();
    let template = issuer_service
        .create_credential_template(&did, request)
        .await?;

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
    let template = issuer_service
        .get_credential_template(&did, &template_id)
        .await?;

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
    Json(mut request): Json<HashMap<String, serde_json::Value>>,
) -> Result<(StatusCode, Json<serde_json::Value>), AppError> {
    let issuer_service = state.issuer_service();

    if let Some(fields_value) = request.get_mut("fields") {
        if let Some(fields_array) = fields_value.as_array_mut() {
            for field in fields_array.iter_mut() {
                if let Some(field_obj) = field.as_object_mut() {
                    let field_type = field_obj
                        .get("field_type")
                        .or_else(|| field_obj.get("type"))
                        .and_then(|v| v.as_str())
                        .unwrap_or("");

                    if field_type.eq_ignore_ascii_case("file") {
                        field_obj.insert("source".to_string(), serde_json::Value::String("holder_input".to_string()));
                    }
                }
            }
        }
    }

    let template = issuer_service
        .update_credential_template(&did, &template_id, request)
        .await?;

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
    let success = issuer_service
        .delete_credential_template(&did, &template_id)
        .await?;

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
    let mut credential = credential_service.issue_credential(&did, request).await?;

    let credential_hash = credential
        .credential_hash
        .as_ref()
        .unwrap_or(&credential.credential.credential_hash)
        .clone();

    let subject_did = credential
        .subject_did
        .as_ref()
        .unwrap_or(&credential.credential.owner_did);

    let metadata_uri = credential
        .ipfs_hash
        .as_ref()
        .map(|h| format!("ipfs://{}", h))
        .unwrap_or_else(|| format!("hash_{}", &credential.credential.id));

    match state
        .blockchain
        .register_credential(subject_did, &credential_hash, &metadata_uri)
        .await
    {
        Ok(tx_hash) => {
            info!("Credential registered on blockchain: {:?}", tx_hash);
            credential.blockchain_tx = Some(format!("0x{:x}", tx_hash));
            credential.on_chain = Some(true);

            let tx_hash_str = format!("0x{:x}", tx_hash);
            let _ = state
                .db
                .update_credential_blockchain_info(&credential.credential.id, &tx_hash_str)
                .await;
        }
        Err(e) => {
            warn!(
                "Failed to register credential on blockchain: {}. Continuing without blockchain.",
                e
            );
            credential.on_chain = Some(false);
        }
    }

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
    let credentials = credential_service
        .list_credentials_by_issuer(&did, params)
        .await?;

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
    let credential = credential_service
        .get_credential_by_id(&credential_id)
        .await?
        .ok_or_else(|| {
            AppError::NotFoundError(format!("Credential with ID {} not found", credential_id))
        })?;

    if credential.issuer_did != did {
        return Err(AppError::AccessDeniedError(
            "You can only access credentials you issued".to_string(),
        ));
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
    let mut credential = credential_service
        .revoke_credential(&did, &credential_id)
        .await?;

    let credential_hash: String = credential.credential_hash.clone();
    let subject_did = credential
        .subject_did
        .as_ref()
        .unwrap_or(&credential.owner_did);

    match state
        .blockchain
        .revoke_credential(subject_did, &credential_hash)
        .await
    {
        Ok(tx_hash) => {
            info!("Credential revoked on blockchain: {:?}", tx_hash);
            credential.revocation_blockchain_tx = Some(format!("0x{:x}", tx_hash));

            state.db().save_credential(&credential).await?;
            tracing::info!(
                "Credential revocation saved with tx_hash: {}",
                credential_id
            );
        }
        Err(e) => {
            warn!(
                "Failed to revoke credential on blockchain: {}. Continuing without blockchain.",
                e
            );
            state.db().save_credential(&credential).await?;
            tracing::warn!(
                "Credential revoked in DB but blockchain failed: {}",
                credential_id
            );
        }
    }

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
    let requests = issuer_service
        .list_credential_requests(&did, params)
        .await?;

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
    let request = issuer_service
        .get_credential_request(&did, &request_id)
        .await?;

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
    let mut credential = issuer_service
        .approve_credential_request(&did, &request_id)
        .await?;

    let credential_hash = credential
        .credential_hash
        .as_ref()
        .or(credential.ipfs_hash.as_ref())
        .cloned()
        .unwrap_or_else(|| format!("hash_{}", &credential.id));

    let subject_did = credential
        .subject_did
        .as_ref()
        .unwrap_or(&credential.user_did);

    // Use IPFS hash as metadata_uri
    let metadata_uri = credential
        .ipfs_hash
        .as_ref()
        .map(|h| format!("ipfs://{}", h))
        .unwrap_or_else(|| format!("hash_{}", &credential.id));

    match state
        .blockchain
        .register_credential(subject_did, &credential_hash, &metadata_uri)
        .await
    {
        Ok(tx_hash) => {
            info!(
                "Credential (from request) registered on blockchain: {:?}",
                tx_hash
            );
            credential.blockchain_tx = Some(format!("0x{:x}", tx_hash));
            credential.on_chain = true;
        }
        Err(e) => {
            warn!("Failed to register credential on blockchain: {}", e);
            credential.on_chain = false;
        }
    }

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
    let request = issuer_service
        .reject_credential_request(&did, &request_id, reason)
        .await?;

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
}

async fn generate_credential_offer_qr(
    State(state): State<AppState>,
    Path(did): Path<String>,
    Json(request): Json<CredentialOfferQrRequest>,
) -> Result<(StatusCode, Json<serde_json::Value>), AppError> {
    let qr_service = state.qr_service();
    let qr_data = qr_service
        .generate_credential_offer_qr(&did, &request.credential_id, None)
        .await?;

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
    let qr_data = qr_service
        .generate_presentation_request_qr(
            &did,
            &request.schema_ids,
            &request.purpose,
            request.recipient_did,
        )
        .await?;

    Ok((
        StatusCode::OK,
        Json(json!({
            "success": true,
            "qr_data": qr_data,
        })),
    ))
}

/// Create credential offer handler
async fn create_credential_offer(
    State(state): State<AppState>,
    Path(did): Path<String>,
    Json(request): Json<CreateCredentialOfferRequest>,
) -> Result<(StatusCode, Json<serde_json::Value>), AppError> {
    let issuer_service = state.issuer_service();
    let offer = issuer_service
        .create_credential_offer(&did, request)
        .await?;

    Ok((
        StatusCode::CREATED,
        Json(json!({
            "success": true,
            "message": "Credential offer created successfully",
            "offer": offer,
        })),
    ))
}

async fn list_offers(
    State(state): State<AppState>,
    Path(did): Path<String>,
) -> Result<(StatusCode, Json<serde_json::Value>), AppError> {
    tracing::info!("Listing offers for issuer: {}", did);

    // Normalize DID
    let normalized_did = crate::utils::did_compat::normalize_did(&did)?;
    let db = state.db();

    // Fetch raw BSON documents
    let raw_docs: Vec<bson::Document> = db
        .find_many("credential_offers", doc! { "issuer_did": &normalized_did })
        .await?;

    tracing::info!("Found {} offers for issuer", raw_docs.len());

    // Return documents as-is
    Ok((
        StatusCode::OK,
        Json(json!({
            "success": true,
            "offers": raw_docs,
        })),
    ))
}

/// Generate QR code for offer handler
async fn generate_offer_qr(
    State(state): State<AppState>,
    Path((did, offer_id)): Path<(String, String)>,
) -> Result<(StatusCode, Json<serde_json::Value>), AppError> {
    let qr_service = state.qr_service();

    // Generate QR from offer
    let qr_data = qr_service.generate_offer_qr(&offer_id).await?;

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

/// Upload profile photo handler
async fn upload_profile_photo(
    State(state): State<AppState>,
    Path(did): Path<String>,
    mut multipart: Multipart,
) -> Result<(StatusCode, Json<serde_json::Value>), AppError> {
    info!("Uploading profile photo for issuer: {}", did);

    let mut file_data = Vec::new();
    let mut content_type = String::from("application/octet-stream");

    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|e| AppError::ValidationError(format!("Failed to read multipart field: {}", e)))?
    {
        if field.name() == Some("photo") {
            content_type = field
                .content_type()
                .unwrap_or("application/octet-stream")
                .to_string();
            file_data = field
                .bytes()
                .await
                .map_err(|e| AppError::ValidationError(format!("Failed to read file data: {}", e)))?
                .to_vec();
        }
    }

    if file_data.is_empty() {
        return Err(AppError::ValidationError("No file uploaded".to_string()));
    }

    let upload_service = state.upload_service();
    let (ipfs_hash, gateway_url) = upload_service
        .upload_image(file_data, &content_type)
        .await?;

    let now = chrono::Utc::now();
    let now_bson = bson::to_bson(&now)
        .map_err(|e| AppError::InternalError(format!("Failed to convert date: {}", e)))?;

    let update = bson::doc! {
        "$set": {
            "profile_photo_url": &gateway_url,
            "profile_photo_ipfs": &ipfs_hash,
            "updated_at": now_bson
        }
    };

    state
        .db
        .update_one("issuers", bson::doc! { "id": &did }, update)
        .await?;
    info!(
        "Profile photo uploaded for issuer {}: {}",
        did, gateway_url
    );

    Ok((
        StatusCode::OK,
        Json(json!({
            "success": true,
            "message": "Profile photo uploaded successfully",
            "data": {
                "profile_photo_url": gateway_url,
                "ipfs_hash": ipfs_hash
            }
        })),
    ))
}

/// Upload logo handler
async fn upload_logo(
    State(state): State<AppState>,
    Path(did): Path<String>,
    mut multipart: Multipart,
) -> Result<(StatusCode, Json<serde_json::Value>), AppError> {
    info!("Uploading logo for issuer: {}", did);

    let mut file_data = Vec::new();
    let mut content_type = String::from("application/octet-stream");

    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|e| AppError::ValidationError(format!("Failed to read multipart field: {}", e)))?
    {
        if field.name() == Some("logo") {
            content_type = field
                .content_type()
                .unwrap_or("application/octet-stream")
                .to_string();
            file_data = field
                .bytes()
                .await
                .map_err(|e| AppError::ValidationError(format!("Failed to read file data: {}", e)))?
                .to_vec();
        }
    }

    if file_data.is_empty() {
        return Err(AppError::ValidationError("No file uploaded".to_string()));
    }

    let upload_service = state.upload_service();
    let (ipfs_hash, gateway_url) = upload_service
        .upload_image(file_data, &content_type)
        .await?;

    let now = chrono::Utc::now();
    let now_bson = bson::to_bson(&now)
        .map_err(|e| AppError::InternalError(format!("Failed to convert date: {}", e)))?;

    let update = bson::doc! {
        "$set": {
            "logo_url": &gateway_url,
            "logo_ipfs": &ipfs_hash,
            "updated_at": now_bson
        }
    };

    state
        .db
        .update_one("issuers", bson::doc! { "id": &did }, update)
        .await?;
    info!("Logo uploaded for issuer {}: {}", did, gateway_url);

    Ok((
        StatusCode::OK,
        Json(json!({
            "success": true,
            "message": "Logo uploaded successfully",
            "data": {
                "logo_url": gateway_url,
                "ipfs_hash": ipfs_hash
            }
        })),
    ))
}

/// Set auth hash request
#[derive(Debug, Deserialize)]
struct SetAuthHashRequest {
    auth_token: String,
}

/// Set auth hash handler
async fn set_auth_hash(
    State(state): State<AppState>,
    Path(did): Path<String>,
    Json(request): Json<SetAuthHashRequest>,
) -> Result<(StatusCode, Json<serde_json::Value>), AppError> {
    let issuer_service = state.issuer_service();
    issuer_service
        .set_auth_hash(&did, &request.auth_token)
        .await?;

    Ok((
        StatusCode::OK,
        Json(json!({
            "success": true,
            "message": "Authentication credentials set successfully",
        })),
    ))
}

/// Authenticate issuer request
#[derive(Debug, Deserialize)]
struct AuthenticateIssuerRequest {
    auth_token: String,
}

/// Authenticate issuer handler
async fn authenticate_issuer(
    State(state): State<AppState>,
    Path(did): Path<String>,
    Json(request): Json<AuthenticateIssuerRequest>,
) -> Result<(StatusCode, Json<serde_json::Value>), AppError> {
    let issuer_service = state.issuer_service();
    let issuer = issuer_service
        .authenticate(&did, &request.auth_token)
        .await?;

    // Use auth_token as JWT token for API requests
    let token = request.auth_token.clone();

    Ok((
        StatusCode::OK,
        Json(json!({
            "success": true,
            "message": "Authentication successful",
            "token": token,
            "issuer": issuer,
        })),
    ))
}