export const TAILSCALE_ANDROID_PACKAGE = 'com.tailscale.ipn';
export const TAILSCALE_PLAY_URL = `https://play.google.com/store/apps/details?id=${TAILSCALE_ANDROID_PACKAGE}`;
export const TAILSCALE_APP_STORE_URL = 'https://apps.apple.com/app/tailscale/id1470499037';

export interface TailscaleOpener {
  platform: string;
  openApplication: (packageName: string) => Promise<void>;
  openURL: (url: string) => Promise<void>;
}

export function isTailnetAddress(host: string): boolean {
  const parts = host.split('.').map(Number);
  if (parts.length !== 4 || parts.some((p) => !Number.isInteger(p) || p < 0 || p > 255)) return false;
  return parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127;
}

export async function openTailscale(opener: TailscaleOpener): Promise<void> {
  if (opener.platform !== 'android') {
    await opener.openURL(TAILSCALE_APP_STORE_URL);
    return;
  }
  try {
    await opener.openApplication(TAILSCALE_ANDROID_PACKAGE);
  } catch {
    await opener.openURL(TAILSCALE_PLAY_URL);
  }
}
