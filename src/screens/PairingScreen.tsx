import React, { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Monitor, ScanLine, X } from 'lucide-react-native';
import { CheckCodeView } from '../components/CheckCodeView';
import { Button, Group, IconButton, IconTile, ListRow, SectionHeader, TILE_INSET } from '../components/ui';
import { ScreenProps } from '../navigation';
import { parsePairingPayload } from '../services/pairing';
import { pairWith } from '../services/pairWith';
import { useNearbyDesktops } from '../services/useNearbyDesktops';
import { usePairing } from '../services/usePairing';
import { colors, font, radius, space, type } from '../theme';

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
            <IconButton icon={X} label="Close scanner" onPress={() => setScanning(false)} color="#fff" />
            <Text style={[type.headline, { color: '#fff', marginLeft: space.xs }]}>Scan the desktop's QR code</Text>
          </View>
          <View style={styles.viewfinder}>
            <View style={[styles.corner, styles.topLeft]} />
            <View style={[styles.corner, styles.topRight]} />
            <View style={[styles.corner, styles.bottomLeft]} />
            <View style={[styles.corner, styles.bottomRight]} />
            {pairing.busy ? <ActivityIndicator size="large" color="#fff" /> : null}
          </View>
          <Text style={[type.bodyMuted, styles.cameraHint]}>
            {pairing.busy ? 'Pairing…' : 'Settings › Remote'}
          </Text>
        </SafeAreaView>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
        <View style={styles.hero}>
          <IconTile icon={Monitor} tone="brand" size="lg" />
          <Text style={[type.title, { marginTop: space.xl }]}>Connect to your desktop</Text>
          <Text style={[type.bodyMuted, { marginTop: space.sm }]}>
            On the desktop, open <Text style={styles.crumb}>Settings › Remote</Text> and show a pairing code.
          </Text>
        </View>

        <SectionHeader title="Nearby" trailing={<SearchState searching={state.kind === 'searching'} />} />
        {desktops.length > 0 ? (
          <Group inset={TILE_INSET}>
            {desktops.map((desktop) => (
              <ListRow
                key={`${desktop.host}:${desktop.port}`}
                title={desktop.name}
                subtitle={desktop.host}
                mono
                leading={<IconTile icon={Monitor} />}
                onPress={() => navigation.navigate('PairCode', desktop)}
              />
            ))}
          </Group>
        ) : null}
        {state.kind === 'none' ? (
          <Text style={[type.bodyMuted, styles.none]}>
            None found. Turn on Discoverable in Settings › Remote, or scan the QR code.
          </Text>
        ) : null}

        <View style={styles.actions}>
          <Button label="Scan QR code" icon={ScanLine} onPress={() => void startScan()} />
          <Button label="Paste a pairing link" variant="tonal" onPress={() => navigation.navigate('PairLink')} />
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

const CORNER = 28;
const CORNER_WIDTH = 4;

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  hero: { paddingTop: space.xxxl, paddingHorizontal: space.xl },
  crumb: { fontFamily: font.mono, color: colors.fg },
  searching: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  radar: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.brandSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radarDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.brand },
  none: { paddingHorizontal: space.lg + space.xs },
  actions: { marginTop: 'auto', paddingHorizontal: space.lg, paddingTop: space.xl, paddingBottom: space.lg, gap: space.md },
  camera: { flex: 1, backgroundColor: '#000' },
  cameraUi: { flex: 1, justifyContent: 'space-between' },
  cameraTop: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.sm,
    paddingVertical: space.sm,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
  },
  viewfinder: { alignSelf: 'center', width: 248, height: 248, alignItems: 'center', justifyContent: 'center' },
  corner: { position: 'absolute', width: CORNER, height: CORNER, borderColor: '#fff' },
  topLeft: { top: 0, left: 0, borderTopWidth: CORNER_WIDTH, borderLeftWidth: CORNER_WIDTH, borderTopLeftRadius: radius.xl },
  topRight: { top: 0, right: 0, borderTopWidth: CORNER_WIDTH, borderRightWidth: CORNER_WIDTH, borderTopRightRadius: radius.xl },
  bottomLeft: { bottom: 0, left: 0, borderBottomWidth: CORNER_WIDTH, borderLeftWidth: CORNER_WIDTH, borderBottomLeftRadius: radius.xl },
  bottomRight: { bottom: 0, right: 0, borderBottomWidth: CORNER_WIDTH, borderRightWidth: CORNER_WIDTH, borderBottomRightRadius: radius.xl },
  cameraHint: {
    color: '#fff',
    textAlign: 'center',
    paddingVertical: space.lg + space.xs,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
  },
});
