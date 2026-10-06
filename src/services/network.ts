import { pinnedPost } from 'websocket-pinning';
import { generateDeviceKeyPair } from './crypto';
import { pairFailure } from './pairFailure';
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
    const failure = pairFailure(error?.message ?? '', host, port);
    throw Object.assign(new Error(failure.text), { action: failure.action });
  }
}
