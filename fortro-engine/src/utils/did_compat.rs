use crate::error::AppError;
use base64::{engine::general_purpose, Engine as _};

pub fn normalize_did(did: &str) -> Result<String, AppError> {
    // Check if it's already in the expected format
    if !did.starts_with("did:alyra:") {
        return Err(AppError::ValidationError("Invalid DID format".to_string()));
    }

    let identifier = did
        .strip_prefix("did:alyra:")
        .ok_or_else(|| AppError::ValidationError("Invalid DID prefix".to_string()))?;

    if identifier.len() == 64 && identifier.chars().all(|c| c.is_ascii_hexdigit()) {
        tracing::debug!("Hex DID detected, keeping as-is: {}", did);
        return Ok(did.to_string());
    }

    if is_likely_base64(identifier) {
        match general_purpose::URL_SAFE_NO_PAD.decode(identifier) {
            Ok(bytes) => {
                let base58_identifier = bs58::encode(bytes).into_string();
                tracing::debug!(
                    "Converted base64 to base58: {} {}",
                    identifier,
                    base58_identifier
                );
                Ok(format!("did:alyra:{}", base58_identifier))
            }
            Err(_) => match general_purpose::STANDARD.decode(identifier) {
                Ok(bytes) => {
                    let base58_identifier = bs58::encode(bytes).into_string();
                    tracing::debug!(
                        "Converted standard base64 to base58: {} {}",
                        identifier,
                        base58_identifier
                    );
                    Ok(format!("did:alyra:{}", base58_identifier))
                }
                Err(_) => {
                    tracing::debug!("Assumed base58 format, keeping as-is: {}", did);
                    Ok(did.to_string())
                }
            },
        }
    } else {
        tracing::debug!("Not base64, keeping as-is: {}", did);
        Ok(did.to_string())
    }
}

/// Check if a string is likely base64 encoded
fn is_likely_base64(s: &str) -> bool {
    if s.contains('-') || s.contains('_') || s.contains('+') || s.contains('/') {
        return true;
    }

    if s.ends_with('=') {
        return true;
    }

    if s.contains(':') {
        return true;
    }

    false
}

/// Convert a base58 DID to base64 format for frontend compatibility
pub fn did_to_frontend_format(did: &str) -> Result<String, AppError> {
    if !did.starts_with("did:alyra:") {
        return Err(AppError::ValidationError("Invalid DID format".to_string()));
    }

    let base58_identifier = did
        .strip_prefix("did:alyra:")
        .ok_or_else(|| AppError::ValidationError("Invalid DID prefix".to_string()))?;

    match bs58::decode(base58_identifier).into_vec() {
        Ok(bytes) => {
            let base64_identifier = general_purpose::URL_SAFE_NO_PAD.encode(&bytes);
            Ok(format!("did:alyra:{}", base64_identifier))
        }
        Err(_) => {
            Ok(did.to_string())
        }
    }
}

/// Validate a DID regardless of encoding
pub fn validate_did_compat(did: &str) -> bool {
    if !did.starts_with("did:alyra:") {
        return false;
    }

    let identifier = match did.strip_prefix("did:alyra:") {
        Some(id) => id,
        None => return false,
    };

    // Check if it's a valid base64 or base58 string
    !identifier.is_empty()
        && identifier
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_' || c == '+' || c == '/')
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_normalize_base64_did() {
        let base64_did = "did:alyra:dGVzdC1pZGVudGlmaWVy";
        let result = normalize_did(base64_did).unwrap();
        assert!(result.starts_with("did:alyra:"));
    }

    #[test]
    fn test_normalize_base58_did() {
        let base58_did = "did:alyra:5Q3H8tqbCYxRmPKt";
        let result = normalize_did(base58_did).unwrap();
        assert_eq!(result, base58_did);
    }

    #[test]
    fn test_did_to_frontend_format() {
        let base58_did = "did:alyra:5Q3H8tqbCYxRmPKt";
        let result = did_to_frontend_format(base58_did).unwrap();
        assert!(result.starts_with("did:alyra:"));
    }

    #[test]
    fn test_validate_did_compat() {
        assert!(validate_did_compat("did:alyra:dGVzdC1pZGVudGlmaWVy"));
        assert!(validate_did_compat("did:alyra:5Q3H8tqbCYxRmPKt"));
        assert!(!validate_did_compat("did:web:example.com"));
        assert!(!validate_did_compat("invalid"));
    }
}
