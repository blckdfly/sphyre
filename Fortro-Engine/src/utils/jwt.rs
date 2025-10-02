use crate::error::AppError;
use crate::utils::did::{sign, pq_sign, pq_verify};
use chrono::{DateTime, Duration, Utc};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use base64::{Engine as _, engine::general_purpose};
use std::collections::HashMap;

/// JWT header
#[derive(Debug, Serialize, Deserialize)]
pub struct JwtHeader {
    pub alg: String,
    pub typ: String,
    pub kid: String,
}

/// JWT claims
#[derive(Debug, Serialize, Deserialize)]
pub struct JwtClaims {
    pub iss: String,
    pub sub: Option<String>,
    pub aud: Option<String>,
    pub exp: Option<i64>,
    pub nbf: Option<i64>,
    pub iat: i64,
    pub jti: String,
    #[serde(flatten)]
    pub additional_claims: HashMap<String, Value>,
}

/// Create a generic JWT
pub fn create_jwt(
    header: &JwtHeader,
    claims: &JwtClaims,
    private_key_base58: &str,
) -> Result<String, AppError> {
    // Encode header
    let header_json = serde_json::to_string(header)
        .map_err(|e| AppError::SsiError(format!("Failed to serialize JWT header: {}", e)))?;
    let header_base64 = general_purpose::URL_SAFE_NO_PAD.encode(header_json.as_bytes());
    
    // Encode claims
    let claims_json = serde_json::to_string(claims)
        .map_err(|e| AppError::SsiError(format!("Failed to serialize JWT claims: {}", e)))?;
    let claims_base64 = general_purpose::URL_SAFE_NO_PAD.encode(claims_json.as_bytes());
    
    // Create signature input
    let signature_input = format!("{}.{}", header_base64, claims_base64);
    
    // Sign the input
    let signature = sign(signature_input.as_bytes(), private_key_base58)?;
    let signature_base64 = general_purpose::URL_SAFE_NO_PAD.encode(&signature);
    
    // Combine to form the JWT
    let jwt = format!("{}.{}.{}", header_base64, claims_base64, signature_base64);
    
    Ok(jwt)
}

/// Extract a verifiable credential from a JWT
pub fn extract_credential(jwt: &str) -> Result<Value, AppError> {
    let (_, claims) = verify_pq_jwt(jwt)?;

    claims.additional_claims.get("vc")
        .cloned()
        .ok_or_else(|| AppError::SsiError("JWT does not contain a verifiable credential".to_string()))
}

/// Extract a verifiable presentation from a JWT
pub fn extract_presentation(jwt: &str) -> Result<Value, AppError> {
    let (_, claims) = verify_pq_jwt(jwt)?;
    
    claims.additional_claims.get("vp")
        .cloned()
        .ok_or_else(|| AppError::SsiError("JWT does not contain a verifiable presentation".to_string()))
}

/// Decode a JWT without verifying the signature
pub fn decode_jwt_unverified(jwt: &str) -> Result<(JwtHeader, JwtClaims), AppError> {
    // Split the JWT into parts
    let parts: Vec<&str> = jwt.split('.').collect();
    if parts.len() != 3 {
        return Err(AppError::SsiError("Invalid JWT format".to_string()));
    }
    
    let header_base64 = parts[0];
    let claims_base64 = parts[1];
    
    // Decode header
    let header_json = general_purpose::URL_SAFE_NO_PAD.decode(header_base64)
        .map_err(|e| AppError::SsiError(format!("Failed to decode JWT header: {}", e)))?;
    let header: JwtHeader = serde_json::from_slice(&header_json)
        .map_err(|e| AppError::SsiError(format!("Failed to parse JWT header: {}", e)))?;
    
    // Decode claims
    let claims_json = general_purpose::URL_SAFE_NO_PAD.decode(claims_base64)
        .map_err(|e| AppError::SsiError(format!("Failed to decode JWT claims: {}", e)))?;
    let claims: JwtClaims = serde_json::from_slice(&claims_json)
        .map_err(|e| AppError::SsiError(format!("Failed to parse JWT claims: {}", e)))?;
    
    Ok((header, claims))
}

