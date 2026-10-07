import React, { useState } from 'react';
import { ActivityIndicator, Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Monitor, ScanLine, X } from 'lucide-react-native';
import { CheckCodeView } from '../components/CheckCodeView';
import { Avatar, Button, Divider, HeaderIcon, ListRow, SectionHeader } from '../components/ui';
import { ScreenProps } from '../navigation';
import { parsePairingPayload } from '../services/pairing';
import { pairWith } from '../services/pairWith';
import { useNearbyDesktops } from '../services/useNearbyDesktops';
import { usePairing } from '../services/usePairing';
import { colors, type } from '../theme';

export function PairingScreen({ navigation, onPaired }: ScreenProps<'Pair'> & { onPaired: () => Promise<void> }) {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanning, setScanning] = useState(false);
  const [scannedName, setScannedName] = useState('your desktop');
  const { desktops, state } = useNearbyDesktops();
  const pairing = usePairing(onPaired);

  const startScan = async () => {
    const granted = permission?.granted || (await requestPermission()).granted;
    if (granted) setScanning(true);
  };

  const handleScanned = ({ data }: { data: string }) => {
    try {
      setScannedName(parsePairingPayload(data).name || 'your desktop');
    } catch {}
    void pairing.run((onCheck) => pairWith(data, onCheck));
  };

  if (pairing.checkCode) return <CheckCodeView code={pairing.checkCode} desktop={scannedName} />;

  if (scanning) {
    return (
      <View style={styles.camera}>
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={pairing.busy ? undefined : handleScanned}
        />
        <SafeAreaView style={styles.cameraUi}>
          <View style={styles.cameraTop}>
            <HeaderIcon icon={X} label="Close scanner" onPress={() => setScanning(false)} color="#fff" />
            <Text style={[type.label, { color: '#fff', marginLeft: 8 }]}>Scan the QR code on your desktop</Text>
          </View>
          <View style={styles.viewfinder}>
            {pairing.busy ? <ActivityIndicator size="large" color="#fff" /> : null}
          </View>
          <Text style={[type.bodyMuted, styles.cameraHint]}>
            {pairing.busy ? 'Pairing…' : 'Ostia Settings → Remote shows it.'}
          </Text>
        </SafeAreaView>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.welcome}>
      <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
        <View style={styles.hero}>
          <Image source={require('../../assets/icon.png')} style={styles.icon} />
          <Text style={[type.headline, styles.center, { marginTop: 20 }]}>Connect to your desktop</Text>
          <Text style={[type.bodyMuted, styles.center, { marginTop: 8 }]}>
            In Ostia Settings → Remote, turn on remote access and show a pairing code.
          </Text>
        </View>

        <SectionHeader title="On this Wi-Fi" />
        {desktops.map((desktop, index) => (
          <View key={`${desktop.host}:${desktop.port}`}>
            {index > 0 ? <Divider /> : null}
            <ListRow
              title={desktop.name}
              subtitle={desktop.host}
              mono
              leading={<Avatar icon={Monitor} tone="brand" />}
              onPress={() => navigation.navigate('PairCode', desktop)}
            />
          </View>
        ))}
        {state.kind === 'searching' ? (
          <View style={styles.status}>
            <ActivityIndicator color={colors.muted} />
            <Text style={[type.bodyMuted, { marginLeft: 12 }]}>Looking for desktops…</Text>
          </View>
        ) : null}
        {state.kind === 'none' ? (
          <Text style={[type.bodyMuted, styles.status]}>
            No desktop found. Turn on Discoverable in Ostia Settings → Remote, or scan the QR code.
          </Text>
        ) : null}

        <View style={styles.actions}>
          <Button label="Scan QR code" icon={ScanLine} onPress={() => void startScan()} />
          <Button label="Paste pairing link" variant="text" onPress={() => navigation.navigate('PairLink')} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  welcome: { flex: 1, backgroundColor: colors.bg },
  hero: { alignItems: 'center', paddingTop: 40, paddingHorizontal: 24, paddingBottom: 24 },
  center: { textAlign: 'center' },
  icon: { width: 72, height: 72, borderRadius: 18 },
  status: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 16 },
  actions: { marginTop: 'auto', paddingHorizontal: 24, paddingTop: 24, paddingBottom: 16, gap: 4 },
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
