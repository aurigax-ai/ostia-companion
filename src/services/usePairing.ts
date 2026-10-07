import { useEffect, useRef, useState } from 'react';
import { PairingRun } from './network';
import { PairCancelled } from './pairFlow';
import { haptic } from './motion';
import { CheckCodeListener, showPairingError } from './pairWith';

type PairTask = (onCheckCode: CheckCodeListener) => PairingRun;

export function usePairing(onPaired: () => Promise<void>) {
  const [busy, setBusy] = useState(false);
  const [check, setCheck] = useState<{ code: string; startedAt: number } | null>(null);
  const current = useRef<PairingRun | null>(null);

  useEffect(() => () => current.current?.cancel(), []);

  const run = async (task: PairTask, onFailed?: () => void) => {
    if (busy) return;
    setBusy(true);
    setCheck(null);
    try {
      const pairing = task((code, startedAt) => setCheck({ code, startedAt }));
      current.current = pairing;
      await pairing.done;
      haptic('approved');
      await onPaired();
    } catch (err) {
      setCheck(null);
      if (err instanceof PairCancelled) return setBusy(false);
      onFailed?.();
      haptic('failed');
      showPairingError(err, () => setBusy(false));
    } finally {
      current.current = null;
    }
  };

  const cancel = () => current.current?.cancel();

  return { busy, check, run, cancel };
}
