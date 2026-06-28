use crate::error::AppError;

#[derive(Debug, serde::Serialize, serde::Deserialize)]
pub struct DIDDocument {
    #[serde(rename = "@context")]
    pub context: Vec<String>,
    pub id: String,
    #[serde(rename = "verificationMethod")]
    pub verification_method: Vec<VerificationMethod>,
    pub authentication: Vec<String>,
    #[serde(rename = "assertionMethod")]
    pub assertion_method: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub service: Option<Vec<ServiceEndpoint>>,
}

#[derive(Debug, serde::Serialize, serde::Deserialize)]
pub struct VerificationMethod {
    pub id: String,
    pub controller: String,
    #[serde(rename = "type")]
    pub key_type: String,
    #[serde(rename = "publicKeyMultibase")]
    pub public_key_multibase: String,
}

#[derive(Debug, serde::Serialize, serde::Deserialize)]
pub struct ServiceEndpoint {
    pub id: String,
    #[serde(rename = "type")]
    pub service_type: String,
    #[serde(rename = "serviceEndpoint")]
    pub service_endpoint: String,
}

pub fn build_did_document(
    did: &str,
    public_key_base58: &str,
    role: &str,
) -> Result<DIDDocument, AppError> {
    let public_key_multibase = format!("z{}", public_key_base58);
    let verification_method_id = format!("{}#keys-1", did);

    let mut service_endpoints = Vec::new();

    match role {
        "issuer" => {
            service_endpoints.push(ServiceEndpoint {
                id: format!("{}#issuer-service", did),
                service_type: "IssuerService".to_string(),
                service_endpoint: "https://issuers.sphyre.tech".to_string(),
            });
        }
        "verifier" => {
            service_endpoints.push(ServiceEndpoint {
                id: format!("{}#verifier-service", did),
                service_type: "VerifierService".to_string(),
                service_endpoint: "https://verifier.sphyre.tech".to_string(),
            });
        }
        "holder" => {
            service_endpoints.push(ServiceEndpoint {
                id: format!("{}#wallet-service", did),
                service_type: "WalletService".to_string(),
                service_endpoint: "https://app.sphyre.tech".to_string(),
            });
        }
        _ => {
            service_endpoints.push(ServiceEndpoint {
                id: format!("{}#sphyre-service", did),
                service_type: "SphyreService".to_string(),
                service_endpoint: "https://api.sphyre.tech".to_string(),
            });
        }
    }

    let did_document = DIDDocument {
        context: vec![
            "https://www.w3.org/ns/did/v1".to_string(),
            "https://w3id.org/security/suites/dilithium-2024/v1".to_string(),
        ],
        id: did.to_string(),
        verification_method: vec![VerificationMethod {
            id: verification_method_id.clone(),
            controller: did.to_string(),
            key_type: "Dilithium2VerificationKey2024".to_string(),
            public_key_multibase,
        }],
        authentication: vec![verification_method_id.clone()],
        assertion_method: vec![verification_method_id],
        service: if service_endpoints.is_empty() {
            None
        } else {
            Some(service_endpoints)
        },
    };

    Ok(did_document)
}
