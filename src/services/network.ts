import { pinnedPost } from 'websocket-pinning';
import { generateDeviceKeyPair } from './crypto';
import { pairFailure } from './pairFailure';
import { requestPairing } from './pairFlow';
import { PairingData } from './storage';

export interface PairTarget {
  host: string;
  port: number;
  fingerprint: string;
  pairCode: string;
  name: string;
}

export async function pairDevice(
  target: PairTarget,
  deviceName: string,
  onCheckCode: (code: string) => void,
): Promise<PairingData> {
  const { host, port, fingerprint, pairCode, name } = target;
  const keypair = generateDeviceKeyPair();
  const post = (path: string, body: object) => pinnedPost(`https://${host}:${port}${path}`, body, fingerprint);
  try {
    const result = await requestPairing(
      post,
      { pairCode, fingerprint, deviceName, pubkey: keypair.publicKeySpki },
      onCheckCode,
    );
    return {
      deviceToken: result.deviceToken,
      deviceId: result.deviceId,
      pinnedFingerprint: fingerprint,
      desktopName: name,
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
