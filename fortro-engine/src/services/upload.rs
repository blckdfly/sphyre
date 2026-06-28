use crate::error::AppError;
use crate::ipfs::IpfsClient;
use std::sync::Arc;

/// Upload service for handling file uploads to IPFS
pub struct UploadService {
    ipfs: Arc<IpfsClient>,
}

impl UploadService {
    pub fn new(ipfs: Arc<IpfsClient>) -> Self {
        Self { ipfs }
    }

    /// Upload image to IPFS and return gateway URL
    pub async fn upload_image(
        &self,
        file_data: Vec<u8>,
        content_type: &str,
    ) -> Result<(String, String), AppError> {
        // Validate image type
        if !content_type.starts_with("image/") {
            return Err(AppError::ValidationError(
                "Invalid file type. Only images are allowed.".to_string(),
            ));
        }

        if file_data.len() > 5 * 1024 * 1024 {
            return Err(AppError::ValidationError(
                "File too large. Maximum size is 5MB.".to_string(),
            ));
        }

        let ipfs_hash = self
            .ipfs
            .upload(&file_data)
            .await
            .map_err(|e| AppError::InternalError(format!("IPFS upload failed: {}", e)))?;

        // Get gateway URL
        let gateway_base = std::env::var("IPFS_GATEWAY")
            .unwrap_or_else(|_| "https://gateway.sphyre.tech".to_string());
        let gateway_url = format!("{}/ipfs/{}", gateway_base, ipfs_hash);

        tracing::info!("Image uploaded to IPFS: {} ({})", ipfs_hash, gateway_url);

        Ok((ipfs_hash, gateway_url))
    }

    /// Upload arbitrary file to IPFS
    pub async fn upload_file(
        &self,
        file_data: Vec<u8>,
        content_type: Option<&str>,
    ) -> Result<(String, String), AppError> {
        if file_data.is_empty() {
            return Err(AppError::ValidationError("No file provided".to_string()));
        }

        if file_data.len() > 20 * 1024 * 1024 {
            return Err(AppError::ValidationError(
                "File too large. Maximum size is 20MB.".to_string(),
            ));
        }

        if let Some(ct) = content_type {
            tracing::debug!("Uploading evidence file with content-type {}", ct);
        }

        let ipfs_hash = self
            .ipfs
            .upload(&file_data)
            .await
            .map_err(|e| AppError::InternalError(format!("IPFS upload failed: {}", e)))?;

        let gateway_base = std::env::var("IPFS_GATEWAY")
            .unwrap_or_else(|_| "https://gateway.sphyre.tech".to_string());
        let gateway_url = format!("{}/ipfs/{}", gateway_base, ipfs_hash);

        tracing::info!("File uploaded to IPFS: {} ({})", ipfs_hash, gateway_url);

        Ok((ipfs_hash, gateway_url))
    }
}
