use crate::error::AppError;
use crate::utils::crypto::{dilithium_sign, dilithium_verify, generate_dilithium_keypair, hash_to_hex};
use crystals_dilithium::dilithium2::PUBLICKEYBYTES;
use serde::{Deserialize, Serialize};

/// DID key pair containing both public and private keys
#[derive(Clone, Serialize, Deserialize)]
pub struct DidKeyPair {
    pub did: String,
    pub public_key_base58: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub private_key_base58: Option<String>,
}

pub fn generate_did() -> Result<DidKeyPair, AppError> {
    let (public_key, private_key) = generate_dilithium_keypair()
        .map_err(|e| AppError::SsiError(format!("Failed to generate Dilithium key pair: {}", e)))?;

    let public_key_base58 = bs58::encode(&public_key).into_string();
    let private_key_base58 = bs58::encode(&private_key).into_string();

    let public_key_hash = crate::utils::crypto::hash_to_hex(&public_key);
    let did = format!("did:alyra:{}", &public_key_hash);

    Ok(DidKeyPair {
        did,
        public_key_base58,
        private_key_base58: Some(private_key_base58),
    })
}

pub fn did_from_private_key(private_key_base58: &str) -> Result<DidKeyPair, AppError> {
    // Decode the private key from base58
    let private_key_bytes = bs58::decode(private_key_base58)
        .into_vec()
        .map_err(|e| AppError::SsiError(format!("Failed to decode private key: {}", e)))?;

    if private_key_bytes.len() < PUBLICKEYBYTES {
        return Err(AppError::SsiError(
            "Invalid Dilithium private key length".to_string(),
        ));
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

pub fn did_from_did(did: &str) -> Result<DidKeyPair, AppError> {
    if !did.starts_with("did:alyra:") {
        return Err(AppError::SsiError(
            "Only did:alyra method is supported".to_string(),
        ));
    }
    // Extract the public key from the DID
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

    did.starts_with("did:alyra:")
}

pub fn build_pairwise_pseudonym(
    holder_did: &str,
    verifier_did: &str,
    request_id: &str,
) -> String {
    let seed = format!("{}|{}|{}", holder_did, verifier_did, request_id);
    let hash = hash_to_hex(seed.as_bytes());
    let slice_len = 32.min(hash.len());
    format!("did:alyra:prs:{}", &hash[..slice_len])
}

pub fn sign(data: &[u8], private_key_base58: &str) -> Result<Vec<u8>, AppError> {
    // Decode the private key from base58
    let private_key_bytes = bs58::decode(private_key_base58)
        .into_vec()
        .map_err(|e| AppError::SsiError(format!("Failed to decode private key: {}", e)))?;

    const DILITHIUM_SECRETKEYBYTES: usize = 2528;
    if private_key_bytes.len() != DILITHIUM_SECRETKEYBYTES {
        return Err(AppError::SsiError(format!(
            "Invalid Dilithium private key size: expected {}, got {}",
            DILITHIUM_SECRETKEYBYTES,
            private_key_bytes.len()
        )));
    }

    // Sign the data using Dilithium
    dilithium_sign(data, &private_key_bytes)
        .map_err(|e| AppError::SsiError(format!("Failed to sign with Dilithium: {}", e)))
}

/// Verify a signature using a DID's public key
pub fn verify(data: &[u8], signature: &[u8], public_key_base58: &str) -> Result<bool, AppError> {
    // Decode the public key from base58
    let public_key_bytes = bs58::decode(public_key_base58)
        .into_vec()
        .map_err(|e| AppError::SsiError(format!("Failed to decode public key: {}", e)))?;

    dilithium_verify(data, signature, &public_key_bytes)
        .map_err(|e| AppError::SsiError(format!("Failed to verify with Dilithium: {}", e)))
}

/// generate a new post-quantum did key pair using dilithium
pub fn generate_pq_did() -> Result<(String, Vec<u8>, Vec<u8>), AppError> {
    let (public_key, private_key) = generate_dilithium_keypair()
        .map_err(|e| AppError::SsiError(format!("Failed to generate Dilithium key pair: {}", e)))?;
    let did = format!("did:alyra:{}", hex::encode(&public_key[0..16]));

    Ok((did, public_key, private_key))
}

pub fn pq_sign(data: &[u8], private_key: &[u8]) -> Result<Vec<u8>, AppError> {
    dilithium_sign(data, private_key)
        .map_err(|e| AppError::SsiError(format!("Failed to sign with Dilithium: {}", e)))
}

pub fn pq_verify(data: &[u8], signature: &[u8], public_key: &[u8]) -> Result<bool, AppError> {
    dilithium_verify(data, signature, public_key)
        .map_err(|e| AppError::SsiError(format!("Failed to verify with Dilithium: {}", e)))
}
