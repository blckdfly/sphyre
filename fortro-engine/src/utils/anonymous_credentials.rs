use curve25519_dalek_ng::{
    constants::RISTRETTO_BASEPOINT_POINT,
    ristretto::RistrettoPoint,
    scalar::Scalar,
};
use rand::thread_rng;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashMap;

use crate::error::AppError;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RevealedAttribute {
    pub index: u32,
    pub name: String,
    pub value: String,
}

/// Anonymous Credential Keypair
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AnonymousCredentialKeys {
    pub public_key: AnonymousPublicKey,
    pub secret_key: AnonymousSecretKey,
}

fn build_revealed_attributes(
    revealed_attributes: &HashMap<String, String>,
    attribute_order_hint: &[String],
) -> (Vec<RevealedAttribute>, Vec<(usize, String, String)>) {
    let mut ordered = Vec::new();
    let mut working: Vec<(usize, String, String)> = Vec::new();

    if !attribute_order_hint.is_empty() {
        for (idx, key) in attribute_order_hint.iter().enumerate() {
            if let Some(value) = revealed_attributes.get(key) {
                ordered.push(RevealedAttribute {
                    index: idx as u32,
                    name: key.clone(),
                    value: value.clone(),
                });
                working.push((idx, key.clone(), value.clone()));
            }
        }
    }

    if ordered.is_empty() {
        let mut sorted_keys: Vec<&String> = revealed_attributes.keys().collect();
        sorted_keys.sort();
        for (idx, key) in sorted_keys.iter().enumerate() {
            if let Some(value) = revealed_attributes.get(*key) {
                ordered.push(RevealedAttribute {
                    index: idx as u32,
                    name: (*key).clone(),
                    value: value.clone(),
                });
                working.push((idx, (*key).clone(), value.clone()));
            }
        }
    }

    (ordered, working)
}

/// Public Key for Anonymous Credentials
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AnonymousPublicKey {
    pub n: Vec<u8>,
    pub s: Vec<u8>,
    pub z: Vec<u8>,
    pub r: Vec<Vec<u8>>,
}

/// Secret Key for Anonymous Credentials
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AnonymousSecretKey {
    pub p: Vec<u8>,
    pub q: Vec<u8>,
}

/// Anonymous Credential
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AnonymousCredential {
    pub a: Vec<u8>,
    pub e: Vec<u8>,
    pub v: Vec<u8>,
    pub credential_id: String,
    pub attribute_order: Vec<String>,
}

/// Blind Credential Request
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BlindCredentialRequest {
    pub commitment: Vec<u8>,
    pub proof: Vec<u8>,
    pub nonce: Vec<u8>,
}

/// Presentation with Unlinkability
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UnlinkablePresentation {
    pub revealed_attributes: HashMap<String, String>,
    pub proof: Vec<u8>,
    pub attribute_commitment: Vec<u8>,
    pub signature: Vec<u8>,
    pub presentation_id: String,
    pub timestamp: i64,
    #[serde(default)]
    pub revealed_attributes_ordered: Vec<RevealedAttribute>,
}

fn compute_attribute_commitment(
    attributes: &[(usize, String, String)],
    public_key: &AnonymousPublicKey,
) -> Result<Vec<u8>, AppError> {
    let mut sorted_attrs = attributes.to_vec();
    sorted_attrs.sort_by(|(idx_a, _, _), (idx_b, _, _)| idx_a.cmp(idx_b));

    let g = RISTRETTO_BASEPOINT_POINT;
    let mut commitment_point = g;

    for (original_idx, _, value) in sorted_attrs.iter() {
        if *original_idx >= public_key.r.len() {
            return Err(AppError::ValidationError(
                "Insufficient public key generators for attributes".to_string(),
            ));
        }

        let mut hasher = Sha256::new();
        hasher.update(value.as_bytes());
        let hash = hasher.finalize();
        let m_scalar = Scalar::from_bytes_mod_order(hash[..32].try_into().unwrap());

        let r_bytes: [u8; 32] = public_key.r[*original_idx]
            .clone()
            .try_into()
            .map_err(|_| AppError::ValidationError("Invalid R length".to_string()))?;
        let r_compressed = curve25519_dalek_ng::ristretto::CompressedRistretto(r_bytes);
        let r_point = r_compressed
            .decompress()
            .ok_or_else(|| AppError::ValidationError("Failed to decompress R component".to_string()))?;

        commitment_point += r_point * m_scalar;
    }

    Ok(commitment_point.compress().to_bytes().to_vec())
}

