import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = { deviceId: 'dev-a', call: vi.fn(), status: (_: string) => {} };
vi.mock('./rpc', () => ({
  OstiaRpc: {
    getPairing: () => ({ deviceId: rpc.deviceId }),
    call: (...args: unknown[]) => rpc.call(...args),
    addStatusListener: (listener: (status: string) => void) => {
      rpc.status = listener;
      return () => {};
    },
  },
}));

const { loadSnippets, resetSnippets } = await import('./snippets');
const STANDUP = { snippets: [{ name: 'standup', command: 'Draft my standup', arguments: [], source: 'user' }] };

beforeEach(() => {
  resetSnippets();
  rpc.deviceId = 'dev-a';
  rpc.call.mockReset();
});

describe('snippets on the phone', () => {
  it('PHA-C26 keeps the last list for this desktop when a load fails', async () => {
    rpc.call.mockResolvedValueOnce(STANDUP);
    expect((await loadSnippets(null)).map((s) => s.name)).toEqual(['standup']);
    rpc.call.mockRejectedValueOnce({ code: -1, message: 'offline' });
    expect((await loadSnippets(null)).map((s) => s.name)).toEqual(['standup']);
  });

  it('never shows another desktop\'s snippets', async () => {
    rpc.call.mockResolvedValueOnce(STANDUP);
    await loadSnippets(null);
    rpc.deviceId = 'dev-b';
    rpc.call.mockRejectedValueOnce({ code: -1, message: 'offline' });
    expect(await loadSnippets(null)).toEqual([]);
  });

  it('forgets every list when the phone is unpaired or revoked', async () => {
    rpc.call.mockResolvedValueOnce(STANDUP);
    await loadSnippets(null);
    rpc.status('revoked');
    rpc.call.mockRejectedValueOnce({ code: -1, message: 'offline' });
    expect(await loadSnippets(null)).toEqual([]);
    rpc.call.mockResolvedValueOnce(STANDUP);
    await loadSnippets(null);
    resetSnippets();
    rpc.call.mockRejectedValueOnce({ code: -1, message: 'offline' });
    expect(await loadSnippets(null)).toEqual([]);
  });
});
