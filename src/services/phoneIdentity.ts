import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { newPhoneIdentity, pairingName, parsePhoneIdentity, PhoneIdentity } from '../model/phoneIdentity';

const KEY = 'ostia_phone_identity';

export interface PairingIdentity {
  installId: string;
  name: string;
}

let loading: Promise<PhoneIdentity> | null = null;

async function loadOrCreate(): Promise<PhoneIdentity> {
  const stored = parsePhoneIdentity(await SecureStore.getItemAsync(KEY));
  if (stored) return stored;
  const created = newPhoneIdentity(Crypto.getRandomBytes);
  await SecureStore.setItemAsync(KEY, JSON.stringify(created));
  return created;
}

export async function loadPairingIdentity(): Promise<PairingIdentity> {
  loading ??= loadOrCreate().catch((error) => {
    loading = null;
    throw error;
  });
  const identity = await loading;
  return { installId: identity.installId, name: pairingName(identity, (Platform.constants as { Model?: unknown }).Model) };
}
