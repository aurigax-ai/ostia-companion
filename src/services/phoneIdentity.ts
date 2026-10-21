import { useSyncExternalStore } from 'react';
import * as Crypto from 'expo-crypto';
import { File, Paths } from 'expo-file-system';
import * as SecureStore from 'expo-secure-store';
import { cleanPhoneName, newPhoneIdentity, parsePhoneIdentity, PhoneIdentity } from '../model/phoneIdentity';
import { OstiaRpc } from './rpc';

const KEY = 'ostia_phone_identity';
const OPTIONS = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };

let identity: PhoneIdentity | null = null;
let loading: Promise<PhoneIdentity> | null = null;
const listeners = new Set<() => void>();

function publish(next: PhoneIdentity) {
  identity = next;
  OstiaRpc.setPhoneName(next.name);
  listeners.forEach((listener) => listener());
}

async function loadOrCreate(): Promise<PhoneIdentity> {
  const marker = new File(Paths.document, 'ostia-install');
  const reinstalled = !marker.exists;
  const stored = reinstalled ? null : parsePhoneIdentity(await SecureStore.getItemAsync(KEY, OPTIONS));
  if (stored) return stored;
  const created = newPhoneIdentity(Crypto.getRandomBytes);
  await SecureStore.setItemAsync(KEY, JSON.stringify(created), OPTIONS);
  if (reinstalled) marker.create({ overwrite: true });
  return created;
}

export async function loadPhoneIdentity(): Promise<PhoneIdentity> {
  loading ??= loadOrCreate()
    .then((loaded) => (publish(loaded), loaded))
    .catch((error) => {
      loading = null;
      throw error;
    });
  return loading;
}

export async function renamePhone(text: string): Promise<boolean> {
  const name = cleanPhoneName(text);
  const current = await loadPhoneIdentity();
  if (!name) return false;
  const next = { ...current, name };
  await SecureStore.setItemAsync(KEY, JSON.stringify(next), OPTIONS);
  publish(next);
  return true;
}

export function usePhoneName(): string | null {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => identity?.name ?? null,
  );
}
