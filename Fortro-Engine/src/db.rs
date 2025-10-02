use mongodb::{
    bson::{doc, Document, to_document},
    options::{ClientOptions, FindOptions},
    Client, Collection, Database as MongoDatabase,
};
use serde::{de::DeserializeOwned, Serialize};
use futures::TryStreamExt;
use uuid::Uuid;

use crate::error::AppError;
use crate::models::{Credential, CredentialRequest, User, Presentation, ConsentRecord, ShortUrlQrCode};

#[derive(Debug, Clone)]
pub struct Database {
    client: Client,
    db: MongoDatabase,
}

impl Database {
    pub async fn connect(uri: &str) -> Result<Self, AppError> {
        let client_options = ClientOptions::parse(uri).await?;
        let client = Client::with_options(client_options)?;
        let db = client.database("ssi_wallet");

        // Ping the database to check the connection
        client
            .database("admin")
            .run_command(doc! {"ping": 1})
            .await?;

        tracing::info!("Connected to MongoDB");
        Ok(Self { client, db })
    }

    // User collection methods
    pub fn users(&self) -> Collection<User> {
        self.db.collection("users")
    }

    pub async fn find_user_by_did(&self, did: &str) -> Result<Option<User>, AppError> {
        let filter = doc! { "did": did };
        self.users().find_one(filter).await.map_err(|e| e.into())
    }

    pub async fn create_user(&self, user: &User) -> Result<(), AppError> {
        self.users().insert_one(user).await?;
        Ok(())
    }

    pub async fn update_user(&self, user: &User) -> Result<(), AppError> {
        let filter = doc! { "did": &user.did };
        self.users().replace_one(filter, user).await?;
        Ok(())
    }

    // Credential collection methods
    pub fn credentials(&self) -> Collection<Credential> {
        self.db.collection("credentials")
    }

    pub async fn find_credentials_by_owner(&self, owner_did: &str) -> Result<Vec<Credential>, AppError> {
        let filter = doc! { "owner_did": owner_did };
        let options = FindOptions::builder().sort(doc! { "created_at": -1 }).build();

        let cursor = self.credentials().find(filter).await?;
        let credentials = cursor.try_collect().await?;

        Ok(credentials)
    }

    pub async fn find_credential_by_id(&self, id: &str) -> Result<Option<Credential>, AppError> {
        let filter = doc! { "id": id };
        self.credentials().find_one(filter).await.map_err(|e| e.into())
    }

    pub async fn get_credential_by_id(&self, id: &str) -> Result<Option<Credential>, AppError> {
        self.find_credential_by_id(id).await
    }

    pub async fn save_credential(&self, credential: &Credential) -> Result<(), AppError> {
        let filter = doc! { "id": &credential.id };
        let options = mongodb::options::ReplaceOptions::builder()
            .upsert(true)
            .build();

        self.credentials().replace_one(filter, credential).await?;
        Ok(())
    }

    pub async fn delete_credential(&self, id: &str, owner_did: &str) -> Result<bool, AppError> {
        let filter = doc! { "id": id, "owner_did": owner_did };
        let result = self.credentials().delete_one(filter).await?;
        Ok(result.deleted_count > 0)
    }

    // Credential request collection methods
    pub fn credential_requests(&self) -> Collection<CredentialRequest> {
        self.db.collection("credential_requests")
    }

    pub async fn find_credential_requests_by_issuer(&self, issuer_did: &str) -> Result<Vec<CredentialRequest>, AppError> {
        let filter = doc! { "issuer_did": issuer_did };
        let options = FindOptions::builder().sort(doc! { "created_at": -1 }).build();

        let cursor = self.credential_requests().find(filter).await?;
        let requests = cursor.try_collect().await?;

        Ok(requests)
    }

    pub async fn find_credential_requests_by_user(&self, user_did: &str) -> Result<Vec<CredentialRequest>, AppError> {
        let filter = doc! { "user_did": user_did };
        let options = FindOptions::builder().sort(doc! { "created_at": -1 }).build();

        let cursor = self.credential_requests().find(filter).await?;
        let requests = cursor.try_collect().await?;

        Ok(requests)
    }

    pub async fn save_credential_request(&self, request: &CredentialRequest) -> Result<(), AppError> {
        let filter = doc! { "id": &request.id };
        let options = mongodb::options::ReplaceOptions::builder()
            .upsert(true)
            .build();

        self.credential_requests().replace_one(filter, request).await?;
        Ok(())
    }

    pub async fn update_credential_request_status(&self, id: &str, status: &str) -> Result<bool, AppError> {
        let filter = doc! { "id": id };
        let update = doc! { "$set": { "status": status } };

        let result = self.credential_requests().update_one(filter, update).await?;
        Ok(result.modified_count > 0)
    }

    // Presentation collection methods
    pub fn presentations(&self) -> Collection<Presentation> {
        self.db.collection("presentations")
    }

    pub async fn save_presentation(&self, presentation: &Presentation) -> Result<(), AppError> {
        let filter = doc! { "id": &presentation.id };
        let options = mongodb::options::ReplaceOptions::builder()
            .upsert(true)
            .build();

        self.presentations().replace_one(filter, presentation).await?;
        Ok(())
    }

