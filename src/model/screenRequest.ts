import type { Session } from './workspaces';

export const REQUEST_TIMEOUT_MS = 60_000;
const REASON_MAX = 300;

export interface ScreenRequest {
  sessionId: string;
  workspace: string;
  title: string;
  reason: string | null;
}

export function parseScreenRequest(payload: unknown, sessions: Session[], desktop: string): ScreenRequest | null {
  const raw = (payload && typeof payload === 'object' ? payload : {}) as Record<string, unknown>;
  if (typeof raw.sessionId !== 'string' || !raw.sessionId) return null;
  const workspace = sessions.find((session) => session.sessionId === raw.sessionId)?.name ?? 'a workspace';
  const agent = raw.by === 'agent' && typeof raw.agent === 'string' && raw.agent.trim() ? raw.agent.trim().slice(0, 40) : null;
  const reason = typeof raw.reason === 'string' && raw.reason.trim() ? raw.reason.trim().slice(0, REASON_MAX) : null;
  return {
    sessionId: raw.sessionId,
    workspace,
    title: agent ? `${agent} in ${workspace} wants to use this phone` : `${desktop} asks to use this phone`,
    reason,
  };
}
