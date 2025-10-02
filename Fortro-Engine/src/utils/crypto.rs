use rand::{rngs::OsRng, RngCore};
use sha2::{Sha256, Digest};
use std::io;
use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Nonce,
};
use crystals_dilithium::dilithium2;
use pbkdf2;
use pqc_kyber::{keypair, encapsulate, decapsulate, KYBER_PUBLICKEYBYTES, KYBER_SECRETKEYBYTES, KYBER_CIPHERTEXTBYTES, KYBER_SYMBYTES, KyberError};
use crystals_dilithium::dilithium2::{
    PUBLICKEYBYTES, SECRETKEYBYTES, SIGNBYTES,
    PublicKey, SecretKey, Signature
};
use crystals_dilithium::sign::lvl2 as dilithium_lvl2;

/// Generate a random encryption key
pub fn generate_key() -> [u8; 32] {
    let mut key = [0u8; 32];
    OsRng.fill_bytes(&mut key);
    key
}

/// Hash data using SHA-256
pub fn hash_data(data: &[u8]) -> Vec<u8> {
    let mut hasher = Sha256::new();
    hasher.update(data);
    hasher.finalize().to_vec()
}

/// Hash data and return as hex string
pub fn hash_to_hex(data: &[u8]) -> String {
    let hash = hash_data(data);
    hex::encode(hash)
}

/// Encrypt data using AES-GCM
pub fn encrypt(data: &[u8], key: &[u8]) -> io::Result<Vec<u8>> {
    if key.len() != 32 {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            "Encryption key must be 32 bytes",
        ));
    }

    // Create cipher
    let cipher = Aes256Gcm::new_from_slice(key)
        .map_err(|e| io::Error::new(io::ErrorKind::InvalidInput, e))?;

    let mut nonce_bytes = [0u8; 12];
    OsRng.fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);

    // Encrypt the data
    let ciphertext = cipher
        .encrypt(nonce, data)
        .map_err(|e| io::Error::new(io::ErrorKind::Other, e.to_string()))?;

    // Combine nonce and ciphertext
    let mut result = Vec::with_capacity(nonce_bytes.len() + ciphertext.len());
    result.extend_from_slice(&nonce_bytes);
    result.extend_from_slice(&ciphertext);

    Ok(result)
}

/// Decrypt data using AES-GCM
pub fn decrypt(encrypted_data: &[u8], key: &[u8]) -> io::Result<Vec<u8>> {

    if key.len() != 32 {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            "Decryption key must be 32 bytes",
        ));
    }

    // Ensure encrypted data is long enough to contain nonce and ciphertext
    if encrypted_data.len() <= 12 {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            "Encrypted data is too short",
        ));
    }

    // Split nonce and ciphertext
    let nonce_bytes = &encrypted_data[..12];
    let ciphertext = &encrypted_data[12..];

    // Create cipher
    let cipher = Aes256Gcm::new_from_slice(key)
        .map_err(|e| io::Error::new(io::ErrorKind::InvalidInput, e))?;

    let nonce = Nonce::from_slice(nonce_bytes);

    // Decrypt the data
    let plaintext = cipher
        .decrypt(nonce, ciphertext)
        .map_err(|e| io::Error::new(io::ErrorKind::Other, e.to_string()))?;

    Ok(plaintext)
}

/// Derive a key from a password using PBKDF2
pub fn derive_key_from_password(password: &str, salt: &[u8]) -> [u8; 32] {
    use pbkdf2::{pbkdf2_hmac};
    use sha2::Sha256;

    let mut key = [0u8; 32];
    pbkdf2_hmac::<Sha256>(password.as_bytes(), salt, 10000, &mut key);
    key
}

/// Generate a random salt for key derivation
pub fn generate_salt() -> [u8; 16] {
    let mut salt = [0u8; 16];
    OsRng.fill_bytes(&mut salt);
    salt
}

/// Encrypt data with a password
pub fn encrypt_with_password(data: &[u8], password: &str) -> io::Result<Vec<u8>> {
    // Generate a random salt
    let salt = generate_salt();

    // Derive key from password
    let key = derive_key_from_password(password, &salt);

    // Encrypt the data
    let encrypted = encrypt(data, &key)?;

    // Combine salt and encrypted data
    let mut result = Vec::with_capacity(salt.len() + encrypted.len());
    result.extend_from_slice(&salt);
    result.extend_from_slice(&encrypted);

    Ok(result)
}

/// Decrypt data with a password
pub fn decrypt_with_password(encrypted_data: &[u8], password: &str) -> io::Result<Vec<u8>> {
    // Ensure encrypted data is long enough to contain salt, nonce, and ciphertext
    if encrypted_data.len() <= 28 { // 16 (salt) + 12 (nonce)
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            "Encrypted data is too short",
        ));
    }

    // Split salt and encrypted data
    let salt = &encrypted_data[..16];
    let encrypted = &encrypted_data[16..];

    // Derive key from password
    let key = derive_key_from_password(password, salt);

    // Decrypt the data
    decrypt(encrypted, &key)
}

/// Generate a secure random string (useful for API keys, etc.)
pub fn generate_secure_string(length: usize) -> String {
    use base64::{Engine as _, engine::general_purpose};

    let mut bytes = vec![0u8; length];
    OsRng.fill_bytes(&mut bytes);
    general_purpose::URL_SAFE_NO_PAD.encode(&bytes)
}

