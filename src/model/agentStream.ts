export type ToolKind = 'edit' | 'command' | 'search' | 'read' | 'subagent' | 'web' | 'other';
export type TurnStatus = 'running' | 'done' | 'interrupted' | 'failed';
export type PlanStatus = 'pending' | 'active' | 'done';
export type EditChange = 'add' | 'update' | 'delete';

export interface PlanItem {
  text: string;
  status: PlanStatus;
}

export type Block =
  | { kind: 'text'; id: string; text: string }
  | { kind: 'tool'; id: string; tool: ToolKind; name: string; target?: string; input?: string; output?: string; exitCode?: number; isError?: boolean }
  | { kind: 'edit'; id: string; path: string; change: EditChange; diff: string }
  | { kind: 'plan'; id: string; items: PlanItem[] };

export interface Turn {
  id: string;
  prompt?: { id: string; text: string };
  blocks: Block[];
  status: TurnStatus;
  startedAt?: number;
}

export interface StreamState {
  turns: Turn[];
  live: boolean;
  ended: 'pane-closed' | 'agent-closed' | null;
}

export const MAX_TURNS = 50;
export const MAX_SHOWN_CHARS = 20_000;
export const MAX_DIFF_LINES = 500;

export const EMPTY_STREAM: StreamState = { turns: [], live: false, ended: null };

export interface StreamFrame {
  paneId: string;
  seq: number;
  backfill: boolean;
  events: Record<string, unknown>[];
}

const TOOLS: ToolKind[] = ['edit', 'command', 'search', 'read', 'subagent', 'web', 'other'];
const CHANGES: EditChange[] = ['add', 'update', 'delete'];
const PLAN_STATUSES: PlanStatus[] = ['pending', 'active', 'done'];

const str = (value: unknown) => (typeof value === 'string' ? value : undefined);
const key = (value: unknown) => (typeof value === 'string' || typeof value === 'number' ? String(value) : undefined);

export function parseFrame(payload: unknown): StreamFrame | null {
  const raw = (payload && typeof payload === 'object' ? payload : {}) as Record<string, unknown>;
  if (typeof raw.paneId !== 'string' || typeof raw.seq !== 'number' || !Array.isArray(raw.events)) return null;
  const events = raw.events.filter((event): event is Record<string, unknown> => !!event && typeof event === 'object');
  return { paneId: raw.paneId, seq: raw.seq, backfill: raw.backfill === true, events };
}

function parseItems(value: unknown): PlanItem[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const raw = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>;
    const text = str(raw.text);
    return text === undefined ? [] : [{ text, status: PLAN_STATUSES.includes(raw.status as PlanStatus) ? (raw.status as PlanStatus) : 'pending' }];
  });
}

function withTurn(state: StreamState, id: string, now: number | undefined, change: (turn: Turn) => Turn): StreamState {
  const index = state.turns.findIndex((turn) => turn.id === id);
  if (index < 0) return { ...state, turns: [...state.turns, change({ id, blocks: [], status: 'running', ...(now !== undefined ? { startedAt: now } : {}) })] };
  const turns = state.turns.slice();
  turns[index] = change(turns[index]);
  return { ...state, turns };
}

function upsert(blocks: Block[], block: Block, merge?: (old: Block) => Block): Block[] {
  const index = blocks.findIndex((old) => old.kind === block.kind && old.id === block.id);
  if (index < 0) return [...blocks, block];
  const next = blocks.slice();
  next[index] = merge ? merge(blocks[index]) : block;
  return next;
}

