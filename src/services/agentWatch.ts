import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { startAgentWatch, stopAgentWatch } from 'agent-watch';
import { actionFor, AgentAlert, alertForAsk, alertsFromChange, tapTarget, watchState } from '../model/agentAlerts';
import type { Ask } from '../model/asks';
import type { Pane, Session } from '../model/workspaces';
import { getAlertPrefs, onAlertPrefs } from './alertPrefsStore';
import { answerAsk, onAsks } from './askStore';
import { OstiaRpc } from './rpc';
import { onWorkspaces } from './workspaceStore';

type OpenTerminal = (target: ReturnType<typeof tapTarget>) => void;

const CHANNEL = 'agents';
let started = false;
let panes: Pane[] = [];
let sessions: Session[] = [];
let shownAsks = new Set<string>();
let latestAsks: Ask[] = [];
let running = false;

async function post(alert: AgentAlert) {
  if (alert.actions.length > 0) {
    await Notifications.setNotificationCategoryAsync(
      alert.id,
      alert.actions.map((action) => ({
        identifier: action.id,
        buttonTitle: action.label,
        textInput: action.reply ? { submitButtonTitle: 'Send', placeholder: 'Reply' } : undefined,
        options: { opensAppToForeground: action.unlock, isAuthenticationRequired: action.unlock },
      })),
    );
  }
  await Notifications.scheduleNotificationAsync({
    identifier: alert.id,
    content: {
      title: alert.title,
      body: alert.body,
      data: { paneId: alert.paneId, paneTitle: alert.paneTitle, askId: alert.askId ?? null },
      categoryIdentifier: alert.actions.length > 0 ? alert.id : undefined,
    },
    trigger: Platform.OS === 'android' ? { channelId: CHANNEL } : null,
  });
}

function updateService() {
  const pairing = OstiaRpc.getPairing();
  const state = watchState(panes, getAlertPrefs(), Platform.OS, pairing?.desktopName ?? 'the desktop');
  if (state.run) startAgentWatch(state.text);
  else if (running) stopAgentWatch();
  running = state.run;
}

export function startAgentAlerts(openTerminal: OpenTerminal): void {
  if (started) return;
  started = true;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
  });
  if (Platform.OS === 'android') {
    void Notifications.setNotificationChannelAsync(CHANNEL, { name: 'Agents', importance: Notifications.AndroidImportance.HIGH });
  }
  onWorkspaces((snapshot) => {
    const alerts = alertsFromChange(panes, snapshot.panes, snapshot.sessions, getAlertPrefs());
    panes = snapshot.panes;
    sessions = snapshot.sessions;
    alerts.filter((alert) => !latestAsks.some((ask) => ask.paneId === alert.paneId)).forEach((alert) => void post(alert));
    updateService();
  });
  onAsks((asks) => {
    latestAsks = asks;
    const open = new Set(asks.map((ask) => ask.askId));
    for (const id of shownAsks) if (!open.has(id)) void Notifications.dismissNotificationAsync(`ask:${id}`);
    if (getAlertPrefs().waiting) {
      asks.filter((ask) => !shownAsks.has(ask.askId)).forEach((ask) => {
        void Notifications.dismissNotificationAsync(`${ask.paneId}:waiting`);
        void post(alertForAsk(ask, sessions));
      });
    }
    shownAsks = open;
  });
  onAlertPrefs(updateService);
  Notifications.addNotificationResponseReceivedListener((response) => {
    const { identifier, content } = response.notification.request;
    const data = content.data as { paneId: string; paneTitle: string; askId: string | null };
    if (response.actionIdentifier === Notifications.DEFAULT_ACTION_IDENTIFIER || !data.askId) {
      openTerminal(tapTarget(data));
      return;
    }
    const result = actionFor(data.askId, response.actionIdentifier, response.userText, latestAsks);
    if (result.answer) void answerAsk(result.answer.askId, result.answer);
    if (result.dismiss) void Notifications.dismissNotificationAsync(identifier);
  });
}
