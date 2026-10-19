import { useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import * as Notifications from 'expo-notifications';
import { decideRequest, Level } from '../model/phoneControlPrefs';
import { failureText, isActive, SessionLimit } from '../model/phoneSession';
import { DeclineReason, parseScreenRequest, REQUEST_TIMEOUT_MS, ScreenRequest } from '../model/screenRequest';
import type { Session } from '../model/workspaces';
import { getPhoneControl } from './phoneControlStore';
import { accessibilityEnabled, currentPhoneSession, phoneControlSupported, startPhoneSession } from './phoneSession';
import { OstiaRpc } from './rpc';
import { showSnackbar } from './snackbar';
import { onWorkspaces } from './workspaceStore';

const ASK = 'screen-request';
const ALLOWED = 'screen-request-allowed';
const NOTIFICATION = 'screen-request';

export interface PendingRequest extends ScreenRequest {
  skipSheet: boolean;
}

let pending: PendingRequest | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let started = false;
const listeners = new Set<() => void>();

function decline(request: ScreenRequest, reason: DeclineReason) {
  if (request.requestId) OstiaRpc.call('screen.decline', { requestId: request.requestId, reason }).catch(() => {});
}

function publish(next: PendingRequest | null) {
  pending = next;
  if (timer) clearTimeout(timer);
  timer = next ? setTimeout(() => denyRequest(), REQUEST_TIMEOUT_MS) : null;
  if (!next) void Notifications.dismissNotificationAsync(NOTIFICATION);
  listeners.forEach((listener) => listener());
}

function notify(request: PendingRequest) {
  const agent = request.agent ?? 'An agent';
  void Notifications.scheduleNotificationAsync({
    identifier: NOTIFICATION,
    content: request.skipSheet
      ? {
          title: `${agent} in ${request.workspace} will use this phone`,
          body: 'It starts when you open Ostia and share the screen. Stop to decline.',
          categoryIdentifier: ALLOWED,
          data: { kind: ALLOWED },
        }
      : {
          title: request.title,
          body: request.reason ?? `For ${request.workspace}`,
          categoryIdentifier: ASK,
          data: { kind: ASK },
        },
    trigger: { channelId: 'agents' },
  });
}

export function receiveRequest(payload: unknown, sessions: Session[]): void {
  const request = parseScreenRequest(payload, sessions);
  if (!request) return;
  if (isActive(currentPhoneSession().state)) return decline(request, 'busy');
  const decision = decideRequest(getPhoneControl(), request.sessionId, phoneControlSupported());
  if (decision === 'off' || decision === 'unsupported') return decline(request, decision);
  if (pending) decline(pending, 'busy');
  const next = { ...request, skipSheet: decision === 'allow' && accessibilityEnabled() };
  publish(next);
  if (AppState.currentState !== 'active') notify(next);
  else if (next.skipSheet) void allowRequest(defaults());
}

function defaults(): { level: Level; limit: SessionLimit } {
  const { level, limit } = getPhoneControl();
  return { level, limit };
}

export function denyRequest(): void {
  if (pending) decline(pending, 'denied');
  publish(null);
}

export async function allowRequest(choice: { level: Level; limit: SessionLimit }): Promise<void> {
  const request = pending;
  if (!request) return;
  publish(null);
  const failure = await startPhoneSession(request.sessionId, request.workspace, {
    ...choice,
    fingerprint: getPhoneControl().fingerprint,
    agent: request.agent,
    requestId: request.requestId,
  });
  if (!failure) return;
  decline(request, 'denied');
  showSnackbar(failureText(failure));
}

export function startScreenRequests(): void {
  if (started) return;
  started = true;
  let sessions: Session[] = [];
  onWorkspaces((snapshot) => (sessions = snapshot.sessions));
  void Notifications.setNotificationCategoryAsync(ASK, [
    { identifier: 'deny', buttonTitle: 'Deny', options: { opensAppToForeground: false } },
    { identifier: 'open', buttonTitle: 'Review', options: { opensAppToForeground: true } },
  ]);
  void Notifications.setNotificationCategoryAsync(ALLOWED, [
    { identifier: 'deny', buttonTitle: 'Stop', options: { opensAppToForeground: false } },
    { identifier: 'open', buttonTitle: 'Open', options: { opensAppToForeground: true } },
  ]);
  OstiaRpc.addEventListener((type, payload) => {
    if (type === 'screen.requested') receiveRequest(payload, sessions);
  });
  AppState.addEventListener('change', (state) => {
    if (state === 'active' && pending?.skipSheet) void allowRequest(defaults());
  });
  Notifications.addNotificationResponseReceivedListener((response) => {
    const kind = (response.notification.request.content.data as { kind?: string })?.kind;
    if ((kind === ASK || kind === ALLOWED) && response.actionIdentifier === 'deny') denyRequest();
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
