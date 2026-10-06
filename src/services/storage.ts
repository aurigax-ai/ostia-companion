import * as SecureStore from 'expo-secure-store';

export interface PairingData {
  deviceToken: string;
  deviceId: string;
  pinnedFingerprint: string;
  desktopName: string;
  gatewayHost: string;
  gatewayPort: number;
  privateKey: string;
  publicKey: string;
}

const KEYS = {
  DEVICE_TOKEN: 'ostia_device_token',
  DEVICE_ID: 'ostia_device_id',
  PINNED_FINGERPRINT: 'ostia_pinned_fingerprint',
  DESKTOP_NAME: 'ostia_desktop_name',
  GATEWAY_HOST: 'ostia_gateway_host',
  GATEWAY_PORT: 'ostia_gateway_port',
  PRIVATE_KEY: 'ostia_private_key',
  PUBLIC_KEY: 'ostia_public_key',
};

/**
 * Saves all pairing details into secure storage.
 */
export async function savePairingData(data: PairingData): Promise<void> {
  await SecureStore.setItemAsync(KEYS.DEVICE_TOKEN, data.deviceToken);
  await SecureStore.setItemAsync(KEYS.DEVICE_ID, data.deviceId);
  await SecureStore.setItemAsync(KEYS.PINNED_FINGERPRINT, data.pinnedFingerprint);
  await SecureStore.setItemAsync(KEYS.DESKTOP_NAME, data.desktopName);
  await SecureStore.setItemAsync(KEYS.GATEWAY_HOST, data.gatewayHost);
  await SecureStore.setItemAsync(KEYS.GATEWAY_PORT, data.gatewayPort.toString());
  await SecureStore.setItemAsync(KEYS.PRIVATE_KEY, data.privateKey);
  await SecureStore.setItemAsync(KEYS.PUBLIC_KEY, data.publicKey);
}

/**
 * Retrieves pairing data from secure storage. Returns null if not paired.
 */
export async function getPairingData(): Promise<PairingData | null> {
  try {
    const deviceToken = await SecureStore.getItemAsync(KEYS.DEVICE_TOKEN);
    const deviceId = await SecureStore.getItemAsync(KEYS.DEVICE_ID);
    const pinnedFingerprint = await SecureStore.getItemAsync(KEYS.PINNED_FINGERPRINT);
    const desktopName = await SecureStore.getItemAsync(KEYS.DESKTOP_NAME);
    const gatewayHost = await SecureStore.getItemAsync(KEYS.GATEWAY_HOST);
    const gatewayPortStr = await SecureStore.getItemAsync(KEYS.GATEWAY_PORT);
    const privateKey = await SecureStore.getItemAsync(KEYS.PRIVATE_KEY);
    const publicKey = await SecureStore.getItemAsync(KEYS.PUBLIC_KEY);

    if (
      !deviceToken ||
      !deviceId ||
      !pinnedFingerprint ||
      !desktopName ||
      !gatewayHost ||
      !gatewayPortStr ||
      !privateKey ||
      !publicKey
    ) {
      return null;
    }

    return {
      deviceToken,
      deviceId,
      pinnedFingerprint,
      desktopName,
      gatewayHost,
      gatewayPort: parseInt(gatewayPortStr, 10),
      privateKey,
      publicKey,
    };
  } catch (error) {
    console.error('Failed to retrieve pairing data from SecureStore:', error);
    return null;
  }
}

/**
 * Deletes all pairing data (equivalent to revoking/forgetting the device).
 */
export async function clearPairingData(): Promise<void> {
  await SecureStore.deleteItemAsync(KEYS.DEVICE_TOKEN);
  await SecureStore.deleteItemAsync(KEYS.DEVICE_ID);
  await SecureStore.deleteItemAsync(KEYS.PINNED_FINGERPRINT);
  await SecureStore.deleteItemAsync(KEYS.DESKTOP_NAME);
  await SecureStore.deleteItemAsync(KEYS.GATEWAY_HOST);
  await SecureStore.deleteItemAsync(KEYS.GATEWAY_PORT);
  await SecureStore.deleteItemAsync(KEYS.PRIVATE_KEY);
  await SecureStore.deleteItemAsync(KEYS.PUBLIC_KEY);
}

/**
 * Checks if the device is currently paired.
 */
export async function isPaired(): Promise<boolean> {
  const token = await SecureStore.getItemAsync(KEYS.DEVICE_TOKEN);
  return token !== null;
}
