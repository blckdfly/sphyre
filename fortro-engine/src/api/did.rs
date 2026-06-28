use axum::{
    extract::{Path, State},
    http::StatusCode,
    routing::get,
    Json, Router,
};
use serde::{Deserialize, Serialize};
use serde_json::json;
use crate::error::AppError;
use crate::services::AppState;

#[derive(Debug, Serialize, Deserialize)]
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

#[derive(Debug, Serialize, Deserialize)]
pub struct VerificationMethod {
    pub id: String,
    pub controller: String,
    #[serde(rename = "type")]
    pub key_type: String,
    #[serde(rename = "publicKeyMultibase")]
    pub public_key_multibase: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ServiceEndpoint {
    pub id: String,
    #[serde(rename = "type")]
    pub service_type: String,
    #[serde(rename = "serviceEndpoint")]
    pub service_endpoint: String,
}

pub fn routes() -> Router<AppState> {
    Router::new().route("/:did", get(resolve_did))
}

async fn resolve_did(
    State(state): State<AppState>,
    Path(did_string): Path<String>,
) -> Result<(StatusCode, Json<serde_json::Value>), AppError> {
    let did_parts: Vec<&str> = did_string.split(':').collect();

    if did_parts.len() < 3 || did_parts[0] != "did" || did_parts[1] != "alyra" {
        return Err(AppError::ValidationError(
            "Invalid DID format. Expected: did:alyra:<pubkey>".to_string(),
        ));
    }

    let public_key_base64 = did_parts[2];

    // Check if this DID exists in system
    let db = &state.db;
    let role = determine_did_role(db, &did_string).await?;
    let did_document = build_did_document(&did_string, public_key_base64, &role)?;

    Ok((
        StatusCode::OK,
        Json(json!({
            "didDocument": did_document,
            "didResolutionMetadata": {
                "contentType": "application/did+json"
            },
            "didDocumentMetadata": {
                "created": chrono::Utc::now().to_rfc3339(),
                "role": role
            }
        })),
    ))
}

async fn determine_did_role(db: &crate::db::Database, did: &str) -> Result<String, AppError> {
    if let Ok(Some(_)) = db
        .find_one::<serde_json::Value>("issuers", bson::doc! { "id": did })
        .await
    {
        return Ok("issuer".to_string());
    }

    // Check verifiers
    if let Ok(Some(_)) = db
        .find_one::<serde_json::Value>("verifiers", bson::doc! { "id": did })
        .await
    {
        return Ok("verifier".to_string());
    }

    if let Ok(Some(_)) = db.find_user_by_did(did).await {
        return Ok("holder".to_string());
    }

    Ok("unknown".to_string())
}

fn build_did_document(
    did: &str,
    public_key_base64: &str,
    role: &str,
) -> Result<DIDDocument, AppError> {
    let public_key_multibase = format!("z{}", public_key_base64);

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