import { useSyncExternalStore } from 'react';
import * as SecureStore from 'expo-secure-store';
import { DEFAULT_PHONE_CONTROL, parsePhoneControlByDesktop, PhoneControlPrefs } from '../model/phoneControlPrefs';
import { OstiaRpc } from './rpc';

const KEY = 'ostia_phone_control';
let byDesktop: Record<string, PhoneControlPrefs> = {};
const listeners = new Set<() => void>();

function desktop(): string {
  return OstiaRpc.getPairing()?.deviceId ?? '';
}

function publish(next: Record<string, PhoneControlPrefs>) {
  byDesktop = next;
  listeners.forEach((listener) => listener());
}

export async function loadPhoneControl(): Promise<void> {
  publish(parsePhoneControlByDesktop(await SecureStore.getItemAsync(KEY)));
}

export function getPhoneControl(): PhoneControlPrefs {
  return byDesktop[desktop()] ?? DEFAULT_PHONE_CONTROL;
}

export function setPhoneControl(patch: Partial<PhoneControlPrefs>): void {
  publish({ ...byDesktop, [desktop()]: { ...getPhoneControl(), ...patch } });
  void SecureStore.setItemAsync(KEY, JSON.stringify(byDesktop));
}

export function usePhoneControl(): PhoneControlPrefs {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getPhoneControl,
  );
}
