import { describe, expect, it } from 'vitest';
import { newPhoneIdentity, pairingName, parsePhoneIdentity } from './phoneIdentity';

const bytes = (...values: number[]) => (n: number) => Uint8Array.from({ length: n }, (_, i) => values[i % values.length]);

describe('phone identity', () => {
  it('PID-P1 makes a 32 character hex install id and a generated adjective-noun name', () => {
    const identity = newPhoneIdentity(bytes(0xab, 0x01));
    expect(identity.installId).toMatch(/^[0-9a-f]{32}$/);
    expect(identity.generatedName).toMatch(/^[a-z]+-[a-z]+$/);
  });

  it('PID-P2 makes a different install id from different random bytes', () => {
    expect(newPhoneIdentity(bytes(1)).installId).not.toBe(newPhoneIdentity(bytes(2)).installId);
  });

  it('PID-P3 reads back what it stored and refuses anything else', () => {
    const identity = newPhoneIdentity(bytes(7, 9));
    expect(parsePhoneIdentity(JSON.stringify(identity))).toEqual(identity);
    expect(parsePhoneIdentity(null)).toBeNull();
    expect(parsePhoneIdentity('not json')).toBeNull();
    expect(parsePhoneIdentity(JSON.stringify({ installId: 'short', generatedName: 'a-b' }))).toBeNull();
    expect(parsePhoneIdentity(JSON.stringify({ installId: identity.installId, generatedName: '' }))).toBeNull();
  });

  it('PID-P4 names the phone by its model, else by the generated name', () => {
    const identity = { installId: 'a'.repeat(32), generatedName: 'brave-apple' };
    expect(pairingName(identity, ' Pixel 9 ')).toBe('Pixel 9');
    expect(pairingName(identity, undefined)).toBe('brave-apple');
    expect(pairingName(identity, '   ')).toBe('brave-apple');
    expect(pairingName(identity, 42)).toBe('brave-apple');
    expect(pairingName(identity, 'x'.repeat(100))).toHaveLength(64);
  });
});
