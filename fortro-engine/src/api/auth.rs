use axum::{
    extract::{Json, Multipart, State},
    http::{Request, StatusCode},
    routing::{get, post},
    Extension, Router,
};
use serde::{Deserialize, Serialize};
use serde_json::json;
use crate::error::AppError;
use crate::models::{
    CreateWalletAuthRequest, LoginWalletAuthRequest, WalletAuth,
};
use crate::services::auth::{GenerateDIDRequest, LoginRequest, RegisterRequest};
use crate::services::user::UpdateProfileRequest;
use crate::services::AppState;
use crate::utils::{auth_token, crypto, did};
use chrono::Utc;

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/register", post(register))
        .route("/login", post(login))
        .route("/challenge", post(generate_challenge))
        .route("/verify-challenge", post(verify_challenge))
        .route("/generate-did", post(generate_did))
        .route("/me", get(get_current_user))
        .route("/profile", get(get_profile).put(update_profile))
        .route("/avatar", post(upload_avatar))
        .route("/create-wallet", post(create_wallet))
        .route("/login-wallet", post(login_wallet))
        .route("/wallet/encrypted-seed", post(update_encrypted_seed))
        .route("/wallet/encrypted-seed/get", post(get_encrypted_seed))
}

async fn register(
    State(state): State<AppState>,
    Json(request): Json<RegisterRequest>,
) -> Result<(StatusCode, Json<serde_json::Value>), AppError> {
    let auth_service = state.auth_service();
    let user = auth_service.register(request).await?;

    Ok((
        StatusCode::CREATED,
        Json(json!({
            "success": true,
            "message": "User registered successfully",
            "user": user,
        })),
    ))
}

async fn login(
    State(state): State<AppState>,
    Json(request): Json<LoginRequest>,
) -> Result<(StatusCode, Json<serde_json::Value>), AppError> {
    let auth_service = state.auth_service();
    let auth_response = auth_service.login(request).await?;

    Ok((
        StatusCode::OK,
        Json(json!({
            "success": true,
            "message": "Login successful",
            "user": auth_response.user,
            "token": auth_response.token,
        })),
    ))
}

/// Challenge request
#[derive(Debug, Deserialize)]
pub struct ChallengeRequest {
    pub did: String,
}

/// Challenge response
#[derive(Debug, Serialize)]
pub struct ChallengeResponse {
    pub challenge: String,
    pub expires_at: String,
}

/// Generate challenge handler
async fn generate_challenge(
    State(state): State<AppState>,
    Json(request): Json<ChallengeRequest>,
) -> Result<(StatusCode, Json<serde_json::Value>), AppError> {
    let auth_service = state.auth_service();
    let challenge = auth_service.generate_challenge(&request.did).await?;

    Ok((
        StatusCode::OK,
        Json(json!({
            "success": true,
            "challenge": challenge.challenge,
            "expires_at": challenge.expires_at,
        })),
    ))
}

/// Verify challenge request
#[derive(Debug, Deserialize)]
pub struct VerifyChallengeRequest {
    pub did: String,
    pub challenge: String,
    pub signature: String,
}

/// Verify challenge handler
async fn verify_challenge(
    State(state): State<AppState>,
    Json(request): Json<VerifyChallengeRequest>,
) -> Result<(StatusCode, Json<serde_json::Value>), AppError> {
    let auth_service = state.auth_service();
    let (user, token) = auth_service
        .verify_challenge(&request.did, &request.challenge, &request.signature)
        .await?;

    Ok((
        StatusCode::OK,
        Json(json!({
            "success": true,
            "message": "Challenge verified successfully",
            "user": user,
            "token": token,
        })),
    ))
}

/// Generate DID handler
async fn generate_did(
    State(state): State<AppState>,
    Json(request): Json<GenerateDIDRequest>,
) -> Result<(StatusCode, Json<serde_json::Value>), AppError> {
    let auth_service = state.auth_service();
    let did_document = auth_service.create_did_document(request).await?;

    Ok((
        StatusCode::OK,
        Json(json!({
            "success": true,
            "message": "DID generated successfully",
            "did_document": did_document,
        })),
    ))
}

