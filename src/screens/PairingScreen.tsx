import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { MotiView } from 'moti';
import { AlertCircle, AlertTriangle, Camera, Link2, ScanLine, ShieldCheck, X } from 'lucide-react-native';
import { pairDevice } from '../services/network';
import { savePairingData } from '../services/storage';
import { Button, IconButton, Screen, colors } from '../components/ui';

interface PairingScreenProps {
  onPairSuccess: () => void;
}

export function PairingScreen({ onPairSuccess }: PairingScreenProps) {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [manualModalVisible, setManualModalVisible] = useState(false);
  const [manualUri, setManualUri] = useState('');

  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain) {
      requestPermission();
    }
  }, [permission, requestPermission]);

  const handlePairingPayload = async (payloadStr: string) => {
    setLoading(true);
    setError(null);
    try {
      let dataStr = payloadStr.trim();

      if (dataStr.startsWith('ostia-pair://')) {
        const base64Data = dataStr.replace('ostia-pair://', '');
        dataStr = atob(base64Data);
      }

      const config = JSON.parse(dataStr);

      if (!config.host || !config.port || !config.fingerprint || !config.pairCode) {
        throw new Error('Pairing payload is missing required parameters');
      }
      if (isLoopbackHost(config.host)) {
        throw new Error(
          `The desktop is only listening on itself (${config.host}). In Ostia on your desktop, open Settings → Remote, choose your Wi-Fi or Tailscale address, then show the QR again.`
        );
      }

      const pairingResult = await pairDevice(
        config.host,
        config.port,
        config.fingerprint,
        config.pairCode,
        'Phone Companion'
      );

      await savePairingData({
        ...pairingResult,
        desktopName: config.name || 'Ostia Desktop',
      });

      setLoading(false);
      setManualModalVisible(false);
      onPairSuccess();
    } catch (e: any) {
      setLoading(false);
      setError(e.message || 'Failed to complete pairing');
    }
  };

  const handleBarcodeScanned = ({ data }: { data: string }) => {
    setScanned(true);
    handlePairingPayload(data);
  };

  const handleManualSubmit = () => {
    if (!manualUri.trim()) return;
    handlePairingPayload(manualUri);
  };

  const closeManualModal = () => {
    setManualModalVisible(false);
    setError(null);
    setManualUri('');
    setScanned(false);
  };

  if (!permission) {
    return (
      <Screen className="justify-center items-center">
        <ActivityIndicator size="large" color={colors.accent} />
      </Screen>
    );
  }

  if (!permission.granted) {
    return (
      <Screen className="px-6 justify-center">
        <MotiView
          from={{ opacity: 0, translateY: 16 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ type: 'spring', damping: 15 }}
          className="items-center"
        >
          <View className="h-16 w-16 rounded-2xl bg-ostia-card border border-ostia-border items-center justify-center mb-6">
            <Camera size={30} color={colors.accent} />
          </View>

          <Text className="text-ostia-muted text-xs font-bold uppercase text-center">
            Ostia
          </Text>
          <Text className="text-ostia-text text-2xl font-bold text-center mt-2">
            Connect to Ostia desktop
          </Text>
          <Text className="text-ostia-muted text-sm leading-5 text-center mt-3 mb-8 max-w-[310]">
            Camera access is used only to scan the local pairing QR code from your desktop.
          </Text>

          <Button
            label="Grant Camera Access"
            icon={Camera}
            onPress={requestPermission}
            className="w-full mb-3"
          />
          <Button
            label="Enter Pairing Link"
            icon={Link2}
            variant="secondary"
            onPress={() => setManualModalVisible(true)}
            className="w-full"
          />
        </MotiView>

        {renderManualInputModal()}
      </Screen>
    );
  }

  return (
    <Screen>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={scanned ? undefined : handleBarcodeScanned}
      />

      <View className="absolute inset-0" style={{ backgroundColor: 'rgba(0, 0, 0, 0.55)' }} />

      <View className="flex-1 px-5 justify-between">
        <View className="pt-4">
          <Text className="text-white text-xs font-bold uppercase">Ostia</Text>
          <Text className="text-white text-2xl font-bold mt-1">Scan pairing code</Text>
          <Text className="text-white text-sm leading-5 mt-2 max-w-[320]">
            Open Ostia desktop settings and choose Connect phone.
          </Text>
        </View>

        <View className="items-center">
          <MotiView
            animate={{
              scale: [0.985, 1.015, 0.985],
              opacity: [0.82, 1, 0.82],
            }}
            transition={{
              loop: true,
              duration: 2400,
              type: 'timing',
            }}
            className="w-64 h-64 justify-center items-center border border-ostia-border relative overflow-hidden" style={{ backgroundColor: 'rgba(0, 0, 0, 0.10)' }}
          >
            <View className="absolute top-[-2] left-[-2] w-9 h-9 border-t-4 border-l-4 border-ostia-accent rounded-tl" />
            <View className="absolute top-[-2] right-[-2] w-9 h-9 border-t-4 border-r-4 border-ostia-accent rounded-tr" />
            <View className="absolute bottom-[-2] left-[-2] w-9 h-9 border-b-4 border-l-4 border-ostia-accent rounded-bl" />
            <View className="absolute bottom-[-2] right-[-2] w-9 h-9 border-b-4 border-r-4 border-ostia-accent rounded-br" />
            <ScanLine size={34} color={colors.accent} />
            <MotiView
              animate={{ translateY: [-112, 112, -112] }}
              transition={{ loop: true, duration: 2100, type: 'timing' }}
              className="absolute w-56 h-0.5 bg-ostia-accent"
            />
          </MotiView>
        </View>

        <View className="pb-4">
          <Button
            label="Enter Link Manually"
            icon={Link2}
            variant="secondary"
            onPress={() => {
              setError(null);
              setManualModalVisible(true);
            }}
            className="border-ostia-border"
          />
        </View>
      </View>

      <Modal transparent visible={loading} animationType="fade">
        <View className="flex-1 justify-center items-center px-5" style={{ backgroundColor: 'rgba(0, 0, 0, 0.85)' }}>
          <MotiView
            from={{ scale: 0.94, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="p-6 rounded-lg bg-ostia-card border border-ostia-border items-center w-full max-w-[310]"
          >
            <ActivityIndicator size="large" color={colors.accent} />
            <Text className="text-ostia-text text-base font-bold mt-4 text-center">
              Securing connection
            </Text>
            <Text className="text-ostia-muted text-xs mt-2 text-center leading-4">
              Verifying the TLS fingerprint and registering this device with Ostia.
            </Text>
          </MotiView>
        </View>
      </Modal>

      {error && !manualModalVisible ? (
        <MotiView
          from={{ opacity: 0, translateY: 40 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ type: 'spring', damping: 16 }}
          className="absolute bottom-8 left-5 right-5 p-4 rounded-lg bg-red-950 border border-red-800"
        >
          <View className="flex-row items-center mb-2">
            <AlertCircle size={17} color={colors.danger} />
            <Text className="text-red-200 text-sm font-bold ml-2">Pairing failed</Text>
          </View>
          <Text className="text-red-200 text-xs leading-4 mb-4">{error}</Text>
          <Button
            label="Try Again"
            variant="danger"
            onPress={() => {
              setError(null);
              setScanned(false);
            }}
          />
        </MotiView>
      ) : null}

      {renderManualInputModal()}
    </Screen>
  );

  function renderManualInputModal() {
    return (
      <Modal visible={manualModalVisible} transparent animationType="slide" onRequestClose={closeManualModal}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          className="flex-1 justify-end" style={{ backgroundColor: 'rgba(0, 0, 0, 0.70)' }}
        >
          <View className="bg-ostia-card rounded-t-2xl p-5 border-t border-ostia-border">
            <View className="w-12 h-1.5 rounded-full bg-ostia-border self-center mb-5" />
            <View className="flex-row justify-between items-start mb-3">
              <View className="flex-1 pr-4">
                <Text className="text-ostia-text text-xl font-bold">Manual pairing</Text>
                <Text className="text-ostia-muted text-sm leading-5 mt-2">
                  Paste the copyable pairing link shown below the QR code on your desktop.
                </Text>
              </View>
              <IconButton label="Close manual pairing" icon={X} onPress={closeManualModal} />
            </View>

            {error ? (
              <MotiView
                from={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                className="mb-4 p-3 rounded-lg bg-red-950 border border-red-900 flex-row items-start"
              >
                <AlertTriangle size={15} color={colors.danger} />
                <View className="flex-1 ml-2">
                  <Text className="text-red-300 text-xs font-bold">Pairing failed</Text>
                  <Text className="text-red-200 text-xs mt-1 leading-4">{error}</Text>
                </View>
              </MotiView>
            ) : null}

            <TextInput
              className="bg-ostia-bg border border-ostia-border rounded-lg p-3 text-ostia-text min-h-24 text-xs font-mono mb-4"
              placeholder="ostia-pair://..."
              placeholderTextColor={colors.subtle}
              value={manualUri}
              onChangeText={setManualUri}
              autoCapitalize="none"
              autoCorrect={false}
              multiline
            />

            <View className="flex-row">
              <Pressable
                accessibilityRole="button"
                onPress={closeManualModal}
                className="flex-1 min-h-11 rounded-lg items-center justify-center mr-3"
              >
                <Text className="text-ostia-muted text-sm font-semibold">Cancel</Text>
              </Pressable>
              <Button
                label="Pair"
                icon={ShieldCheck}
                onPress={handleManualSubmit}
                disabled={!manualUri.trim()}
                className="flex-1"
              />
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    );
  }
}

function isLoopbackHost(host: string): boolean {
  return host === 'localhost' || host === '::1' || host.startsWith('127.');
}
