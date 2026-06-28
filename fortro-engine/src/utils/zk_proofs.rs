use bulletproofs::{BulletproofGens, PedersenGens, RangeProof};
use curve25519_dalek_ng::{ristretto::CompressedRistretto, scalar::Scalar};
use merlin::Transcript;
use rand::thread_rng;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

use crate::error::AppError;
use crate::utils::bbs_plus::{
    create_selective_disclosure_proof,
    verify_selective_disclosure_proof, BBSProof, BBSPublicKey, BBSSignature,
};

/// A range proof with its commitment
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RangeProofWithCommitment {
    pub proof: Vec<u8>,
    pub commitment: Vec<u8>,
    #[serde(default)]
    pub attribute_name: String,
}

/// A predicate proof for a credential attribute
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PredicateProof {
    pub attribute_name: String,
    pub predicate_type: String,
    pub predicate_value: i64,
    pub range_proof: RangeProofWithCommitment,
}

/// Create a range proof for a value
pub fn create_range_proof(
    value: u64,
    attribute_name: &str,
) -> Result<RangeProofWithCommitment, AppError> {
    // Set up the generators
    let pc_gens = PedersenGens::default();
    let bp_gens = BulletproofGens::new(64, 1);

    // Create a random blinding factor
    let mut rng = thread_rng();
    let blinding = Scalar::random(&mut rng);

    // Create a Pedersen commitment to the value
    let commitment = pc_gens.commit(Scalar::from(value), blinding);

    // Create a range proof for the value
    let mut transcript = Transcript::new(b"range_proof");
    let (proof, _) =
        RangeProof::prove_single(&bp_gens, &pc_gens, &mut transcript, value, &blinding, 64)
            .map_err(|e| AppError::SsiError(format!("Failed to create range proof: {}", e)))?;

    Ok(RangeProofWithCommitment {
        proof: proof.to_bytes(),
        commitment: commitment.compress().to_bytes().to_vec(),
        attribute_name: attribute_name.to_string(),
    })
}

/// Verify a range proof
pub fn verify_range_proof(
    proof_with_commitment: &RangeProofWithCommitment,
) -> Result<bool, AppError> {
    // Set up the generators
    let pc_gens = PedersenGens::default();
    let bp_gens = BulletproofGens::new(64, 1);

    // Parse the proof and commitment
    let proof = RangeProof::from_bytes(&proof_with_commitment.proof)
        .map_err(|e| AppError::SsiError(format!("Failed to parse range proof: {}", e)))?;

    let commitment_bytes: [u8; 32] = proof_with_commitment
        .commitment
        .clone()
        .try_into()
        .map_err(|_| AppError::SsiError("Invalid commitment length".to_string()))?;

    let commitment = CompressedRistretto::from_slice(&commitment_bytes);

    let mut transcript = Transcript::new(b"range_proof");
    proof
        .verify_single(&bp_gens, &pc_gens, &mut transcript, &commitment, 64)
        .map_err(|e| AppError::SsiError(format!("Range proof verification failed: {}", e)))?;

    Ok(true)
}

