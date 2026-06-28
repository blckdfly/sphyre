use std::collections::HashMap;

use base64::{engine::general_purpose::STANDARD, Engine as _};
use chrono::{DateTime, Datelike, NaiveDate, NaiveDateTime, Utc};
use pqc_kyber::{KYBER_PUBLICKEYBYTES, KYBER_SECRETKEYBYTES};
use serde_json::Value;

use crate::error::AppError;
use crate::models::Credential;
use crate::utils::crypto;

fn decode_public_key(hex_str: &str) -> Result<[u8; KYBER_PUBLICKEYBYTES], AppError> {
    let bytes = hex::decode(hex_str).map_err(|e| {
        AppError::InternalError(format!("Failed to decode Kyber public key from hex: {}", e))
    })?;

    bytes
        .try_into()
        .map_err(|_| AppError::InternalError("Invalid Kyber public key length".to_string()))
}

fn decode_secret_key(hex_str: &str) -> Result<[u8; KYBER_SECRETKEYBYTES], AppError> {
    let bytes = hex::decode(hex_str).map_err(|e| {
        AppError::InternalError(format!("Failed to decode Kyber secret key from hex: {}", e))
    })?;

    bytes
        .try_into()
        .map_err(|_| AppError::InternalError("Invalid Kyber secret key length".to_string()))
}

pub fn encrypt_preview_map(
    preview: &HashMap<String, Value>,
    kyber_public_key_hex: &str,
) -> Result<String, AppError> {
    let public_key = decode_public_key(kyber_public_key_hex)?;
    let preview_bytes = serde_json::to_vec(preview).map_err(|e| {
        AppError::InternalError(format!("Failed to serialize credential preview: {}", e))
    })?;

    let encrypted = crypto::encrypt_with_kyber(&preview_bytes, &public_key).map_err(|e| {
        AppError::InternalError(format!(
            "Failed to encrypt credential preview with Kyber: {}",
            e
        ))
    })?;

    Ok(STANDARD.encode(encrypted))
}

pub fn decrypt_preview_map(
    encrypted_b64: &str,
    kyber_secret_key_hex: &str,
) -> Result<HashMap<String, Value>, AppError> {
    let secret_key = decode_secret_key(kyber_secret_key_hex)?;
    let encrypted = STANDARD.decode(encrypted_b64).map_err(|e| {
        AppError::InternalError(format!(
            "Failed to decode credential preview ciphertext: {}",
            e
        ))
    })?;

    let decrypted = crypto::decrypt_with_kyber(&encrypted, &secret_key).map_err(|e| {
        AppError::InternalError(format!(
            "Failed to decrypt credential preview with Kyber: {}",
            e
        ))
    })?;

    serde_json::from_slice(&decrypted).map_err(|e| {
        AppError::InternalError(format!(
            "Failed to deserialize credential preview JSON: {}",
            e
        ))
    })
}

pub fn get_plain_preview(
    credential: &Credential,
) -> Result<Option<HashMap<String, Value>>, AppError> {
    if let Some(preview) = &credential.credential_preview {
        return Ok(Some(preview.clone()));
    }

    match (
        &credential.credential_preview_encrypted,
        &credential.kyber_secret_key,
    ) {
        (Some(ciphertext), Some(secret_hex)) => {
            let preview = decrypt_preview_map(ciphertext, secret_hex)?;
            Ok(Some(preview))
        }
        _ => Ok(None),
    }
}

pub fn find_value_case_insensitive<'a>(
    map: &'a HashMap<String, Value>,
    key: &str,
) -> Option<&'a Value> {
    let lookup = key.trim();
    if let Some(value) = map.get(lookup) {
        return Some(value);
    }

    map.iter()
        .find(|(existing_key, _)| existing_key.trim().eq_ignore_ascii_case(lookup))
        .map(|(_, value)| value)
}

fn normalize_string_value(value: &Value) -> Option<String> {
    if let Some(text) = value.as_str() {
        return Some(text.trim().to_string());
    }

    if value.is_null() {
        return None;
    }

    Some(value.to_string())
}

pub fn parse_numeric_value(value: &Value) -> Option<i64> {
    if let Some(number) = value.as_i64() {
        return Some(number);
    }

    if let Some(float) = value.as_f64() {
        return Some(float.trunc() as i64);
    }

    value
        .as_str()
        .and_then(|s| s.trim().parse::<i64>().ok())
}

