use std::collections::HashMap;
use std::sync::Arc;

use chrono::{DateTime, Utc};
use uuid::Uuid;

use crate::db::Database;
use crate::error::AppError;
use crate::models::{
    VerifierActivity, VerifierActivityStatus, VerifierActivityType,
};

pub struct VerifierActivityService {
    db: Arc<Database>,
}

pub struct NewVerifierActivity {
    pub verifier_did: String,
    pub activity_type: VerifierActivityType,
    pub status: VerifierActivityStatus,
    pub title: String,
    pub description: String,
    pub metadata: HashMap<String, String>,
    pub created_at: Option<DateTime<Utc>>,
}

impl VerifierActivityService {
    pub fn new(db: Arc<Database>) -> Self {
        Self { db }
    }

    pub async fn record_activity(
        &self,
        input: NewVerifierActivity,
    ) -> Result<VerifierActivity, AppError> {
        let created_at = input.created_at.unwrap_or_else(Utc::now);
        let mut metadata = input.metadata;
        metadata.retain(|key, value| {
            let trimmed_key = key.trim();
            let trimmed_value = value.trim();
            if trimmed_key.is_empty() || trimmed_value.is_empty() {
                return false;
            }
            if trimmed_key.len() > 120 {
                return false;
            }
            true
        });

        let activity = VerifierActivity {
            id: Uuid::new_v4().to_string(),
            verifier_did: input.verifier_did,
            activity_type: input.activity_type,
            status: input.status,
            title: input.title,
            description: input.description,
            metadata: if metadata.is_empty() {
                None
            } else {
                Some(metadata)
            },
            created_at,
            updated_at: created_at,
        };

        self.db.save_verifier_activity(&activity).await?;
        Ok(activity)
    }

    pub async fn list_activities(
        &self,
        verifier_did: &str,
        limit: Option<i64>,
    ) -> Result<Vec<VerifierActivity>, AppError> {
        self.db
            .find_verifier_activities_by_did(verifier_did, limit)
            .await
    }
}
