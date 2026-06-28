import * as bip39 from 'bip39';
import nacl from 'tweetnacl';
import { encodeBase64, decodeBase64 } from 'tweetnacl-util';

export function generateSeedPhrase() {
  return bip39.generateMnemonic(128);
}
export function validateSeedPhrase(seedPhrase) {
  return bip39.validateMnemonic(seedPhrase);
}

export async function deriveAuthToken(seedPhrase) {
  const encoder = new TextEncoder();
  const salt = 'sphyre-issuer-v1';
  const iterations = 100000;
  
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(seedPhrase),
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  );
  
  // Derive bits using PBKDF2
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: encoder.encode(salt),
      iterations: iterations,
      hash: 'SHA-256',
    },
    keyMaterial,
    256
  );
  
  // Convert to hex string
  const hashArray = Array.from(new Uint8Array(derivedBits));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  
  return hashHex;
}

export function encryptData(data, pin) {
  // Generate salt
  const salt = nacl.randomBytes(nacl.secretbox.nonceLength);
  
  // Derive key from PIN + salt
  const encoder = new TextEncoder();
  const pinData = encoder.encode(pin + salt.toString());
  const hash = nacl.hash(pinData);
  const key = hash.slice(0, nacl.secretbox.keyLength);
  
  // Generate nonce
  const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
  
  // Encrypt message
  const message = encoder.encode(data);
  const encrypted = nacl.secretbox(message, nonce, key);
  
  // Combine salt + nonce + encrypted
  const fullMessage = new Uint8Array(salt.length + nonce.length + encrypted.length);
  fullMessage.set(salt);
  fullMessage.set(nonce, salt.length);
  fullMessage.set(encrypted, salt.length + nonce.length);
  
  return encodeBase64(fullMessage);
}

export function decryptData(encryptedData, pin) {
  const fullMessage = decodeBase64(encryptedData);
  const salt = fullMessage.slice(0, nacl.secretbox.nonceLength);
  const nonce = fullMessage.slice(nacl.secretbox.nonceLength, nacl.secretbox.nonceLength * 2);
  const encrypted = fullMessage.slice(nacl.secretbox.nonceLength * 2);
  
  // Derive key from PIN + salt
  const encoder = new TextEncoder();
  const pinData = encoder.encode(pin + salt.toString());
  const hash = nacl.hash(pinData);
  const key = hash.slice(0, nacl.secretbox.keyLength);
  
  // Decrypt
  const decrypted = nacl.secretbox.open(encrypted, nonce, key);
  
  if (!decrypted) {
    throw new Error('Decryption failed - incorrect PIN or corrupted data');
  }
  
  const decoder = new TextDecoder();
  return decoder.decode(decrypted);
}

export function validatePIN(pin) {
  return /^\d{6}$/.test(pin);
}

export function deriveKeypairFromSeed(seedPhrase) {
  // Convert seed phrase to seed bytes
  const seed = bip39.mnemonicToSeedSync(seedPhrase).slice(0, 32);
  
  // Generate Ed25519 keypair from seed
  const keypair = nacl.sign.keyPair.fromSeed(seed);
  
  return keypair;
}

export function deriveDIDFromSeedPhrase(seedPhrase) {
  const keypair = deriveKeypairFromSeed(seedPhrase);
  const publicKeyBase64 = encodeBase64(keypair.publicKey);
  return `did:alyra:iss:${publicKeyBase64}`;
}
export function signMessage(message, secretKey) {
  const encoder = new TextEncoder();
  const messageBytes = encoder.encode(message);
  const signature = nacl.sign.detached(messageBytes, secretKey);
  return encodeBase64(signature);
}

export function createProof(nonce, seedPhrase, did) {
  const keypair = deriveKeypairFromSeed(seedPhrase);
  const signature = signMessage(nonce, keypair.secretKey);
  
  return {
    type: 'Ed25519Signature2024',
    nonce: nonce,
    signature: signature,
    did: did,
    publicKey: encodeBase64(keypair.publicKey)
  };
}
