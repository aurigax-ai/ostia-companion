import { parseTurnList, TurnList } from '../model/turns';
import { OstiaRpc } from './rpc';

const METHOD_NOT_FOUND = -32601;
const INVALID_PARAMS = -32602;
const REDACTION_FAILED = -32603;

export type TurnsResult = { kind: 'turns'; list: TurnList } | { kind: 'terminal' } | { kind: 'error'; text: string };

export function turnsFailure(err: any, firstLoad: boolean): TurnsResult {
  if (err?.code === METHOD_NOT_FOUND) return { kind: 'terminal' };
  if (err?.code === INVALID_PARAMS && firstLoad) return { kind: 'terminal' };
  if (err?.code === INVALID_PARAMS) return { kind: 'error', text: 'This agent is no longer on the desktop.' };
  if (err?.code === REDACTION_FAILED) return { kind: 'error', text: 'The desktop could not check this for secrets, so it sent nothing.' };
  return { kind: 'error', text: err?.message || 'Could not read the conversation.' };
}

export async function loadTurns(paneId: string, firstLoad: boolean): Promise<TurnsResult> {
  try {
    return { kind: 'turns', list: parseTurnList(await OstiaRpc.call('turn.list', { paneId })) };
  } catch (err: any) {
    return turnsFailure(err, firstLoad);
  }
}

export function outputFailure(err: any): string {
  if (err?.code === REDACTION_FAILED) return 'The desktop could not check this for secrets, so it sent nothing.';
  if (err?.message === 'unknown-step') return 'The desktop no longer keeps this output.';
  return err?.message || 'Could not read the output.';
}

export async function loadStepOutput(paneId: string, stepId: string): Promise<{ ok: true; output: string } | { ok: false; text: string }> {
  try {
    const result = await OstiaRpc.call('turn.output', { paneId, stepId });
    return { ok: true, output: typeof result?.output === 'string' ? result.output : '' };
  } catch (err: any) {
    return { ok: false, text: outputFailure(err) };
  }
}
