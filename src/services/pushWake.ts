import type { AgentAlert } from '../model/agentAlerts';
import type { AlertPrefs } from '../model/alertPrefs';
import { wakeAlerts } from '../model/pushWake';

export interface WakeDeps {
  connect(): Promise<{ release(): void } | null>;
  call(method: string): Promise<any>;
  presentedIds(): Promise<string[]>;
  raisedIds(): Promise<string[]>;
  prefs(): AlertPrefs;
  post(alert: AgentAlert): Promise<void>;
}

export async function runWake(deps: WakeDeps): Promise<number> {
  const connection = await deps.connect();
  if (!connection) return 0;
  try {
    const [asks, sessions, panes, presentedIds, raisedIds] = await Promise.all([
      deps.call('ask.list'),
      deps.call('session.list'),
      deps.call('pane.list'),
      deps.presentedIds(),
      deps.raisedIds(),
    ]);
    const alerts = wakeAlerts(
      asks.asks ?? [],
      panes.panes ?? [],
      sessions.sessions ?? [],
      deps.prefs(),
      presentedIds,
      raisedIds,
    );
    for (const alert of alerts) await deps.post(alert);
    return alerts.length;
  } finally {
    connection.release();
  }
}
