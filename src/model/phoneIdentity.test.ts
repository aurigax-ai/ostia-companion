import { adjectives, nouns } from 'human-id';
import { describe, expect, it, vi } from 'vitest';
import { cleanPhoneName, newPhoneIdentity, parsePhoneIdentity } from './phoneIdentity';

const bytes = (...values: number[]) => (n: number) => Uint8Array.from({ length: n }, (_, i) => values[i % values.length]);

describe('phone identity', () => {
  it('PID-P1 makes a 32 character hex install id and a lowercase adjective-noun name', () => {
    const identity = newPhoneIdentity(bytes(0xab, 0x01));
    expect(identity.installId).toMatch(/^[0-9a-f]{32}$/);
    expect(identity.name).toMatch(/^[a-z]+-[a-z]+$/);
  });

  it('PID-P2 makes a different install id from different random bytes', () => {
    expect(newPhoneIdentity(bytes(1)).installId).not.toBe(newPhoneIdentity(bytes(2)).installId);
  });

  it('PID-P3 reads back what it stored and refuses anything else', () => {
    const identity = newPhoneIdentity(bytes(7, 9));
    expect(parsePhoneIdentity(JSON.stringify(identity))).toEqual(identity);
    expect(parsePhoneIdentity(null)).toBeNull();
    expect(parsePhoneIdentity('not json')).toBeNull();
    expect(parsePhoneIdentity(JSON.stringify({ installId: 'short', name: 'a-b' }))).toBeNull();
    expect(parsePhoneIdentity(JSON.stringify({ installId: identity.installId, name: '' }))).toBeNull();
    expect(parsePhoneIdentity(JSON.stringify({ installId: identity.installId, name: 'a‮b' }))).toBeNull();
  });

  it('PID-P4 always names the phone with a generated adjective-noun name, from at least 50000 pairs', () => {
    expect(adjectives.length * nouns.length).toBeGreaterThanOrEqual(50_000);
    const names = new Set<string>();
    for (let i = 0; i < 200; i++) names.add(newPhoneIdentity(() => crypto.getRandomValues(new Uint8Array(16))).name);
    expect(names.size).toBeGreaterThan(190);
    for (const name of names) expect(name).toMatch(/^[a-z]+-[a-z]+$/);
  });

  it('PID-P10 refuses control, bidi, zero-width and separator characters and cuts at 64 characters', () => {
    for (const bad of ['a\nb', 'a‮b', 'a​b', 'a b', 'a b', 'a\u0000b', 'a\ud800b', '   ']) {
      expect(cleanPhoneName(bad)).toBeNull();
    }
    expect(cleanPhoneName('  Desk phone  ')).toBe('Desk phone');
    expect(cleanPhoneName('x'.repeat(100))).toHaveLength(64);
    const emoji = cleanPhoneName('\u{1F600}'.repeat(70)) ?? '';
    expect(Array.from(emoji)).toHaveLength(64);
    expect(() => encodeURIComponent(emoji)).not.toThrow();
  });

  it('PID-P18 loads and cleans a name when the runtime has no Intl.Segmenter', async () => {
    vi.stubGlobal('Intl', { ...Intl, Segmenter: undefined });
    vi.resetModules();
    try {
      const fresh = await import('./phoneIdentity');
      expect(fresh.cleanPhoneName('  kitchen-phone  ')).toBe('kitchen-phone');
      expect(Array.from(fresh.cleanPhoneName('\u{1F600}'.repeat(70)) ?? '')).toHaveLength(64);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
