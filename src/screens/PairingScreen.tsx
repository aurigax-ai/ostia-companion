import React, { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Monitor, ScanLine, X } from 'lucide-react-native';
import { CheckCodeView } from '../components/CheckCodeView';
import { Button, Divider, HeaderIcon, IconTile, ListRow, SectionHeader } from '../components/ui';
import { ScreenProps } from '../navigation';
import { parsePairingPayload } from '../services/pairing';
import { pairWith } from '../services/pairWith';
import { useNearbyDesktops } from '../services/useNearbyDesktops';
import { usePairing } from '../services/usePairing';
import { colors, mono, type } from '../theme';

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

  if (pairing.check) {
    return (
      <CheckCodeView
        code={pairing.check.code}
        startedAt={pairing.check.startedAt}
        desktop={scannedName}
        onCancel={pairing.cancel}
      />
    );
  }

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
            {pairing.busy ? 'Sending the code…' : 'Settings › Remote on the desktop shows it.'}
          </Text>
        </SafeAreaView>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
        <View style={styles.hero}>
          <View style={styles.logo}>
            <Monitor size={28} color={colors.brand} />
          </View>
          <Text style={[type.title, { marginTop: 24 }]}>Connect to your desktop</Text>
          <Text style={[type.bodyMuted, { marginTop: 8 }]}>
            On the desktop, open <Text style={styles.crumb}> Settings › Remote </Text> and show a pairing code.
          </Text>
        </View>

        <SectionHeader title="Nearby" trailing={<SearchState searching={state.kind === 'searching'} />} />
        {desktops.map((desktop, index) => (
          <View key={`${desktop.host}:${desktop.port}`}>
            {index > 0 ? <Divider inset={72} /> : null}
            <ListRow
              title={desktop.name}
              subtitle={desktop.host}
              mono
              leading={<IconTile icon={Monitor} tone="brand" />}
              onPress={() => navigation.navigate('PairCode', desktop)}
            />
          </View>
        ))}
        {state.kind === 'none' ? (
          <Text style={[type.bodyMuted, styles.none]}>
            None found. Turn on Discoverable in Settings › Remote, or scan the QR code.
          </Text>
        ) : null}

        <View style={styles.actions}>
          <Button label="Scan QR code" icon={ScanLine} onPress={() => void startScan()} />
          <Button label="Paste a pairing link" variant="text" onPress={() => navigation.navigate('PairLink')} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function SearchState({ searching }: { searching: boolean }) {
  if (!searching) return null;
  return (
    <View style={styles.searching}>
      <View style={styles.radar}>
        <View style={styles.radarDot} />
      </View>
      <Text style={type.caption}>Searching</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  hero: { paddingTop: 40, paddingHorizontal: 16 },
  logo: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: colors.surfaceHigh,
    alignItems: 'center',
    justifyContent: 'center',
  },
  crumb: { fontFamily: mono, fontSize: 12, color: colors.fg, backgroundColor: colors.surfaceHigh },
  searching: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  radar: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.brandSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radarDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.brand },
  none: { paddingHorizontal: 16, paddingVertical: 8 },
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
