import type { FileRoot } from './model/files';
import type { CompositeScreenProps, NavigatorScreenParams } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { NativeBottomTabScreenProps } from '@react-navigation/bottom-tabs/unstable';

export type TabList = {
  Chats: undefined;
  Workspaces: undefined;
  Settings: undefined;
};

export type RootStack = {
  Main: NavigatorScreenParams<TabList> | undefined;
  Workspace: { sessionId: string; name: string; askId?: string };
  Terminal: { paneId: string; title: string };
  NewChat: { sessionId?: string } | undefined;
  Desktops: undefined;
  Files: { sessionId: string; path: string; title: string };
  FileView: { sessionId: string; path: string; name: string; root?: FileRoot };
  Artifacts: { sessionId: string; path: string; title: string };
  PhoneSession: undefined;
  BlockedApps: undefined;
  AllowMode: undefined;
  Pair: undefined;
  PairLink: undefined;
  PairCode: { name: string; host: string; port: number; fingerprint: string };
};

export type ScreenProps<Name extends keyof RootStack> = NativeStackScreenProps<RootStack, Name>;

export type TabProps<Name extends keyof TabList> = CompositeScreenProps<
  NativeBottomTabScreenProps<TabList, Name>,
  NativeStackScreenProps<RootStack>
>;
