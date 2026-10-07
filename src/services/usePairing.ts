import { useState } from 'react';
import { showPairingError } from './pairWith';

type PairTask = (onCheckCode: (code: string) => void) => Promise<void>;

export function usePairing(onPaired: () => Promise<void>) {
  const [busy, setBusy] = useState(false);
  const [checkCode, setCheckCode] = useState<string | null>(null);

  const run = async (task: PairTask) => {
    if (busy) return;
    setBusy(true);
    setCheckCode(null);
    try {
      await task(setCheckCode);
      await onPaired();
    } catch (err) {
      setCheckCode(null);
      showPairingError(err, () => setBusy(false));
    }
  };

  return { busy, checkCode, run };
}
