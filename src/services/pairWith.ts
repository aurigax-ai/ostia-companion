import { Alert } from 'react-native';
import { PairingRun, pairDevice, PairTarget } from './network';
import { openTailscaleApp } from './openTailscaleApp';
import { parsePairingPayload } from './pairing';
import { logEvent } from './connectionLog';
import { savePairingData } from './storage';

const DEVICE_NAME = 'Phone';

export type CheckCodeListener = (code: string, startedAt: number) => void;

export function pairWithTarget(target: PairTarget, onCheckCode: CheckCodeListener): PairingRun {
  return pairDevice(target, DEVICE_NAME, onCheckCode, savePairingData);
}

export function pairWith(text: string, onCheckCode: CheckCodeListener): PairingRun {
  const config = parsePairingPayload(text);
  return pairWithTarget({ ...config, name: config.name || 'Ostia desktop' }, onCheckCode);
}

export function showPairingError(err: any, onDismiss: () => void) {
  logEvent(`pairing failed: ${err?.message ?? 'unknown error'}`);
  const buttons: { text: string; onPress?: () => void; style?: 'cancel' }[] = [];
  if (err?.action === 'open-tailscale') buttons.push({ text: 'Open Tailscale', onPress: () => void openTailscaleApp() });
  buttons.push({ text: 'Try again', style: 'cancel', onPress: onDismiss });
  Alert.alert("Couldn't pair", err?.message || 'Pairing failed.', buttons, { onDismiss });
}
