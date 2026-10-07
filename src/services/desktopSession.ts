import { activeDesktop } from '../model/desktops';
import { OstiaRpc } from './rpc';
import { chooseSavedDesktop, forgetDesktop } from './storage';
import { resetWorkspaces } from './workspaceStore';

function connectTo(list: Awaited<ReturnType<typeof chooseSavedDesktop>>): boolean {
  OstiaRpc.disconnect();
  resetWorkspaces();
  const desktop = activeDesktop(list);
  if (desktop) OstiaRpc.initialize(desktop);
  return desktop !== null;
}

export async function switchDesktop(deviceId: string): Promise<void> {
  connectTo(await chooseSavedDesktop(deviceId));
}

export async function removeDesktopAndReconnect(deviceId: string): Promise<boolean> {
  return connectTo(await forgetDesktop(deviceId));
}
