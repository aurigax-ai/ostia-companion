import type { AlertPrefs } from './alertPrefs';
import type { Ask } from './asks';
import { paneTitle, type Pane, type Session } from './workspaces';

export interface AlertAction {
  id: string;
  label: string;
  unlock: boolean;
  reply?: boolean;
}

export interface AgentAlert {
  id: string;
  paneId: string;
  paneTitle: string;
  askId?: string;
  title: string;
  body: string;
  actions: AlertAction[];
}

const MAX_CHOICES = 3;

const KIND: Record<string, { pref: keyof AlertPrefs; verb: string } | undefined> = {
  waiting: { pref: 'waiting', verb: 'needs you' },
  done: { pref: 'done', verb: 'finished' },
  error: { pref: 'failed', verb: 'failed' },
};

function who(pane: Pane, sessions: Session[]): string {
  const workspace = sessions.find((s) => s.sessionId === pane.sessionId)?.name;
  const agent = pane.agent && pane.agent !== 'other' ? pane.agent : paneTitle(pane);
  return workspace ? `${agent} in ${workspace}` : agent;
}

export function alertsFromChange(before: Pane[], after: Pane[], sessions: Session[], prefs: AlertPrefs): AgentAlert[] {
  const previous = new Map(before.map((pane) => [pane.paneId, pane.agentState]));
  return after.flatMap((pane) => {
    const kind = pane.agentState ? KIND[pane.agentState] : undefined;
    if (!kind || !prefs[kind.pref] || !previous.has(pane.paneId) || previous.get(pane.paneId) === pane.agentState) return [];
    return [{
      id: `${pane.paneId}:${pane.agentState}`,
      paneId: pane.paneId,
      paneTitle: paneTitle(pane),
      title: `${who(pane, sessions)} ${kind.verb}`,
      body: pane.agentMessage ?? '',
      actions: [],
    }];
  });
}

export function alertForAsk(ask: Ask, sessions: Session[]): AgentAlert {
  const workspace = sessions.find((s) => s.sessionId === ask.sessionId)?.name;
  const actions: AlertAction[] =
    ask.kind === 'question'
      ? ask.choices.slice(0, MAX_CHOICES).map((c) => ({ id: c.id, label: c.label, unlock: false }))
      : [
          ...ask.choices.filter((c) => c.tone === 'approve').slice(0, 1).map((c) => ({ id: c.id, label: 'Approve', unlock: true })),
          ...ask.choices.filter((c) => c.tone === 'deny').slice(0, 1).map((c) => ({ id: c.id, label: 'Deny', unlock: false })),
        ];
  if (ask.allowText) actions.push({ id: 'reply', label: 'Reply', unlock: false, reply: true });
  return {
    id: `ask:${ask.askId}`,
    paneId: ask.paneId,
    paneTitle: ask.agent ?? 'Terminal',
    askId: ask.askId,
    title: [ask.agent, workspace].filter(Boolean).join(' in ') || 'An agent',
    body: ask.title,
    actions,
  };
}

export function watchState(panes: Pane[], prefs: AlertPrefs, platform: string, desktop: string): { run: boolean; text: string } {
  const watching = panes.filter((pane) => pane.agentState === 'working' || pane.agentState === 'waiting').length;
  if (platform !== 'android' || watching === 0 || !(prefs.waiting || prefs.done || prefs.failed)) return { run: false, text: '' };
  return { run: true, text: `Watching ${watching} ${watching === 1 ? 'agent' : 'agents'} on ${desktop}` };
}

export function tapTarget(alert: { paneId: string; paneTitle: string }) {
  return { screen: 'Terminal' as const, params: { paneId: alert.paneId, title: alert.paneTitle } };
}

export function actionFor(askId: string, actionId: string, text: string | undefined, asks: Ask[]) {
  const ask = asks.find((a) => a.askId === askId);
  if (!ask) return { answer: null, dismiss: true };
  if (actionId === 'reply') return { answer: text ? { askId, text } : null, dismiss: !!text };
  return { answer: { askId, choiceId: actionId }, dismiss: true };
}
