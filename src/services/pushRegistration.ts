import { useSyncExternalStore } from 'react';
import * as Notifications from 'expo-notifications';
import {
  hashToken,
  needsRegistration,
  platformFor,
  PUSH_OFF,
  PushStatus,
  registerOutcome,
  RegisterOutcome,
  sameOrigin,
  retryDelay,
} from '../model/push';
import { OstiaRpc } from './rpc';
import { loadDesktops, savePush } from './storage';

const PUSH_OFF_MESSAGE = 'push-off';
const NEEDS_ELEVATION_MESSAGE = 'needs-elevation';
const TICKET_ATTEMPTS = 2;

let status: PushStatus = PUSH_OFF;
let started = false;
let generation = 0;
let backoffMs = 0;
let lastSeenTokenHash: string | null = null;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();

function setStatus(next: PushStatus) {
  status = next;
  listeners.forEach((listener) => listener());
}

function clearRetry() {
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = null;
}

async function storedPush(deviceId: string) {
  return (await loadDesktops()).desktops.find((desktop) => desktop.deviceId === deviceId)?.push;
}

function scheduleRetry(server: string, retryAfterMs: number | null = null) {
  backoffMs = retryDelay(backoffMs, retryAfterMs);
  setStatus({ server, state: 'waiting' });
  retryTimer = setTimeout(() => void sync(), backoffMs);
}

function stopState(server: string, err: any): PushStatus | null {
  if (err?.message === PUSH_OFF_MESSAGE) return PUSH_OFF;
  if (err?.message === NEEDS_ELEVATION_MESSAGE) return { server, state: 'notAllowed' };
  return null;
}

async function postRegistration(server: string, platform: string, token: string, ticket: string): Promise<RegisterOutcome> {
  try {
    const response = await fetch(`${server}/v1/push/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ platform, token, ticket }),
    });
    if (!sameOrigin(response.url, server)) return 'rejected';
    const body = await response.json().catch(() => null);
    return registerOutcome(response.status, body, response.headers?.get?.('retry-after'));
  } catch {
    return { retryAfterMs: null };
  }
}

async function sync(): Promise<void> {
  const run = ++generation;
  clearRetry();
  const pairing = OstiaRpc.getPairing();
  if (!pairing || OstiaRpc.getStatus() !== 'connected') return;
  const config = OstiaRpc.getPush();
  const stored = await storedPush(pairing.deviceId);
  if (run !== generation) return;
  if (!config) {
    setStatus(PUSH_OFF);
    backoffMs = 0;
    if (stored) await savePush(pairing.deviceId, undefined);
    return;
  }
  const { server } = config;
  if (!OstiaRpc.hasCap('notify')) return setStatus({ server, state: 'notAllowed' });
  setStatus({ server, state: 'registering' });
  let token: Notifications.DevicePushToken;
  try {
    token = await Notifications.getDevicePushTokenAsync();
  } catch {
    if (run === generation) setStatus({ server, state: 'unavailable' });
    return;
  }
  const platform = platformFor(token.type);
  if (!platform || typeof token.data !== 'string') {
    if (run === generation) setStatus({ server, state: 'unavailable' });
    return;
  }
  const tokenHash = hashToken(token.data);
  lastSeenTokenHash = tokenHash;
  if (run !== generation) return;
  if (!needsRegistration(stored, config, tokenHash)) return setStatus({ server, state: 'on' });
  let outcome: RegisterOutcome = 'ticket';
  for (let attempt = 0; attempt < TICKET_ATTEMPTS && outcome === 'ticket'; attempt++) {
    let ticket: string;
    try {
      ticket = (await OstiaRpc.call('push.ticket', {})).ticket;
    } catch (err: any) {
      if (run !== generation) return;
      const stop = stopState(server, err);
      if (stop) return setStatus(stop);
      return scheduleRetry(server);
    }
    outcome = await postRegistration(server, platform, token.data, ticket);
    if (run !== generation) return;
  }
  if (outcome === 'busy') return setStatus({ server, state: 'busy' });
  if (outcome === 'ticket' || outcome === 'rejected') return setStatus({ server, state: 'refused' });
  if ('retryAfterMs' in outcome) return scheduleRetry(server, outcome.retryAfterMs);
  try {
    await OstiaRpc.call('push.register', { handle: outcome.handle, platform });
  } catch (err: any) {
    if (run !== generation) return;
    const stop = stopState(server, err);
    if (stop) return setStatus(stop);
    return scheduleRetry(server);
  }
  if (run !== generation) return;
  await savePush(pairing.deviceId, { server, handle: outcome.handle, tokenHash });
  backoffMs = 0;
  setStatus({ server, state: 'on' });
}

export async function unregisterPush(deviceId: string): Promise<void> {
  const pairing = OstiaRpc.getPairing();
  if (pairing?.deviceId !== deviceId || OstiaRpc.getStatus() !== 'connected' || !OstiaRpc.getPush()) return;
  await OstiaRpc.call('push.unregister', {}).catch(() => {});
}

export async function forgetPush(deviceId: string): Promise<void> {
  await unregisterPush(deviceId);
  if (await storedPush(deviceId)) await savePush(deviceId, undefined);
}

export function startPushRegistration(): void {
  if (started) return;
  started = true;
  OstiaRpc.addStatusListener((next) => {
    if (next === 'connected') void sync();
    else if (next === 'revoked') {
      generation++;
      clearRetry();
      setStatus(PUSH_OFF);
    }
  });
  OstiaRpc.addPushListener(() => {
    if (OstiaRpc.getStatus() === 'connected') void sync();
    else resetPushRegistration();
  });
  OstiaRpc.addCapsListener(() => {
    if (OstiaRpc.getStatus() === 'connected') void sync();
  });
  Notifications.addPushTokenListener((token) => {
    if (typeof token?.data === 'string' && hashToken(token.data) === lastSeenTokenHash) return;
    void sync();
  });
}

export function resetPushRegistration(): void {
  generation++;
  lastSeenTokenHash = null;
  clearRetry();
  backoffMs = 0;
  setStatus(PUSH_OFF);
}

export function getPushStatus(): PushStatus {
  return status;
}

export function usePushStatus(): PushStatus {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => status,
  );
}

