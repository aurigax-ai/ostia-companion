export const AGENTS = ['claude', 'codex'] as const;
export type AgentName = (typeof AGENTS)[number];

const NOT_CONNECTED = -1;
const NEEDS_ELEVATION = -32003;
const NOT_STARTED = -32006;
const RATE_LIMITED = -32007;
const METHOD_NOT_FOUND = -32601;
const INVALID_PARAMS = -32602;

const INVALID: Record<string, string> = {
  'unknown-session': 'That workspace is closed on the desktop.',
  refused: 'Agents cannot be started in this workspace.',
  'phone-workspace-unavailable': 'The Phone workspace is not set up on the desktop. Set it in Settings › Remote › Phone, or pick a workspace.',
  'bad-params':
    'The desktop does not start an agent from that message. Write a sentence that does not begin with - or +, or with one of the agent’s own commands.',
};

export function startFailureText(error: { code?: number; message?: string } | undefined): string {
  switch (error?.code) {
    case NOT_CONNECTED:
      return 'Not connected to the desktop.';
    case NEEDS_ELEVATION:
      return 'Turn on Respond for this phone on the desktop first.';
    case NOT_STARTED:
      return 'The agent did not start. Look at the workspace on the desktop.';
    case RATE_LIMITED:
      return 'Wait a minute: the desktop starts at most 3 agents a minute from a phone.';
    case METHOD_NOT_FOUND:
      return 'Update Ostia on the desktop to start agents from this phone.';
    case INVALID_PARAMS:
      return INVALID[error.message ?? ''] ?? INVALID['bad-params'];
    default:
      return 'The agent could not start.';
  }
}

export interface PhoneWorkspace {
  set: boolean;
  agent: AgentName | null;
}

export function parsePhoneWorkspace(value: unknown): PhoneWorkspace | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  return { set: raw.set === true, agent: AGENTS.includes(raw.agent as AgentName) ? (raw.agent as AgentName) : null };
}

export type ChatTarget<T> = { kind: 'phone' } | { kind: 'workspace'; session: T };

export type ChatChoice = { kind: 'phone' } | { kind: 'workspace'; sessionId: string };

export function chatTarget<T extends { sessionId: string; kind: string; phone?: boolean }>(
  sessions: T[],
  asked: ChatChoice | undefined,
  last: string | null,
  phone: PhoneWorkspace | null,
): ChatTarget<T> | null {
  const startable = sessions.filter((session) => session.kind !== 'scratch' && session.kind !== 'manager' && !session.phone);
  if (asked?.kind === 'phone' && phone?.set) return { kind: 'phone' };
  const named = asked?.kind === 'workspace' ? sessions.find((session) => session.sessionId === asked.sessionId) : undefined;
  if (named) return named.phone && phone?.set ? { kind: 'phone' } : { kind: 'workspace', session: named };
  if (phone?.set) return { kind: 'phone' };
  const session = startable.find((s) => s.sessionId === last) ?? startable.find((s) => s.kind === 'agent') ?? startable[0];
  return session ? { kind: 'workspace', session } : null;
}