/// Create a JWT using post-quantum Dilithium signatures
pub fn create_pq_jwt(
    header: &JwtHeader,
    claims: &JwtClaims,
    private_key: &[u8],
) -> Result<String, AppError> {
    // Encode header
    let header_json = serde_json::to_string(header)
        .map_err(|e| AppError::SsiError(format!("Failed to serialize JWT header: {}", e)))?;
    let header_base64 = general_purpose::URL_SAFE_NO_PAD.encode(header_json.as_bytes());
    
    // Encode claims
    let claims_json = serde_json::to_string(claims)
        .map_err(|e| AppError::SsiError(format!("Failed to serialize JWT claims: {}", e)))?;
    let claims_base64 = general_purpose::URL_SAFE_NO_PAD.encode(claims_json.as_bytes());
    
    // Create signature input
    let signature_input = format!("{}.{}", header_base64, claims_base64);
    
    // Sign the input using Dilithium
    let signature = pq_sign(signature_input.as_bytes(), private_key)?;
    let signature_base64 = general_purpose::URL_SAFE_NO_PAD.encode(&signature);
    
    // Combine to form the JWT
    let jwt = format!("{}.{}.{}", header_base64, claims_base64, signature_base64);
    
    Ok(jwt)
}

/// Create a credential JWT using post-quantum Dilithium signatures
pub fn create_pq_credential_jwt(
    issuer_did: &str,
    subject_did: &str,
    credential_data: Value,
    private_key: &[u8],
    public_key: &[u8],
    expiration_seconds: Option<i64>,
) -> Result<String, AppError> {
    let now = Utc::now();
    let exp = expiration_seconds.map(|secs| (now + Duration::seconds(secs)).timestamp());
    
    // For PQ, we'll use a different key ID format to indicate it's using Dilithium
    let key_id = format!("{}#pq-keys-1", issuer_did);
    
    let header = JwtHeader {
        alg: "Dilithium".to_string(), // Indicate we're using Dilithium instead of EdDSA
        typ: "JWT".to_string(),
        kid: key_id,
    };
    
    let credential_id = uuid::Uuid::new_v4().to_string();
    
    let credential = json!({
        "@context": [
            "https://www.w3.org/2018/credentials/v1",
            "https://www.w3.org/2018/credentials/examples/v1"
        ],
        "type": ["VerifiableCredential", "PostQuantumCredential"],
        "id": credential_id,
        "issuer": issuer_did,
        "issuanceDate": now.to_rfc3339(),
        "expirationDate": exp.map(|ts| DateTime::<Utc>::from_timestamp(ts, 0).unwrap().to_rfc3339()),
        "credentialSubject": {
            "id": subject_did,
            "claims": credential_data
        }
    });
    
    let mut claims = JwtClaims {
        iss: issuer_did.to_string(),
        sub: Some(subject_did.to_string()),
        aud: None,
        exp,
        nbf: Some(now.timestamp()),
        iat: now.timestamp(),
        jti: credential_id,
        additional_claims: HashMap::new(),
    };
    
    claims.additional_claims.insert("vc".to_string(), credential);
    // Store the public key in the JWT for verification
    claims.additional_claims.insert("pqk".to_string(), json!(hex::encode(public_key)));
    
    create_pq_jwt(&header, &claims, private_key)
}

