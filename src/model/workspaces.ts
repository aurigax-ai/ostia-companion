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

export function paneSummary(panes: Pane[]): string {
  if (panes.length === 0) return 'No panes';
  const running = panes.filter((pane) => pane.running).length;
  if (running > 0) return `${running} running`;
  return panes.length === 1 ? '1 pane' : `${panes.length} panes`;
}

export function failedExit(pane: Pane): number | null {
  if (pane.running || pane.lastExitCode === undefined || pane.lastExitCode === 0) return null;
  return pane.lastExitCode;
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
  if (pane.kind !== 'terminal') return 'Open on the desktop';
  if (pane.cwd && pane.cwd !== workDir) return shortPath(pane.cwd);
  return pane.agent && pane.agent !== 'other' ? pane.agent : shortPath(pane.cwd);
}