export function applyEvent(state: StreamState, event: Record<string, unknown>, now?: number): StreamState {
  const type = str(event.type);
  const turn = key(event.turn);
  const id = key(event.id);
  const append = event.append === true;
  if (type === 'live') return { ...state, live: true };
  if (type === 'ended') return { ...state, ended: event.reason === 'agent-closed' ? 'agent-closed' : 'pane-closed' };
  if (type === 'session') return { ...EMPTY_STREAM };
  if (turn === undefined) return state;

  if (type === 'turn.started') return withTurn(state, turn, now, (t) => ({ ...t, status: 'running', ...(now !== undefined ? { startedAt: now } : {}) }));
  if (type === 'turn.ended') {
    const status: TurnStatus = event.status === 'interrupted' || event.status === 'failed' ? event.status : 'done';
    return withTurn(state, turn, undefined, (t) => ({ ...t, status }));
  }
  if (id === undefined) return state;

  if (type === 'prompt') {
    const text = str(event.text) ?? '';
    return withTurn(state, turn, now, (t) => ({ ...t, prompt: { id, text: append ? (t.prompt?.text ?? '') + text : text } }));
  }
  if (type === 'text') {
    const text = str(event.text) ?? '';
    return withTurn(state, turn, now, (t) => ({
      ...t,
      blocks: upsert(t.blocks, { kind: 'text', id, text }, (old) => ({ kind: 'text', id, text: append && old.kind === 'text' ? old.text + text : text })),
    }));
  }
  if (type === 'tool') {
    const input = str(event.input);
    const fresh: Block = {
      kind: 'tool',
      id,
      tool: TOOLS.includes(event.kind as ToolKind) ? (event.kind as ToolKind) : 'other',
      name: str(event.name) ?? '',
      ...(str(event.target) ? { target: str(event.target) } : {}),
      ...(input !== undefined ? { input } : {}),
    };
    return withTurn(state, turn, now, (t) => ({
      ...t,
      blocks: upsert(t.blocks, fresh, (old) => (old.kind !== 'tool' ? fresh : append ? { ...old, input: (old.input ?? '') + (input ?? '') } : { ...fresh, ...(old.output !== undefined ? { output: old.output } : {}), ...(old.exitCode !== undefined ? { exitCode: old.exitCode } : {}), ...(old.isError ? { isError: true } : {}) })),
    }));
  }
  if (type === 'tool.result') {
    const output = str(event.output) ?? '';
    const exitCode = typeof event.exitCode === 'number' && Number.isInteger(event.exitCode) ? event.exitCode : undefined;
    const result = { ...(exitCode !== undefined ? { exitCode } : {}), ...(event.isError === true ? { isError: true } : {}) };
    return withTurn(state, turn, now, (t) => ({
      ...t,
      blocks: upsert(t.blocks, { kind: 'tool', id, tool: 'other', name: '', output, ...result }, (old) =>
        old.kind !== 'tool' ? old : { ...old, output: append ? (old.output ?? '') + output : output, ...result },
      ),
    }));
  }
  if (type === 'edit') {
    const diff = str(event.diff) ?? '';
    const path = str(event.path) ?? '';
    const change = CHANGES.includes(event.change as EditChange) ? (event.change as EditChange) : 'update';
    return withTurn(state, turn, now, (t) => ({
      ...t,
      blocks: upsert(t.blocks, { kind: 'edit', id, path, change, diff }, (old) => (old.kind === 'edit' && append ? { ...old, diff: old.diff + diff } : { kind: 'edit', id, path, change, diff })),
    }));
  }
  if (type === 'plan') {
    const items = parseItems(event.items);
    return withTurn(state, turn, now, (t) => ({
      ...t,
      blocks: upsert(t.blocks, { kind: 'plan', id, items }, (old) => (old.kind === 'plan' && append ? { ...old, items: [...old.items, ...items] } : { kind: 'plan', id, items })),
    }));
  }
  return state;
}

export function applyFrame(state: StreamState, frame: StreamFrame, now: number): StreamState {
  const next = frame.events.reduce((current, event) => applyEvent(current, event, frame.backfill ? undefined : now), state);
  return next.turns.length > MAX_TURNS ? { ...next, turns: next.turns.slice(-MAX_TURNS) } : next;
}

export function clipHead(text: string, max = MAX_SHOWN_CHARS): { text: string; hidden: number } {
  return text.length <= max ? { text, hidden: 0 } : { text: text.slice(0, max), hidden: text.length - max };
}