/// Create a predicate proof for a credential attribute
pub fn create_predicate_proof(
    attribute_name: &str,
    attribute_value: u64,
    predicate_type: &str,
    predicate_value: i64,
) -> Result<PredicateProof, AppError> {
    tracing::info!(
        "Creating ZK proof - attribute: {}, value: {} (u64), predicate: {} {} (i64)",
        attribute_name, attribute_value, predicate_type, predicate_value
    );
    
    match predicate_type {
        ">=" => {
            let attr_i64 = attribute_value as i64;
            tracing::info!(
                "Comparing: {} >= {} (types: {} vs {})",
                attr_i64, predicate_value,
                std::any::type_name_of_val(&attr_i64),
                std::any::type_name_of_val(&predicate_value)
            );
            
            if attr_i64 < predicate_value {
                tracing::error!(
                    "Predicate FAILED: {} < {}",
                    attr_i64, predicate_value
                );
                return Err(AppError::ValidationError(format!(
                    "Attribute value {} does not satisfy predicate {} {}",
                    attribute_value, predicate_type, predicate_value
                )));
            }
            
            tracing::info!("Predicate PASSED: {} >= {}", attr_i64, predicate_value);

            let range_proof = create_range_proof(
                (attribute_value as i64 - predicate_value) as u64,
                attribute_name,
            )?;

            Ok(PredicateProof {
                attribute_name: attribute_name.to_string(),
                predicate_type: predicate_type.to_string(),
                predicate_value,
                range_proof,
            })
        }
        "<=" => {
            if (attribute_value as i64) > predicate_value {
                return Err(AppError::ValidationError(format!(
                    "Attribute value {} does not satisfy predicate {} {}",
                    attribute_value, predicate_type, predicate_value
                )));
            }

            let range_proof = create_range_proof(
                (predicate_value - attribute_value as i64) as u64,
                attribute_name,
            )?;

            Ok(PredicateProof {
                attribute_name: attribute_name.to_string(),
                predicate_type: predicate_type.to_string(),
                predicate_value,
                range_proof,
            })
        }
        ">" => {
            if (attribute_value as i64) <= predicate_value {
                return Err(AppError::ValidationError(format!(
                    "Attribute value {} does not satisfy predicate {} {}",
                    attribute_value, predicate_type, predicate_value
                )));
            }

            let range_proof = create_range_proof(
                (attribute_value as i64 - predicate_value - 1) as u64,
                attribute_name,
            )?;

            Ok(PredicateProof {
                attribute_name: attribute_name.to_string(),
                predicate_type: predicate_type.to_string(),
                predicate_value,
                range_proof,
            })
        }
        "<" => {
            if (attribute_value as i64) >= predicate_value {
                return Err(AppError::ValidationError(format!(
                    "Attribute value {} does not satisfy predicate {} {}",
                    attribute_value, predicate_type, predicate_value
                )));
            }

            let range_proof = create_range_proof(
                (predicate_value - attribute_value as i64 - 1) as u64,
                attribute_name,
            )?;

            Ok(PredicateProof {
                attribute_name: attribute_name.to_string(),
                predicate_type: predicate_type.to_string(),
                predicate_value,
                range_proof,
            })
        }
        "==" => {
            if (attribute_value as i64) != predicate_value {
                return Err(AppError::ValidationError(format!(
                    "Attribute value {} does not satisfy predicate {} {}",
                    attribute_value, predicate_type, predicate_value
                )));
            }

            let range_proof = create_range_proof(0, attribute_name)?;

            Ok(PredicateProof {
                attribute_name: attribute_name.to_string(),
                predicate_type: predicate_type.to_string(),
                predicate_value,
                range_proof,
            })
        }
        "!=" => {
            if (attribute_value as i64) == predicate_value {
                return Err(AppError::ValidationError(format!(
                    "Attribute value {} does not satisfy predicate {} {}",
                    attribute_value, predicate_type, predicate_value
                )));
            }

            let diff = if attribute_value as i64 > predicate_value {
                (attribute_value as i64 - predicate_value) as u64
            } else {
                (predicate_value - attribute_value as i64) as u64
            };

            let range_proof = create_range_proof(diff, attribute_name)?;

            Ok(PredicateProof {
                attribute_name: attribute_name.to_string(),
                predicate_type: predicate_type.to_string(),
                predicate_value,
                range_proof,
            })
        }
        _ => Err(AppError::ValidationError(format!(
            "Unsupported predicate type: {}",
            predicate_type
        ))),
    }
}

/// Verify a predicate proof
pub fn verify_predicate_proof(proof: &PredicateProof) -> Result<bool, AppError> {
    // Verify the range proof
    verify_range_proof(&proof.range_proof)?;

    Ok(true)
}

pub fn create_selective_disclosure(
    credential_data: &HashMap<String, serde_json::Value>,
    disclosed_attributes: &[String],
    bbs_signature: &BBSSignature,
    bbs_public_key: &BBSPublicKey,
) -> Result<HashMap<String, serde_json::Value>, AppError> {
    let mut disclosed_data = HashMap::new();

    // Get all attribute keys in order
    let mut all_keys: Vec<String> = credential_data.keys().cloned().collect();
    all_keys.sort(); // Consistent ordering

    // Convert to messages for BBS+
    let messages: Vec<String> = all_keys
        .iter()
        .map(|k| credential_data.get(k).unwrap().to_string())
        .collect();

    // Get indices of disclosed attributes
    let disclosed_indices: Vec<usize> = disclosed_attributes
        .iter()
        .filter_map(|attr| all_keys.iter().position(|k| k == attr))
        .collect();

    // Add disclosed attributes to result
    for attr in disclosed_attributes {
        if let Some(value) = credential_data.get(attr) {
            disclosed_data.insert(attr.clone(), value.clone());
        } else {
            return Err(AppError::ValidationError(format!(
                "Attribute {} not found in credential",
                attr
            )));
        }
    }

    // Create BBS+ selective disclosure proof
    let bbs_proof = create_selective_disclosure_proof(
        &messages,
        bbs_signature,
        bbs_public_key,
        &disclosed_indices,
    )?;

    // Store BBS+ proof as metadata
    disclosed_data.insert(
        "_bbs_proof".to_string(),
        serde_json::json!({
            "disclosed_indices": disclosed_indices,
            "disclosed_messages": bbs_proof.disclosed_messages,
            "proof": hex::encode(&bbs_proof.proof),
            "nonce": hex::encode(&bbs_proof.nonce),
            "signature_type": "bbs+",
            "scheme": bbs_proof.scheme
        }),
    );

    Ok(disclosed_data)
}

