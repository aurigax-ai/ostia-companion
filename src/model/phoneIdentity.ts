import { adjectives, nouns } from 'human-id';

export interface PhoneIdentity {
  installId: string;
  name: string;
}

export const PHONE_NAME_MAX = 64;

const INSTALL_ID = /^[0-9a-f]{32}$/;
const UNSAFE = /[\p{Cc}\p{Cf}\p{Cs}\p{Zl}\p{Zp}]/u;

export function cleanPhoneName(text: unknown): string | null {
  if (typeof text !== 'string' || UNSAFE.test(text)) return null;
  const kept = Array.from(text.trim()).slice(0, PHONE_NAME_MAX);
  return kept.join('').trim() || null;
}

export function newPhoneIdentity(randomBytes: (n: number) => Uint8Array): PhoneIdentity {
  const installId = [...randomBytes(16)].map((b) => b.toString(16).padStart(2, '0')).join('');
  const pick = (words: string[]) => {
    const [high, low] = randomBytes(2);
    return words[(high * 256 + low) % words.length];
  };
  return { installId, name: `${pick(adjectives)}-${pick(nouns)}` };
}

export function parsePhoneIdentity(text: string | null): PhoneIdentity | null {
  if (!text) return null;
  try {
    const data = JSON.parse(text);
    const name = cleanPhoneName(data?.name);
    return typeof data?.installId === 'string' && INSTALL_ID.test(data.installId) && name ? { installId: data.installId, name } : null;
  } catch {
    return null;
  }
}