/// Generate a Kyber key pair for post-quantum key encapsulation
/// Returns a tuple of (public_key, secret_key) or an error
pub fn generate_kyber_keypair() -> io::Result<([u8; KYBER_PUBLICKEYBYTES], [u8; KYBER_SECRETKEYBYTES])> {
    let mut rng = OsRng;
    let keypair_result = keypair(&mut rng)
        .map_err(|e| io::Error::new(io::ErrorKind::Other, format!("Kyber keypair generation failed: {}", e)))?;
    
    Ok((keypair_result.public, keypair_result.secret))
}

/// Encapsulate a shared secret using a Kyber public key
/// Returns a tuple of (ciphertext, shared_secret) or an error
pub fn kyber_encapsulate(public_key: &[u8; KYBER_PUBLICKEYBYTES]) -> io::Result<([u8; KYBER_CIPHERTEXTBYTES], [u8; KYBER_SYMBYTES])> {
    let mut rng = OsRng;
    let result = encapsulate(public_key, &mut rng)
        .map_err(|e| io::Error::new(io::ErrorKind::Other, format!("Kyber encapsulation failed: {}", e)))?;

    Ok(result)
}

/// Decapsulate a shared secret using a Kyber secret key and ciphertext
/// Returns the shared secret or an error
pub fn kyber_decapsulate(secret_key: &[u8; KYBER_SECRETKEYBYTES], ciphertext: &[u8; KYBER_CIPHERTEXTBYTES]) -> io::Result<[u8; KYBER_SYMBYTES]> {
    let result = decapsulate(ciphertext, secret_key)
        .map_err(|e| io::Error::new(io::ErrorKind::Other, format!("Kyber decapsulation failed: {}", e)))?;
    
    Ok(result)
}

/// Encrypt data using Kyber for key encapsulation and AES-GCM for encryption
/// This provides post-quantum security for the key exchange
pub fn encrypt_with_kyber(data: &[u8], public_key: &[u8; KYBER_PUBLICKEYBYTES]) -> io::Result<Vec<u8>> {
    // Encapsulate a shared secret using the recipient's public key
    let (ciphertext, shared_secret) = kyber_encapsulate(public_key)?;
    
    // Use the shared secret as the encryption key for AES-GCM
    let encrypted_data = encrypt(data, &shared_secret)?;
    
    // Combine the Kyber ciphertext with the encrypted data
    let mut result = Vec::with_capacity(KYBER_CIPHERTEXTBYTES + encrypted_data.len());
    result.extend_from_slice(&ciphertext);
    result.extend_from_slice(&encrypted_data);
    
    Ok(result)
}

/// Decrypt data that was encrypted using Kyber and AES-GCM
pub fn decrypt_with_kyber(encrypted_data: &[u8], secret_key: &[u8; KYBER_SECRETKEYBYTES]) -> io::Result<Vec<u8>> {
    // Ensure the encrypted data is long enough to contain the Kyber ciphertext
    if encrypted_data.len() <= KYBER_CIPHERTEXTBYTES {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            "Encrypted data is too short",
        ));
    }
    
    // Split the Kyber ciphertext and the encrypted data
    let kyber_ciphertext = encrypted_data[..KYBER_CIPHERTEXTBYTES].try_into().map_err(|_| {
        io::Error::new(io::ErrorKind::InvalidInput, "Invalid Kyber ciphertext")
    })?;
    
    let aes_encrypted_data = &encrypted_data[KYBER_CIPHERTEXTBYTES..];
    
    // Recover the shared secret using the recipient's secret key
    let shared_secret = kyber_decapsulate(secret_key, &kyber_ciphertext)?;
    
    // Decrypt the data using the shared secret
    decrypt(aes_encrypted_data, &shared_secret)
}

/// Generate a Dilithium key pair for post-quantum digital signatures
/// Returns a tuple of (public_key, secret_key) or an error
pub fn generate_dilithium_keypair() -> io::Result<(Vec<u8>, Vec<u8>)> {
    let mut seed = [0u8; 32];
    OsRng.fill_bytes(&mut seed);
    
    // Allocate buffers for public and secret keys
    let mut public_key_bytes = vec![0u8; PUBLICKEYBYTES];
    let mut secret_key_bytes = vec![0u8; SECRETKEYBYTES];
    
    // Generate the keypair using Dilithium2
    dilithium_lvl2::keypair(&mut public_key_bytes, &mut secret_key_bytes, Some(&seed));
    
    Ok((public_key_bytes, secret_key_bytes))
}

/// Sign a message using Dilithium
/// Returns the signature or an error
pub fn dilithium_sign(message: &[u8], secret_key_bytes: &[u8]) -> io::Result<Vec<u8>> {
    // Convert secret key bytes back to SecretKey
    let secret_key = SecretKey::from_bytes(secret_key_bytes);
    
    // Sign the message
    let signature = secret_key.sign(message);
    
    // Convert signature to bytes - signature is already a byte array
    Ok(signature.to_vec())
}

/// Verify a signature using Dilithium
/// Returns true if the signature is valid, false otherwise
pub fn dilithium_verify(message: &[u8], signature_bytes: &[u8], public_key_bytes: &[u8]) -> io::Result<bool> {
    // Convert public key bytes back to PublicKey
    let public_key = PublicKey::from_bytes(public_key_bytes);
    
    // Create a signature from the bytes
    let signature = match Signature::try_from(signature_bytes) {
        Ok(sig) => sig,
        Err(_) => return Err(io::Error::new(io::ErrorKind::InvalidInput, "Invalid Dilithium signature"))
    };
    
    // Verify the signature
    Ok(public_key.verify(message, &signature))
}
