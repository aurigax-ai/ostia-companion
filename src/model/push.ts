import { bytesToHex } from '@noble/hashes/utils.js';
import { sha256 } from '@noble/hashes/sha2.js';

export type PushPlatform = 'fcm' | 'apns';

export type PushState = 'off' | 'registering' | 'on' | 'unavailable' | 'refused' | 'busy' | 'notAllowed' | 'waiting';

export interface PushStatus {
  server: string | null;
  state: PushState;
}

export interface PushConfig {
  server: string;
  registered?: boolean;
}

export interface StoredPush {
  server: string;
  handle: string;
  tokenHash: string;
}

export const PUSH_OFF: PushStatus = { server: null, state: 'off' };

export function parsePushServer(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.origin : null;
  } catch {
    return null;
  }
}

export function parsePushConfig(push: unknown): PushConfig | null {
  const { server, registered } = (push ?? {}) as { server?: unknown; registered?: unknown };
  const origin = parsePushServer(server);
  if (!origin) return null;
  return typeof registered === 'boolean' ? { server: origin, registered } : { server: origin };
}

export function platformFor(tokenType: unknown): PushPlatform | null {
  if (tokenType === 'android') return 'fcm';
  if (tokenType === 'ios') return 'apns';
  return null;
}

export function hashToken(token: string): string {
  return bytesToHex(sha256(new TextEncoder().encode(token)));
}

export function needsRegistration(stored: StoredPush | undefined, config: PushConfig, tokenHash: string): boolean {
  return !stored || stored.server !== config.server || stored.tokenHash !== tokenHash || config.registered === false;
}

const LINES: Record<PushState, string> = {
  off: 'Off',
  registering: 'Setting up',
  waiting: 'Setting up',
  on: 'On',
  unavailable: 'Unavailable (build)',
  refused: 'Refused by the server',
  busy: 'Server is full',
  notAllowed: 'Off: notifications not allowed',
};

export function pushLine(status: PushStatus): string {
  return status.server || status.state === 'notAllowed' ? LINES[status.state] : LINES.off;
}

const BACKOFF_START_MS = 30_000;
const BACKOFF_MAX_MS = 600_000;

export function nextBackoff(previousMs: number): number {
  return previousMs === 0 ? BACKOFF_START_MS : Math.min(previousMs * 2, BACKOFF_MAX_MS);
}

export function retryDelay(previousMs: number, retryAfterMs: number | null): number {
  return retryAfterMs === null ? nextBackoff(previousMs) : Math.min(retryAfterMs, BACKOFF_MAX_MS);
}

export function parseRetryAfter(header: string | null | undefined): number | null {
  if (!header || !/^\d+$/.test(header.trim())) return null;
  return Number(header.trim()) * 1000;
}

export type RegisterOutcome = { handle: string } | { retryAfterMs: number | null } | 'ticket' | 'busy' | 'rejected';

export function sameOrigin(responseUrl: unknown, server: string): boolean {
  if (typeof responseUrl !== 'string' || responseUrl === '') return true;
  try {
    return new URL(responseUrl).origin === new URL(server).origin;
  } catch {
    return false;
  }
}

export function registerOutcome(status: number, body: unknown, retryAfter?: string | null): RegisterOutcome {
  if (status === 201 && typeof (body as { handle?: unknown } | null)?.handle === 'string') {
    return { handle: (body as { handle: string }).handle };
  }
  if (status === 403) return 'ticket';
  if (status === 503) return 'busy';
  if (status === 429 || status >= 500) return { retryAfterMs: parseRetryAfter(retryAfter) };
  return 'rejected';
}
