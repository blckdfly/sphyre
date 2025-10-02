use serde::{Deserialize, Serialize};
use crate::error::AppError;
use crate::utils::crypto::{generate_dilithium_keypair, dilithium_sign, dilithium_verify};
use crystals_dilithium::dilithium2::PUBLICKEYBYTES;

/// DID key pair containing both public and private keys
#[derive(Clone, Serialize, Deserialize)]
pub struct DidKeyPair {
    pub did: String,
    pub public_key_base58: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub private_key_base58: Option<String>,
}

/// Generate a new DID key pair using Dilithium (did:alyra)
pub fn generate_did() -> Result<DidKeyPair, AppError> {
    let (public_key, private_key) = generate_dilithium_keypair()
        .map_err(|e| AppError::SsiError(format!("Failed to generate Dilithium key pair: {}", e)))?;

    let public_key_base58 = bs58::encode(&public_key).into_string();
    let private_key_base58 = bs58::encode(&private_key).into_string();
    let did = format!("did:alyra:{}", &public_key_base58);

    Ok(DidKeyPair {
        did,
        public_key_base58,
        private_key_base58: Some(private_key_base58),
    })
}

/// Create a DID key pair from an existing private key (Dilithium secret key bytes)
pub fn did_from_private_key(private_key_base58: &str) -> Result<DidKeyPair, AppError> {
    // Decode the private key from base58
    let private_key_bytes = bs58::decode(private_key_base58)
        .into_vec()
        .map_err(|e| AppError::SsiError(format!("Failed to decode private key: {}", e)))?;

    // Attempt to extract the public key from the Dilithium secret key bytes.
    // In common implementations, the Dilithium secret key includes the public key bytes.
    if private_key_bytes.len() < PUBLICKEYBYTES {
        return Err(AppError::SsiError("Invalid Dilithium private key length".to_string()));
    }
    let pub_start = private_key_bytes.len().saturating_sub(PUBLICKEYBYTES);
    let public_key = &private_key_bytes[pub_start..];
    let public_key_base58 = bs58::encode(public_key).into_string();
    let did = format!("did:alyra:{}", &public_key_base58);

    Ok(DidKeyPair {
        did,
        public_key_base58,
        private_key_base58: Some(private_key_base58.to_string()),
    })
}

/// Create a public-only DID key pair from a DID (did:alyra)
pub fn did_from_did(did: &str) -> Result<DidKeyPair, AppError> {
    if !did.starts_with("did:alyra:") {
        return Err(AppError::SsiError("Only did:alyra method is supported".to_string()));
    }
    // Extract the public key (base58) from the DID
    let public_key_base58 = did.strip_prefix("did:alyra:").unwrap_or("");

    Ok(DidKeyPair {
        did: did.to_string(),
        public_key_base58: public_key_base58.to_string(),
        private_key_base58: None,
    })
}

/// Validate a DID string
pub fn validate_did(did: &str) -> bool {
    if !did.starts_with("did:") {
        return false;
    }

    // For now, accept only did:alyra method
    did.starts_with("did:alyra:")
}

/// Sign data using a DID's private key (Dilithium)
pub fn sign(data: &[u8], private_key_base58: &str) -> Result<Vec<u8>, AppError> {
    // Decode the private key from base58
    let private_key_bytes = bs58::decode(private_key_base58)
        .into_vec()
        .map_err(|e| AppError::SsiError(format!("Failed to decode private key: {}", e)))?;

    // Sign the data using Dilithium
    dilithium_sign(data, &private_key_bytes)
        .map_err(|e| AppError::SsiError(format!("Failed to sign with Dilithium: {}", e)))
}

/// Verify a signature using a DID's public key (Dilithium)
pub fn verify(data: &[u8], signature: &[u8], public_key_base58: &str) -> Result<bool, AppError> {
    // Decode the public key from base58
    let public_key_bytes = bs58::decode(public_key_base58)
        .into_vec()
        .map_err(|e| AppError::SsiError(format!("Failed to decode public key: {}", e)))?;

    // Verify the signature using Dilithium
    dilithium_verify(data, signature, &public_key_bytes)
        .map_err(|e| AppError::SsiError(format!("Failed to verify with Dilithium: {}", e)))
}

/// Generate a new post-quantum DID key pair using Dilithium
pub fn generate_pq_did() -> Result<(String, Vec<u8>, Vec<u8>), AppError> {
    // Generate a Dilithium key pair
    let (public_key, private_key) = generate_dilithium_keypair()
        .map_err(|e| AppError::SsiError(format!("Failed to generate Dilithium key pair: {}", e)))?;
    
    // Create a DID from the public key
    // For simplicity, we'll use a similar format to did:key but with a pq: prefix
    let did = format!("did:pq:{}", hex::encode(&public_key[0..16]));
    
    Ok((did, public_key, private_key))
}

/// Sign data using Dilithium (post-quantum)
pub fn pq_sign(data: &[u8], private_key: &[u8]) -> Result<Vec<u8>, AppError> {
    // Sign the data using Dilithium
    dilithium_sign(data, private_key)
        .map_err(|e| AppError::SsiError(format!("Failed to sign with Dilithium: {}", e)))
}

/// Verify a signature using Dilithium (post-quantum)
pub fn pq_verify(data: &[u8], signature: &[u8], public_key: &[u8]) -> Result<bool, AppError> {
    // Verify the signature using Dilithium
    dilithium_verify(data, signature, public_key)
        .map_err(|e| AppError::SsiError(format!("Failed to verify with Dilithium: {}", e)))
}
