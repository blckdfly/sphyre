use crate::error::AppError;
use reqwest;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::time::{SystemTime, UNIX_EPOCH};

/// Domain verification method
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum VerificationMethod {
    /// DNS TXT record verification
    DnsTxt,
    /// HTTP .well-known file verification
    WellKnown,
}

/// Domain verification challenge
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DomainChallenge {
    pub domain: String,
    pub challenge_token: String,
    pub method: VerificationMethod,
    pub created_at: u64,
    pub expires_at: u64,
}

/// Domain verification result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DomainVerification {
    pub domain: String,
    pub verified: bool,
    pub verified_at: u64,
    pub public_key: String,
}

impl DomainChallenge {
    /// Create a new domain verification challenge
    pub fn new(domain: String, public_key: &str, method: VerificationMethod) -> Self {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs();

        // Create challenge token from domain + public_key + timestamp
        let challenge_input = format!("{}:{}:{}", domain, public_key, now);
        let mut hasher = Sha256::new();
        hasher.update(challenge_input.as_bytes());
        let challenge_token = format!("sphyre-verify-{}", hex::encode(hasher.finalize()));

        Self {
            domain,
            challenge_token,
            method,
            created_at: now,
            expires_at: now + 3600,
        }
    }

    /// Check if challenge is expired
    pub fn is_expired(&self) -> bool {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs();
        now > self.expires_at
    }
}

/// Verify domain ownership via DNS TXT record
pub async fn verify_domain_dns_txt(domain: &str, expected_token: &str) -> Result<bool, AppError> {
    // Use DNS over HTTPS for DNS queries
    let dns_query_url = format!(
        "https://dns.google/resolve?name=_sphyre-verify.{}&type=TXT",
        domain
    );

    let client = reqwest::Client::new();
    let response = client
        .get(&dns_query_url)
        .send()
        .await
        .map_err(|e| AppError::SsiError(format!("DNS query failed: {}", e)))?;

    if !response.status().is_success() {
        return Err(AppError::SsiError(
            "Failed to query DNS records".to_string(),
        ));
    }

    let dns_response: serde_json::Value = response
        .json()
        .await
        .map_err(|e| AppError::SsiError(format!("Failed to parse DNS response: {}", e)))?;

    // Check if any TXT record matches the expected token
    if let Some(answers) = dns_response["Answer"].as_array() {
        for answer in answers {
            if let Some(data) = answer["data"].as_str() {
                // Remove quotes from TXT record data
                let cleaned_data = data.trim_matches('"');
                if cleaned_data == expected_token {
                    return Ok(true);
                }
            }
        }
    }

    Ok(false)
}

/// Verify domain ownership via .well-known file
pub async fn verify_domain_well_known(
    domain: &str,
    expected_token: &str,
) -> Result<bool, AppError> {
    // Try both HTTP and HTTPS
    let urls = vec![
        format!("https://{}/.well-known/sphyre-verify.txt", domain),
        format!("http://{}/.well-known/sphyre-verify.txt", domain),
    ];

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| AppError::SsiError(format!("HTTP client error: {}", e)))?;

    for url in urls {
        match client.get(&url).send().await {
            Ok(response) => {
                if response.status().is_success() {
                    if let Ok(content) = response.text().await {
                        let trimmed = content.trim();
                        if trimmed == expected_token {
                            return Ok(true);
                        }
                    }
                }
            }
            Err(_) => continue,
        }
    }

    Ok(false)
}

/// Verify domain ownership using specified method
pub async fn verify_domain_ownership(
    challenge: &DomainChallenge,
) -> Result<DomainVerification, AppError> {
    // Check if challenge is expired
    if challenge.is_expired() {
        return Err(AppError::ValidationError(
            "Domain verification challenge has expired".to_string(),
        ));
    }

    let verified = match challenge.method {
        VerificationMethod::DnsTxt => {
            verify_domain_dns_txt(&challenge.domain, &challenge.challenge_token).await?
        }
        VerificationMethod::WellKnown => {
            verify_domain_well_known(&challenge.domain, &challenge.challenge_token).await?
        }
    };

    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs();

    Ok(DomainVerification {
        domain: challenge.domain.clone(),
        verified,
        verified_at: now,
        public_key: String::new(),
    })
}

/// Generate DID from domain and public key
pub fn generate_domain_did(entity_type: &str, domain: &str, public_key_base58: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(domain.as_bytes());
    hasher.update(public_key_base58.as_bytes());
    let domain_hash = hex::encode(&hasher.finalize()[..8]);

    // Format: did:alyra:<role>:<domain-hash>:<pubkey-prefix>
    // Role is shortened to keep DIDs compact (issuer -> iss, verifier -> vf)
    let pubkey_prefix = &public_key_base58[..12];
    let role_segment = match entity_type {
        "issuer" => "iss",
        "verifier" => "vf",
        other => other,
    };

    format!(
        "did:alyra:{}:{}:{}",
        role_segment, domain_hash, pubkey_prefix
    )
}

/// Validate domain format
pub fn validate_domain(domain: &str) -> Result<(), AppError> {
    // Basic domain validation
    if domain.is_empty() {
        return Err(AppError::ValidationError(
            "Domain cannot be empty".to_string(),
        ));
    }

    // Check for valid characters and structure
    if !domain
        .chars()
        .all(|c| c.is_alphanumeric() || c == '.' || c == '-')
    {
        return Err(AppError::ValidationError(
            "Domain contains invalid characters".to_string(),
        ));
    }

    // Must have at least one dot
    if !domain.contains('.') {
        return Err(AppError::ValidationError(
            "Domain must be a valid hostname".to_string(),
        ));
    }

    // Check length
    if domain.len() > 253 {
        return Err(AppError::ValidationError(
            "Domain name too long".to_string(),
        ));
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_validate_domain() {
        assert!(validate_domain("example.com").is_ok());
        assert!(validate_domain("sub.example.com").is_ok());
        assert!(validate_domain("my-domain.org").is_ok());
        assert!(validate_domain("invalid").is_err());
        assert!(validate_domain("").is_err());
        assert!(validate_domain("invalid!domain.com").is_err());
    }

    #[test]
    fn test_generate_domain_did() {
        let did = generate_domain_did(
            "issuer",
            "university.edu",
            "8RGnKR7LmGNSL5PuKHzRWfxUCpbQwXP5DxJq4nFkHYZ1",
        );
        assert!(did.starts_with("did:alyra:iss:"));
        assert!(did.contains("8RGnKR7LmGNS"));
    }

    #[test]
    fn test_challenge_creation() {
        let challenge = DomainChallenge::new(
            "example.com".to_string(),
            "pubkey123",
            VerificationMethod::DnsTxt,
        );
        assert_eq!(challenge.domain, "example.com");
        assert!(challenge.challenge_token.starts_with("sphyre-verify-"));
        assert!(!challenge.is_expired());
    }
}
