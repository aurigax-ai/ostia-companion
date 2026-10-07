import { sha256 } from '@noble/hashes/sha2.js';

const SEPARATOR = new Uint8Array([0]);
const DIGITS = 1_000_000;

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function utf8(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

export function checkCode(fingerprint: string, pubkey: string, phoneNonce: Uint8Array, desktopNonce: Uint8Array): string {
  const digest = sha256(concat(utf8(fingerprint), SEPARATOR, utf8(pubkey), SEPARATOR, phoneNonce, desktopNonce));
  const value = new DataView(digest.buffer, digest.byteOffset, 4).getUint32(0);
  return String(value % DIGITS).padStart(6, '0');
}

export function commitOf(nonce: Uint8Array): string {
  return [...sha256(nonce)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function spacedCheckCode(code: string): string {
  return `${code.slice(0, 3)} ${code.slice(3)}`;
}
