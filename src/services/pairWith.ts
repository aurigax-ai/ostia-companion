import { Alert } from 'react-native';
import { pairDevice, PairTarget } from './network';
import { openTailscaleApp } from './openTailscaleApp';
import { parsePairingPayload } from './pairing';
import { savePairingData } from './storage';

const DEVICE_NAME = 'Phone';

export async function pairWithTarget(target: PairTarget, onCheckCode: (code: string) => void): Promise<void> {
  await savePairingData(await pairDevice(target, DEVICE_NAME, onCheckCode));
}

export async function pairWith(text: string, onCheckCode: (code: string) => void): Promise<void> {
  const config = parsePairingPayload(text);
  await pairWithTarget({ ...config, name: config.name || 'Ostia desktop' }, onCheckCode);
}

export function showPairingError(err: any, onDismiss: () => void) {
  const buttons: { text: string; onPress?: () => void; style?: 'cancel' }[] = [];
  if (err?.action === 'open-tailscale') buttons.push({ text: 'Open Tailscale', onPress: () => void openTailscaleApp() });
  buttons.push({ text: 'Try again', style: 'cancel', onPress: onDismiss });
  Alert.alert('Could not pair', err?.message || 'Pairing failed.', buttons, { onDismiss });
}