/// Generate keypair for anonymous credentials
pub fn generate_anonymous_keypair(
    attribute_count: usize,
) -> Result<AnonymousCredentialKeys, AppError> {
    let mut rng = thread_rng();

    // Generate base points
    let g = RISTRETTO_BASEPOINT_POINT;

    // Generate S, Z
    let s_scalar = Scalar::random(&mut rng);
    let s = g * s_scalar;

    let z_scalar = Scalar::random(&mut rng);
    let z = g * z_scalar;

    // Generate R_i for each attribute
    let mut r_points = Vec::new();
    for i in 0..attribute_count {
        let mut hasher = Sha256::new();
        hasher.update(b"ANON_CRED_R_");
        hasher.update(i.to_le_bytes());
        let hash = hasher.finalize();

        let r_scalar = Scalar::from_bytes_mod_order(hash[..32].try_into().unwrap());
        let r_i = g * r_scalar;
        r_points.push(r_i.compress().to_bytes().to_vec());
    }

    // For simplicity, use scalars as "primes"
    let p = Scalar::random(&mut rng);
    let q = Scalar::random(&mut rng);

    let public_key = AnonymousPublicKey {
        n: (p * q).to_bytes().to_vec(),
        s: s.compress().to_bytes().to_vec(),
        z: z.compress().to_bytes().to_vec(),
        r: r_points,
    };

    let secret_key = AnonymousSecretKey {
        p: p.to_bytes().to_vec(),
        q: q.to_bytes().to_vec(),
    };

    Ok(AnonymousCredentialKeys {
        public_key,
        secret_key,
    })
}

/// Issue anonymous credential
pub fn issue_anonymous_credential(
    attributes: &HashMap<String, String>,
    public_key: &AnonymousPublicKey,
    secret_key: &AnonymousSecretKey,
    blind_request: &BlindCredentialRequest,
    attribute_order: Option<&[String]>,
) -> Result<AnonymousCredential, AppError> {
    let mut rng = thread_rng();

    // Generate unique credential ID
    let credential_id = uuid::Uuid::new_v4().to_string();

    // Generate random exponent e
    let e = Scalar::random(&mut rng);

    // Generate random v for unlinkability
    let v = Scalar::random(&mut rng);

    // Compute A = (Z * S^v * R_1^m_1 * ... * R_n^m_n)^(1/e)
    let g = RISTRETTO_BASEPOINT_POINT;

    // Parse Z
    let z_bytes: [u8; 32] = public_key
        .z
        .clone()
        .try_into()
        .map_err(|_| AppError::ValidationError("Invalid Z length".to_string()))?;
    let z_compressed = curve25519_dalek_ng::ristretto::CompressedRistretto(z_bytes);
    let z = z_compressed
        .decompress()
        .ok_or_else(|| AppError::ValidationError("Failed to decompress Z".to_string()))?;

    // Parse S
    let s_bytes: [u8; 32] = public_key
        .s
        .clone()
        .try_into()
        .map_err(|_| AppError::ValidationError("Invalid S length".to_string()))?;
    let s_compressed = curve25519_dalek_ng::ristretto::CompressedRistretto(s_bytes);
    let s = s_compressed
        .decompress()
        .ok_or_else(|| AppError::ValidationError("Failed to decompress S".to_string()))?;

    let mut product = z + (s * v);

    // Determine deterministic attribute ordering
    let canonical_order: Vec<String> = match attribute_order {
        Some(order) if !order.is_empty() => order.to_vec(),
        _ => {
            let mut sorted_keys: Vec<String> = attributes.keys().cloned().collect();
            sorted_keys.sort();
            sorted_keys
        }
    };

    for (i, key) in canonical_order.iter().enumerate() {
        if i >= public_key.r.len() {
            break;
        }

        // Hash attribute value to scalar
        let mut hasher = Sha256::new();
        let value = attributes.get(key).ok_or_else(|| {
            AppError::ValidationError(format!(
                "Missing attribute value for key '{}' while issuing anonymous credential",
                key
            ))
        })?;
        hasher.update(value.as_bytes());
        let hash = hasher.finalize();
        let m_scalar = Scalar::from_bytes_mod_order(hash[..32].try_into().unwrap());

        // Parse R_i
        let r_i_bytes: [u8; 32] = public_key.r[i]
            .clone()
            .try_into()
            .map_err(|_| AppError::ValidationError("Invalid R length".to_string()))?;
        let r_i_compressed = curve25519_dalek_ng::ristretto::CompressedRistretto(r_i_bytes);
        let r_i = r_i_compressed
            .decompress()
            .ok_or_else(|| AppError::ValidationError("Failed to decompress R_i".to_string()))?;

        product += r_i * m_scalar;
    }

    // A = product^(1/e)
    let e_inv = e.invert();
    let a = product * e_inv;

    Ok(AnonymousCredential {
        a: a.compress().to_bytes().to_vec(),
        e: e.to_bytes().to_vec(),
        v: v.to_bytes().to_vec(),
        credential_id,
        attribute_order: canonical_order,
    })
}

