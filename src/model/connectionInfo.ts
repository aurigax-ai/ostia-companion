import { isTailnetAddress } from '../services/tailscale';
import type { PairingData } from '../services/storage';

const FINGERPRINT_CHARS = 12;

export function routeLabel(host: string): string {
  return isTailnetAddress(host) ? 'Tailscale' : 'Local network';
}

export function shortFingerprint(fingerprint: string): string {
  return fingerprint.replace(/^sha256\//, '').slice(0, FINGERPRINT_CHARS);
}

export function connectionRows(desktop: PairingData): { title: string; value: string; mono?: boolean }[] {
  const rows = [
    { title: 'Route', value: routeLabel(desktop.gatewayHost) },
    { title: 'Address', value: `${desktop.gatewayHost}:${desktop.gatewayPort}`, mono: true },
    { title: 'Certificate', value: shortFingerprint(desktop.pinnedFingerprint), mono: true },
    { title: 'This phone', value: desktop.deviceId, mono: true },
  ];
  if (desktop.pairedAt) rows.push({ title: 'Paired', value: new Date(desktop.pairedAt).toLocaleDateString() });
  return rows;
}
