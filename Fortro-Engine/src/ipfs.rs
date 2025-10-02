use ipfs_api_backend_hyper::{IpfsApi, IpfsClient as IpfsApiClient, TryFromUri};
use std::io::Cursor;
use futures::TryStreamExt;
use crate::error::AppError;

#[derive(Clone)]
pub struct IpfsClient {
    client: IpfsApiClient,
}

impl IpfsClient {
    pub fn new(ipfs_api_url: &str) -> Result<Self, AppError> {
        let client = IpfsApiClient::from_str(ipfs_api_url)
            .map_err(|e| AppError::IpfsError(format!("Failed to create IPFS client: {}", e)))?;

        Ok(Self { client })
    }

    pub async fn upload(&self, data: &[u8]) -> Result<String, AppError> {
        let cursor = Cursor::new(data.to_vec());
        let client = self.client.clone();

        let cid = tokio::task::spawn_blocking(move || {
            // Create a new runtime for this thread
            let rt = tokio::runtime::Builder::new_current_thread()
                .enable_all()
                .build()
                .map_err(|e| AppError::IpfsError(format!("Failed to create runtime: {}", e)))?;
            
            // Run the async operation on this thread's runtime
            rt.block_on(async {
                client.add(cursor)
                    .await
                    .map_err(|e| AppError::IpfsError(format!("Failed to upload to IPFS: {}", e)))
                    .map(|res| res.hash)
            })
        }).await.map_err(|e| AppError::IpfsError(format!("Task join error: {}", e)))??;

        tracing::info!("Uploaded data to IPFS with CID: {}", cid);
        Ok(cid)
    }

    /// Upload JSON data to IPFS and return the content identifier (CID)
    pub async fn upload_json<T: serde::Serialize>(&self, data: &T) -> Result<String, AppError> {
        let json_data = serde_json::to_vec(data)
            .map_err(|e| AppError::IpfsError(format!("Failed to serialize data: {}", e)))?;

        self.upload(&json_data).await
    }

    pub async fn get(&self, cid: &str) -> Result<Vec<u8>, AppError> {
        let cid_string = cid.to_string();
        let client = self.client.clone();
        
        // Use a blocking task to handle the non-Send future
        let bytes = tokio::task::spawn_blocking(move || {
            // Create a new runtime for this thread
            let rt = tokio::runtime::Builder::new_current_thread()
                .enable_all()
                .build()
                .map_err(|e| AppError::IpfsError(format!("Failed to create runtime: {}", e)))?;
            
            // Run the async operation on this thread's runtime
            rt.block_on(async {
                let stream = client.cat(&cid_string);
                
                // Convert the stream of Bytes to a single Vec<u8>
                stream
                    .map_ok(|bytes| bytes.to_vec())
                    .try_concat()
                    .await
                    .map_err(|e| AppError::IpfsError(format!("Failed to get data from IPFS: {}", e)))
            })
        }).await.map_err(|e| AppError::IpfsError(format!("Task join error: {}", e)))??;

        Ok(bytes)
    }

    /// Get JSON data from IPFS using the content identifier (CID)
    pub async fn get_json<T: serde::de::DeserializeOwned>(&self, cid: &str) -> Result<T, AppError> {
        let data = self.get(cid).await?;

        let json_data = serde_json::from_slice(&data)
            .map_err(|e| AppError::IpfsError(format!("Failed to deserialize data: {}", e)))?;

        Ok(json_data)
    }

    pub async fn exists(&self, cid: &str) -> Result<bool, AppError> {
        let cid_string = cid.to_string();
        let client = self.client.clone();
        
        // Use a blocking task to handle the non-Send future
        let result = tokio::task::spawn_blocking(move || {
            // Create a new runtime for this thread
            let rt = tokio::runtime::Builder::new_current_thread()
                .enable_all()
                .build()
                .map_err(|e| AppError::IpfsError(format!("Failed to create runtime: {}", e)))?;
            
            // Run the async operation on this thread's runtime
            rt.block_on(async {
                match client.block_stat(&cid_string).await {
                    Ok(_) => Ok(true),
                    Err(e) => {
                        if e.to_string().contains("not found") {
                            Ok(false)
                        } else {
                            Err(AppError::IpfsError(format!("Failed to check if CID exists: {}", e)))
                        }
                    }
                }
            })
        }).await.map_err(|e| AppError::IpfsError(format!("Task join error: {}", e)))??;

        Ok(result)
    }