/// Get current user profile (requires DID in header or token)
async fn get_current_user(
    State(state): State<AppState>,
    req: Request<axum::body::Body>,
) -> Result<(StatusCode, Json<serde_json::Value>), AppError> {
    let did = req
        .extensions()
        .get::<String>()
        .ok_or_else(|| AppError::UnauthorizedError("No DID found in request".to_string()))?;

    let user_service = state.user_service();
    let user = user_service
        .get_user_by_did(did)
        .await?
        .ok_or_else(|| AppError::NotFoundError("User not found".to_string()))?;

    Ok((
        StatusCode::OK,
        Json(json!({
            "success": true,
            "user": {
                "did": user.did,
                "name": user.name,
                "username": user.username,
                "email": user.email,
                "imageUrl": user.image_url,
            },
        })),
    ))
}

/// Get user profile
async fn get_profile(
    State(state): State<AppState>,
    Extension(user_did): Extension<String>,
) -> Result<(StatusCode, Json<serde_json::Value>), AppError> {
    let did = &user_did;

    let user_service = state.user_service();

    let user = match user_service.get_user_by_did(did).await? {
        Some(user) => user,
        None => {
            let username = format!("user_{}", &did[did.len().saturating_sub(8)..]);
            user_service.create_default_user(did, &username).await?
        }
    };

    Ok((
        StatusCode::OK,
        Json(json!({
            "username": user.username,
            "name": user.name,
            "email": user.email,
            "imageUrl": user.image_url,
        })),
    ))
}

/// Update user profile handler
async fn update_profile(
    State(state): State<AppState>,
    Extension(user_did): Extension<String>,
    Json(update_request): Json<UpdateProfileRequest>,
) -> Result<(StatusCode, Json<serde_json::Value>), AppError> {
    let did = &user_did;

    let user_service = state.user_service();

    if !user_service.user_exists(did).await? {
        tracing::info!("User {} doesn't exist, creating default profile", did);
        let username = format!("user_{}", &did[did.len().saturating_sub(8)..]);
        user_service.create_default_user(did, &username).await?;
    }

    let updated_user = user_service.update_profile(did, update_request).await?;

    Ok((
        StatusCode::OK,
        Json(json!({
            "success": true,
            "message": "Profile updated successfully",
            "username": updated_user.username,
            "name": updated_user.name,
            "email": updated_user.email,
            "imageUrl": updated_user.image_url,
        })),
    ))
}

/// Upload avatar handler
async fn upload_avatar(
    State(state): State<AppState>,
    Extension(user_did): Extension<String>,
    mut multipart: Multipart,
) -> Result<(StatusCode, Json<serde_json::Value>), AppError> {
    // DID extracted from JWT token via auth middleware
    let did = user_did;

    let user_service = state.user_service();

    // Check if user exists, create if not
    if !user_service.user_exists(&did).await? {
        tracing::info!(
            "User {} doesn't exist, creating default profile for avatar upload",
            did
        );
        let username = format!("user_{}", &did[did.len().saturating_sub(8)..]);
        user_service.create_default_user(&did, &username).await?;
    }

    // Process multipart form data
    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|e| AppError::ValidationError(format!("Failed to read multipart field: {}", e)))?
    {
        let name = field.name().unwrap_or("").to_string();

        if name == "avatar" || name == "profileImage" {
            // Get content type before consuming the field
            let content_type = field
                .content_type()
                .map(|ct| ct.to_string())
                .unwrap_or_else(|| "image/jpeg".to_string());

            // Validate file type (basic check)
            if !content_type.starts_with("image/") {
                return Err(AppError::ValidationError(
                    "Only image files are allowed".to_string(),
                ));
            }

            let data = field.bytes().await.map_err(|e| {
                AppError::ValidationError(format!("Failed to read file data: {}", e))
            })?;
            if data.len() > 1024 * 1024 {
                return Err(AppError::ValidationError(
                    "Image size exceeds 1MB limit. Please compress or resize the image."
                        .to_string(),
                ));
            }

            use base64::{engine::general_purpose, Engine as _};
            let base64_data = general_purpose::STANDARD.encode(&data);
            let image_url = format!("data:{};base64,{}", content_type, base64_data);

            let user_service = state.user_service();
            let updated_user = user_service.update_avatar(&did, image_url.clone()).await?;

            return Ok((
                StatusCode::OK,
                Json(json!({
                    "success": true,
                    "message": "Avatar uploaded successfully",
                    "imageUrl": updated_user.image_url,
                    "url": updated_user.image_url,
                    "size": data.len(),
                    "type": content_type,
                })),
            ));
        }
    }

    Err(AppError::ValidationError(
        "No avatar field found in request".to_string(),
    ))
}

