import { describe, expect, it, vi } from 'vitest';
import { PairCancelled, approvalCountdown, startPairing } from './pairFlow';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => (resolve = res));
  return { promise, resolve };
}

const TOKEN = { deviceId: 'dev_1', deviceToken: 'tok', caps: ['read'], expiresAt: null };

describe('approval wait', () => {
  it('CRD-C19 counts down the two-minute window from the desktop answer', () => {
    expect(approvalCountdown(10_000, 16_000)).toBe('1:54');
  });

  it('CRD-C20 stops at 0:00 once the window has passed', () => {
    expect(approvalCountdown(10_000, 10_000 + 200_000)).toBe('0:00');
  });

  it('CRD-C21 cancel aborts the pending request and ends with a cancelled result', async () => {
    const confirm = deferred<typeof TOKEN>();
    const abort = vi.fn();
    const save = vi.fn(async () => {});
    const run = startPairing(() => confirm.promise, abort, save);
    run.cancel();
    await expect(run.done).rejects.toBeInstanceOf(PairCancelled);
    expect(abort).toHaveBeenCalledOnce();
    expect(save).not.toHaveBeenCalled();
  });

  it('CRD-C22 never saves a token once cancelled, and ignores a cancel after it was saved', async () => {
    const late = deferred<typeof TOKEN>();
    const save = vi.fn(async () => {});
    const cancelled = startPairing(() => late.promise, vi.fn(), save);
    late.resolve(TOKEN);
    cancelled.cancel();
    await expect(cancelled.done).rejects.toBeInstanceOf(PairCancelled);
    expect(save).not.toHaveBeenCalled();

    const early = deferred<typeof TOKEN>();
    const abort = vi.fn();
    const finished = startPairing(() => early.promise, abort, save);
    early.resolve(TOKEN);
    await finished.done;
    finished.cancel();
    expect(save).toHaveBeenCalledWith(TOKEN);
    expect(abort).not.toHaveBeenCalled();
  });
});
