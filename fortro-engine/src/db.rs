use futures::TryStreamExt;
use mongodb::{
    bson::{self, doc, to_document, Document},
    options::{ClientOptions, FindOptions, UpdateOptions},
    Client, Collection, Database as MongoDatabase,
};
use serde::{de::DeserializeOwned, Serialize};
use uuid::Uuid;

use crate::error::AppError;
use crate::models::{
    Consent, ConsentRecord, Credential, CredentialRequest, IssuerAnonymousKeys, Presentation,
    ShortUrlQrCode, User, VerifierActivity, WalletActivity, WalletAuth,
};

#[derive(Debug, Clone)]
pub struct Database {
    client: Client,
    pub db: MongoDatabase,
}

impl Database {
    pub async fn connect(uri: &str) -> Result<Self, AppError> {
        let client_options = ClientOptions::parse(uri).await?;
        let client = Client::with_options(client_options)?;
        let db = client.database("fortro_db");
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

    pub async fn find_credentials_by_owner(
        &self,
        owner_did: &str,
    ) -> Result<Vec<Credential>, AppError> {
        let filter = doc! { "owner_did": owner_did };

        self.find_many::<Credential>("credentials", filter).await
    }

    pub async fn find_credential_by_id(&self, id: &str) -> Result<Option<Credential>, AppError> {
        let filter = doc! { "id": id };
        self.credentials()
            .find_one(filter)
            .await
            .map_err(|e| e.into())
    }

    pub async fn find_credential_by_ipfs_hash(
        &self,
        ipfs_hash: &str,
    ) -> Result<Option<Credential>, AppError> {
        let filter = doc! { "ipfs_hash": ipfs_hash };
        self.credentials()
            .find_one(filter)
            .await
            .map_err(|e| e.into())
    }

    pub async fn get_credential_by_id(&self, id: &str) -> Result<Option<Credential>, AppError> {
        self.find_credential_by_id(id).await
    }

    pub async fn save_credential(&self, credential: &Credential) -> Result<(), AppError> {
        let filter = doc! { "id": &credential.id };

        tracing::debug!(
            "Saving credential: id={}, owner_did={}, status={:?}",
            credential.id,
            credential.owner_did,
            credential.status
        );

        let mut set_doc = doc! {
            "id": &credential.id,
            "issuer_did": &credential.issuer_did,
            "owner_did": &credential.owner_did,
            "credential_type": &credential.credential_type,
            "schema_id": &credential.schema_id,
            "ipfs_hash": &credential.ipfs_hash,
            "ipfs_gateway_url": &credential.ipfs_gateway_url,
            "credential_hash": &credential.credential_hash,
            "blockchain_tx_hash": &credential.blockchain_tx_hash,
            "blockchain_reference": &credential.blockchain_reference,
            "jwt": &credential.jwt,
            "status": mongodb::bson::to_bson(&credential.status)?,
            "bbs_signature": &credential.bbs_signature,
            "bbs_public_key": &credential.bbs_public_key,
            "signature_type": &credential.signature_type,
            "kyber_public_key": &credential.kyber_public_key,
            "kyber_secret_key": &credential.kyber_secret_key,
            "kyber_encrypted": credential.kyber_encrypted,
            "created_at": mongodb::bson::to_bson(&credential.created_at)?,
            "updated_at": mongodb::bson::to_bson(&credential.updated_at)?,
            "expires_at": mongodb::bson::to_bson(&credential.expires_at)?,
            "subject_did": &credential.subject_did,
            "revocation_blockchain_tx": &credential.revocation_blockchain_tx,
        };

        let mut unset_doc = doc! {};

        if !credential.evidence_attachments.is_empty() {
            set_doc.insert(
                "evidence_attachments",
                mongodb::bson::to_bson(&credential.evidence_attachments)?,
            );
        } else {
            unset_doc.insert("evidence_attachments", 1);
        }

        if !credential.evidence_required.is_empty() {
            set_doc.insert(
                "evidence_required",
                mongodb::bson::to_bson(&credential.evidence_required)?,
            );
        } else {
            unset_doc.insert("evidence_required", 1);
        }

        if let Some(status) = &credential.evidence_status {
            set_doc.insert("evidence_status", mongodb::bson::to_bson(status)?);
        } else {
            unset_doc.insert("evidence_status", 1);
        }

        if !credential.extensions.is_empty() {
            set_doc.insert(
                "extensions",
                mongodb::bson::to_bson(&credential.extensions)?,
            );
        } else {
            unset_doc.insert("extensions", 1);
        }

        if let Some(preview) = &credential.credential_preview {
            set_doc.insert("credential_preview", mongodb::bson::to_bson(preview)?);
        } else {
            unset_doc.insert("credential_preview", 1);
        }

        if let Some(preview_encrypted) = &credential.credential_preview_encrypted {
            set_doc.insert("credential_preview_encrypted", preview_encrypted);
        } else {
            unset_doc.insert("credential_preview_encrypted", 1);
        }

        if let Some(anon_record) = &credential.anonymous_credential {
            set_doc.insert(
                "anonymous_credential",
                mongodb::bson::to_bson(anon_record)?,
            );
        } else {
            unset_doc.insert("anonymous_credential", 1);
        }

        if let Some(master_secret) = &credential.anonymous_master_secret {
            set_doc.insert("anonymous_master_secret", master_secret);
        } else {
            unset_doc.insert("anonymous_master_secret", 1);
        }

        let mut update = doc! { "$set": set_doc };
        if !unset_doc.is_empty() {
            update.insert("$unset", unset_doc);
        }

        let options = mongodb::options::UpdateOptions::builder()
            .upsert(true)
            .build();

        self.credentials()
            .update_one(filter, update)
            .with_options(options)
            .await?;

        tracing::debug!("Saved credential: id={}", credential.id);
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

    pub fn issuer_anonymous_keys(&self) -> Collection<IssuerAnonymousKeys> {
        self.db.collection("issuer_anonymous_keys")
    }

    pub async fn get_issuer_anonymous_keys(
        &self,
        issuer_did: &str,
    ) -> Result<Option<IssuerAnonymousKeys>, AppError> {
        let filter = doc! { "issuer_did": issuer_did };
        self.issuer_anonymous_keys()
            .find_one(filter)
            .await
            .map_err(|e| e.into())
    }

    pub async fn upsert_issuer_anonymous_keys(
        &self,
        record: &IssuerAnonymousKeys,
    ) -> Result<(), AppError> {
        let filter = doc! { "issuer_did": &record.issuer_did };
        let update = doc! { "$set": to_document(record)? };
        let options = mongodb::options::UpdateOptions::builder()
            .upsert(true)
            .build();

        self.issuer_anonymous_keys()
            .update_one(filter, update)
            .with_options(options)
            .await?;

        Ok(())
    }

    pub async fn find_credential_requests_by_issuer(
        &self,
        issuer_did: &str,
    ) -> Result<Vec<CredentialRequest>, AppError> {
        let filter = doc! { "issuer_did": issuer_did };
        let options = FindOptions::builder()
            .sort(doc! { "created_at": -1 })
            .build();

        let cursor = self
            .credential_requests()
            .find(filter)
            .with_options(options)
            .await?;
        let requests = cursor.try_collect().await?;

        Ok(requests)
    }

    pub async fn find_credential_requests_by_user(
        &self,
        user_did: &str,
    ) -> Result<Vec<CredentialRequest>, AppError> {
        let filter = doc! { "user_did": user_did };
        let options = FindOptions::builder()
            .sort(doc! { "created_at": -1 })
            .build();

        let cursor = self
            .credential_requests()
            .find(filter)
            .with_options(options)
            .await?;
        let requests = cursor.try_collect().await?;

        Ok(requests)
    }

    pub async fn create_credential_request(
        &self,
        request: &CredentialRequest,
    ) -> Result<(), AppError> {
        self.credential_requests().insert_one(request).await?;
        Ok(())
    }

    pub async fn find_credential_request(
        &self,
        id: &str,
    ) -> Result<Option<CredentialRequest>, AppError> {
        let filter = doc! { "id": id };
        self.credential_requests()
            .find_one(filter)
            .await
            .map_err(|e| e.into())
    }

    pub async fn update_credential_request(
        &self,
        request: &CredentialRequest,
    ) -> Result<(), AppError> {
        let filter = doc! { "id": &request.id };
        self.credential_requests()
            .replace_one(filter, request)
            .await?;
        Ok(())
    }

    pub async fn save_credential_request(
        &self,
        request: &CredentialRequest,
    ) -> Result<(), AppError> {
        self.credential_requests().insert_one(request).await?;
        Ok(())
    }

    pub async fn update_credential_request_status(
        &self,
        id: &str,
        status: &str,
    ) -> Result<bool, AppError> {
        let filter = doc! { "id": id };
        let update = doc! { "$set": { "status": status } };

        let result = self
            .credential_requests()
            .update_one(filter, update)
            .await?;
        Ok(result.modified_count > 0)
    }

    // Presentation collection methods
    pub fn presentations(&self) -> Collection<Presentation> {
        self.db.collection("presentations")
    }

    pub fn wallet_activities(&self) -> Collection<WalletActivity> {
        self.db.collection("wallet_activities")
    }

    pub fn verifier_activities(&self) -> Collection<VerifierActivity> {
        self.db.collection("verifier_activities")
    }

    pub async fn save_presentation(&self, presentation: &Presentation) -> Result<(), AppError> {
        let filter = doc! { "id": &presentation.id };
        let mut presentation_doc = to_document(presentation)?;
        presentation_doc.remove("_id");

        let update_doc = doc! { "$set": presentation_doc };
        self.presentations()
            .update_one(filter, update_doc)
            .upsert(true)
            .await?;
        Ok(())
    }

    pub async fn find_presentations_by_verifier(
        &self,
        verifier_did: &str,
    ) -> Result<Vec<Presentation>, AppError> {
        let filter = doc! { "verifier_did": verifier_did };
        let options = FindOptions::builder()
            .sort(doc! { "created_at": -1 })
            .build();

        let cursor = self
            .presentations()
            .find(filter)
            .with_options(options)
            .await?;
        let presentations = cursor.try_collect().await?;

        Ok(presentations)
    }

    pub async fn find_presentations_by_prover(
        &self,
        prover_did: &str,
    ) -> Result<Vec<Presentation>, AppError> {
        let filter = doc! { "prover_did": prover_did };
        let options = FindOptions::builder()
            .sort(doc! { "created_at": -1 })
            .build();

        let cursor = self
            .presentations()
            .find(filter)
            .with_options(options)
            .await?;
        let presentations = cursor.try_collect().await?;

        Ok(presentations)
    }

    pub async fn save_wallet_activity(&self, activity: &WalletActivity) -> Result<(), AppError> {
        let filter = doc! { "id": &activity.id };
        let mut doc = to_document(activity)?;
        doc.remove("_id");

        let update = doc! { "$set": doc };
        let options = UpdateOptions::builder().upsert(true).build();

        self
            .wallet_activities()
            .update_one(filter, update)
            .with_options(options)
            .await?;

        Ok(())
    }

    pub async fn save_verifier_activity(&self, activity: &VerifierActivity) -> Result<(), AppError> {
        let filter = doc! { "id": &activity.id };
        let mut doc = to_document(activity)?;
        doc.remove("_id");

        let update = doc! { "$set": doc };
        let options = UpdateOptions::builder().upsert(true).build();

        self
            .verifier_activities()
            .update_one(filter, update)
            .with_options(options)
            .await?;

        Ok(())
    }

    pub async fn find_verifier_activities_by_did(
        &self,
        verifier_did: &str,
        limit: Option<i64>,
    ) -> Result<Vec<VerifierActivity>, AppError> {
        let mut options = FindOptions::builder().sort(doc! { "created_at": -1 }).build();
        if let Some(limit) = limit {
            options.limit = Some(limit);
        }

        let cursor = self
            .verifier_activities()
            .find(doc! { "verifier_did": verifier_did })
            .with_options(options)
            .await?;

        let activities = cursor.try_collect().await?;
        Ok(activities)
    }

    pub async fn find_wallet_activities_by_holder(
        &self,
        holder_did: &str,
        limit: Option<i64>,
    ) -> Result<Vec<WalletActivity>, AppError> {
        let mut options = FindOptions::builder().sort(doc! { "created_at": -1 }).build();
        if let Some(limit) = limit {
            options.limit = Some(limit);
        }

        let cursor = self
            .wallet_activities()
            .find(doc! { "holder_did": holder_did })
            .with_options(options)
            .await?;

        let activities = cursor.try_collect().await?;
        Ok(activities)
    }

    // Consent records collection methods
    pub fn consent_records(&self) -> Collection<ConsentRecord> {
        self.db.collection("consent_records")
    }

    pub async fn save_consent_record(&self, record: &ConsentRecord) -> Result<(), AppError> {
        self.consent_records().insert_one(record).await?;
        Ok(())
    }

    pub async fn find_consent_records_by_user(
        &self,
        user_did: &str,
    ) -> Result<Vec<ConsentRecord>, AppError> {
        let filter = doc! { "user_did": user_did };
        let options = FindOptions::builder()
            .sort(doc! { "created_at": -1 })
            .build();

        let mut cursor = self
            .db
            .collection::<mongodb::bson::Document>("consent_records")
            .find(filter)
            .with_options(options)
            .await?;

        let mut records = Vec::new();
        while let Some(doc) = cursor.try_next().await? {
            let normalized = self.normalize_legacy_consent_doc(doc)?;
            let record = mongodb::bson::from_document(normalized)?;
            records.push(record);
        }

        Ok(records)
    }

    pub async fn revoke_consent(&self, id: &str, holder_did: &str) -> Result<bool, AppError> {
        let filter = doc! { "id": id, "holder_did": holder_did };
        let update = doc! { "$set": { "revoked": true, "revoked_at": bson::DateTime::now() } };

        let result = self.consents().update_one(filter, update).await?;
        Ok(result.modified_count > 0)
    }

    pub async fn delete_consent(&self, id: &str, holder_did: &str) -> Result<bool, AppError> {
        let filter = doc! { "id": id, "holder_did": holder_did };
        let result = self.consents().delete_one(filter).await?;
        Ok(result.deleted_count > 0)
    }

    // Generic methods for any collection
    pub async fn find_one<T>(
        &self,
        collection_name: &str,
        filter: Document,
    ) -> Result<Option<T>, AppError>
    where
        T: DeserializeOwned + Unpin + Send + Sync,
    {
        if collection_name == "consents" {
            let result = self
                .db
                .collection::<mongodb::bson::Document>(collection_name)
                .find_one(filter)
                .await?;

            if let Some(doc) = result {
                let normalized = self.normalize_legacy_consent_doc(doc)?;
                let model: T = mongodb::bson::from_document(normalized)?;
                Ok(Some(model))
            } else {
                Ok(None)
            }
        } else {
            let result = self
                .db
                .collection::<T>(collection_name)
                .find_one(filter)
                .await?;

            Ok(result)
        }
    }

    pub async fn find_many<T>(
        &self,
        collection_name: &str,
        filter: Document,
    ) -> Result<Vec<T>, AppError>
    where
        T: DeserializeOwned + Unpin + Send + Sync,
    {
        use futures::stream::StreamExt;

        let mut cursor = self
            .db
            .collection::<mongodb::bson::Document>(collection_name)
            .find(filter)
            .await?;

        let mut results = Vec::new();
        while let Some(doc_result) = cursor.next().await {
            match doc_result {
                Ok(doc) => {
                    if collection_name == "consents" {
                        let normalized = self.normalize_legacy_consent_doc(doc)?;
                        results.push(mongodb::bson::from_document(normalized)?);
                    } else {
                        results.push(mongodb::bson::from_document(doc)?);
                    }
                }
                Err(e) => {
                    tracing::error!(
                        "Skipping document in {} due to error: {}",
                        collection_name,
                        e
                    );
                }
            }
        }

        Ok(results)
    }

    fn normalize_legacy_consent_doc(
        &self,
        mut doc: mongodb::bson::Document,
    ) -> Result<mongodb::bson::Document, AppError> {
        doc.entry("expires_at".to_string())
            .or_insert(bson::Bson::Null);
        doc.entry("revoked_at".to_string())
            .or_insert(bson::Bson::Null);
        doc.entry("expired_at".to_string())
            .or_insert(bson::Bson::Null);
        doc.entry("blockchain_tx".to_string())
            .or_insert(bson::Bson::Null);
        doc.entry("on_chain".to_string())
            .or_insert(bson::Bson::Boolean(false));
        Ok(doc)
    }

    pub async fn insert_one<T>(
        &self,
        collection_name: &str,
        document: &T,
    ) -> Result<String, AppError>
    where
        T: Serialize,
    {
        let result = self
            .db
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
        let result = self
            .db
            .collection::<Document>(collection_name)
            .update_one(filter, update)
            .await?;

        Ok(result.modified_count > 0)
    }

    pub async fn delete_one(
        &self,
        collection_name: &str,
        filter: Document,
    ) -> Result<bool, AppError> {
        let result = self
            .db
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
        tracing::info!(
            "Saving short URL QR code: short_id={}, type={}",
            qr_code.short_id,
            qr_code.qr_type
        );
        self.short_url_qr_codes().insert_one(qr_code).await?;
        tracing::info!("Short URL QR code saved successfully");
        Ok(())
    }

    pub async fn find_short_url_qr_code_by_short_id(
        &self,
        short_id: &str,
    ) -> Result<Option<ShortUrlQrCode>, AppError> {
        tracing::info!("Finding short URL QR code by short_id: {}", short_id);
        let filter = doc! { "short_id": short_id };
        let result = self
            .short_url_qr_codes()
            .find_one(filter)
            .await
            .map_err(|e| AppError::DatabaseError(e.to_string()))?;
        if result.is_some() {
            tracing::info!("Short URL QR code found");
        } else {
            tracing::warn!("Short URL QR code NOT found for short_id: {}", short_id);
        }
        Ok(result)
    }

    pub async fn find_short_url_qr_codes_by_issuer_verifier(
        &self,
        did: &str,
    ) -> Result<Vec<ShortUrlQrCode>, AppError> {
        let filter = doc! { "issuer_verifier_did": did };
        let options = FindOptions::builder()
            .sort(doc! { "created_at": -1 })
            .build();

        let cursor = self.short_url_qr_codes().find(filter).await?;
        let qr_codes = cursor.try_collect().await?;

        Ok(qr_codes)
    }

    pub async fn delete_short_url_qr_code(
        &self,
        short_id: &str,
        did: &str,
    ) -> Result<bool, AppError> {
        let filter = doc! { "short_id": short_id, "issuer_verifier_did": did };
        let result = self.short_url_qr_codes().delete_one(filter).await?;
        Ok(result.deleted_count > 0)
    }

    pub fn wallet_auth(&self) -> Collection<WalletAuth> {
        self.db.collection("wallet_auth")
    }

    pub async fn find_wallet_by_auth_hash(
        &self,
        auth_hash: &str,
    ) -> Result<Option<WalletAuth>, AppError> {
        let filter = doc! { "auth_token_hash": auth_hash };
        self.wallet_auth()
            .find_one(filter)
            .await
            .map_err(|e| e.into())
    }

    pub async fn find_wallet_by_auth_fingerprint(
        &self,
        fingerprint: &str,
    ) -> Result<Option<WalletAuth>, AppError> {
        let filter = doc! { "auth_token_fingerprint": fingerprint };
        self.wallet_auth()
            .find_one(filter)
            .await
            .map_err(|e| e.into())
    }

    pub async fn find_wallet_by_did(&self, did: &str) -> Result<Option<WalletAuth>, AppError> {
        let filter = doc! { "did": did };
        self.wallet_auth()
            .find_one(filter)
            .await
            .map_err(|e| e.into())
    }

    // Issuer collection methods
    pub fn issuers(&self) -> Collection<Document> {
        self.db.collection("issuers")
    }

    pub async fn find_issuer_by_did(&self, did: &str) -> Result<Option<Document>, AppError> {
        let filter = doc! { "id": did };
        self.issuers().find_one(filter).await.map_err(|e| e.into())
    }

    // Verifier collection methods
    pub fn verifiers(&self) -> Collection<Document> {
        self.db.collection("verifiers")
    }

    pub async fn find_verifier_by_did(&self, did: &str) -> Result<Option<Document>, AppError> {
        let filter = doc! { "id": did };
        self.verifiers()
            .find_one(filter)
            .await
            .map_err(|e| e.into())
    }

    pub async fn create_wallet_auth(&self, wallet: &WalletAuth) -> Result<(), AppError> {
        self.wallet_auth().insert_one(wallet).await?;
        Ok(())
    }

    pub async fn update_wallet_auth(&self, wallet: &WalletAuth) -> Result<(), AppError> {
        let filter = doc! { "did": &wallet.did };
        self.wallet_auth().replace_one(filter, wallet).await?;
        Ok(())
    }

    // Consent collection accessor
    pub fn consents(&self) -> Collection<Consent> {
        self.db.collection("consents")
    }

    pub async fn find_consents_by_holder(
        &self,
        holder_did: &str,
    ) -> Result<Vec<Consent>, AppError> {
        let filter = doc! { "holder_did": holder_did };
        self.find_many::<Consent>("consents", filter).await
    }

    pub async fn find_expired_consents(
        &self,
        now: bson::DateTime,
        holder_did: Option<&str>,
        verifier_did: Option<&str>,
    ) -> Result<Vec<Consent>, AppError> {
        let mut filter = doc! {
            "revoked": false,
            "expired": { "$ne": true },
            "expires_at": { "$lt": now },
        };

        if let Some(holder) = holder_did {
            filter.insert("holder_did", holder);
        }

        if let Some(verifier) = verifier_did {
            filter.insert("verifier_did", verifier);
        }

        self.find_many::<Consent>("consents", filter).await
    }

    pub async fn mark_consent_expired(&self, consent_id: &str, now: bson::DateTime) -> Result<(), AppError> {
        let filter = doc! { "id": consent_id };
        let update = doc! {
            "$set": {
                "expired": true,
                "expired_at": now,
                "data_categories": bson::to_bson(&Vec::<String>::new())?,
            }
        };
        self.consents().update_one(filter, update).await?;
        Ok(())
    }

    pub async fn find_consent_by_id(&self, id: &str) -> Result<Option<Consent>, AppError> {
        let filter = doc! { "id": id };
        self.consents().find_one(filter).await.map_err(|e| e.into())
    }

    pub async fn update_credential_blockchain_info(
        &self,
        _id: &str,
        _tx_hash: &str,
    ) -> Result<(), AppError> {
        Ok(())
    }
}