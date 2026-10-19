export const SESSION_LIMITS = [5, 15, 30] as const;
export type SessionLimit = (typeof SESSION_LIMITS)[number];
export const DEFAULT_LIMIT: SessionLimit = 15;

export function isActive(state: string): boolean {
  return state === 'starting' || state === 'running' || state === 'paused';
}

export function timeLeft(endsAt: number, now: number): string {
  const seconds = Math.max(0, Math.ceil((endsAt - now) / 1000));
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, '0')} left`;
}

const PAUSED: Record<string, string> = {
  'human-touch': 'Paused because you touched the screen',
  'screen-off': 'Paused because the screen went off',
  confirm: 'Waiting for your answer',
};

export function pausedText(reason: string | null): string {
  return (reason && PAUSED[reason]) || 'Paused';
}

const STOPPED: Record<string, string> = {
  'stop-phone': 'You stopped the session.',
  'stop-desktop': 'The desktop stopped the session.',
  'time-limit': 'The time limit ended the session.',
  'projection-ended': 'Android stopped the screen capture.',
  'link-closed': 'The connection to the desktop closed.',
  revoked: 'This phone was removed on the desktop.',
  unreachable: 'Could not reach the desktop.',
  unauthenticated: 'The desktop no longer accepts this phone.',
  'desktop-too-old': 'Update Ostia on the desktop to share this phone.',
  'no-controller': 'Install the screens extension on the desktop to share this phone.',
  'unknown-session': 'That workspace is closed on the desktop.',
  busy: 'This phone is already shared with the desktop.',
  'service-off': 'Ostia phone control was turned off in Android settings.',
};

export function stoppedText(reason: string | null): string {
  return (reason && STOPPED[reason]) || 'The session ended.';
}

export type StartFailure = 'lock-needed' | 'not-verified' | 'notifications-needed' | 'cancelled' | 'not-paired' | 'not-started';

const FAILURES: Record<StartFailure, string> = {
  'lock-needed': 'Set a screen lock on this phone first. Sharing needs your fingerprint or PIN.',
  'not-verified': 'Not started: your fingerprint or PIN was not confirmed.',
  'notifications-needed': 'Allow notifications for Ostia first. Stop lives in the notification for the whole session.',
  cancelled: 'Not started. Nothing was sent to the desktop.',
  'not-paired': 'Pair with a desktop first.',
  'not-started': 'The session could not start.',
};

export function failureText(failure: StartFailure): string {
  return FAILURES[failure];
}