    /// Pin a CID to ensure it's not garbage collected
    /// This version uses a blocking approach to handle non-Send futures
    pub async fn pin(&self, cid: &str) -> Result<(), AppError> {
        let cid_string = cid.to_string();
        let client = self.client.clone();
        
        // Use a blocking task to handle the non-Send future
        tokio::task::spawn_blocking(move || {
            // Create a new runtime for this thread
            let rt = tokio::runtime::Builder::new_current_thread()
                .enable_all()
                .build()
                .map_err(|e| AppError::IpfsError(format!("Failed to create runtime: {}", e)))?;
            
            // Run the async operation on this thread's runtime
            rt.block_on(async {
                client.pin_add(&cid_string, false)
                    .await
                    .map_err(|e| AppError::IpfsError(format!("Failed to pin CID: {}", e)))
            })
        }).await.map_err(|e| AppError::IpfsError(format!("Task join error: {}", e)))??;

        tracing::info!("Pinned CID: {}", cid);
        Ok(())
    }

    /// Unpin a CID
    /// This version uses a blocking approach to handle non-Send futures
    pub async fn unpin(&self, cid: &str) -> Result<(), AppError> {
        let cid_string = cid.to_string();
        let client = self.client.clone();
        
        // Use a blocking task to handle the non-Send future
        tokio::task::spawn_blocking(move || {
            // Create a new runtime for this thread
            let rt = tokio::runtime::Builder::new_current_thread()
                .enable_all()
                .build()
                .map_err(|e| AppError::IpfsError(format!("Failed to create runtime: {}", e)))?;
            
            // Run the async operation on this thread's runtime
            rt.block_on(async {
                client.pin_rm(&cid_string, false)
                    .await
                    .map_err(|e| AppError::IpfsError(format!("Failed to unpin CID: {}", e)))
            })
        }).await.map_err(|e| AppError::IpfsError(format!("Task join error: {}", e)))??;

        tracing::info!("Unpinned CID: {}", cid);
        Ok(())
    }

    /// Upload encrypted data to IPFS
    /// This is a higher-level function that encrypts sensitive data before uploading
    pub async fn upload_encrypted(&self, data: &[u8], encryption_key: &[u8]) -> Result<String, AppError> {
        // Encrypt the data using a utility function
        let encrypted_data = crate::utils::crypto::encrypt(data, encryption_key)
            .map_err(|e| AppError::IpfsError(format!("Failed to encrypt data: {}", e)))?;

        // Upload the encrypted data
        self.upload(&encrypted_data).await
    }

    /// Get and decrypt data from IPFS
    pub async fn get_encrypted(&self, cid: &str, encryption_key: &[u8]) -> Result<Vec<u8>, AppError> {
        // Get the encrypted data
        let encrypted_data = self.get(cid).await?;

        // Decrypt the data
        let decrypted_data = crate::utils::crypto::decrypt(&encrypted_data, encryption_key)
            .map_err(|e| AppError::IpfsError(format!("Failed to decrypt data: {}", e)))?;

        Ok(decrypted_data)
    }

    /// Upload sensitive credential data to IPFS with encryption
    pub async fn upload_credential_data(
        &self, 
        data: &serde_json::Value, 
        encryption_key: &[u8]
    ) -> Result<String, AppError> {
        let json_data = serde_json::to_vec(data)
            .map_err(|e| AppError::IpfsError(format!("Failed to serialize credential data: {}", e)))?;

        self.upload_encrypted(&json_data, encryption_key).await
    }

    /// Get and decrypt credential data from IPFS
    pub async fn get_credential_data(
        &self, 
        cid: &str, 
        encryption_key: &[u8]
    ) -> Result<serde_json::Value, AppError> {
        let decrypted_data = self.get_encrypted(cid, encryption_key).await?;

        let json_data = serde_json::from_slice(&decrypted_data)
            .map_err(|e| AppError::IpfsError(format!("Failed to deserialize credential data: {}", e)))?;

        Ok(json_data)
    }
}
