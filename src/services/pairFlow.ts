import { checkCode, commitOf } from './pairCheck';

export type PairPost = (path: string, body: object) => Promise<any>;

export interface PairRequestInput {
  pairCode: string;
  fingerprint: string;
  deviceName: string;
  pubkey: string;
}

export interface PairResponse {
  deviceId: string;
  deviceToken: string;
  caps: string[];
  expiresAt: string | null;
}

const NONCE_BYTES = 32;

function toBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

function fromBase64(text: string): Uint8Array {
  return Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
}

export async function requestPairing(
  post: PairPost,
  input: PairRequestInput,
  onCheckCode: (code: string) => void,
  randomBytes: (n: number) => Uint8Array = (n) => crypto.getRandomValues(new Uint8Array(n)),
): Promise<PairResponse> {
  const phoneNonce = randomBytes(NONCE_BYTES);
  const started = await post('/pair', {
    pairCode: input.pairCode,
    device: { name: input.deviceName, pubkey: input.pubkey },
    commit: commitOf(phoneNonce),
  });
  if (typeof started?.requestId !== 'string' || typeof started.nonce !== 'string') {
    throw new Error('Invalid pairing response format from server');
  }
  onCheckCode(checkCode(input.fingerprint, input.pubkey, phoneNonce, fromBase64(started.nonce)));
  const result = await post('/pair/confirm', { requestId: started.requestId, nonce: toBase64(phoneNonce) });
  if (typeof result?.deviceToken !== 'string' || typeof result.deviceId !== 'string') {
    throw new Error('Invalid pairing response format from server');
  }
  return result;
}

export const APPROVAL_WINDOW_MS = 120_000;

export class PairCancelled extends Error {
  constructor() {
    super('Pairing cancelled');
  }
}

export function approvalCountdown(startedAt: number, now: number): string {
  const seconds = Math.max(0, Math.ceil((startedAt + APPROVAL_WINDOW_MS - now) / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

export function startPairing(
  run: () => Promise<PairResponse>,
  abort: () => void,
  save: (result: PairResponse) => Promise<void>,
): { done: Promise<void>; cancel: () => void } {
  let settled = false;
  let cancelled = false;
  let rejectCancelled: (err: PairCancelled) => void = () => {};
  const cancelledSignal = new Promise<never>((_, reject) => (rejectCancelled = reject));
  const finished = run().then(async (result) => {
    if (cancelled) throw new PairCancelled();
    settled = true;
    await save(result);
  });
  const done = Promise.race([finished, cancelledSignal]);
  finished.catch(() => {});
  cancelledSignal.catch(() => {});
  return {
    done,
    cancel: () => {
      if (settled || cancelled) return;
      cancelled = true;
      abort();
      rejectCancelled(new PairCancelled());
    },
  };
}
