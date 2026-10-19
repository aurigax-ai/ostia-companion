export const AGENTS = ['claude', 'codex'] as const;
export type AgentName = (typeof AGENTS)[number];

export const PROMPT_LIMIT = 4000;

const NOT_CONNECTED = -1;
const NEEDS_ELEVATION = -32003;
const NOT_STARTED = -32006;
const RATE_LIMITED = -32007;
const METHOD_NOT_FOUND = -32601;
const INVALID_PARAMS = -32602;

const INVALID: Record<string, string> = {
  'unknown-session': 'That workspace is closed on the desktop.',
  refused: 'Agents cannot be started in this workspace.',
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