/// Create new wallet with DID
async fn create_wallet(
    State(state): State<AppState>,
    Json(req): Json<CreateWalletAuthRequest>,
) -> Result<(StatusCode, Json<serde_json::Value>), AppError> {
    let db = state.db();
    let wallet_service = state.wallet_service();

    // Hash the auth token for storage
    let auth_hash = auth_token::hash_auth_token(&req.auth_token)?;
    let fingerprint = auth_token::fingerprint_auth_token(&req.auth_token);

    // Check if wallet already exists with this auth token
    if let Some(existing) = db.find_wallet_by_auth_fingerprint(&fingerprint).await? {
        return Err(AppError::ValidationError(
            "Wallet already exists. Please use login instead.".to_string(),
        ));
    }

    // Generate Kyber keypair for encryption
    let (kyber_pub, kyber_priv) = crypto::generate_kyber_keypair()
        .map_err(|e| AppError::InternalError(format!("Failed to generate Kyber keypair: {}", e)))?;

    // Generate Dilithium DID keypair for signing
    let did_pair = did::generate_did()?;

    // Private wallet keys must never be encrypted with a source-code fallback.
    let master_key = std::env::var("MASTER_ENCRYPTION_KEY")
        .map_err(|_| AppError::ConfigError("MASTER_ENCRYPTION_KEY must be set".to_string()))?;

    // Encrypt private keys with master key
    let dilithium_priv_encrypted = crypto::encrypt_with_password(
        did_pair
            .private_key_base58
            .as_ref()
            .ok_or_else(|| AppError::InternalError("Missing private key".to_string()))?
            .as_bytes(),
        &master_key,
    )
    .map_err(|e| AppError::InternalError(format!("Failed to encrypt Dilithium key: {}", e)))?;

    let kyber_priv_encrypted = crypto::encrypt_with_password(&kyber_priv, &master_key)
        .map_err(|e| AppError::InternalError(format!("Failed to encrypt Kyber key: {}", e)))?;

    // Create wallet document
    let wallet = WalletAuth::new(
        auth_hash,
        fingerprint,
        did_pair.did.clone(),
        did_pair.public_key_base58.clone(),
        base64::encode(dilithium_priv_encrypted),
        bs58::encode(&kyber_pub).into_string(),
        base64::encode(kyber_priv_encrypted),
    );

    // Save to database
    db.create_wallet_auth(&wallet).await?;

    tracing::info!("Created new wallet with DID: {}", wallet.did);

    // Provision holder DID document + blockchain registration using the generated keys
    let wallet_meta = wallet_service
        .create_wallet_with_existing_keys(
            wallet.did.clone(),
            wallet.dilithium_public_key.clone(),
            None,
            None,
        )
        .await?;

    // Return wallet response
    Ok((
        StatusCode::CREATED,
        Json(json!({
            "success": true,
            "did": wallet.did,
            "public_key": wallet.dilithium_public_key,
            "kyber_public_key": wallet.kyber_public_key,
            "created_at": wallet.created_at.to_rfc3339(),
            "credential_count": 0,
            "has_encrypted_seed": false,
            "did_doc_cid": wallet_meta.did_doc_cid,
            "blockchain_registered": true,
        })),
    ))
}

