import * as Crypto from 'expo-crypto';
import nacl from 'tweetnacl';

// Set up secure random number generation for tweetnacl using native expo-crypto
nacl.setPRNG((x, n) => {
  const randomBytes = Crypto.getRandomBytes(n);
  for (let i = 0; i < n; i++) {
    x[i] = randomBytes[i];
  }
});

// ASN.1 SPKI header prefix for Ed25519 public keys (12 bytes)
const ED25519_SPKI_PREFIX = new Uint8Array([
  0x30, 0x2a, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x03, 0x21, 0x00,
]);

export interface DeviceKeyPair {
  publicKeySpki: string; // Base64 SPKI public key
  privateKeyRaw: string; // Base64 raw private key
}

/**
 * Generates an Ed25519 keypair and formats the public key as a Base64-encoded SPKI.
 */
export function generateDeviceKeyPair(): DeviceKeyPair {
  const keyPair = nacl.sign.keyPair();
  
  // Create SPKI public key: prefix (12 bytes) + public key bytes (32 bytes)
  const spkiBytes = new Uint8Array(ED25519_SPKI_PREFIX.length + keyPair.publicKey.length);
  spkiBytes.set(ED25519_SPKI_PREFIX, 0);
  spkiBytes.set(keyPair.publicKey, ED25519_SPKI_PREFIX.length);

  // Convert to Base64
  const publicKeySpki = base64Encode(spkiBytes);
  const privateKeyRaw = base64Encode(keyPair.secretKey);

  return {
    publicKeySpki,
    privateKeyRaw,
  };
}

/**
 * Helper to convert a Uint8Array to a Base64 string in JavaScript.
 */
function base64Encode(bytes: Uint8Array): string {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}
