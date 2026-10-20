import { afterEach, describe, expect, it, vi } from 'vitest';

describe('xterm on Hermes', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('CRD-V13 loads where there is no navigator.userAgent and process has no title', async () => {
    vi.resetModules();
    vi.stubGlobal('process', { env: {} });
    vi.stubGlobal('navigator', { product: 'ReactNative' });
    const { TerminalCopy } = await import('./terminalCopy');
    expect(new TerminalCopy(10, 3).cols).toBe(10);
  });
});
