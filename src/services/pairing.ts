export interface PairingPayload {
  host: string;
  port: number;
  fingerprint: string;
  pairCode: string;
  name?: string;
}

const SCHEME = 'ostia-pair://';

export function parsePairingPayload(text: string): PairingPayload {
  let json = text.trim();
  if (json.startsWith(SCHEME)) json = atob(json.slice(SCHEME.length));
  let config: any;
  try {
    config = JSON.parse(json);
  } catch {
    throw new Error('This is not an Ostia pairing code. Scan the QR code from Settings › Remote on the desktop.');
  }
  if (!config?.host || !config.port || !config.fingerprint || !config.pairCode) {
    throw new Error('This pairing code is incomplete. Show a new QR code on the desktop and scan it again.');
  }
  if (isLoopbackHost(config.host)) {
    throw new Error(
      `This code points at ${config.host}, which only the desktop itself can reach. In Settings › Remote on the desktop, choose an address this phone can reach, then show the code again.`,
    );
  }
  return config;
}

function isLoopbackHost(host: string): boolean {
  return host === 'localhost' || host === '::1' || host.startsWith('127.');
}
