import type { ConnectionStatus } from './rpc';
import { isTailnetAddress } from './tailscale';

export type ConnectionAction = 'pair-again' | 'open-tailscale';

export interface ConnectionNotice {
  text: string;
  actions: ConnectionAction[];
}

export function connectionNotice(status: ConnectionStatus, host: string): ConnectionNotice | null {
  if (status === 'connected' || status === 'revoked') return null;
  if (status === 'connecting') {
    return { text: `Connecting to the desktop at ${host}…`, actions: [] };
  }
  if (isTailnetAddress(host)) {
    return {
      text: `Cannot reach the desktop at ${host}. Open Tailscale on this phone and sign in to the same tailnet, or pair again.`,
      actions: ['open-tailscale', 'pair-again'],
    };
  }
  return {
    text: `Cannot reach the desktop at ${host}. Desktops now accept phones only over Tailscale: pair again from Settings → Remote on the desktop.`,
    actions: ['pair-again'],
  };
}
