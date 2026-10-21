import { describe, expect, it } from 'vitest';
import type { PairingData } from '../services/storage';
import { pairedRoute, parseAddresses, savedRoutes, untried } from './rediscovery';

const desktop = (patch: Partial<PairingData> = {}): PairingData => ({
  deviceToken: 'tok',
  deviceId: 'dev_a',
  pinnedFingerprint: 'sha256/a',
  desktopName: 'brave-apple',
  gatewayHost: '192.168.1.5',
  gatewayPort: 8722,
  privateKey: 'priv',
  publicKey: 'pub',
  ...patch,
});

describe('address list (contract v1.10 §1)', () => {
  it('RDS-A1 keeps well-formed entries in order and drops malformed ones', () => {
    expect(
      parseAddresses([
        { kind: 'tailnet', host: 'box.tail1234.ts.net', port: 8722 },
        { kind: 'tailnet', host: '100.101.102.103', port: 8722 },
        { kind: 'wifi', host: '10.0.0.2', port: 8722 },
        { kind: 'lan', host: 'https://10.0.0.2', port: 8722 },
        { kind: 'lan', host: '[::1]', port: 8722 },
        { kind: 'lan', host: '10.0.0.2', port: 0 },
        { kind: 'phone', host: 'gw.example.org', port: 443 },
      ]),
    ).toEqual([
      { kind: 'tailnet', host: 'box.tail1234.ts.net', port: 8722 },
      { kind: 'tailnet', host: '100.101.102.103', port: 8722 },
      { kind: 'phone', host: 'gw.example.org', port: 443 },
    ]);
  });

  it('RDS-A2 treats a missing list as "keep what is saved" and an empty list as a replacement', () => {
    expect(parseAddresses(undefined)).toBeNull();
    expect(parseAddresses('x')).toBeNull();
    expect(parseAddresses([])).toEqual([]);
  });

  it('RDS-A4 keeps what is saved when the answer has entries but none usable', () => {
    expect(parseAddresses([{ kind: 'wifi', host: '10.0.0.2', port: 8722 }, { kind: 'lan', host: '[::1]', port: 8722 }])).toBeNull();
  });
});

describe('where to try first (contract v1.10 §4)', () => {
  it('RDS-A3 tries the last address that worked, then the saved list in order, without repeats', () => {
    const routes = savedRoutes(
      desktop({
        gatewayHost: '100.101.102.103',
        gatewayPort: 8722,
        addresses: [
          { kind: 'tailnet', host: 'Box.tail1234.ts.net', port: 8722 },
          { kind: 'tailnet', host: '100.101.102.103', port: 8722 },
          { kind: 'lan', host: '192.168.2.108', port: 8722 },
        ],
      }),
    );
    expect(routes).toEqual([
      { host: '100.101.102.103', port: 8722 },
      { host: 'Box.tail1234.ts.net', port: 8722 },
      { host: '192.168.2.108', port: 8722 },
    ]);
  });

  it('RDS-A4 falls back to the paired address when no list was ever saved', () => {
    expect(savedRoutes(desktop())).toEqual([{ host: '192.168.1.5', port: 8722 }]);
  });

  it('RDS-A5 skips discovered routes that were already tried', () => {
    expect(
      untried(
        [
          { host: '10.0.0.2', port: 8722 },
          { host: '10.0.0.3', port: 8722 },
          { host: '10.0.0.3', port: 8722 },
        ],
        [{ host: '10.0.0.2', port: 8722 }],
      ),
    ).toEqual([{ host: '10.0.0.3', port: 8722 }]);
  });
});

describe('LAN announce (contract v1.10 §3)', () => {
  const addresses = ['fe80::1', '192.168.2.108'];

  it('RDS-A6 takes a mode=paired instance, with its IPv4 and TXT port', () => {
    expect(pairedRoute({ txt: { v: '1', mode: 'paired', port: '8722' }, addresses })).toEqual({
      host: '192.168.2.108',
      port: 8722,
    });
  });

  it('RDS-A7 ignores pairing announces, other versions and instances without an IPv4', () => {
    expect(pairedRoute({ txt: { v: '1', name: 'brave-apple', host: '10.0.0.2', port: '8722', fp: 'sha256/a' }, addresses })).toBeNull();
    expect(pairedRoute({ txt: { v: '2', mode: 'paired', port: '8722' }, addresses })).toBeNull();
    expect(pairedRoute({ txt: { v: '1', mode: 'paired', port: '70000' }, addresses })).toBeNull();
    expect(pairedRoute({ txt: { v: '1', mode: 'paired', port: '8722' }, addresses: ['fe80::1'] })).toBeNull();
  });
});
