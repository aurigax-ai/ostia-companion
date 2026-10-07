import { needsYou, InboxItem, Pane, Session } from './workspaces';

export type AskKind = 'permission' | 'question' | 'approval';

export interface AskChoice {
  id: string;
  label: string;
  tone: 'approve' | 'deny' | 'neutral';
}

export interface Ask {
  askId: string;
  sessionId: string;
  paneId: string;
  kind: AskKind;
  agent?: string;
  title: string;
  detail?: string;
  choices: AskChoice[];
  allowText: boolean;
  since: number;
}

export type NeedsYouItem = { kind: 'ask'; ask: Ask } | { kind: 'agent'; item: InboxItem };

const PREVIEW_LINES = 6;

export function needsYouItems(asks: Ask[], sessions: Session[], panes: Pane[]): NeedsYouItem[] {
  const asked = new Set(asks.map((ask) => ask.paneId));
  const sorted = [...asks].sort((a, b) => a.since - b.since);
  return [
    ...sorted.map((ask) => ({ kind: 'ask' as const, ask })),
    ...needsYou(sessions, panes)
      .filter((item) => !asked.has(item.pane.paneId))
      .map((item) => ({ kind: 'agent' as const, item })),
  ];
}

export function detailPreview(detail: string): { text: string; more: boolean } {
  const lines = detail.split('\n');
  return { text: lines.slice(0, PREVIEW_LINES).join('\n'), more: lines.length > PREVIEW_LINES };
}

export function waitedFor(since: number, now: number): string {
  const minutes = Math.floor((now - since) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h`;
}

const DESTRUCTIVE = /\brm\s+-[a-z]*r|--force\b|\bpush\b.*\s-f\b|reset\s+--hard|\b(drop|truncate)\s+(table|database|schema)\b|\bsudo\b|\bmkfs|\bdd\s+.*of=/i;

export function needsConfirm(ask: Ask, choice: AskChoice): boolean {
  if (choice.tone === 'deny') return false;
  if (/always/i.test(choice.id) || /always/i.test(choice.label)) return true;
  return choice.tone === 'approve' && DESTRUCTIVE.test(`${ask.title}\n${ask.detail ?? ''}`);
}
