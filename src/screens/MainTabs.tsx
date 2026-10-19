import React from 'react';
import { Platform } from 'react-native';
import { createNativeBottomTabNavigator, NativeBottomTabIcon } from '@react-navigation/bottom-tabs/unstable';
import { TabList } from '../navigation';
import { colors, font } from '../theme';
import { NowScreen } from './NowScreen';
import { SettingsScreen } from './SettingsScreen';
import { WorkspacesScreen } from './WorkspacesScreen';

const Tab = createNativeBottomTabNavigator<TabList>();

function icon(symbol: string, image: number): NativeBottomTabIcon {
  return Platform.OS === 'ios' ? { type: 'sfSymbol', name: symbol as never } : { type: 'image', source: image };
}

const ICONS = {
  Chats: icon('bubble.left', require('../../assets/tabs/chats.png')),
  Workspaces: icon('desktopcomputer', require('../../assets/tabs/workspaces.png')),
  Settings: icon('gearshape', require('../../assets/tabs/settings.png')),
};

export function MainTabs({ onUnpair }: { onUnpair: () => Promise<void> }) {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: true,
        headerStyle: { backgroundColor: colors.bg },
        headerTintColor: colors.fg,
        headerTitleStyle: { fontFamily: font.semibold, fontSize: Platform.OS === 'ios' ? 16 : 22, color: colors.fg },
        headerShadowVisible: false,
        headerLargeTitle: Platform.OS === 'ios',
        tabBarIcon: ICONS[route.name],
        tabBarActiveTintColor: colors.fg,
        tabBarInactiveTintColor: colors.muted,
        tabBarActiveIndicatorColor: colors.surfacePressed,
        tabBarRippleColor: colors.ripple,
        tabBarStyle: { backgroundColor: colors.surface },
        tabBarLabelStyle: { fontFamily: font.semibold, fontSize: 12 },
        tabBarBadgeStyle: { backgroundColor: colors.attn, color: colors.fg },
        tabBarLabelVisibilityMode: 'labeled',
      })}
    >
      <Tab.Screen name="Chats" component={NowScreen} />
      <Tab.Screen name="Workspaces" component={WorkspacesScreen} />
      <Tab.Screen name="Settings">{(props) => <SettingsScreen {...props} onUnpair={onUnpair} />}</Tab.Screen>
    </Tab.Navigator>
  );
}
