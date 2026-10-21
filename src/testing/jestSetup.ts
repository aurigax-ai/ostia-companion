import { jest } from '@jest/globals';
import { FlatList, Image, Modal, ScrollView, TextInput } from 'react-native';

void [FlatList, Image, Modal, ScrollView, TextInput];

jest.mock('expo-notifications', () => ({
  getPermissionsAsync: jest.fn(async () => ({ granted: true })),
  requestPermissionsAsync: jest.fn(async () => ({ granted: true })),
}));

jest.mock('../services/phoneWorkspace', () => ({ usePhoneWorkspace: jest.fn(() => null) }));
jest.mock('@react-navigation/elements', () => ({ useHeaderHeight: () => 0 }));
jest.mock('react-native-webview', () => ({ WebView: 'WebView' }));
jest.mock('../generated/mermaidSource', () => ({ MERMAID_SOURCE: '' }));
jest.mock('expo-file-system', () => ({ File: jest.fn(), Paths: { cache: 'cache' } }));
jest.mock('expo-sharing', () => ({ shareAsync: jest.fn(async () => {}) }));
jest.mock('../services/dictation', () => ({
  useDictation: () => ({ listening: false, problem: null, abort: () => {}, toggle: () => {} }),
}));
jest.mock('../services/images', () => ({ pickImage: jest.fn(async () => null) }));
jest.mock('../services/orientation', () => ({ lockLandscape: jest.fn(async () => {}), lockPortrait: jest.fn(async () => {}) }));
