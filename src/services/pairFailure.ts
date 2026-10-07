import { isTailnetAddress } from './tailscale';

export interface PairFailure {
  text: string;
  action?: 'open-tailscale';
}

export function pairFailure(message: string, host: string, port: number): PairFailure {
  if (/\b403\b/.test(message)) {
    return { text: 'The desktop declined this phone.' };
  }
  if (/\b408\b/.test(message)) {
    return { text: 'Pairing expired before the desktop approved it. Show a new code on the desktop and try again.' };
  }
  if (/401/.test(message)) {
    return { text: 'Code expired or already used.' };
  }
  if (/429/.test(message)) {
    return { text: 'Too many attempts. Wait a minute.' };
  }
  if (/fingerprint|certificate|SSL|TLS/i.test(message)) {
    return { text: "Certificate doesn't match. Scan a new code." };
  }
  if (isTailnetAddress(host)) {
    return {
      text: `Can't reach ${host} over Tailscale. Open the Tailscale app on this phone and join the same tailnet.`,
      action: 'open-tailscale',
    };
  }
  return {
    text: `Can't reach ${host}:${port}. Is remote access on?`,
  };
}
