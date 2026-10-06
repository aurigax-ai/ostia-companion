import { isTailnetAddress } from './tailscale';

export interface PairFailure {
  text: string;
  action?: 'open-tailscale';
}

export function pairFailure(message: string, host: string, port: number): PairFailure {
  if (/401/.test(message)) {
    return { text: 'The pairing code was already used or expired. Show a new QR on the desktop and scan again.' };
  }
  if (/429/.test(message)) {
    return { text: 'Too many pairing attempts. Wait a minute, then show a new QR on the desktop.' };
  }
  if (/fingerprint|certificate|SSL|TLS/i.test(message)) {
    return { text: 'The desktop certificate does not match the QR. Show a new QR on the desktop and scan again.' };
  }
  if (isTailnetAddress(host)) {
    return {
      text: `Cannot reach the desktop at ${host}:${port} over Tailscale. Open the Tailscale app on this phone and sign in to the same tailnet as the desktop.`,
      action: 'open-tailscale',
    };
  }
  return {
    text: `Cannot reach the desktop at ${host}:${port}. Check that Ostia's remote access is on, then show a new QR on the desktop.`,
  };
}
