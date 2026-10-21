import { activeDesktop } from '../model/desktops';
import { OstiaRpc } from './rpc';
import { chooseSavedDesktop, forgetDesktop } from './storage';
import { resetAsks } from './askStore';
import { forgetPush, unregisterPush } from './pushRegistration';
import { resetWorkspaces } from './workspaceStore';

function connectTo(list: Awaited<ReturnType<typeof chooseSavedDesktop>>): boolean {
  OstiaRpc.disconnect();
  resetWorkspaces();
  resetAsks();
  const desktop = activeDesktop(list);
  if (desktop) OstiaRpc.initialize(desktop);
  return desktop !== null;
}

export async function releasePushOfPrevious(nextDeviceId: string | undefined): Promise<void> {
  const current = OstiaRpc.getPairing()?.deviceId;
  if (current && current !== nextDeviceId) await forgetPush(current);
}

export async function switchDesktop(deviceId: string): Promise<void> {
  await releasePushOfPrevious(deviceId);
  connectTo(await chooseSavedDesktop(deviceId));
}

export async function removeDesktopAndReconnect(deviceId: string): Promise<boolean> {
  await unregisterPush(deviceId);
  return connectTo(await forgetDesktop(deviceId));
}
