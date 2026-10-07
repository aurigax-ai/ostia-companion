import React, { useCallback, useEffect, useState } from 'react';
import { Alert, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { clearPairingData, getPairingData } from './src/services/storage';
import { OstiaRpc } from './src/services/rpc';
import { resetWorkspaces } from './src/services/workspaceStore';
import { HomeScreen } from './src/screens/HomeScreen';
import { WorkspaceScreen } from './src/screens/WorkspaceScreen';
import { TerminalScreen } from './src/screens/TerminalScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { PairingScreen } from './src/screens/PairingScreen';
import { PairCodeScreen } from './src/screens/PairCodeScreen';
import { PairLinkScreen } from './src/screens/PairLinkScreen';
import { RootStack } from './src/navigation';
import { colors, navigationTheme } from './src/theme';

const Stack = createNativeStackNavigator<RootStack>();

export default function App() {
  const [paired, setPaired] = useState<boolean | null>(null);

  const connect = useCallback(async () => {
    const data = await getPairingData();
    if (!data) return setPaired(false);
    OstiaRpc.initialize(data);
    setPaired(true);
  }, []);

  const unpair = useCallback(async () => {
    OstiaRpc.disconnect();
    await clearPairingData();
    resetWorkspaces();
    setPaired(false);
  }, []);

  useEffect(() => {
    connect().catch(() => setPaired(false));
    return OstiaRpc.addStatusListener((status, reason) => {
      if (status !== 'revoked') return;
      void unpair().then(() =>
        Alert.alert('Pair this phone again', reason ?? 'The desktop no longer accepts this phone.'),
      );
    });
  }, [connect, unpair]);

  if (paired === null) return <View style={{ flex: 1, backgroundColor: colors.bg }} />;

  return (
    <SafeAreaProvider>
      <NavigationContainer theme={navigationTheme}>
        <Stack.Navigator
          screenOptions={{
            headerStyle: { backgroundColor: colors.bg },
            headerTintColor: colors.fg,
            headerShadowVisible: false,
            contentStyle: { backgroundColor: colors.bg },
            animation: 'default',
          }}
        >
          {paired ? (
            <>
              <Stack.Screen name="Home" component={HomeScreen} />
              <Stack.Screen
                name="Workspace"
                component={WorkspaceScreen}
                options={({ route }) => ({ title: route.params.name })}
              />
              <Stack.Screen
                name="Terminal"
                component={TerminalScreen}
                options={({ route }) => ({ title: route.params.title })}
              />
              <Stack.Screen name="Settings" options={{ title: 'Settings' }}>
                {(props) => <SettingsScreen {...props} onUnpair={unpair} />}
              </Stack.Screen>
            </>
          ) : (
            <>
              <Stack.Screen name="Pair" options={{ headerShown: false }}>
                {(props) => <PairingScreen {...props} onPaired={connect} />}
              </Stack.Screen>
              <Stack.Screen name="PairLink" options={{ title: 'Paste pairing link', presentation: 'modal' }}>
                {(props) => <PairLinkScreen {...props} onPaired={connect} />}
              </Stack.Screen>
              <Stack.Screen name="PairCode" options={{ title: 'Pair', presentation: 'modal' }}>
                {(props) => <PairCodeScreen {...props} onPaired={connect} />}
              </Stack.Screen>
            </>
          )}
        </Stack.Navigator>
      </NavigationContainer>
      <StatusBar style="light" />
    </SafeAreaProvider>
  );
}
