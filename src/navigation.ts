import type { NativeStackScreenProps } from '@react-navigation/native-stack';

export type RootStack = {
  Home: undefined;
  Workspace: { sessionId: string; name: string };
  Terminal: { paneId: string; title: string };
  Settings: undefined;
  Pair: undefined;
  PairLink: undefined;
};

export type ScreenProps<Name extends keyof RootStack> = NativeStackScreenProps<RootStack, Name>;
