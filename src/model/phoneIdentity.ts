export interface PhoneIdentity {
  installId: string;
  name: string;
}

export const PHONE_NAME_MAX = 64;

const ADJECTIVES = [
  'amber', 'brave', 'bright', 'calm', 'clever', 'cosmic', 'crisp', 'eager', 'fancy', 'gentle', 'glad',
  'golden', 'happy', 'jolly', 'keen', 'kind', 'lively', 'lucky', 'merry', 'mighty', 'noble', 'plucky',
  'proud', 'quick', 'quiet', 'rapid', 'rosy', 'shiny', 'silver', 'sunny', 'swift', 'witty',
];

const NOUNS = [
  'apple', 'badger', 'beacon', 'birch', 'breeze', 'canyon', 'cedar', 'comet', 'coral', 'falcon', 'fern',
  'harbor', 'heron', 'island', 'juniper', 'lantern', 'maple', 'meadow', 'otter', 'pebble', 'pine', 'raven',
  'river', 'sparrow', 'summit', 'thistle', 'tulip', 'valley', 'willow', 'wren', 'yarrow', 'zephyr',
];

const INSTALL_ID = /^[0-9a-f]{32}$/;
const UNSAFE = /[\p{Cc}\p{Cf}\p{Cs}\p{Zl}\p{Zp}]/u;
const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

export function cleanPhoneName(text: unknown): string | null {
  if (typeof text !== 'string' || UNSAFE.test(text)) return null;
  const kept = Array.from(graphemes.segment(text.trim()), (g) => g.segment).slice(0, PHONE_NAME_MAX);
  return kept.join('').trim() || null;
}

export function newPhoneIdentity(randomBytes: (n: number) => Uint8Array, model: unknown): PhoneIdentity {
  const installId = [...randomBytes(16)].map((b) => b.toString(16).padStart(2, '0')).join('');
  const [adjective, noun] = randomBytes(2);
  const generated = `${ADJECTIVES[adjective % ADJECTIVES.length]}-${NOUNS[noun % NOUNS.length]}`;
  return { installId, name: cleanPhoneName(model) ?? generated };
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
