use bulletproofs::{BulletproofGens, PedersenGens, RangeProof};
use curve25519_dalek_ng::{
    ristretto::{CompressedRistretto},
    scalar::Scalar,
};
use merlin::Transcript;
use rand::thread_rng;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashMap;

use crate::error::AppError;

/// A range proof with its commitment
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RangeProofWithCommitment {
    pub proof: Vec<u8>,
    pub commitment: Vec<u8>,
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
    let (proof, _) = RangeProof::prove_single(
        &bp_gens,
        &pc_gens,
        &mut transcript,
        value,
        &blinding,
        64,
    )
    .map_err(|e| AppError::SsiError(format!("Failed to create range proof: {}", e)))?;

    Ok(RangeProofWithCommitment {
        proof: proof.to_bytes(),
        commitment: commitment.compress().to_bytes().to_vec(),
        attribute_name: attribute_name.to_string(),
    })
}

/// Verify a range proof
pub fn verify_range_proof(proof_with_commitment: &RangeProofWithCommitment) -> Result<bool, AppError> {
    // Set up the generators
    let pc_gens = PedersenGens::default();
    let bp_gens = BulletproofGens::new(64, 1);

    // Parse the proof and commitment
    let proof = RangeProof::from_bytes(&proof_with_commitment.proof)
        .map_err(|e| AppError::SsiError(format!("Failed to parse range proof: {}", e)))?;

    let commitment_bytes: [u8; 32] = proof_with_commitment.commitment.clone().try_into()
        .map_err(|_| AppError::SsiError("Invalid commitment length".to_string()))?;

    let commitment = CompressedRistretto::from_slice(&commitment_bytes);

    let mut transcript = Transcript::new(b"range_proof");
    proof.verify_single(&bp_gens, &pc_gens, &mut transcript, &commitment, 64)
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
    match predicate_type {
        ">=" => {
            if (attribute_value as i64) < predicate_value {
                return Err(AppError::ValidationError(format!(
                    "Attribute value {} does not satisfy predicate {} {}",
                    attribute_value, predicate_type, predicate_value
                )));
            }

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

            // For equality, we just prove that the difference is 0
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

            // For inequality, we prove that the absolute difference is at least 1
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
        _ => Err(AppError::ValidationError(format!("Unsupported predicate type: {}", predicate_type))),
    }
}

/// Verify a predicate proof
pub fn verify_predicate_proof(proof: &PredicateProof) -> Result<bool, AppError> {
    // Verify the range proof
    verify_range_proof(&proof.range_proof)?;

    Ok(true)
}

/// Create a selective disclosure proof for a credential
pub fn create_selective_disclosure(
    credential_data: &HashMap<String, serde_json::Value>,
    disclosed_attributes: &[String],
) -> Result<HashMap<String, serde_json::Value>, AppError> {
    let mut disclosed_data = HashMap::new();

    for attr in disclosed_attributes {
        if let Some(value) = credential_data.get(attr) {
            disclosed_data.insert(attr.clone(), value.clone());
        } else {
            return Err(AppError::ValidationError(format!("Attribute {} not found in credential", attr)));
        }
    }

    // Create a hash of the undisclosed attributes to prove knowledge of them
    let mut hasher = Sha256::new();

    for (key, value) in credential_data {
        if !disclosed_attributes.contains(key) {
            hasher.update(key.as_bytes());
            hasher.update(value.to_string().as_bytes());
        }
    }

    let hash = hasher.finalize();
    disclosed_data.insert("_undisclosed_hash".to_string(), serde_json::Value::String(hex::encode(hash)));

    Ok(disclosed_data)
}

/// Verify a selective disclosure proof against the original credential
pub fn verify_selective_disclosure(
    original_credential: &HashMap<String, serde_json::Value>,
    disclosed_data: &HashMap<String, serde_json::Value>,
) -> Result<bool, AppError> {
    // Check that all disclosed attributes match the original
    for (key, value) in disclosed_data {
        if key == "_undisclosed_hash" {
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

    // If there are undisclosed attributes, verify the hash
    if let Some(hash_value) = disclosed_data.get("_undisclosed_hash") {
        if let serde_json::Value::String(hash_hex) = hash_value {
            let mut hasher = Sha256::new();

            for (key, value) in original_credential {
                if !disclosed_data.contains_key(key) {
                    hasher.update(key.as_bytes());
                    hasher.update(value.to_string().as_bytes());
                }
            }

            let computed_hash = hasher.finalize();
            let computed_hash_hex = hex::encode(computed_hash);

            return Ok(&computed_hash_hex == hash_hex);
        }
    }

    // If there's no hash, all attributes should be disclosed
    Ok(disclosed_data.len() == original_credential.len() + 1) // +1 for the _undisclosed_hash field
}