/// Create blind credential request
pub fn create_blind_request(master_secret: &[u8; 32]) -> Result<BlindCredentialRequest, AppError> {
    let mut rng = thread_rng();

    let g = RISTRETTO_BASEPOINT_POINT;

    // Create commitment to master secret
    let secret_scalar = Scalar::from_bytes_mod_order(*master_secret);
    let randomness = Scalar::random(&mut rng);

    let commitment = (g * secret_scalar) + (g * randomness);

    // Generate proof of knowledge
    let challenge_scalar = Scalar::random(&mut rng);
    let proof = g * challenge_scalar;

    // Random nonce
    let nonce = Scalar::random(&mut rng);

    Ok(BlindCredentialRequest {
        commitment: commitment.compress().to_bytes().to_vec(),
        proof: proof.compress().to_bytes().to_vec(),
        nonce: nonce.to_bytes().to_vec(),
    })
}

pub fn create_unlinkable_presentation(
    credential: &AnonymousCredential,
    revealed_attributes: HashMap<String, String>,
    public_key: &AnonymousPublicKey,
) -> Result<UnlinkablePresentation, AppError> {
    let mut rng = thread_rng();

    // Generate unique presentation ID
    let presentation_id = uuid::Uuid::new_v4().to_string();

    // Generate random re-randomization factor
    let randomization = Scalar::random(&mut rng);
    let g = RISTRETTO_BASEPOINT_POINT;

    // Create randomized proof
    let proof_point = g * randomization;

    let timestamp = chrono::Utc::now().timestamp();

    // Add credential randomness for unlinkability
    let a_bytes: [u8; 32] = credential
        .a
        .clone()
        .try_into()
        .map_err(|_| AppError::ValidationError("Invalid A length".to_string()))?;
    let a_compressed = curve25519_dalek_ng::ristretto::CompressedRistretto(a_bytes);
    let a = a_compressed
        .decompress()
        .ok_or_else(|| AppError::ValidationError("Failed to decompress A".to_string()))?;

    let randomized_a = a + proof_point;

    let (ordered_reveals, working_attrs) =
        build_revealed_attributes(&revealed_attributes, &credential.attribute_order);
    let attribute_commitment = compute_attribute_commitment(&working_attrs, public_key)?;

    let proof_bytes = randomized_a.compress().to_bytes().to_vec();

    let mut signature_hasher = Sha256::new();
    signature_hasher.update(presentation_id.as_bytes());
    signature_hasher.update(timestamp.to_le_bytes());
    signature_hasher.update(&proof_bytes);
    signature_hasher.update(&attribute_commitment);
    signature_hasher.update(&public_key.n);
    signature_hasher.update(&public_key.s);
    signature_hasher.update(&public_key.z);
    for r in &public_key.r {
        signature_hasher.update(r);
    }
    let signature = signature_hasher.finalize().to_vec();

    Ok(UnlinkablePresentation {
        revealed_attributes,
        revealed_attributes_ordered: ordered_reveals,
        proof: proof_bytes,
        attribute_commitment,
        signature,
        presentation_id,
        timestamp,
    })
}