    pub async fn find_presentations_by_verifier(&self, verifier_did: &str) -> Result<Vec<Presentation>, AppError> {
        let filter = doc! { "verifier_did": verifier_did };
        let options = FindOptions::builder().sort(doc! { "created_at": -1 }).build();

        let cursor = self.presentations().find(filter).await?;
        let presentations = cursor.try_collect().await?;

        Ok(presentations)
    }

    pub async fn find_presentations_by_prover(&self, prover_did: &str) -> Result<Vec<Presentation>, AppError> {
        let filter = doc! { "prover_did": prover_did };
        let options = FindOptions::builder().sort(doc! { "created_at": -1 }).build();

        let cursor = self.presentations().find(filter).await?;
        let presentations = cursor.try_collect().await?;

        Ok(presentations)
    }

    // Consent records collection methods
    pub fn consent_records(&self) -> Collection<ConsentRecord> {
        self.db.collection("consent_records")
    }

    pub async fn save_consent_record(&self, record: &ConsentRecord) -> Result<(), AppError> {
        let filter = doc! { "id": &record.id };
        let options = mongodb::options::ReplaceOptions::builder()
            .upsert(true)
            .build();

        self.consent_records().replace_one(filter, record).await?;
        Ok(())
    }

    pub async fn find_consent_records_by_user(&self, user_did: &str) -> Result<Vec<ConsentRecord>, AppError> {
        let filter = doc! { "user_did": user_did };
        let options = FindOptions::builder().sort(doc! { "created_at": -1 }).build();

        let cursor = self.consent_records().find(filter).await?;
        let records = cursor.try_collect().await?;

        Ok(records)
    }

    pub async fn revoke_consent(&self, id: &str, user_did: &str) -> Result<bool, AppError> {
        let filter = doc! { "id": id, "user_did": user_did };
        let update = doc! { "$set": { "revoked": true, "revoked_at": bson::DateTime::now() } };

        let result = self.consent_records().update_one(filter, update).await?;
        Ok(result.modified_count > 0)
    }

    // Generic methods for any collection
    pub async fn find_one<T>(&self, collection_name: &str, filter: Document) -> Result<Option<T>, AppError>
    where
        T: DeserializeOwned + Unpin + Send + Sync,
    {
        self.db
            .collection::<T>(collection_name)
            .find_one(filter)
            .await
            .map_err(|e| e.into())
    }

    pub async fn find_many<T>(&self, collection_name: &str, filter: Document) -> Result<Vec<T>, AppError>
    where
        T: DeserializeOwned + Unpin + Send + Sync,
    {
        let cursor = self.db
            .collection::<T>(collection_name)
            .find(filter)
            .await?;

        cursor.try_collect().await.map_err(|e| e.into())
    }

    pub async fn insert_one<T>(&self, collection_name: &str, document: &T) -> Result<String, AppError>
    where
        T: Serialize,
    {
        let result = self.db
            .collection::<Document>(collection_name)
            .insert_one(to_document(document)?)
            .await?;

        Ok(result
            .inserted_id
            .as_object_id()
            .map(|id| id.to_hex())
            .unwrap_or_else(|| Uuid::new_v4().to_string()))
    }

    pub async fn update_one(
        &self,
        collection_name: &str,
        filter: Document,
        update: Document,
    ) -> Result<bool, AppError> {
        let result = self.db
            .collection::<Document>(collection_name)
            .update_one(filter, update)
            .await?;

        Ok(result.modified_count > 0)
    }

    pub async fn delete_one(&self, collection_name: &str, filter: Document) -> Result<bool, AppError> {
        let result = self.db
            .collection::<Document>(collection_name)
            .delete_one(filter)
            .await?;

        Ok(result.deleted_count > 0)
    }

    // Short URL QR codes collection methods
    pub fn short_url_qr_codes(&self) -> Collection<ShortUrlQrCode> {
        self.db.collection("short_url_qr_codes")
    }

    pub async fn save_short_url_qr_code(&self, qr_code: &ShortUrlQrCode) -> Result<(), AppError> {
        let filter = doc! { "id": &qr_code.id };
        let options = mongodb::options::ReplaceOptions::builder()
            .upsert(true)
            .build();

        self.short_url_qr_codes().replace_one(filter, qr_code).await?;
        Ok(())
    }

    pub async fn find_short_url_qr_code_by_short_id(&self, short_id: &str) -> Result<Option<ShortUrlQrCode>, AppError> {
        let filter = doc! { "short_id": short_id };
        self.short_url_qr_codes().find_one(filter).await.map_err(|e| e.into())
    }

    pub async fn find_short_url_qr_codes_by_issuer_verifier(&self, did: &str) -> Result<Vec<ShortUrlQrCode>, AppError> {
        let filter = doc! { "issuer_verifier_did": did };
        let options = FindOptions::builder().sort(doc! { "created_at": -1 }).build();

        let cursor = self.short_url_qr_codes().find(filter).await?;
        let qr_codes = cursor.try_collect().await?;

        Ok(qr_codes)
    }

    pub async fn delete_short_url_qr_code(&self, short_id: &str, did: &str) -> Result<bool, AppError> {
        let filter = doc! { "short_id": short_id, "issuer_verifier_did": did };
        let result = self.short_url_qr_codes().delete_one(filter).await?;
        Ok(result.deleted_count > 0)
    }
}
