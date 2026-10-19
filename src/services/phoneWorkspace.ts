import { useSyncExternalStore } from 'react';
import type { PhoneWorkspace } from '../model/agentStart';
import { OstiaRpc } from './rpc';

export function usePhoneWorkspace(): PhoneWorkspace | null {
  return useSyncExternalStore(
    (listener) => OstiaRpc.addStatusListener(listener),
    () => OstiaRpc.getPhoneWorkspace(),
  );
}
