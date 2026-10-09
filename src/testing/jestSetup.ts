import { jest } from '@jest/globals';

jest.mock('expo-notifications', () => ({
  getPermissionsAsync: jest.fn(async () => ({ granted: true })),
  requestPermissionsAsync: jest.fn(async () => ({ granted: true })),
}));

jest.mock('react-native-webview', () => ({ WebView: 'WebView' }));
jest.mock('../generated/mermaidSource', () => ({ MERMAID_SOURCE: '' }));
jest.mock('expo-file-system', () => ({ File: jest.fn(), Paths: { cache: 'cache' } }));
jest.mock('expo-sharing', () => ({ shareAsync: jest.fn(async () => {}) }));
