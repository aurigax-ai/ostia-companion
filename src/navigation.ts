import type { NativeStackScreenProps } from '@react-navigation/native-stack';

export type RootStack = {
  Home: undefined;
  Workspace: { sessionId: string; name: string };
  Terminal: { paneId: string; title: string };
  Settings: undefined;
  Desktops: undefined;
  Pair: undefined;
  PairLink: undefined;
  PairCode: { name: string; host: string; port: number; fingerprint: string };
};

export type ScreenProps<Name extends keyof RootStack> = NativeStackScreenProps<RootStack, Name>;