export function clipTail(text: string, max = MAX_SHOWN_CHARS): { text: string; hidden: number } {
  if (text.length <= max) return { text, hidden: 0 };
  const cut = text.length - max;
  const newline = text.indexOf('\n', cut);
  const start = newline >= 0 && newline - cut < 200 ? newline + 1 : cut;
  return { text: text.slice(start), hidden: start };
}

export function visibleBlocks(turn: Turn): Block[] {
  const edits = turn.blocks.filter((block) => block.kind === 'edit');
  return turn.blocks.filter((block) => {
    if (block.kind !== 'tool' || block.tool !== 'edit') return true;
    return !edits.some((edit) => edit.id === block.id || (!!block.target && edit.path === block.target));
  });
}

export function turnRunning(state: StreamState): boolean {
  const last = state.turns[state.turns.length - 1];
  return !state.ended && last?.status === 'running';
}

const VERBS: Record<ToolKind, string> = {
  edit: 'Edited',
  command: 'Ran',
  search: 'Searched',
  read: 'Read',
  subagent: 'Asked',
  web: 'Looked up',
  other: 'Used',
};

export function toolVerb(tool: ToolKind): string {
  return VERBS[tool];
}

export function toolTarget(block: Extract<Block, { kind: 'tool' }>): string {
  return block.target ?? block.name;
}

export function toolFailed(block: Extract<Block, { kind: 'tool' }>): boolean {
  return block.isError === true || (block.tool === 'command' && block.exitCode !== undefined && block.exitCode !== 0);
}

export function planDone(items: PlanItem[]): string {
  return `Plan · ${items.filter((item) => item.status === 'done').length} of ${items.length} done`;
}

export interface DiffLine {
  kind: 'add' | 'del' | 'ctx' | 'hunk';
  text: string;
  line?: number;
}

const GIT_HEADER = /^(diff --git |index |--- |\+\+\+ |new file mode|deleted file mode|old mode|new mode|similarity index|rename |copy |Binary files )/;

export function parseDiff(diff: string, change: EditChange = 'update', maxRows = MAX_DIFF_LINES): { lines: DiffLine[]; added: number; removed: number; hidden: number } {
  const rows = diff.split('\n');
  if (rows[rows.length - 1] === '') rows.pop();
  const lines: DiffLine[] = [];
  let added = 0;
  let removed = 0;
  let total = 0;
  const push = (line: DiffLine) => {
    total++;
    if (lines.length < maxRows) lines.push(line);
  };

  if (!rows.some((row) => row.startsWith('@@ ')) && change !== 'update') {
    const kind = change === 'add' ? 'add' : 'del';
    rows.forEach((row, index) => {
      if (kind === 'add') added++;
      else removed++;
      push({ kind, text: row, line: index + 1 });
    });
    return { lines, added, removed, hidden: total - lines.length };
  }

  let inHunk = false;
  let oldLine = 0;
  let newLine = 0;
  for (const row of rows) {
    const hunk = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(row);
    if (hunk) {
      inHunk = true;
      oldLine = Number(hunk[1]);
      newLine = Number(hunk[2]);
      push({ kind: 'hunk', text: row });
    } else if (!inHunk && GIT_HEADER.test(row)) continue;
    else if (row.startsWith('+')) {
      added++;
      push({ kind: 'add', text: row.slice(1), line: newLine++ });
    } else if (row.startsWith('-')) {
      removed++;
      push({ kind: 'del', text: row.slice(1), line: oldLine++ });
    } else if (row.startsWith('\\')) continue;
    else {
      push({ kind: 'ctx', text: row.startsWith(' ') ? row.slice(1) : row, line: newLine });
      oldLine++;
      newLine++;
    }
  }
  return { lines, added, removed, hidden: total - lines.length };
}

export function workingFor(startedAt: number | undefined, now: number): string {
  if (startedAt === undefined) return 'Working';
  const seconds = Math.max(0, Math.floor((now - startedAt) / 1000));
  if (seconds < 60) return `Working · ${seconds} s`;
  return `Working · ${Math.floor(seconds / 60)} min ${seconds % 60} s`;
}
