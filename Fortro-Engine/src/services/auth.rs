use crate::db::Database;
use crate::error::AppError;
use crate::models::User;
use crate::utils::crypto;
use crate::utils::did::{self, DidKeyPair};
use crate::utils::jwt::{self, JwtClaims, JwtHeader};
use chrono::{Duration, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use uuid::Uuid;

/// Authentication service
pub struct AuthService {
    db: Arc<Database>,
}

impl AuthService {
    pub(crate) async fn verify_challenge(&self, did: &String, challenge: &String, signature: &String) -> Result<(User, String), AppError> {
        // Get the user
        let user = self.db.find_user_by_did(did).await?
            .ok_or_else(|| AppError::AuthError(format!("User with DID {} not found", did)))?;

        // Verify the signature
        let is_valid = did::verify(
            challenge.as_bytes(),
            &base64::decode(signature)
                .map_err(|e| AppError::AuthError(format!("Invalid signature: {}", e)))?,
            &user.public_key,
        )?;

        if !is_valid {
            return Err(AppError::AuthError("Invalid signature".to_string()));
        }

        // Generate a JWT token
        let token = self.generate_token(&user)?;

        Ok((user, token))
    }
}

/// Login request
#[derive(Debug, Deserialize)]
pub struct LoginRequest {
    pub did: String,
    pub signature: String,
    pub challenge: String,
}

/// Registration request
#[derive(Debug, Deserialize)]
pub struct RegisterRequest {
    pub did: String,
    pub public_key: String,
    pub name: Option<String>,
    pub email: Option<String>,
}

/// Authentication response
#[derive(Debug, Serialize)]
pub struct AuthResponse {
    pub token: String,
    pub user: User,
}

/// Challenge response
#[derive(Debug, Serialize)]
pub struct ChallengeResponse {
    pub challenge: String,
    pub expires_at: chrono::DateTime<chrono::Utc>,
}

impl AuthService {
    /// Create a new authentication service
    pub fn new(db: Arc<Database>) -> Self {
        Self { db }
    }

    /// Generate a challenge for authentication
    pub async fn generate_challenge(&self, did: &str) -> Result<ChallengeResponse, AppError> {
        // Check if the DID exists
        let user = self.db.find_user_by_did(did).await?;
        if user.is_none() {
            return Err(AppError::AuthError(format!("User with DID {} not found", did)));
        }

        // Generate a random challenge
        let challenge = crypto::generate_secure_string(32);
        let expires_at = Utc::now() + Duration::minutes(5);

        Ok(ChallengeResponse { challenge, expires_at })
    }

    /// Register a new user
    pub async fn register(&self, request: RegisterRequest) -> Result<User, AppError> {
        // Check if the DID is valid
        if !did::validate_did(&request.did) {
            return Err(AppError::ValidationError("Invalid DID".to_string()));
        }

        // Check if the user already exists
        let existing_user = self.db.find_user_by_did(&request.did).await?;
        if existing_user.is_some() {
            return Err(AppError::ValidationError(format!(
                "User with DID {} already exists",
                request.did
            )));
        }

        // Create a new user
        let mut user = User::new(request.did, request.public_key);
        user.name = request.name;
        user.email = request.email;

        // Save the user to the database
        self.db.create_user(&user).await?;

        Ok(user)
    }

    /// Login a user
    pub async fn login(&self, request: LoginRequest) -> Result<AuthResponse, AppError> {
        // Get the user
        let user = self.db.find_user_by_did(&request.did).await?
            .ok_or_else(|| AppError::AuthError(format!("User with DID {} not found", request.did)))?;

        // Verify the signature
        let is_valid = did::verify(
            request.challenge.as_bytes(),
            &base64::decode(&request.signature)
                .map_err(|e| AppError::AuthError(format!("Invalid signature: {}", e)))?,
            &user.public_key,
        )?;

        if !is_valid {
            return Err(AppError::AuthError("Invalid signature".to_string()));
        }

        // Generate a JWT token
        let token = self.generate_token(&user)?;

        Ok(AuthResponse { token, user })
    }

    /// Generate a JWT token for a user
    pub fn generate_token(&self, user: &User) -> Result<String, AppError> {
        let now = Utc::now();
        let expires_at = now + Duration::hours(24);

        let header = JwtHeader {
            alg: "HS256".to_string(),
            typ: "JWT".to_string(),
            kid: format!("{}#auth", user.did),
        };

        let mut claims = JwtClaims {
            iss: "ssi-wallet".to_string(),
            sub: Some(user.did.clone()),
            aud: None,
            exp: Some(expires_at.timestamp()),
            nbf: Some(now.timestamp()),
            iat: now.timestamp(),
            jti: Uuid::new_v4().to_string(),
            additional_claims: HashMap::new(),
        };

        claims.additional_claims.insert("name".to_string(), serde_json::to_value(user.name.clone()).unwrap());
        claims.additional_claims.insert("email".to_string(), serde_json::to_value(user.email.clone()).unwrap());

        // In a real implementation, we would use a proper signing key
        // For this example, we'll use a dummy key
        let private_key = "dummy_key";
        jwt::create_jwt(&header, &claims, private_key)
    }

    /// Verify a JWT token
    pub fn verify_token(&self, token: &str) -> Result<JwtClaims, AppError> {
        let (_, claims) = jwt::verify_pq_jwt(token)?;
        Ok(claims)
    }

    /// Get a user from a JWT token
    pub async fn get_user_from_token(&self, token: &str) -> Result<User, AppError> {
        let claims = self.verify_token(token)?;
        let did = claims.sub.ok_or_else(|| AppError::AuthError("Token missing subject".to_string()))?;

        let user = self.db.find_user_by_did(&did).await?
            .ok_or_else(|| AppError::AuthError(format!("User with DID {} not found", did)))?;

        Ok(user)
    }

    /// Generate a new DID key pair
    pub fn generate_did_key_pair(&self) -> Result<DidKeyPair, AppError> {
        did::generate_did()
    }

    /// Create a DID document from a request
    pub async fn create_did_document(&self, request: GenerateDIDRequest) -> Result<DidKeyPair, AppError> {
        // If a private key is provided, use it to generate the DID
        if let Some(private_key) = request.private_key {
            return did::did_from_private_key(&private_key);
        }

        // Otherwise, generate a new DID
        did::generate_did()
    }
}

/// Generate DID request
#[derive(Debug, Deserialize)]
pub struct GenerateDIDRequest {
    pub private_key: Option<String>,
}