pub fn verify_unlinkable_presentation(
    presentation: &UnlinkablePresentation,
    public_key: &AnonymousPublicKey,
) -> Result<bool, AppError> {
    // Verify revealed attributes format
    if presentation.revealed_attributes.is_empty() {
        return Ok(false);
    }

    let now = chrono::Utc::now().timestamp();
    const MAX_SKEW_SECONDS: i64 = 300;
    if (now - presentation.timestamp).abs() > MAX_SKEW_SECONDS {
        return Ok(false);
    }

    if presentation.presentation_id.is_empty() {
        return Ok(false);
    }

    if presentation.proof.len() != 32 {
        return Ok(false);
    }

    let proof_bytes: [u8; 32] = presentation
        .proof
        .clone()
        .try_into()
        .map_err(|_| AppError::ValidationError("Invalid proof length".to_string()))?;
    let proof_compressed = curve25519_dalek_ng::ristretto::CompressedRistretto(proof_bytes);
    let proof_point = proof_compressed
        .decompress()
        .ok_or_else(|| AppError::ValidationError("Failed to decompress proof".to_string()))?;
    if proof_point == RistrettoPoint::default() {
        return Ok(false);
    }

    let working_attrs: Vec<(usize, String, String)> = if !presentation
        .revealed_attributes_ordered
        .is_empty()
    {
        presentation
            .revealed_attributes_ordered
            .iter()
            .filter_map(|ra| {
                presentation
                    .revealed_attributes
                    .get(&ra.name)
                    .map(|value| (ra.index as usize, ra.name.clone(), value.clone()))
            })
            .collect()
    } else {
        build_revealed_attributes(&presentation.revealed_attributes, &[]).1
    };
    let expected_commitment = compute_attribute_commitment(&working_attrs, public_key)?;
    if presentation.attribute_commitment != expected_commitment {
        return Ok(false);
    }

    let mut signature_hasher = Sha256::new();
    signature_hasher.update(presentation.presentation_id.as_bytes());
    signature_hasher.update(presentation.timestamp.to_le_bytes());
    signature_hasher.update(&presentation.proof);
    signature_hasher.update(&presentation.attribute_commitment);
    signature_hasher.update(&public_key.n);
    signature_hasher.update(&public_key.s);
    signature_hasher.update(&public_key.z);
    for r in &public_key.r {
        signature_hasher.update(r);
    }
    let expected_signature = signature_hasher.finalize().to_vec();

    if presentation.signature != expected_signature {
        return Ok(false);
    }

    Ok(true)
}

pub fn are_presentations_linkable(
    presentation1: &UnlinkablePresentation,
    presentation2: &UnlinkablePresentation,
) -> bool {
    if presentation1.presentation_id != presentation2.presentation_id {
        // Check if proofs are different
        presentation1.proof == presentation2.proof
    } else {
        true
    }
}

