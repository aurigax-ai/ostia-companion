import * as SecureStore from 'expo-secure-store';
import { activeDesktop, addDesktop, chooseDesktop, DesktopList, EMPTY_DESKTOPS, removeDesktop } from '../model/desktops';

export interface PairingData {
  deviceToken: string;
  deviceId: string;
  pinnedFingerprint: string;
  desktopName: string;
  gatewayHost: string;
  gatewayPort: number;
  privateKey: string;
  publicKey: string;
  pairedAt?: number;
}

const INDEX = 'ostia_desktops';
const ACTIVE = 'ostia_active_desktop';
const entry = (deviceId: string) => `ostia_desktop_${deviceId}`;

function parseDesktop(text: string | null): PairingData | null {
  if (!text) return null;
  try {
    const data = JSON.parse(text);
    return typeof data?.deviceToken === 'string' && typeof data.gatewayHost === 'string' ? data : null;
  } catch {
    return null;
  }
}

export async function loadDesktops(): Promise<DesktopList> {
  let ids: string[] = [];
  try {
    ids = JSON.parse((await SecureStore.getItemAsync(INDEX)) ?? '[]');
  } catch {
    ids = [];
  }
  const desktops = (await Promise.all(ids.map(async (id) => parseDesktop(await SecureStore.getItemAsync(entry(id))))))
    .filter((d): d is PairingData => d !== null);
  if (desktops.length === 0) return EMPTY_DESKTOPS;
  const stored = await SecureStore.getItemAsync(ACTIVE);
  const activeId = desktops.some((d) => d.deviceId === stored) ? stored : desktops[desktops.length - 1].deviceId;
  return { desktops, activeId };
}

async function saveDesktops(previous: DesktopList, next: DesktopList): Promise<void> {
  for (const desktop of next.desktops) await SecureStore.setItemAsync(entry(desktop.deviceId), JSON.stringify(desktop));
  for (const gone of previous.desktops.filter((d) => !next.desktops.some((n) => n.deviceId === d.deviceId))) {
    await SecureStore.deleteItemAsync(entry(gone.deviceId));
  }
  await SecureStore.setItemAsync(INDEX, JSON.stringify(next.desktops.map((d) => d.deviceId)));
  if (next.activeId) await SecureStore.setItemAsync(ACTIVE, next.activeId);
  else await SecureStore.deleteItemAsync(ACTIVE);
}

async function update(change: (list: DesktopList) => DesktopList): Promise<DesktopList> {
  const previous = await loadDesktops();
  const next = change(previous);
  await saveDesktops(previous, next);
  return next;
}

export async function savePairingData(data: PairingData): Promise<void> {
  await update((list) => addDesktop(list, { pairedAt: Date.now(), ...data }));
}

export async function getPairingData(): Promise<PairingData | null> {
  return activeDesktop(await loadDesktops());
}

export function chooseSavedDesktop(deviceId: string): Promise<DesktopList> {
  return update((list) => chooseDesktop(list, deviceId));
}

export function forgetDesktop(deviceId: string): Promise<DesktopList> {
  return update((list) => removeDesktop(list, deviceId));
}
