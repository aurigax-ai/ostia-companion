import type { FileRoot } from './model/files';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

export type RootStack = {
  Home: undefined;
  Workspace: { sessionId: string; name: string };
  Terminal: { paneId: string; title: string };
  Settings: undefined;
  Desktops: undefined;
  Files: { sessionId: string; path: string; title: string };
  FileView: { sessionId: string; path: string; name: string; root?: FileRoot };
  Artifacts: { sessionId: string; path: string; title: string };
  Pair: undefined;
  PairLink: undefined;
  PairCode: { name: string; host: string; port: number; fingerprint: string };
};

export type ScreenProps<Name extends keyof RootStack> = NativeStackScreenProps<RootStack, Name>;
