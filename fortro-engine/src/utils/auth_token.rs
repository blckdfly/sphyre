use crate::error::AppError;
use pbkdf2::pbkdf2_hmac;
use sha2::{Digest, Sha256};

const SALT: &[u8] = b"sphyre-wallet-v1";
const ITERATIONS: u32 = 100000;

pub fn derive_auth_token(seed_phrase: &str) -> String {
    let mut output = [0u8; 32];
    pbkdf2_hmac::<Sha256>(seed_phrase.as_bytes(), SALT, ITERATIONS, &mut output);
    hex::encode(output)
}

pub fn hash_auth_token(auth_token: &str) -> Result<String, AppError> {
    bcrypt::hash(auth_token, bcrypt::DEFAULT_COST)
        .map_err(|e| AppError::InternalError(format!("Failed to hash auth token: {}", e)))
}

/// Deterministic fingerprint for lookup
pub fn fingerprint_auth_token(auth_token: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(auth_token.as_bytes());
    let digest = hasher.finalize();
    hex::encode(digest)
}

pub fn verify_auth_token(auth_token: &str, hash: &str) -> Result<bool, AppError> {
    bcrypt::verify(auth_token, hash)
        .map_err(|e| AppError::InternalError(format!("Failed to verify auth token: {}", e)))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_derive_auth_token() {
        let seed = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
        let token = derive_auth_token(seed);

        assert_eq!(token.len(), 64);

        let token2 = derive_auth_token(seed);
        assert_eq!(token, token2);
    }

    #[test]
    fn test_hash_and_verify() {
        let token = "test_auth_token_12345";

        let hash = hash_auth_token(token).unwrap();

        assert_ne!(hash, token);

        // Verify correct token
        assert!(verify_auth_token(token, &hash).unwrap());

        // Verify wrong token fails
        assert!(!verify_auth_token("wrong_token", &hash).unwrap());
    }

    #[test]
    fn test_fingerprint_auth_token() {
        let token1 = "token-123";
        let token2 = "token-456";

        let fp1 = fingerprint_auth_token(token1);
        let fp2 = fingerprint_auth_token(token2);

        assert_ne!(fp1, fp2);
        assert_eq!(fp1, fingerprint_auth_token(token1));
        assert_eq!(fp1.len(), 64);
    }

    #[test]
    fn test_different_seeds_different_tokens() {
        let seed1 = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
        let seed2 = "zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo wrong";

        let token1 = derive_auth_token(seed1);
        let token2 = derive_auth_token(seed2);

        assert_ne!(token1, token2);
    }
}
