import { pinnedPost } from 'websocket-pinning';
import { generateDeviceKeyPair } from './crypto';
import { PairingData } from './storage';

export interface PairResponse {
  deviceId: string;
  deviceToken: string;
  caps: string[];
  expiresAt: string | null;
}

/**
 * Executes the pairing request against the desktop gateway.
 * Verifies the self-signed TLS cert against the expected fingerprint using the native pinned client.
 */
export async function pairDevice(
  host: string,
  port: number,
  fingerprint: string,
  pairCode: string,
  deviceName: string
): Promise<PairingData> {
  const url = `https://${host}:${port}/pair`;
  const keypair = generateDeviceKeyPair();

  const payload = {
    v: 1,
    pairCode,
    device: {
      name: deviceName,
      pubkey: keypair.publicKeySpki,
    },
  };

  try {
    const result: PairResponse = await pinnedPost(url, payload, fingerprint);

    if (!result.deviceToken || !result.deviceId) {
      throw new Error('Invalid pairing response format from server');
    }

    return {
      deviceToken: result.deviceToken,
      deviceId: result.deviceId,
      pinnedFingerprint: fingerprint,
      desktopName: '', // Will be updated or can be set from host info
      gatewayHost: host,
      gatewayPort: port,
      privateKey: keypair.privateKeyRaw,
      publicKey: keypair.publicKeySpki,
    };
  } catch (error: any) {
    throw new Error(describePairFailure(error?.message ?? '', host, port));
  }
}

function describePairFailure(message: string, host: string, port: number): string {
  if (/401/.test(message)) {
    return 'The pairing code was already used or expired. Show a new QR on the desktop and scan again.';
  }
  if (/429/.test(message)) {
    return 'Too many pairing attempts. Wait a minute, then show a new QR on the desktop.';
  }
  if (/fingerprint|certificate|SSL|TLS/i.test(message)) {
    return 'The desktop certificate does not match the QR. Show a new QR on the desktop and scan again.';
  }
  return `Cannot reach the desktop at ${host}:${port}. Check that the phone is on the same network (or tailnet) and that the desktop firewall allows TCP port ${port}.`;
}
