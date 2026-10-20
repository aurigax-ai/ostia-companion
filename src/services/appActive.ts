import { AppState } from 'react-native';

export function isActive(): boolean {
  return AppState.currentState === 'active';
}

export function onActive(callback: () => void): void {
  AppState.addEventListener('change', (state) => state === 'active' && callback());
}
