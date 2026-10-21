export interface PhoneIdentity {
  installId: string;
  generatedName: string;
}

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
const NAME_MAX = 64;

export function newPhoneIdentity(randomBytes: (n: number) => Uint8Array): PhoneIdentity {
  const installId = [...randomBytes(16)].map((b) => b.toString(16).padStart(2, '0')).join('');
  const [adjective, noun] = randomBytes(2);
  return { installId, generatedName: `${ADJECTIVES[adjective % ADJECTIVES.length]}-${NOUNS[noun % NOUNS.length]}` };
}

export function parsePhoneIdentity(text: string | null): PhoneIdentity | null {
  if (!text) return null;
  try {
    const data = JSON.parse(text);
    const valid = typeof data?.installId === 'string' && INSTALL_ID.test(data.installId) && typeof data.generatedName === 'string' && data.generatedName;
    return valid ? { installId: data.installId, generatedName: data.generatedName } : null;
  } catch {
    return null;
  }
}

export function pairingName(identity: PhoneIdentity, model: unknown): string {
  const named = typeof model === 'string' ? model.trim().slice(0, NAME_MAX).trim() : '';
  return named || identity.generatedName;
}
