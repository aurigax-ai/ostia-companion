import { describe, expect, it } from 'vitest';
import { connectionRows, routeLabel, shortFingerprint } from './connectionInfo';

const desktop = {
  deviceToken: 'tok',
  deviceId: 'dev_1',
  pinnedFingerprint: 'sha256/ct2Vi9f8LA9Tqt327EitnbCE4esxoxyvNCatZHNRjKA=',
  desktopName: 'Desk',
  gatewayHost: '100.87.12.4',
  gatewayPort: 8722,
  privateKey: 'priv',
  publicKey: 'pub',
};

describe('connection info', () => {
  it('SET-C1 names the route from the address', () => {
    expect(routeLabel('100.87.12.4')).toBe('Tailscale');
    expect(routeLabel('192.168.1.20')).toBe('Local network');
  });

  it('SET-C2 shortens the fingerprint to its first 12 characters', () => {
    expect(shortFingerprint(desktop.pinnedFingerprint)).toBe('ct2Vi9f8LA9T');
  });

  it('SET-C3 leaves out the paired date when it was never stored', () => {
    const titles = connectionRows(desktop).map((row) => row.title);
    expect(titles).not.toContain('Paired');
    expect(connectionRows({ ...desktop, pairedAt: Date.UTC(2026, 9, 6) }).map((row) => row.title)).toContain('Paired');
  });
});
