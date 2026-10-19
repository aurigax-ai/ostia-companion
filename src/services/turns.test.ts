import { describe, expect, it, vi } from 'vitest';

const call = vi.fn();
vi.mock('./rpc', () => ({ OstiaRpc: { call: (...args: unknown[]) => call(...args) } }));

const { loadStepOutput, loadTurns } = await import('./turns');

describe('reading turns', () => {
  it('PHA-C25 opens the terminal only for a desktop without turns or a pane it refuses at first', async () => {
    call.mockRejectedValueOnce({ code: -32601, message: 'Method not found' });
    expect(await loadTurns('p', false)).toEqual({ kind: 'terminal' });
    call.mockRejectedValueOnce({ code: -32602, message: 'unknown-pane' });
    expect(await loadTurns('p', true)).toEqual({ kind: 'terminal' });
  });

  it('PHA-C25 keeps a live thread when the pane goes away later and says so', async () => {
    call.mockRejectedValueOnce({ code: -32602, message: 'not-an-agent' });
    expect(await loadTurns('p', false)).toEqual({ kind: 'error', text: 'This agent is no longer on the desktop.' });
  });

  it('PHA-C22 says when the desktop could not redact the turns and sent nothing', async () => {
    call.mockRejectedValueOnce({ code: -32603, message: 'redaction-failed' });
    expect(await loadTurns('p', true)).toEqual({ kind: 'error', text: 'The desktop could not check this for secrets, so it sent nothing.' });
  });

  it('PHA-C23 reads one step\'s output and names why it is missing', async () => {
    call.mockResolvedValueOnce({ output: 'Tests 61 passed' });
    expect(await loadStepOutput('p', 's')).toEqual({ ok: true, output: 'Tests 61 passed' });
    expect(call).toHaveBeenLastCalledWith('turn.output', { paneId: 'p', stepId: 's' });
    call.mockRejectedValueOnce({ code: -32603, message: 'redaction-failed' });
    expect(await loadStepOutput('p', 's')).toEqual({ ok: false, text: 'The desktop could not check this for secrets, so it sent nothing.' });
    call.mockRejectedValueOnce({ code: -32602, message: 'unknown-step' });
    expect(await loadStepOutput('p', 's')).toEqual({ ok: false, text: 'The desktop no longer keeps this output.' });
  });
});
