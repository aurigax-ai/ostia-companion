import type { ConnectionStatus } from './rpc';
import { isTailnetAddress } from './tailscale';

export type ConnectionAction = 'open-tailscale' | 'retry' | 'pair-again';

export interface ConnectionNotice {
  text: string;
  actions: ConnectionAction[];
}

export function connectionNotice(status: ConnectionStatus, host: string, desktop = 'the desktop'): ConnectionNotice | null {
  if (status === 'connected' || status === 'connecting') return null;
  if (status === 'revoked') {
    return { text: `${desktop} removed this phone. Pair again to reconnect.`, actions: ['pair-again'] };
  }
  if (isTailnetAddress(host)) {
    return {
      text: `Can't reach ${desktop} at ${host}. Is Tailscale on and signed in to the same account?`,
      actions: ['open-tailscale', 'retry'],
    };
  }
  return {
    text: `Can't reach ${desktop} at ${host}. This phone needs to be on a network that reaches it.`,
    actions: ['retry', 'pair-again'],
  };
}
