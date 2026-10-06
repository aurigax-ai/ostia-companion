import { openApplication } from 'expo-intent-launcher';
import { Linking, Platform } from 'react-native';
import { openTailscale } from './tailscale';

export function openTailscaleApp(): Promise<void> {
  return openTailscale({
    platform: Platform.OS,
    openApplication: async (packageName) => openApplication(packageName),
    openURL: (url) => Linking.openURL(url),
  });
}
