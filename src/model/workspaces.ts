export type SessionState = 'idle' | 'working' | 'waiting' | 'done' | 'error';
export type AgentState = 'working' | 'waiting' | 'done' | 'error';

export interface Session {
  sessionId: string;
  name: string;
  kind: string;
  workDir: string;
  state: SessionState;
}

export interface Pane {
  paneId: string;
  sessionId: string;
  kind: string;
  title: string;
  cwd?: string;
  running: boolean;
  blockCount: number;
  lastExitCode?: number;
  agent?: string;
  agentState?: AgentState;
  agentMessage?: string;
}

export interface PaneUpdate {
  paneId: string;
  cwd?: string;
  running?: boolean;
  blockCount?: number;
  lastExitCode?: number;
}

export interface InboxItem {
  pane: Pane;
  workspace: string;
  reason: string;
}

export function needsYou(sessions: Session[], panes: Pane[]): InboxItem[] {
  const names = new Map(sessions.map((session) => [session.sessionId, session.name]));
  return panes
    .filter((pane) => pane.agentState === 'waiting' || pane.agentState === 'error')
    .map((pane) => ({
      pane,
      workspace: names.get(pane.sessionId) ?? '',
      reason: pane.agentMessage || (pane.agentState === 'error' ? 'Stopped with an error' : 'Waiting for you'),
    }));
}

export function shortPath(path: string | undefined): string {
  if (!path) return '';
  const home = /^(\/home\/[^/]+|\/Users\/[^/]+|\/root)(?=\/|$)/.exec(path);
  return home ? `~${path.slice(home[0].length)}` : path;
}

export function failedExit(pane: Pane): number | null {
  if (pane.running || pane.lastExitCode === undefined || pane.lastExitCode === 0) return null;
  return pane.lastExitCode;
}

export type StatusKind = 'waiting' | 'error' | 'running' | 'done' | 'idle';

export interface Status {
  kind: StatusKind;
  tone: 'attn' | 'brand' | 'ok' | 'muted';
  text: string;
}

const WAITING: Status = { kind: 'waiting', tone: 'attn', text: 'Waiting' };
const ERROR: Status = { kind: 'error', tone: 'attn', text: 'Error' };
const DONE: Status = { kind: 'done', tone: 'ok', text: 'Done' };

function exitStatus(code: number): Status {
  return { kind: 'error', tone: 'attn', text: `Exit ${code}` };
}

export function paneStatus(pane: Pane): Status {
  const exit = failedExit(pane);
  if (pane.agentState === 'waiting') return WAITING;
  if (pane.agentState === 'error') return ERROR;
  if (exit !== null) return exitStatus(exit);
  if (pane.running) return { kind: 'running', tone: 'brand', text: 'Running' };
  if (pane.agentState === 'done') return DONE;
  return { kind: 'idle', tone: 'muted', text: 'Idle' };
}

export function workspaceStatus(session: Session, panes: Pane[]): Status {
  const statuses = panes.map(paneStatus);
  if (session.state === 'waiting' || statuses.some((status) => status === WAITING)) return WAITING;
  const failed = statuses.find((status) => status.kind === 'error');
  if (failed) return failed;
  if (session.state === 'error') return ERROR;
  const running = statuses.filter((status) => status.kind === 'running').length;
  if (running > 0) return { kind: 'running', tone: 'brand', text: `${running} running` };
  if (session.state === 'done' || statuses.some((status) => status === DONE)) return DONE;
  const text = panes.length === 0 ? 'No panes' : panes.length === 1 ? '1 pane' : `${panes.length} panes`;
  return { kind: 'idle', tone: 'muted', text };
}

export interface PaneGroup {
  title: 'Terminals' | 'Desktop only';
  panes: Pane[];
}

export function groupPanes(panes: Pane[]): PaneGroup[] {
  const groups: PaneGroup[] = [
    { title: 'Terminals', panes: panes.filter((pane) => pane.kind === 'terminal') },
    { title: 'Desktop only', panes: panes.filter((pane) => pane.kind !== 'terminal') },
  ];
  return groups.filter((group) => group.panes.length > 0);
}

export function applyPaneUpdate(panes: Pane[], update: PaneUpdate): Pane[] {
  return panes.map((pane) => (pane.paneId === update.paneId ? { ...pane, ...update } : pane));
}

export function applySessionState(sessions: Session[], sessionId: string, state: SessionState): Session[] {
  return sessions.map((session) => (session.sessionId === sessionId ? { ...session, state } : session));
}

const STATUS_GLYPHS = /^[\u2800-\u28ff\u25d0-\u25d3\u2722-\u273d\u00b7]+\s*/;

export function paneTitle(pane: Pane): string {
  return pane.title.replace(STATUS_GLYPHS, '') || 'Terminal';
}

export function paneSubtitle(pane: Pane, workDir: string | undefined): string {
  if (pane.agentState === 'waiting' && pane.agentMessage) return pane.agentMessage;
  if (pane.cwd && pane.cwd !== workDir) return shortPath(pane.cwd);
  return pane.agent && pane.agent !== 'other' ? pane.agent : shortPath(pane.cwd);
}
