export const SEARCH_MS = 5000;
export const SERVICE_TYPE = 'ostia';

const IPV4 = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;

export interface NearbyDesktop {
  name: string;
  host: string;
  port: number;
  fingerprint: string;
}

export type NearbyState = { kind: 'searching' } | { kind: 'found' } | { kind: 'none'; offers: string[] };

export function desktopFromService(service: { txt: Record<string, string> }): NearbyDesktop | null {
  const { v, name, host, port, fp } = service.txt ?? {};
  const portNumber = Number(port);
  if (v !== '1' || !name || !host || !IPV4.test(host) || !fp) return null;
  if (!Number.isInteger(portNumber) || portNumber < 1 || portNumber > 65535) return null;
  return { name, host, port: portNumber, fingerprint: fp };
}

export function nearbyState(desktops: NearbyDesktop[], elapsedMs: number): NearbyState {
  if (desktops.length > 0) return { kind: 'found' };
  if (elapsedMs < SEARCH_MS) return { kind: 'searching' };
  return { kind: 'none', offers: ['scan-qr', 'paste-link'] };
}
