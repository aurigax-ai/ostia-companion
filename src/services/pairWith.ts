import { Alert } from 'react-native';
import { pairDevice } from './network';
import { openTailscaleApp } from './openTailscaleApp';
import { parsePairingPayload } from './pairing';
import { savePairingData } from './storage';

export async function pairWith(text: string): Promise<void> {
  const config = parsePairingPayload(text);
  const result = await pairDevice(config.host, config.port, config.fingerprint, config.pairCode, 'Phone');
  await savePairingData({ ...result, desktopName: config.name || 'Ostia desktop' });
}

export function showPairingError(err: any, onDismiss: () => void) {
  const buttons: { text: string; onPress?: () => void; style?: 'cancel' }[] = [];
  if (err?.action === 'open-tailscale') buttons.push({ text: 'Open Tailscale', onPress: () => void openTailscaleApp() });
  buttons.push({ text: 'Try again', style: 'cancel', onPress: onDismiss });
  Alert.alert('Could not pair', err?.message || 'Pairing failed.', buttons, { onDismiss });
}