/// Create a presentation JWT using post-quantum Dilithium signatures
pub fn create_pq_presentation_jwt(
    holder_did: &str,
    verifier_did: Option<&str>,
    credential_jwt_list: &[String],
    private_key: &[u8],
    public_key: &[u8],
    expiration_seconds: Option<i64>,
) -> Result<String, AppError> {
    let now = Utc::now();
    let exp = expiration_seconds.map(|secs| (now + Duration::seconds(secs)).timestamp());
    
    // For PQ, we'll use a different key ID format to indicate it's using Dilithium
    let key_id = format!("{}#pq-keys-1", holder_did);
    
    let header = JwtHeader {
        alg: "Dilithium".to_string(), // Indicate we're using Dilithium instead of EdDSA
        typ: "JWT".to_string(),
        kid: key_id,
    };
    
    let presentation_id = uuid::Uuid::new_v4().to_string();
    
    let presentation = json!({
        "@context": [
            "https://www.w3.org/2018/credentials/v1",
            "https://www.w3.org/2018/credentials/examples/v1"
        ],
        "type": ["VerifiablePresentation", "PostQuantumPresentation"],
        "id": presentation_id,
        "holder": holder_did,
        "verifiableCredential": credential_jwt_list
    });
    
    let mut claims = JwtClaims {
        iss: holder_did.to_string(),
        sub: None,
        aud: verifier_did.map(|s| s.to_string()),
        exp,
        nbf: Some(now.timestamp()),
        iat: now.timestamp(),
        jti: presentation_id,
        additional_claims: HashMap::new(),
    };
    
    claims.additional_claims.insert("vp".to_string(), presentation);
    // Store the public key in the JWT for verification
    claims.additional_claims.insert("pqk".to_string(), json!(hex::encode(public_key)));
    
    create_pq_jwt(&header, &claims, private_key)
}

/// Verify a JWT that was signed using post-quantum Dilithium
pub fn verify_pq_jwt(jwt: &str) -> Result<(JwtHeader, JwtClaims), AppError> {
    // Split the JWT into parts
    let parts: Vec<&str> = jwt.split('.').collect();
    if parts.len() != 3 {
        return Err(AppError::SsiError("Invalid JWT format".to_string()));
    }
    
    let header_base64 = parts[0];
    let claims_base64 = parts[1];
    let signature_base64 = parts[2];
    
    // Decode header
    let header_json = general_purpose::URL_SAFE_NO_PAD.decode(header_base64)
        .map_err(|e| AppError::SsiError(format!("Failed to decode JWT header: {}", e)))?;
    let header: JwtHeader = serde_json::from_slice(&header_json)
        .map_err(|e| AppError::SsiError(format!("Failed to parse JWT header: {}", e)))?;
    
    // Check if this is a post-quantum JWT
    if header.alg != "Dilithium" {
        return Err(AppError::SsiError("JWT is not signed with Dilithium".to_string()));
    }
    
    // Decode claims
    let claims_json = general_purpose::URL_SAFE_NO_PAD.decode(claims_base64)
        .map_err(|e| AppError::SsiError(format!("Failed to decode JWT claims: {}", e)))?;
    let claims: JwtClaims = serde_json::from_slice(&claims_json)
        .map_err(|e| AppError::SsiError(format!("Failed to parse JWT claims: {}", e)))?;
    
    // Get the public key from the claims
    let public_key_hex = claims.additional_claims.get("pqk")
        .and_then(|v| v.as_str())
        .ok_or_else(|| AppError::SsiError("JWT does not contain a post-quantum public key".to_string()))?;
    
    let public_key = hex::decode(public_key_hex)
        .map_err(|e| AppError::SsiError(format!("Failed to decode public key: {}", e)))?;
    
    // Verify the signature
    let signature_input = format!("{}.{}", header_base64, claims_base64);
    let signature = general_purpose::URL_SAFE_NO_PAD.decode(signature_base64)
        .map_err(|e| AppError::SsiError(format!("Failed to decode JWT signature: {}", e)))?;
    
    let is_valid = pq_verify(signature_input.as_bytes(), &signature, &public_key)?;
    
    if !is_valid {
        return Err(AppError::SsiError("JWT signature verification failed".to_string()));
    }
    
    // Check if the token is expired
    if let Some(exp) = claims.exp {
        let now = Utc::now().timestamp();
        if exp < now {
            return Err(AppError::SsiError("JWT is expired".to_string()));
        }
    }
    
    // Check if the token is not yet valid
    if let Some(nbf) = claims.nbf {
        let now = Utc::now().timestamp();
        if nbf > now {
            return Err(AppError::SsiError("JWT is not yet valid".to_string()));
        }
    }
    
    Ok((header, claims))
}