import { cancelPosts, pinnedPost } from 'websocket-pinning';
import { generateDeviceKeyPair } from './crypto';
import { pairFailure } from './pairFailure';
import { PairCancelled, requestPairing, startPairing } from './pairFlow';
import { PairingData } from './storage';

export interface PairTarget {
  host: string;
  port: number;
  fingerprint: string;
  pairCode: string;
  name: string;
}

export interface PairingRun {
  done: Promise<void>;
  cancel: () => void;
}

export function pairDevice(
  target: PairTarget,
  deviceName: string,
  onCheckCode: (code: string, startedAt: number) => void,
  save: (data: PairingData) => Promise<void>,
): PairingRun {
  const { host, port, fingerprint, pairCode, name } = target;
  const keypair = generateDeviceKeyPair();
  const post = (path: string, body: object) => pinnedPost(`https://${host}:${port}${path}`, body, fingerprint);
  const run = startPairing(
    () =>
      requestPairing(post, { pairCode, fingerprint, deviceName, pubkey: keypair.publicKeySpki }, (code) =>
        onCheckCode(code, Date.now()),
      ),
    cancelPosts,
    (result) =>
      save({
        deviceToken: result.deviceToken,
        deviceId: result.deviceId,
        pinnedFingerprint: fingerprint,
        desktopName: name,
        gatewayHost: host,
        gatewayPort: port,
        privateKey: keypair.privateKeyRaw,
        publicKey: keypair.publicKeySpki,
      }),
  );
  return {
    cancel: run.cancel,
    done: run.done.catch((error: any) => {
      if (error instanceof PairCancelled) throw error;
      const failure = pairFailure(error?.message ?? '', host, port);
      throw Object.assign(new Error(failure.text), { action: failure.action });
    }),
  };
}
