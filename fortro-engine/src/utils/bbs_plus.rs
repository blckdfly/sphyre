use bbs::prelude::{
    HashElem, HiddenMessage, Issuer, ProofMessage, ProofNonce, Prover, PublicKey, SecretKey,
    Signature, SignatureMessage, SignatureProof, ToVariableLengthBytes, Verifier,
};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::convert::TryFrom;

use crate::error::AppError;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BBSPublicKey {
    pub bytes: Vec<u8>,
    pub message_count: usize,
    pub scheme: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BBSSecretKey {
    pub bytes: Vec<u8>,
    pub scheme: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BBSSignature {
    pub bytes: Vec<u8>,
    pub scheme: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BBSProof {
    pub disclosed_indices: Vec<usize>,
    pub disclosed_messages: HashMap<usize, String>,
    pub proof: Vec<u8>,
    pub nonce: Vec<u8>,
    pub scheme: String,
}

pub fn generate_bbs_keypair(
    message_count: usize,
) -> Result<(BBSPublicKey, BBSSecretKey), AppError> {
    let (public_key, secret_key) = Issuer::new_keys(message_count)
        .map_err(|e| AppError::SsiError(format!("Failed to generate BBS+ keypair: {}", e)))?;

    Ok((
        BBSPublicKey {
            bytes: public_key.to_bytes_compressed_form(),
            message_count,
            scheme: "bbs-plus-ursa-0.4.1".to_string(),
        },
        BBSSecretKey {
            bytes: secret_key.to_bytes_compressed_form().to_vec(),
            scheme: "bbs-plus-ursa-0.4.1".to_string(),
        },
    ))
}

pub fn bbs_sign(
    messages: &[String],
    secret_key: &BBSSecretKey,
    public_key: &BBSPublicKey,
) -> Result<BBSSignature, AppError> {
    if messages.len() != public_key.message_count {
        return Err(AppError::ValidationError(format!(
            "Message count ({}) doesn't match public key generators ({})",
            messages.len(),
            public_key.message_count
        )));
    }

    let sk = decode_secret_key(secret_key)?;
    let pk = decode_public_key(public_key)?;
    let signature_messages = to_signature_messages(messages);
    let signature = Signature::new(signature_messages.as_slice(), &sk, &pk)
        .map_err(|e| AppError::SsiError(format!("Failed to create BBS+ signature: {}", e)))?;

    Ok(BBSSignature {
        bytes: signature.to_bytes_compressed_form().to_vec(),
        scheme: "bbs-plus-ursa-0.4.1".to_string(),
    })
}

pub fn bbs_verify(
    messages: &[String],
    signature: &BBSSignature,
    public_key: &BBSPublicKey,
) -> Result<bool, AppError> {
    if messages.len() != public_key.message_count {
        return Ok(false);
    }

    let pk = decode_public_key(public_key)?;
    let sig = decode_signature(signature)?;
    let signature_messages = to_signature_messages(messages);

    sig.verify(signature_messages.as_slice(), &pk)
        .map_err(|e| AppError::SsiError(format!("Failed to verify BBS+ signature: {}", e)))
}

pub fn create_selective_disclosure_proof(
    messages: &[String],
    signature: &BBSSignature,
    public_key: &BBSPublicKey,
    disclosed_indices: &[usize],
) -> Result<BBSProof, AppError> {
    if messages.len() != public_key.message_count {
        return Err(AppError::ValidationError(format!(
            "Message count ({}) doesn't match public key generators ({})",
            messages.len(),
            public_key.message_count
        )));
    }

    let disclosed_set: HashSet<_> = disclosed_indices.iter().copied().collect();
    if disclosed_set.len() != disclosed_indices.len() {
        return Err(AppError::ValidationError(
            "Duplicate disclosed BBS+ message index".to_string(),
        ));
    }

    for &idx in disclosed_indices {
        if idx >= messages.len() {
            return Err(AppError::ValidationError(format!(
                "Disclosed BBS+ message index {} is out of bounds",
                idx
            )));
        }
    }

    let pk = decode_public_key(public_key)?;
    let sig = decode_signature(signature)?;
    let nonce = Verifier::generate_proof_nonce();
    let proof_request = Verifier::new_proof_request(disclosed_indices, &pk)
        .map_err(|e| AppError::SsiError(format!("Failed to create BBS+ proof request: {}", e)))?;

    let proof_messages: Vec<ProofMessage> = messages
        .iter()
        .enumerate()
        .map(|(idx, message)| {
            let hashed = SignatureMessage::hash(message.as_bytes());
            if disclosed_set.contains(&idx) {
                ProofMessage::Revealed(hashed)
            } else {
                ProofMessage::Hidden(HiddenMessage::ProofSpecificBlinding(hashed))
            }
        })
        .collect();

    let pok = Prover::commit_signature_pok(&proof_request, proof_messages.as_slice(), &sig)
        .map_err(|e| AppError::SsiError(format!("Failed to commit BBS+ proof: {}", e)))?;
    let challenge = Prover::create_challenge_hash(&[pok.clone()], None, &nonce)
        .map_err(|e| AppError::SsiError(format!("Failed to challenge BBS+ proof: {}", e)))?;
    let proof = Prover::generate_signature_pok(pok, &challenge)
        .map_err(|e| AppError::SsiError(format!("Failed to generate BBS+ proof: {}", e)))?;

    let disclosed_messages = disclosed_indices
        .iter()
        .map(|idx| (*idx, messages[*idx].clone()))
        .collect();

    Ok(BBSProof {
        disclosed_indices: disclosed_indices.to_vec(),
        disclosed_messages,
        proof: proof.to_bytes_compressed_form(),
        nonce: nonce.to_bytes_compressed_form().to_vec(),
        scheme: "bbs-plus-ursa-0.4.1".to_string(),
    })
}

pub fn verify_selective_disclosure_proof(
    proof: &BBSProof,
    _signature: &BBSSignature,
    public_key: &BBSPublicKey,
    messages: &[String],
) -> Result<bool, AppError> {
    if messages.len() != public_key.message_count {
        return Ok(false);
    }

    let disclosed_set: HashSet<_> = proof.disclosed_indices.iter().copied().collect();
    if disclosed_set.len() != proof.disclosed_indices.len() {
        return Ok(false);
    }

    if proof.disclosed_messages.len() != proof.disclosed_indices.len() {
        return Ok(false);
    }

    for &idx in &proof.disclosed_indices {
        if idx >= messages.len() {
            return Ok(false);
        }
        if proof.disclosed_messages.get(&idx) != Some(&messages[idx]) {
            return Ok(false);
        }
    }

    let pk = decode_public_key(public_key)?;
    let signature_proof = SignatureProof::from_bytes_compressed_form(&proof.proof)
        .map_err(|e| AppError::SsiError(format!("Invalid BBS+ proof bytes: {}", e)))?;
    let nonce = ProofNonce::try_from(proof.nonce.as_slice())
        .map_err(|e| AppError::SsiError(format!("Invalid BBS+ proof nonce: {}", e)))?;
    let proof_request = Verifier::new_proof_request(&proof.disclosed_indices, &pk)
        .map_err(|e| AppError::SsiError(format!("Failed to create BBS+ proof request: {}", e)))?;

    Verifier::verify_signature_pok(&proof_request, &signature_proof, &nonce)
        .map_err(|e| AppError::SsiError(format!("Failed to verify BBS+ proof: {}", e)))?;

    for (&idx, message) in &proof.disclosed_messages {
        let expected = SignatureMessage::hash(message.as_bytes());
        if signature_proof.revealed_messages.get(&idx) != Some(&expected) {
            return Ok(false);
        }
    }

    Ok(true)
}

fn to_signature_messages(messages: &[String]) -> Vec<SignatureMessage> {
    messages
        .iter()
        .map(|message| SignatureMessage::hash(message.as_bytes()))
        .collect()
}

fn decode_public_key(public_key: &BBSPublicKey) -> Result<PublicKey, AppError> {
    PublicKey::from_bytes_compressed_form(&public_key.bytes)
        .map_err(|e| AppError::SsiError(format!("Invalid BBS+ public key: {}", e)))
}

fn decode_secret_key(secret_key: &BBSSecretKey) -> Result<SecretKey, AppError> {
    SecretKey::try_from(secret_key.bytes.as_slice())
        .map_err(|e| AppError::SsiError(format!("Invalid BBS+ secret key: {}", e)))
}

fn decode_signature(signature: &BBSSignature) -> Result<Signature, AppError> {
    Signature::try_from(signature.bytes.as_slice())
        .map_err(|e| AppError::SsiError(format!("Invalid BBS+ signature: {}", e)))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_bbs_keypair_generation() {
        let result = generate_bbs_keypair(5);
        assert!(result.is_ok());

        let (pk, sk) = result.unwrap();
        assert_eq!(pk.message_count, 5);
        assert!(!pk.bytes.is_empty());
        assert!(!sk.bytes.is_empty());
    }

    #[test]
    fn test_bbs_sign_and_verify() {
        let messages = vec![
            "Alice".to_string(),
            "25".to_string(),
            "alice@example.com".to_string(),
        ];

        let (pk, sk) = generate_bbs_keypair(messages.len()).unwrap();
        let signature = bbs_sign(&messages, &sk, &pk).unwrap();

        let is_valid = bbs_verify(&messages, &signature, &pk).unwrap();
        assert!(is_valid);
    }

    #[test]
    fn test_bbs_verify_rejects_tampered_message() {
        let messages = vec!["Alice".to_string(), "25".to_string()];
        let (pk, sk) = generate_bbs_keypair(messages.len()).unwrap();
        let signature = bbs_sign(&messages, &sk, &pk).unwrap();

        let tampered = vec!["Alice".to_string(), "26".to_string()];
        let is_valid = bbs_verify(&tampered, &signature, &pk).unwrap();
        assert!(!is_valid);
    }

    #[test]
    fn test_selective_disclosure() {
        let messages = vec![
            "Alice".to_string(),
            "25".to_string(),
            "alice@example.com".to_string(),
            "123 Main St".to_string(),
        ];

        let (pk, sk) = generate_bbs_keypair(messages.len()).unwrap();
        let signature = bbs_sign(&messages, &sk, &pk).unwrap();
        let disclosed_indices = vec![0, 1];
        let proof =
            create_selective_disclosure_proof(&messages, &signature, &pk, &disclosed_indices)
                .unwrap();

        assert_eq!(proof.disclosed_messages.len(), 2);
        assert_eq!(proof.disclosed_messages.get(&0).unwrap(), "Alice");
        assert_eq!(proof.disclosed_messages.get(&1).unwrap(), "25");
        assert!(!proof.disclosed_messages.contains_key(&2));
        assert!(!proof.disclosed_messages.contains_key(&3));
        assert!(verify_selective_disclosure_proof(&proof, &signature, &pk, &messages).unwrap());
    }

    #[test]
    fn test_selective_disclosure_rejects_tampered_disclosed_message() {
        let messages = vec!["Alice".to_string(), "25".to_string(), "admin".to_string()];
        let (pk, sk) = generate_bbs_keypair(messages.len()).unwrap();
        let signature = bbs_sign(&messages, &sk, &pk).unwrap();
        let mut proof =
            create_selective_disclosure_proof(&messages, &signature, &pk, &[0]).unwrap();

        proof.disclosed_messages.insert(0, "Mallory".to_string());

        assert!(!verify_selective_disclosure_proof(&proof, &signature, &pk, &messages).unwrap());
    }
}
