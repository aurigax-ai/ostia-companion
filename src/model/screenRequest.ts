import type { Session } from './workspaces';

export const REQUEST_TIMEOUT_MS = 60_000;
const REASON_MAX = 300;

export interface ScreenRequest {
  requestId: string | null;
  sessionId: string;
  workspace: string;
  agent: string | null;
  title: string;
  reason: string | null;
}

export type DeclineReason = 'off' | 'unsupported' | 'denied' | 'busy';

const REQUEST_ID = /^[A-Za-z0-9._:-]{1,100}$/;

export function parseScreenRequest(payload: unknown, sessions: Session[]): ScreenRequest | null {
  const raw = (payload && typeof payload === 'object' ? payload : {}) as Record<string, unknown>;
  if (typeof raw.sessionId !== 'string' || !raw.sessionId) return null;
  const workspace = sessions.find((session) => session.sessionId === raw.sessionId)?.name ?? 'a workspace';
  const agent = raw.by === 'agent' && typeof raw.agent === 'string' && raw.agent.trim() ? raw.agent.trim().slice(0, 40) : null;
  const reason = typeof raw.reason === 'string' && raw.reason.trim() ? raw.reason.trim().slice(0, REASON_MAX) : null;
  return {
    requestId: typeof raw.requestId === 'string' && REQUEST_ID.test(raw.requestId) ? raw.requestId : null,
    sessionId: raw.sessionId,
    workspace,
    agent,
    title: `${agent ?? 'An agent'} in ${workspace} wants to use this phone`,
    reason,
  };
}
