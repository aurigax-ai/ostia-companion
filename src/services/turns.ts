import { parseTurnList, TurnList } from '../model/turns';
import { OstiaRpc } from './rpc';

const METHOD_NOT_FOUND = -32601;
const INVALID_PARAMS = -32602;
const REDACTION_FAILED = -32603;

export type TurnsResult = { kind: 'turns'; list: TurnList } | { kind: 'terminal' } | { kind: 'error'; text: string };

function failure(err: any): string {
  if (err?.code === REDACTION_FAILED) return 'The desktop could not check this for secrets, so it sent nothing.';
  return err?.message || 'Could not read the conversation.';
}

export async function loadTurns(paneId: string): Promise<TurnsResult> {
  try {
    return { kind: 'turns', list: parseTurnList(await OstiaRpc.call('turn.list', { paneId })) };
  } catch (err: any) {
    if (err?.code === METHOD_NOT_FOUND || err?.code === INVALID_PARAMS) return { kind: 'terminal' };
    return { kind: 'error', text: failure(err) };
  }
}

export async function loadStepOutput(paneId: string, stepId: string): Promise<{ ok: true; output: string } | { ok: false; text: string }> {
  try {
    const result = await OstiaRpc.call('turn.output', { paneId, stepId });
    return { ok: true, output: typeof result?.output === 'string' ? result.output : '' };
  } catch (err: any) {
    return { ok: false, text: err?.message === 'unknown-step' ? 'The desktop no longer keeps this output.' : failure(err) };
  }
}
