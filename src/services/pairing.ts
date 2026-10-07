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
    throw new Error('Not an Ostia pairing code.');
  }
  if (!config?.host || !config.port || !config.fingerprint || !config.pairCode) {
    throw new Error('Incomplete pairing code. Show a new one.');
  }
  if (isLoopbackHost(config.host)) {
    throw new Error(
      `${config.host} only works on the desktop itself. Pick another address in Settings › Remote.`,
    );
  }
  return config;
}

function isLoopbackHost(host: string): boolean {
  return host === 'localhost' || host === '::1' || host.startsWith('127.');
}