fn parse_date_string(date_str: &str) -> Option<NaiveDate> {
    let trimmed = date_str.trim();

    if let Ok(date_time) = DateTime::parse_from_rfc3339(trimmed) {
        return Some(date_time.date_naive());
    }

    // Common date formats (YYYY-MM-DD, DD-MM-YYYY, YYYY/MM/DD, DD/MM/YYYY)
    for format in [
        "%Y-%m-%d",
        "%d-%m-%Y",
        "%Y/%m/%d",
        "%d/%m/%Y",
        "%Y.%m.%d",
        "%d.%m.%Y",
    ] {
        if let Ok(date) = NaiveDate::parse_from_str(trimmed, format) {
            return Some(date);
        }
    }

    None
}

fn parse_date_value(value: &Value) -> Option<NaiveDate> {
    if let Some(text) = value.as_str() {
        return parse_date_string(text);
    }

    if let Some(timestamp) = value.as_i64() {
        if let Some(date_time) = NaiveDateTime::from_timestamp_opt(timestamp, 0) {
            return Some(date_time.date());
        }

        if let Some(date_time) = NaiveDateTime::from_timestamp_millis(timestamp) {
            return Some(date_time.date());
        }
    }

    None
}

fn calculate_age(birth_date: NaiveDate) -> Option<i64> {
    let today = Utc::now().date_naive();
    if birth_date > today {
        return None;
    }

    let mut age = today.year() - birth_date.year();
    if (today.month(), today.day()) < (birth_date.month(), birth_date.day()) {
        age -= 1;
    }

    Some(age as i64)
}

fn is_birthdate_label(label: &str) -> bool {
    let lower = label.trim().to_lowercase();
    matches!(
        lower.as_str(),
        "birth_date"
            | "birthdate"
            | "date_of_birth"
            | "dateofbirth"
            | "dob"
            | "tanggal_lahir"
            | "birth-date"
            | "birth_date_iso"
    ) || lower.contains("birth") || lower.contains("dateofbirth")
}

fn derive_age_from_map(map: &HashMap<String, Value>) -> Option<i64> {
    if let Some(explicit_age) = find_value_case_insensitive(map, "age") {
        if let Some(age) = parse_numeric_value(explicit_age) {
            return Some(age);
        }
    }

    for (key, value) in map {
        if is_birthdate_label(key) {
            if let Some(date) = parse_date_value(value) {
                if let Some(age) = calculate_age(date) {
                    return Some(age);
                }
            }
        }
    }

    None
}

fn format_date_as_yyyymmdd(date: NaiveDate) -> i64 {
    (date.year() as i64) * 10000 + (date.month() as i64) * 100 + (date.day() as i64)
}

fn derive_date_metric(attribute_name: &str, value: &Value) -> Option<i64> {
    let date = parse_date_value(value)?;
    let lower = attribute_name.trim().to_lowercase();

    if lower.contains("age") || lower.contains("umur") || is_birthdate_label(&lower) {
        if let Some(age) = calculate_age(date) {
            return Some(age);
        }
    }

    Some(format_date_as_yyyymmdd(date))
}

pub fn derive_numeric_attribute(
    map: &HashMap<String, Value>,
    attribute_name: &str,
) -> Option<i64> {
    tracing::info!(
        "Deriving numeric attribute for '{}' from map with {} keys",
        attribute_name,
        map.len()
    );
    
    // Log the raw value if found
    if let Some(value) = find_value_case_insensitive(map, attribute_name) {
        tracing::info!(
            "Found raw value for '{}': {:?} (type: {})",
            attribute_name,
            value,
            std::any::type_name_of_val(&value)
        );
        
        if let Some(number) = parse_numeric_value(value) {
            tracing::info!("Parsed numeric value for '{}': {}", attribute_name, number);
            return Some(number);
        }

        if let Some(metric) = derive_date_metric(attribute_name, value) {
            tracing::info!("Derived date metric for '{}': {}", attribute_name, metric);
            return Some(metric);
        }
    } else {
        tracing::info!("Attribute '{}' not found in credential map", attribute_name);
    }

    // If attribute name implies age, attempt to derive from birth date fields
    let attr_lower = attribute_name.trim().to_lowercase();
    if attr_lower.contains("age") || attr_lower.contains("umur") {
        if let Some(age) = derive_age_from_map(map) {
            return Some(age);
        }
    }

    // If a birth date exists but the requested attribute is different, attempt fallback
    if let Some(age) = derive_age_from_map(map) {
        if attr_lower.contains("birth") || attr_lower.contains("dob") {
            return Some(age);
        }
    }

    // As a last resort, attempt to normalize stringified numbers (e.g. "00123")
    if let Some(value) = find_value_case_insensitive(map, attribute_name) {
        if let Some(text) = normalize_string_value(value) {
            if let Ok(parsed) = text.parse::<i64>() {
                return Some(parsed);
            }
        }
    }

    None
}
