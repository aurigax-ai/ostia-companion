import { useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import * as Notifications from 'expo-notifications';
import { decideRequest, Level } from '../model/phoneControlPrefs';
import { failureText, isActive, SessionLimit } from '../model/phoneSession';
import { parseScreenRequest, REQUEST_TIMEOUT_MS, ScreenRequest } from '../model/screenRequest';
import type { Session } from '../model/workspaces';
import { getPhoneControl } from './phoneControlStore';
import { currentPhoneSession, phoneControlSupported, startPhoneSession } from './phoneSession';
import { OstiaRpc } from './rpc';
import { showSnackbar } from './snackbar';
import { onWorkspaces } from './workspaceStore';

const CATEGORY = 'screen-request';
const NOTIFICATION = 'screen-request';

export interface PendingRequest extends ScreenRequest {
  skipSheet: boolean;
}

let pending: PendingRequest | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let started = false;
const listeners = new Set<() => void>();

function publish(next: PendingRequest | null) {
  pending = next;
  if (timer) clearTimeout(timer);
  timer = next ? setTimeout(() => publish(null), REQUEST_TIMEOUT_MS) : null;
  if (!next) void Notifications.dismissNotificationAsync(NOTIFICATION);
  listeners.forEach((listener) => listener());
}

function notify(request: ScreenRequest) {
  void Notifications.scheduleNotificationAsync({
    identifier: NOTIFICATION,
    content: {
      title: request.title,
      body: request.reason ? `${request.workspace} · ${request.reason}` : request.workspace,
      categoryIdentifier: CATEGORY,
      data: { kind: CATEGORY },
    },
    trigger: { channelId: 'agents' },
  });
}

export function receiveRequest(payload: unknown, sessions: Session[]): void {
  const request = parseScreenRequest(payload, sessions, OstiaRpc.getPairing()?.desktopName || 'Your desktop');
  if (!request || isActive(currentPhoneSession().state)) return;
  const decision = decideRequest(getPhoneControl(), request.sessionId, phoneControlSupported());
  if (decision === 'off' || decision === 'unsupported') return;
  publish({ ...request, skipSheet: decision === 'allow' });
  if (AppState.currentState !== 'active') notify(request);
}

export function denyRequest(): void {
  publish(null);
}

export async function allowRequest(choice: { level: Level; limit: SessionLimit }): Promise<void> {
  const request = pending;
  if (!request) return;
  publish(null);
  const failure = await startPhoneSession(request.sessionId, request.workspace, { ...choice, fingerprint: getPhoneControl().fingerprint });
  if (failure) showSnackbar(failureText(failure));
}

export function startScreenRequests(): void {
  if (started) return;
  started = true;
  let sessions: Session[] = [];
  onWorkspaces((snapshot) => (sessions = snapshot.sessions));
  void Notifications.setNotificationCategoryAsync(CATEGORY, [
    { identifier: 'deny', buttonTitle: 'Deny', options: { opensAppToForeground: false } },
    { identifier: 'review', buttonTitle: 'Review', options: { opensAppToForeground: true } },
  ]);
  OstiaRpc.addEventListener((type, payload) => {
    if (type === 'screen.requested') receiveRequest(payload, sessions);
  });
  Notifications.addNotificationResponseReceivedListener((response) => {
    const data = response.notification.request.content.data as { kind?: string };
    if (data?.kind === CATEGORY && response.actionIdentifier === 'deny') denyRequest();
  });
}

export function usePendingRequest(): PendingRequest | null {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => pending,
  );
}