/// Login to existing wallet
async fn login_wallet(
    State(state): State<AppState>,
    Json(req): Json<LoginWalletAuthRequest>,
) -> Result<(StatusCode, Json<serde_json::Value>), AppError> {
    let db = state.db();
    let fingerprint = auth_token::fingerprint_auth_token(&req.auth_token);

    if let Some(mut wallet) = db.find_wallet_by_auth_fingerprint(&fingerprint).await? {
        if !auth_token::verify_auth_token(&req.auth_token, &wallet.auth_token_hash)? {
            return Err(AppError::UnauthorizedError(
                "Invalid authentication credentials".to_string(),
            ));
        }

        // Update last login
        wallet.update_last_login();
        db.update_wallet_auth(&wallet).await?;

        tracing::info!("User logged in with DID: {}", wallet.did);

        return Ok((
            StatusCode::OK,
            Json(json!({
                "success": true,
                "did": wallet.did,
                "public_key": wallet.dilithium_public_key,
                "kyber_public_key": wallet.kyber_public_key,
                "created_at": wallet.created_at.to_rfc3339(),
                "credential_count": wallet.credentials.len(),
                "has_encrypted_seed": wallet.encrypted_seed_blob.is_some(),
                "encrypted_seed_updated_at": wallet.encrypted_seed_updated_at.map(|dt| dt.to_rfc3339()),
            })),
        ));
    }

    Err(AppError::NotFoundError(
        "Wallet not found. Please create a new wallet first.".to_string(),
    ))
}

#[derive(Debug, Deserialize)]
struct UpdateEncryptedSeedRequest {
    pub auth_token: String,
    pub encrypted_seed_blob: String,
}

#[derive(Debug, Deserialize)]
struct GetEncryptedSeedRequest {
    pub auth_token: String,
}

#[derive(Debug, Serialize)]
struct EncryptedSeedResponse {
    pub success: bool,
    pub encrypted_seed_blob: Option<String>,
    pub encrypted_seed_updated_at: Option<String>,
    pub has_encrypted_seed: bool,
}

/// Update encrypted seed blob for wallet
async fn update_encrypted_seed(
    State(state): State<AppState>,
    Json(req): Json<UpdateEncryptedSeedRequest>,
) -> Result<(StatusCode, Json<EncryptedSeedResponse>), AppError> {
    let db = state.db();
    let fingerprint = auth_token::fingerprint_auth_token(&req.auth_token);

    if let Some(mut wallet) = db.find_wallet_by_auth_fingerprint(&fingerprint).await? {
        if !auth_token::verify_auth_token(&req.auth_token, &wallet.auth_token_hash)? {
            return Err(AppError::UnauthorizedError(
                "Invalid authentication credentials".to_string(),
            ));
        }

        wallet.encrypted_seed_blob = Some(req.encrypted_seed_blob.clone());
        wallet.encrypted_seed_updated_at = Some(Utc::now());
        db.update_wallet_auth(&wallet).await?;

        return Ok((
            StatusCode::OK,
            Json(EncryptedSeedResponse {
                success: true,
                encrypted_seed_blob: wallet.encrypted_seed_blob.clone(),
                encrypted_seed_updated_at: wallet
                    .encrypted_seed_updated_at
                    .map(|dt| dt.to_rfc3339()),
                has_encrypted_seed: true,
            }),
        ));
    }

    Err(AppError::NotFoundError(
        "Wallet not found. Please create a new wallet first.".to_string(),
    ))
}

/// Get encrypted seed blob for wallet
async fn get_encrypted_seed(
    State(state): State<AppState>,
    Json(req): Json<GetEncryptedSeedRequest>,
) -> Result<(StatusCode, Json<EncryptedSeedResponse>), AppError> {
    let db = state.db();
    let fingerprint = auth_token::fingerprint_auth_token(&req.auth_token);

    if let Some(wallet) = db.find_wallet_by_auth_fingerprint(&fingerprint).await? {
        if !auth_token::verify_auth_token(&req.auth_token, &wallet.auth_token_hash)? {
            return Err(AppError::UnauthorizedError(
                "Invalid authentication credentials".to_string(),
            ));
        }

        return Ok((
            StatusCode::OK,
            Json(EncryptedSeedResponse {
                success: true,
                encrypted_seed_blob: wallet.encrypted_seed_blob.clone(),
                encrypted_seed_updated_at: wallet
                    .encrypted_seed_updated_at
                    .map(|dt| dt.to_rfc3339()),
                has_encrypted_seed: wallet.encrypted_seed_blob.is_some(),
            }),
        ));
    }

    Err(AppError::NotFoundError(
        "Wallet not found. Please create a new wallet first.".to_string(),
    ))
}