pub fn verify_selective_disclosure(
    original_credential: &HashMap<String, serde_json::Value>,
    disclosed_data: &HashMap<String, serde_json::Value>,
    bbs_signature: &BBSSignature,
    bbs_public_key: &BBSPublicKey,
) -> Result<bool, AppError> {
    for (key, value) in disclosed_data {
        if key == "_bbs_proof" {
            continue;
        }

        if let Some(original_value) = original_credential.get(key) {
            if value != original_value {
                return Ok(false);
            }
        } else {
            return Ok(false);
        }
    }

    if let Some(proof_value) = disclosed_data.get("_bbs_proof") {
        if proof_value.get("signature_type") == Some(&serde_json::Value::String("bbs+".to_string()))
        {
            let mut all_keys: Vec<String> = original_credential.keys().cloned().collect();
            all_keys.sort();

            let messages: Vec<String> = all_keys
                .iter()
                .map(|k| original_credential.get(k).unwrap().to_string())
                .collect();

            let disclosed_indices: Vec<usize> = proof_value
                .get("disclosed_indices")
                .and_then(|v| v.as_array())
                .ok_or_else(|| {
                    AppError::ValidationError("Invalid disclosed_indices in proof".to_string())
                })?
                .iter()
                .map(|v| {
                    v.as_u64().ok_or_else(|| {
                        AppError::ValidationError("Invalid index in disclosed_indices".to_string())
                    })
                })
                .map(|result| result.map(|idx| idx as usize))
                .collect::<Result<Vec<usize>, AppError>>()?;

            let mut disclosed_messages = HashMap::new();
            for &idx in &disclosed_indices {
                if let Some(key) = all_keys.get(idx) {
                    if let Some(value) = original_credential.get(key) {
                        disclosed_messages.insert(idx, value.to_string());
                    }
                }
            }

            let proof_bytes = proof_value
                .get("proof")
                .and_then(|v| v.as_str())
                .ok_or_else(|| AppError::ValidationError("Missing BBS+ proof".to_string()))?;
            let nonce_bytes = proof_value
                .get("nonce")
                .and_then(|v| v.as_str())
                .ok_or_else(|| AppError::ValidationError("Missing BBS+ proof nonce".to_string()))?;

            let proof = BBSProof {
                disclosed_indices,
                disclosed_messages,
                proof: hex::decode(proof_bytes).map_err(|e| {
                    AppError::ValidationError(format!("Failed to decode BBS+ proof: {}", e))
                })?,
                nonce: hex::decode(nonce_bytes).map_err(|e| {
                    AppError::ValidationError(format!("Failed to decode BBS+ proof nonce: {}", e))
                })?,
                scheme: "bbs-plus-ursa-0.4.1".to_string(),
            };

            return verify_selective_disclosure_proof(
                &proof,
                bbs_signature,
                bbs_public_key,
                &messages,
            );
        }
    }

    Ok(false)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::utils::bbs_plus::{bbs_sign, generate_bbs_keypair};
    use serde_json::json;

    fn credential_data() -> HashMap<String, serde_json::Value> {
        HashMap::from([
            ("degree".to_string(), json!("Computer Science")),
            ("email".to_string(), json!("alice@example.com")),
            ("name".to_string(), json!("Alice")),
            ("student_id".to_string(), json!("S12345")),
        ])
    }

    fn sign_credential(
        credential: &HashMap<String, serde_json::Value>,
    ) -> (BBSPublicKey, BBSSignature) {
        let mut keys: Vec<String> = credential.keys().cloned().collect();
        keys.sort();
        let messages: Vec<String> = keys
            .iter()
            .map(|key| credential.get(key).unwrap().to_string())
            .collect();

        let (public_key, secret_key) = generate_bbs_keypair(messages.len()).unwrap();
        let signature = bbs_sign(&messages, &secret_key, &public_key).unwrap();

        (public_key, signature)
    }

    #[test]
    fn test_selective_disclosure_round_trip_with_bbs_proof() {
        let credential = credential_data();
        let (public_key, signature) = sign_credential(&credential);
        let disclosed_attributes = vec!["name".to_string(), "degree".to_string()];

        let disclosed = create_selective_disclosure(
            &credential,
            &disclosed_attributes,
            &signature,
            &public_key,
        )
        .unwrap();

        assert_eq!(disclosed.get("name"), Some(&json!("Alice")));
        assert_eq!(disclosed.get("degree"), Some(&json!("Computer Science")));
        assert!(!disclosed.contains_key("email"));
        assert!(disclosed.contains_key("_bbs_proof"));

        let is_valid =
            verify_selective_disclosure(&credential, &disclosed, &signature, &public_key).unwrap();
        assert!(is_valid);
    }

    #[test]
    fn test_selective_disclosure_rejects_tampered_attribute() {
        let credential = credential_data();
        let (public_key, signature) = sign_credential(&credential);
        let mut disclosed = create_selective_disclosure(
            &credential,
            &["name".to_string()],
            &signature,
            &public_key,
        )
        .unwrap();

        disclosed.insert("name".to_string(), json!("Mallory"));

        let is_valid =
            verify_selective_disclosure(&credential, &disclosed, &signature, &public_key).unwrap();
        assert!(!is_valid);
    }
}
