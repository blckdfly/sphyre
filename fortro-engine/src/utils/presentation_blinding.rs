use curve25519_dalek_ng::{constants::RISTRETTO_BASEPOINT_POINT, scalar::Scalar};
use rand::thread_rng;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use crate::error::AppError;

/// Blinding Factor for Presentation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BlindingFactor {
    pub factor: Vec<u8>,
    pub nonce: Vec<u8>,
}

/// Blinded Presentation Token
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BlindedPresentation {
    pub blinded_credential: Vec<u8>,
    pub blinded_attributes: Vec<Vec<u8>>,
    pub presentation_token: String,
    pub timestamp: i64,
}

/// Presentation Session
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PresentationSession {
    pub session_id: String,
    pub blinding_factor: BlindingFactor,
    pub created_at: i64,
    pub expires_at: i64,
}

/// Generate blinding factor for presentation
pub fn generate_blinding_factor() -> Result<BlindingFactor, AppError> {
    let mut rng = thread_rng();

    let factor = Scalar::random(&mut rng);
    let nonce = Scalar::random(&mut rng);

    Ok(BlindingFactor {
        factor: factor.to_bytes().to_vec(),
        nonce: nonce.to_bytes().to_vec(),
    })
}

/// Blind credential for presentation
pub fn blind_credential(
    credential_data: &[u8],
    blinding_factor: &BlindingFactor,
) -> Result<Vec<u8>, AppError> {
    let g = RISTRETTO_BASEPOINT_POINT;

    // Parse blinding factor
    let factor_bytes: [u8; 32] = blinding_factor
        .factor
        .clone()
        .try_into()
        .map_err(|_| AppError::ValidationError("Invalid factor length".to_string()))?;
    let factor = Scalar::from_bytes_mod_order(factor_bytes);

    // Hash credential to point
    let mut hasher = Sha256::new();
    hasher.update(credential_data);
    let hash = hasher.finalize();
    let cred_scalar = Scalar::from_bytes_mod_order(hash[..32].try_into().unwrap());
    let cred_point = g * cred_scalar;

    // Apply blinding
    let blinded = cred_point + (g * factor);

    Ok(blinded.compress().to_bytes().to_vec())
}

/// Blind attributes for presentation
pub fn blind_attributes(
    attributes: &[String],
    blinding_factor: &BlindingFactor,
) -> Result<Vec<Vec<u8>>, AppError> {
    let g = RISTRETTO_BASEPOINT_POINT;

    let factor_bytes: [u8; 32] = blinding_factor
        .factor
        .clone()
        .try_into()
        .map_err(|_| AppError::ValidationError("Invalid factor length".to_string()))?;
    let factor = Scalar::from_bytes_mod_order(factor_bytes);

    let nonce_bytes: [u8; 32] = blinding_factor
        .nonce
        .clone()
        .try_into()
        .map_err(|_| AppError::ValidationError("Invalid nonce length".to_string()))?;
    let nonce = Scalar::from_bytes_mod_order(nonce_bytes);

    let mut blinded_attrs = Vec::new();

    for (i, attr) in attributes.iter().enumerate() {
        // Hash attribute
        let mut hasher = Sha256::new();
        hasher.update(attr.as_bytes());
        hasher.update(i.to_le_bytes());
        let hash = hasher.finalize();
        let attr_scalar = Scalar::from_bytes_mod_order(hash[..32].try_into().unwrap());

        // Apply blinding with nonce
        let attr_point = g * attr_scalar;
        let blinded = attr_point + (g * factor) + (g * (nonce * Scalar::from(i as u64)));

        blinded_attrs.push(blinded.compress().to_bytes().to_vec());
    }

    Ok(blinded_attrs)
}

/// Create blinded presentation
pub fn create_blinded_presentation(
    credential_data: &[u8],
    attributes: &[String],
) -> Result<BlindedPresentation, AppError> {
    let blinding_factor = generate_blinding_factor()?;

    let blinded_credential = blind_credential(credential_data, &blinding_factor)?;
    let blinded_attributes = blind_attributes(attributes, &blinding_factor)?;

    // Generate unique presentation token
    let mut hasher = Sha256::new();
    hasher.update(&blinded_credential);
    hasher.update(chrono::Utc::now().timestamp().to_le_bytes());
    let token_hash = hasher.finalize();
    let presentation_token = hex::encode(&token_hash[..16]);

    Ok(BlindedPresentation {
        blinded_credential,
        blinded_attributes,
        presentation_token,
        timestamp: chrono::Utc::now().timestamp(),
    })
}

