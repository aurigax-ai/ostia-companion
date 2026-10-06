import React, { useState } from 'react';
import { ActivityIndicator, Image, StyleSheet, Text, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScanLine, X } from 'lucide-react-native';
import { Button, HeaderIcon } from '../components/ui';
import { ScreenProps } from '../navigation';
import { openTailscaleApp } from '../services/openTailscaleApp';
import { pairWith, showPairingError } from '../services/pairWith';
import { colors, type } from '../theme';

const STEPS = [
  'On your desktop, open Ostia Settings → Remote and turn on remote access.',
  'Turn on Tailscale on this phone, signed in to the same account.',
  'Scan the QR code the desktop shows.',
];

export function PairingScreen({ navigation, onPaired }: ScreenProps<'Pair'> & { onPaired: () => Promise<void> }) {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanning, setScanning] = useState(false);
  const [busy, setBusy] = useState(false);

  const startScan = async () => {
    const granted = permission?.granted || (await requestPermission()).granted;
    if (granted) setScanning(true);
  };

  const handleScanned = async ({ data }: { data: string }) => {
    if (busy) return;
    setBusy(true);
    try {
      await pairWith(data);
      await onPaired();
    } catch (err) {
      showPairingError(err, () => setBusy(false));
    }
  };

  if (scanning) {
    return (
      <View style={styles.camera}>
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={busy ? undefined : handleScanned}
        />
        <SafeAreaView style={styles.cameraUi}>
          <View style={styles.cameraTop}>
            <HeaderIcon icon={X} label="Close scanner" onPress={() => setScanning(false)} color="#fff" />
            <Text style={[type.label, { color: '#fff', marginLeft: 8 }]}>Scan the QR code on your desktop</Text>
          </View>
          <View style={styles.viewfinder}>{busy ? <ActivityIndicator size="large" color="#fff" /> : null}</View>
          <Text style={[type.bodyMuted, styles.cameraHint]}>
            {busy ? 'Pairing…' : 'Ostia Settings → Remote shows it.'}
          </Text>
        </SafeAreaView>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.welcome}>
      <View style={styles.hero}>
        <Image source={require('../../assets/icon.png')} style={styles.icon} />
        <Text style={[type.headline, { textAlign: 'center', marginTop: 24 }]}>Connect to your desktop</Text>
        <Text style={[type.bodyMuted, { textAlign: 'center', marginTop: 8 }]}>
          Watch your terminals and answer your agents from this phone.
        </Text>
      </View>

      <View style={styles.steps}>
        {STEPS.map((step, index) => (
          <View key={step} style={styles.step}>
            <View style={styles.stepNumber}>
              <Text style={[type.label, { color: colors.brand }]}>{index + 1}</Text>
            </View>
            <Text style={[type.body, { flex: 1 }]}>{step}</Text>
          </View>
        ))}
      </View>

      <View style={styles.actions}>
        <Button label="Scan QR code" icon={ScanLine} onPress={() => void startScan()} />
        <Button label="Paste pairing link" variant="text" onPress={() => navigation.navigate('PairLink')} />
        <Button label="Open Tailscale" variant="text" onPress={() => void openTailscaleApp()} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  welcome: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: 24 },
  hero: { alignItems: 'center', paddingTop: 48 },
  icon: { width: 88, height: 88, borderRadius: 22 },
  steps: { marginTop: 40, gap: 20 },
  step: { flexDirection: 'row', alignItems: 'flex-start' },
  stepNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.brandSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  actions: { marginTop: 'auto', paddingBottom: 16, gap: 4 },
  camera: { flex: 1, backgroundColor: '#000' },
  cameraUi: { flex: 1, justifyContent: 'space-between' },
  cameraTop: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
  },
  viewfinder: {
    alignSelf: 'center',
    width: 260,
    height: 260,
    borderRadius: 28,
    borderWidth: 3,
    borderColor: 'rgba(255, 255, 255, 0.9)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cameraHint: {
    color: '#fff',
    textAlign: 'center',
    paddingVertical: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
  },
});
