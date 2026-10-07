import React, { useCallback, useEffect, useState } from 'react';
import { Platform, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { Inter_400Regular } from '@expo-google-fonts/inter/400Regular';
import { Inter_600SemiBold } from '@expo-google-fonts/inter/600SemiBold';
import { JetBrainsMono_400Regular } from '@expo-google-fonts/jetbrains-mono/400Regular';
import { JetBrainsMono_600SemiBold } from '@expo-google-fonts/jetbrains-mono/600SemiBold';
import { DarkTheme, NavigationContainer, Theme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { getPairingData, loadDesktops } from './src/services/storage';
import { loadPrefs } from './src/services/prefsStore';
import { startConnectionLog } from './src/services/connectionLog';
import { removeDesktopAndReconnect } from './src/services/desktopSession';
import { OstiaRpc } from './src/services/rpc';
import { resetWorkspaces } from './src/services/workspaceStore';
import { resetAsks } from './src/services/askStore';
import { HomeScreen } from './src/screens/HomeScreen';
import { WorkspaceScreen } from './src/screens/WorkspaceScreen';
import { TerminalScreen } from './src/screens/TerminalScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { PairingScreen } from './src/screens/PairingScreen';
import { PairCodeScreen } from './src/screens/PairCodeScreen';
import { PairLinkScreen } from './src/screens/PairLinkScreen';
import { DesktopsScreen } from './src/screens/DesktopsScreen';
import { RootStack } from './src/navigation';
import { colors, font } from './src/theme';

const navigationTheme: Theme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: colors.brand,
    background: colors.bg,
    card: colors.bg,
    text: colors.fg,
    border: colors.line,
    notification: colors.attn,
  },
};

const Stack = createNativeStackNavigator<RootStack>();

const FONTS = { Inter_400Regular, Inter_600SemiBold, JetBrainsMono_400Regular, JetBrainsMono_600SemiBold };

const headerTitleStyle = {
  fontFamily: font.semibold,
  fontSize: Platform.OS === 'ios' ? 16 : 22,
  color: colors.fg,
};

const largeTitle = Platform.OS === 'ios'
  ? {
      headerLargeTitle: true,
      headerLargeTitleShadowVisible: false,
      headerLargeStyle: { backgroundColor: colors.bg },
      headerLargeTitleStyle: { fontFamily: font.semibold, color: colors.fg },
    }
  : {};

export default function App() {
  const [paired, setPaired] = useState<boolean | null>(null);
  const [fontsLoaded, fontError] = useFonts(FONTS);

  const connect = useCallback(async () => {
    const data = await getPairingData();
    OstiaRpc.disconnect();
    resetWorkspaces();
    resetAsks();
    if (!data) return setPaired(false);
    OstiaRpc.initialize(data);
    setPaired(true);
  }, []);

  const unpair = useCallback(async () => {
    const { activeId } = await loadDesktops();
    setPaired(activeId ? await removeDesktopAndReconnect(activeId) : false);
  }, []);

  useEffect(() => {
    startConnectionLog();
    void loadPrefs();
    connect().catch(() => setPaired(false));
  }, [connect]);

  if (paired === null || (!fontsLoaded && !fontError)) return <View style={{ flex: 1, backgroundColor: colors.bg }} />;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
    <SafeAreaProvider>
      <NavigationContainer theme={navigationTheme}>
        <Stack.Navigator
          screenOptions={{
            headerStyle: { backgroundColor: colors.bg },
            headerTintColor: colors.fg,
            headerTitleStyle,
            headerBackButtonDisplayMode: 'minimal',
            headerShadowVisible: false,
            contentStyle: { backgroundColor: colors.bg },
            animation: 'default',
          }}
        >
          {paired ? (
            <Stack.Group navigationKey="paired">
              <Stack.Screen name="Home">{(props) => <HomeScreen {...props} onUnpair={unpair} />}</Stack.Screen>
              <Stack.Screen name="Workspace" component={WorkspaceScreen} />
              <Stack.Screen name="Terminal" component={TerminalScreen} />
              <Stack.Screen name="Settings" options={{ title: 'Settings', ...largeTitle }}>
                {(props) => <SettingsScreen {...props} onUnpair={unpair} />}
              </Stack.Screen>
              <Stack.Screen name="Desktops" options={{ title: 'Desktops', ...largeTitle }}>
                {(props) => <DesktopsScreen {...props} onEmpty={() => setPaired(false)} />}
              </Stack.Screen>
              <Stack.Screen name="Pair" options={{ title: 'Add desktop' }}>
                {(props) => <PairingScreen {...props} onPaired={async () => (await connect(), props.navigation.popToTop())} />}
              </Stack.Screen>
              <Stack.Screen name="PairLink" options={{ title: 'Pairing link', presentation: 'modal' }}>
                {(props) => <PairLinkScreen {...props} onPaired={async () => (await connect(), props.navigation.popToTop())} />}
              </Stack.Screen>
              <Stack.Screen name="PairCode" options={{ title: 'Pair', presentation: 'modal' }}>
                {(props) => <PairCodeScreen {...props} onPaired={async () => (await connect(), props.navigation.popToTop())} />}
              </Stack.Screen>
            </Stack.Group>
          ) : (
            <Stack.Group navigationKey="unpaired">
              <Stack.Screen name="Pair" options={{ headerShown: false }}>
                {(props) => <PairingScreen {...props} onPaired={connect} />}
              </Stack.Screen>
              <Stack.Screen name="PairLink" options={{ title: 'Pairing link', presentation: 'modal' }}>
                {(props) => <PairLinkScreen {...props} onPaired={connect} />}
              </Stack.Screen>
              <Stack.Screen name="PairCode" options={{ title: 'Pair', presentation: 'modal' }}>
                {(props) => <PairCodeScreen {...props} onPaired={connect} />}
              </Stack.Screen>
            </Stack.Group>
          )}
        </Stack.Navigator>
      </NavigationContainer>
      <StatusBar style="light" />
    </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
