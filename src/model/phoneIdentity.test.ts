import { describe, expect, it } from 'vitest';
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

  it('PID-P4 always names the phone with a generated adjective-noun name, from a list of at least 1000 pairs', () => {
    const names = new Set<string>();
    for (let adjective = 0; adjective < 32; adjective++) {
      for (let noun = 0; noun < 32; noun++) {
        let call = 0;
        names.add(newPhoneIdentity((n) => Uint8Array.from({ length: n }, () => (call++ < 16 ? 1 : call === 18 ? adjective : noun))).name);
      }
    }
    expect(names.size).toBeGreaterThanOrEqual(1000);
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
});