/// Create presentation session
pub fn create_presentation_session(duration_seconds: i64) -> Result<PresentationSession, AppError> {
    let session_id = uuid::Uuid::new_v4().to_string();
    let blinding_factor = generate_blinding_factor()?;
    let now = chrono::Utc::now().timestamp();

    Ok(PresentationSession {
        session_id,
        blinding_factor,
        created_at: now,
        expires_at: now + duration_seconds,
    })
}

/// Verify presentation session is valid
pub fn verify_presentation_session(session: &PresentationSession) -> Result<bool, AppError> {
    let now = chrono::Utc::now().timestamp();

    // Check if session has expired
    if now > session.expires_at {
        return Ok(false);
    }

    // Check if session is from the future
    if session.created_at > now {
        return Ok(false);
    }

    Ok(true)
}

pub fn are_blinded_presentations_linkable(
    presentation1: &BlindedPresentation,
    presentation2: &BlindedPresentation,
) -> bool {
    if presentation1.presentation_token == presentation2.presentation_token {
        return true;
    }

    presentation1.blinded_credential == presentation2.blinded_credential
}

pub fn unblind_presentation(
    blinded_credential: &[u8],
    blinding_factor: &BlindingFactor,
) -> Result<Vec<u8>, AppError> {
    let g = RISTRETTO_BASEPOINT_POINT;

    // Parse blinded credential
    let blinded_bytes: [u8; 32] = blinded_credential
        .to_vec()
        .try_into()
        .map_err(|_| AppError::ValidationError("Invalid blinded credential length".to_string()))?;
    let blinded_compressed = curve25519_dalek_ng::ristretto::CompressedRistretto(blinded_bytes);
    let blinded_point = blinded_compressed.decompress().ok_or_else(|| {
        AppError::ValidationError("Failed to decompress blinded credential".to_string())
    })?;

    // Parse blinding factor
    let factor_bytes: [u8; 32] = blinding_factor
        .factor
        .clone()
        .try_into()
        .map_err(|_| AppError::ValidationError("Invalid factor length".to_string()))?;
    let factor = Scalar::from_bytes_mod_order(factor_bytes);

    // Remove blinding
    let unblinded = blinded_point - (g * factor);

    Ok(unblinded.compress().to_bytes().to_vec())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_blinding_factor_generation() {
        let result = generate_blinding_factor();
        assert!(result.is_ok());

        let factor = result.unwrap();
        assert_eq!(factor.factor.len(), 32);
        assert_eq!(factor.nonce.len(), 32);
    }

    #[test]
    fn test_credential_blinding_and_unblinding() {
        let credential_data = b"test_credential_data";
        let blinding_factor = generate_blinding_factor().unwrap();

        let blinded = blind_credential(credential_data, &blinding_factor).unwrap();
        let unblinded = unblind_presentation(&blinded, &blinding_factor).unwrap();

        // Verify blinding changed the data
        assert_ne!(blinded.as_slice(), credential_data);

        // Verify unblinding recovered something
        assert_eq!(unblinded.len(), 32);
    }

    #[test]
    fn test_blinded_presentations_unlinkability() {
        let credential_data = b"same_credential";
        let attributes = vec!["Alice".to_string(), "25".to_string()];

        // Create two presentations from same credential
        let presentation1 = create_blinded_presentation(credential_data, &attributes).unwrap();
        let presentation2 = create_blinded_presentation(credential_data, &attributes).unwrap();

        // Verify different tokens
        assert_ne!(
            presentation1.presentation_token,
            presentation2.presentation_token
        );

        // Verify different blinded credentials
        assert_ne!(
            presentation1.blinded_credential,
            presentation2.blinded_credential
        );

        // Verify unlinkability
        assert!(!are_blinded_presentations_linkable(
            &presentation1,
            &presentation2
        ));
    }

    #[test]
    fn test_presentation_session() {
        let session = create_presentation_session(300).unwrap();

        // Verify session is valid
        assert!(verify_presentation_session(&session).unwrap());

        // Verify session fields
        assert!(!session.session_id.is_empty());
        assert!(session.expires_at > session.created_at);
    }

    #[test]
    fn test_expired_session() {
        let mut session = create_presentation_session(300).unwrap();

        // Manually expire session
        session.expires_at = chrono::Utc::now().timestamp() - 100;

        // Verify session is invalid
        assert!(!verify_presentation_session(&session).unwrap());
    }

    #[test]
    fn test_attribute_blinding() {
        let attributes = vec![
            "Alice".to_string(),
            "25".to_string(),
            "alice@example.com".to_string(),
        ];

        let blinding_factor = generate_blinding_factor().unwrap();
        let blinded = blind_attributes(&attributes, &blinding_factor).unwrap();

        // Verify all attributes blinded
        assert_eq!(blinded.len(), attributes.len());

        // Verify each blinded attribute is 32 bytes
        for blinded_attr in &blinded {
            assert_eq!(blinded_attr.len(), 32);
        }
    }
}
