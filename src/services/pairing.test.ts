import { describe, expect, it } from 'vitest';
import { parsePairingPayload } from './pairing';

const payload = { v: 1, host: '100.101.102.103', port: 8722, fingerprint: 'sha256/x', pairCode: 'abc', name: 'Desk' };

describe('parsePairingPayload', () => {
  it('reads the ostia-pair link and plain JSON alike', () => {
    expect(parsePairingPayload(`ostia-pair://${btoa(JSON.stringify(payload))}`).host).toBe('100.101.102.103');
    expect(parsePairingPayload(` ${JSON.stringify(payload)} `).name).toBe('Desk');
  });

  it('refuses text that is not a pairing code', () => {
    expect(() => parsePairingPayload('https://example.com')).toThrow(/not an Ostia pairing code/);
  });

  it('refuses a code missing a field', () => {
    expect(() => parsePairingPayload(JSON.stringify({ ...payload, pairCode: '' }))).toThrow(/incomplete/);
  });

  it('refuses a loopback address and says to turn on remote access', () => {
    expect(() => parsePairingPayload(JSON.stringify({ ...payload, host: '127.0.0.1' }))).toThrow(/Tailscale/);
  });
});
