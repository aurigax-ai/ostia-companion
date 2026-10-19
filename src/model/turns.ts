export type StepKind = 'edit' | 'command' | 'search' | 'read' | 'subagent' | 'web' | 'other';

export interface Step {
  id: string;
  kind: StepKind;
  target?: string;
  exitCode?: number;
  output: boolean;
}

export interface Turn {
  id: string;
  startedAt: number;
  prompt?: string;
  steps: Step[];
  final?: string;
  commands: number;
  filesEdited: number;
  ended: boolean;
}

export interface TurnList {
  turns: Turn[];
  truncated: boolean;
}

const KINDS: StepKind[] = ['edit', 'command', 'search', 'read', 'subagent', 'web', 'other'];

const text = (value: unknown) => (typeof value === 'string' && value ? value : undefined);
const count = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0);

function parseStep(value: unknown): Step | null {
  const raw = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  const id = text(raw.id);
  if (!id) return null;
  const kind = KINDS.includes(raw.kind as StepKind) ? (raw.kind as StepKind) : 'other';
  return {
    id,
    kind,
    ...(text(raw.target) ? { target: text(raw.target) } : {}),
    ...(typeof raw.exitCode === 'number' && Number.isInteger(raw.exitCode) ? { exitCode: raw.exitCode } : {}),
    output: raw.output === true,
  };
}

function parseTurn(value: unknown): Turn | null {
  const raw = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  const id = text(raw.id);
  if (!id) return null;
  const steps = Array.isArray(raw.steps) ? raw.steps.map(parseStep).filter((step): step is Step => step !== null) : [];
  return {
    id,
    startedAt: typeof raw.startedAt === 'number' ? raw.startedAt : 0,
    ...(text(raw.prompt) ? { prompt: text(raw.prompt) } : {}),
    steps,
    ...(text(raw.final) ? { final: text(raw.final) } : {}),
    commands: count(raw.commands),
    filesEdited: count(raw.filesEdited),
    ended: raw.ended === true,
  };
}

export function parseTurnList(value: unknown): TurnList {
  const raw = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  const turns = Array.isArray(raw.turns) ? raw.turns.map(parseTurn).filter((turn): turn is Turn => turn !== null) : [];
  return { turns, truncated: raw.truncated === true };
}

const VERBS: Record<StepKind, string> = {
  edit: 'Edited',
  command: 'Ran',
  search: 'Searched',
  read: 'Read',
  subagent: 'Asked a subagent',
  web: 'Looked up',
  other: 'Used a tool',
};

export function stepLine(step: Step): string {
  if (!step.target) return VERBS[step.kind];
  if (step.kind === 'subagent' || step.kind === 'other') return `${VERBS[step.kind]} · ${step.target}`;
  return `${VERBS[step.kind]} ${step.target}`;
}

export function stepFailed(step: Step): boolean {
  return step.kind === 'command' && step.exitCode !== undefined && step.exitCode !== 0;
}

export function turnSummary(turn: Turn): string | null {
  const parts = [
    turn.commands > 0 ? `${turn.commands} command${turn.commands === 1 ? '' : 's'}` : null,
    turn.filesEdited > 0 ? `${turn.filesEdited} file${turn.filesEdited === 1 ? '' : 's'} edited` : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(', ') : null;
}

export function turnRunning(list: TurnList): boolean {
  return list.turns.length > 0 && !list.turns[list.turns.length - 1].ended;
}
