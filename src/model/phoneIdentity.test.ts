import { describe, expect, it } from 'vitest';
import { cleanPhoneName, newPhoneIdentity, parsePhoneIdentity } from './phoneIdentity';

const bytes = (...values: number[]) => (n: number) => Uint8Array.from({ length: n }, (_, i) => values[i % values.length]);

describe('phone identity', () => {
  it('PID-P1 makes a 32 character hex install id and a generated adjective-noun name without a model', () => {
    const identity = newPhoneIdentity(bytes(0xab, 0x01), undefined);
    expect(identity.installId).toMatch(/^[0-9a-f]{32}$/);
    expect(identity.name).toMatch(/^[a-z]+-[a-z]+$/);
  });

  it('PID-P2 makes a different install id from different random bytes', () => {
    expect(newPhoneIdentity(bytes(1), undefined).installId).not.toBe(newPhoneIdentity(bytes(2), undefined).installId);
  });

  it('PID-P3 reads back what it stored and refuses anything else', () => {
    const identity = newPhoneIdentity(bytes(7, 9), 'Pixel 9');
    expect(parsePhoneIdentity(JSON.stringify(identity))).toEqual(identity);
    expect(parsePhoneIdentity(null)).toBeNull();
    expect(parsePhoneIdentity('not json')).toBeNull();
    expect(parsePhoneIdentity(JSON.stringify({ installId: 'short', name: 'a-b' }))).toBeNull();
    expect(parsePhoneIdentity(JSON.stringify({ installId: identity.installId, name: '' }))).toBeNull();
    expect(parsePhoneIdentity(JSON.stringify({ installId: identity.installId, name: 'a‮b' }))).toBeNull();
  });

  it('PID-P4 names the phone by its model at first launch, else by a generated name', () => {
    expect(newPhoneIdentity(bytes(3), ' Pixel 9 ').name).toBe('Pixel 9');
    for (const model of [undefined, '   ', 42, 'a\nb']) {
      expect(newPhoneIdentity(bytes(3), model).name).toMatch(/^[a-z]+-[a-z]+$/);
    }
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