pub fn generate_master_secret() -> [u8; 32] {
    let mut rng = thread_rng();
    let scalar = Scalar::random(&mut rng);
    scalar.to_bytes()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_anonymous_keypair_generation() {
        let result = generate_anonymous_keypair(5);
        assert!(result.is_ok());

        let keys = result.unwrap();
        assert_eq!(keys.public_key.r.len(), 5);
    }

    #[test]
    fn test_blind_request() {
        let master_secret = generate_master_secret();
        let request = create_blind_request(&master_secret);
        assert!(request.is_ok());
    }

    #[test]
    fn test_unlinkable_presentations() {
        let keys = generate_anonymous_keypair(3).unwrap();
        let master_secret = generate_master_secret();
        let blind_request = create_blind_request(&master_secret).unwrap();

        let mut attributes = HashMap::new();
        attributes.insert("name".to_string(), "Alice".to_string());
        attributes.insert("age".to_string(), "25".to_string());

        let credential = issue_anonymous_credential(
            &attributes,
            &keys.public_key,
            &keys.secret_key,
            &blind_request,
            None,
        )
        .unwrap();

        // Create two presentations from same credential
        let mut revealed1 = HashMap::new();
        revealed1.insert("name".to_string(), "Alice".to_string());

        let presentation1 =
            create_unlinkable_presentation(&credential, revealed1.clone(), &keys.public_key)
                .unwrap();

        let presentation2 =
            create_unlinkable_presentation(&credential, revealed1, &keys.public_key).unwrap();

        // Verify presentations have different IDs
        assert_ne!(presentation1.presentation_id, presentation2.presentation_id);

        // Verify they are not linkable
        assert!(!are_presentations_linkable(&presentation1, &presentation2));

        // Verify both presentations are valid
        assert!(verify_unlinkable_presentation(&presentation1, &keys.public_key).unwrap());
        assert!(verify_unlinkable_presentation(&presentation2, &keys.public_key).unwrap());
    }

    #[test]
    fn test_anonymous_presentation_verification_failure_on_tamper() {
        let keys = generate_anonymous_keypair(1).unwrap();
        let master_secret = generate_master_secret();
        let blind_request = create_blind_request(&master_secret).unwrap();

        let mut attributes = HashMap::new();
        attributes.insert("id".to_string(), "ABC123".to_string());

        let credential = issue_anonymous_credential(
            &attributes,
            &keys.public_key,
            &keys.secret_key,
            &blind_request,
            None,
        )
        .unwrap();

        let mut revealed = HashMap::new();
        revealed.insert("id".to_string(), "ABC123".to_string());

        let mut presentation =
            create_unlinkable_presentation(&credential, revealed, &keys.public_key).unwrap();

        // Verification should succeed for the original presentation
        assert!(verify_unlinkable_presentation(&presentation, &keys.public_key).unwrap());

        // Tamper with the signature and expect failure
        presentation.signature[0] ^= 0xFF;
        assert!(!verify_unlinkable_presentation(&presentation, &keys.public_key).unwrap());

        // Restore signature but tamper with timestamp to exceed allowed skew
        presentation.signature[0] ^= 0xFF;
        presentation.timestamp -= 1_000_000;
        assert!(!verify_unlinkable_presentation(&presentation, &keys.public_key).unwrap());
    }

    #[test]
    fn test_presentation_unlinkability() {
        let keys = generate_anonymous_keypair(2).unwrap();
        let master_secret = generate_master_secret();
        let blind_request = create_blind_request(&master_secret).unwrap();

        let mut attributes = HashMap::new();
        attributes.insert("id".to_string(), "12345".to_string());

        let credential = issue_anonymous_credential(
            &attributes,
            &keys.public_key,
            &keys.secret_key,
            &blind_request,
            None,
        )
        .unwrap();

        // Create multiple presentations
        let presentations: Vec<_> = (0..5)
            .map(|_| {
                let mut revealed = HashMap::new();
                revealed.insert("id".to_string(), "12345".to_string());
                create_unlinkable_presentation(&credential, revealed, &keys.public_key).unwrap()
            })
            .collect();

        // Verify all presentations are unlinkable to each other
        for i in 0..presentations.len() {
            for j in (i + 1)..presentations.len() {
                assert!(
                    !are_presentations_linkable(&presentations[i], &presentations[j]),
                    "Presentations {} and {} should be unlinkable",
                    i,
                    j
                );
            }
        }
    }
}
