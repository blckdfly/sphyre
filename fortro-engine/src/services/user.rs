use crate::db::Database;
use crate::error::AppError;
use crate::models::User;
use crate::utils::did;
use serde::{Deserialize, Serialize};
use std::sync::Arc;

/// User service
pub struct UserService {
    db: Arc<Database>,
}

/// Update user profile request
#[derive(Debug, Deserialize)]
pub struct UpdateProfileRequest {
    pub name: Option<String>,
    pub username: Option<String>,
    pub email: Option<String>,
}

/// User profile response
#[derive(Debug, Serialize)]
pub struct UserProfileResponse {
    pub user: User,
}

impl UserService {
    /// Create a new user service
    pub fn new(db: Arc<Database>) -> Self {
        Self { db }
    }

    /// Get a user by DID
    pub async fn get_user_by_did(&self, did: &str) -> Result<Option<User>, AppError> {
        self.db.find_user_by_did(did).await
    }

    /// Update a user profile
    pub async fn update_profile(
        &self,
        did: &str,
        request: UpdateProfileRequest,
    ) -> Result<User, AppError> {
        // Get the user
        let mut user =
            self.db.find_user_by_did(did).await?.ok_or_else(|| {
                AppError::NotFoundError(format!("User with DID {} not found", did))
            })?;

        // Update the user profile
        if let Some(name) = request.name {
            user.name = Some(name);
        }

        if let Some(username) = request.username {
            user.username = Some(username);
        }

        if let Some(email) = request.email {
            user.email = Some(email);
        }

        // Update the user updated_at timestamp
        user.updated_at = chrono::Utc::now();

        // Save the updated user
        self.db.update_user(&user).await?;

        Ok(user)
    }

    /// Update user avatar/image URL
    pub async fn update_avatar(&self, did: &str, image_url: String) -> Result<User, AppError> {
        // Get the user
        let mut user =
            self.db.find_user_by_did(did).await?.ok_or_else(|| {
                AppError::NotFoundError(format!("User with DID {} not found", did))
            })?;

        // Update avatar
        user.image_url = Some(image_url);
        user.updated_at = chrono::Utc::now();

        // Save the updated user
        self.db.update_user(&user).await?;

        Ok(user)
    }

    /// Create a new user
    pub async fn create_user(&self, user: &User) -> Result<(), AppError> {
        // Check if the DID is valid
        if !did::validate_did(&user.did) {
            return Err(AppError::ValidationError("Invalid DID".to_string()));
        }

        // Check if the user already exists
        let existing_user = self.db.find_user_by_did(&user.did).await?;
        if existing_user.is_some() {
            return Err(AppError::ValidationError(format!(
                "User with DID {} already exists",
                user.did
            )));
        }

        // Save the user to the database
        self.db.create_user(user).await
    }

    /// Create a default user profile for a DID
    pub async fn create_default_user(&self, did: &str, username: &str) -> Result<User, AppError> {
        let user = User {
            did: did.to_string(),
            public_key: String::new(),
            name: Some(username.to_string()),
            username: Some(username.to_string()),
            email: None,
            image_url: None,
            did_doc_cid: None,
            did_doc_gateway_url: None,
            blockchain_registered: None,
            blockchain_tx_hash: None,
            created_at: chrono::Utc::now(),
            updated_at: chrono::Utc::now(),
        };

        self.create_user(&user).await?;
        Ok(user)
    }

    /// Get all users
    pub async fn get_all_users(&self) -> Result<Vec<User>, AppError> {
        let filter = mongodb::bson::doc! {};
        self.db.find_many("users", filter).await
    }

    /// Delete a user
    pub async fn delete_user(&self, did: &str) -> Result<bool, AppError> {
        let user = self.db.find_user_by_did(did).await?;
        if user.is_none() {
            return Err(AppError::NotFoundError(format!(
                "User with DID {} not found",
                did
            )));
        }

        // Delete the user
        let filter = mongodb::bson::doc! { "did": did };
        self.db.delete_one("users", filter).await
    }

    /// Search for users by name
    pub async fn search_users(&self, query: &str) -> Result<Vec<User>, AppError> {
        let regex_query = format!(".*{}.*", regex::escape(query));

        let filter = mongodb::bson::doc! {
            "$or": [
                { "name": { "$regex": &regex_query, "$options": "i" } },
                { "email": { "$regex": &regex_query, "$options": "i" } }
            ]
        };

        self.db.find_many("users", filter).await
    }

    /// Check if a user exists
    pub async fn user_exists(&self, did: &str) -> Result<bool, AppError> {
        let user = self.db.find_user_by_did(did).await?;
        Ok(user.is_some())
    }

    /// Count the number of users
    pub async fn count_users(&self) -> Result<u64, AppError> {
        let filter = mongodb::bson::doc! {};
        let count = self
            .db
            .users()
            .count_documents(filter)
            .await
            .map_err(|e| AppError::DatabaseError(format!("Failed to count users: {}", e)))?;

        Ok(count)
    }
}