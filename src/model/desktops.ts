import type { PairingData } from '../services/storage';

export interface DesktopList {
  desktops: PairingData[];
  activeId: string | null;
}

export const EMPTY_DESKTOPS: DesktopList = { desktops: [], activeId: null };

export function activeDesktop(list: DesktopList): PairingData | null {
  return list.desktops.find((d) => d.deviceId === list.activeId) ?? null;
}

export function addDesktop(list: DesktopList, desktop: PairingData): DesktopList {
  const others = list.desktops.filter(
    (d) => d.pinnedFingerprint !== desktop.pinnedFingerprint && d.deviceId !== desktop.deviceId,
  );
  return { desktops: [...others, desktop], activeId: desktop.deviceId };
}

export function chooseDesktop(list: DesktopList, deviceId: string): DesktopList {
  if (!list.desktops.some((d) => d.deviceId === deviceId)) return list;
  return { ...list, activeId: deviceId };
}

export function removeDesktop(list: DesktopList, deviceId: string): DesktopList {
  const index = list.desktops.findIndex((d) => d.deviceId === deviceId);
  if (index < 0) return list;
  const desktops = list.desktops.filter((d) => d.deviceId !== deviceId);
  if (list.activeId !== deviceId) return { ...list, desktops };
  const next = desktops[index] ?? desktops[index - 1] ?? null;
  return { desktops, activeId: next?.deviceId ?? null };
}
