import { Platform } from 'react-native';
import { requireNativeModule } from 'expo-modules-core';

const AgentWatch = Platform.OS === 'android' ? requireNativeModule('AgentWatch') : null;

export function startAgentWatch(text: string): void {
  AgentWatch?.start(text);
}

export function stopAgentWatch(): void {
  AgentWatch?.stop();
}
