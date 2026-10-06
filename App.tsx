import React, { useState, useEffect } from 'react';
import { View, ActivityIndicator, Alert, Text } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { isPaired, getPairingData, clearPairingData } from './src/services/storage';
import { OstiaRpc } from './src/services/rpc';
import { PairingScreen } from './src/screens/PairingScreen';
import { DashboardScreen } from './src/screens/DashboardScreen';
import { TerminalScreen } from './src/screens/TerminalScreen';
import { Screen, colors } from './src/components/ui';

export default function App() {
  const [loading, setLoading] = useState(true);
  const [screen, setScreen] = useState<'pairing' | 'dashboard' | 'terminal'>('pairing');
  const [activePane, setActivePane] = useState<{ id: string; title: string } | null>(null);

  // Check pairing status on startup
  useEffect(() => {
    async function checkPairing() {
      try {
        const paired = await isPaired();
        if (paired) {
          const pairingData = await getPairingData();
          if (pairingData) {
            // Initialize RPC connection
            OstiaRpc.initialize(pairingData);
            setScreen('dashboard');
          } else {
            setScreen('pairing');
          }
        } else {
          setScreen('pairing');
        }
      } catch (e) {
        console.error('Failed checking pairing state:', e);
        setScreen('pairing');
      } finally {
        setLoading(false);
      }
    }
    checkPairing();

    return OstiaRpc.addStatusListener((status, reason) => {
      if (status !== 'revoked') return;
      clearPairingData().finally(() => {
        setActivePane(null);
        setScreen('pairing');
        Alert.alert('Pair this phone again', reason ?? 'The desktop no longer accepts this device.');
      });
    });
  }, []);

  const handlePairSuccess = async () => {
    const pairingData = await getPairingData();
    if (pairingData) {
      OstiaRpc.initialize(pairingData);
      setScreen('dashboard');
    }
  };

  const handleUnpair = () => {
    setScreen('pairing');
    setActivePane(null);
  };

  const handleSelectPane = (paneId: string, title: string) => {
    setActivePane({ id: paneId, title });
    setScreen('terminal');
  };

  const handleBackToDashboard = () => {
    setScreen('dashboard');
    setActivePane(null);
  };

  if (loading) {
    return (
      <Screen className="justify-center items-center">
        <ActivityIndicator size="large" color={colors.accent} />
        <Text className="text-ostia-muted text-sm font-semibold mt-4">
          Initializing Ostia
        </Text>
        <StatusBar style="light" />
      </Screen>
    );
  }

  return (
    <View className="flex-1 bg-ostia-bg">
      {screen === 'pairing' && (
        <PairingScreen onPairSuccess={handlePairSuccess} />
      )}
      
      {screen === 'dashboard' && (
        <DashboardScreen
          onSelectPane={handleSelectPane}
          onUnpair={handleUnpair}
        />
      )}
      
      {screen === 'terminal' && activePane && (
        <TerminalScreen
          paneId={activePane.id}
          paneTitle={activePane.title}
          onBack={handleBackToDashboard}
        />
      )}
      
      <StatusBar style="light" />
    </View>
  );
}
