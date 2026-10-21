import { expect, jest, test } from '@jest/globals';
import React from 'react';
import { render, screen } from '@testing-library/react-native';
import * as Notifications from 'expo-notifications';
import { SettingsScreen } from './SettingsScreen';

jest.mock('../services/rpc', () => ({ OstiaRpc: { getPairing: () => null } }));
jest.mock('../services/workspaceStore', () => ({ useCaps: () => [], useConnectionStatus: () => 'connected' }));
jest.mock('../services/prefsStore', () => ({
  usePrefs: () => ({ fontSize: 13, keyRow: true, haptics: true }),
  setPrefs: jest.fn(),
}));
jest.mock('../services/alertPrefsStore', () => ({
  useAlertPrefs: () => ({ waiting: true, done: true, failed: true }),
  setAlertPrefs: jest.fn(),
}));
let mockPush: { server: string | null; state: string } = { server: 'https://api.example.com', state: 'on' };
jest.mock('../services/pushRegistration', () => ({ usePushStatus: () => mockPush }));
jest.mock('../services/connectionLog', () => ({ connectionLogText: () => '' }));
jest.mock('../services/openTailscaleApp', () => ({ openTailscaleApp: jest.fn() }));

test('NTF-C7 shows Off with an Allow button when notification permission is denied', async () => {
  jest.mocked(Notifications.getPermissionsAsync).mockResolvedValue({ granted: false } as never);
  await render(<SettingsScreen navigation={{ navigate: jest.fn() } as any} route={{} as any} onUnpair={jest.fn(async () => {})} />);
  expect(await screen.findByText('Off')).toBeTruthy();
  expect(screen.getByText('Allow')).toBeTruthy();
  ['Agent needs you', 'Agent finished', 'Agent failed'].forEach((label) => expect(screen.getByText(label)).toBeTruthy());
});

const SERVER = 'https://api.example.com';

test.each([
  [{ server: SERVER, state: 'on' }, 'On'],
  [{ server: null, state: 'off' }, 'Off'],
  [{ server: SERVER, state: 'unavailable' }, 'Unavailable (build)'],
  [{ server: SERVER, state: 'refused' }, 'Refused by the server'],
  [{ server: SERVER, state: 'notAllowed' }, 'Off: notifications not allowed'],
  [{ server: SERVER, state: 'registering' }, 'Setting up'],
])('PSH-S1 shows the server notification value for %j', async (status, text) => {
  mockPush = status;
  jest.mocked(Notifications.getPermissionsAsync).mockResolvedValue({ granted: undefined } as never);
  await render(<SettingsScreen navigation={{ navigate: jest.fn() } as any} route={{} as any} onUnpair={jest.fn(async () => {})} />);
  expect(await screen.findByText('Notifications through the server')).toBeTruthy();
  expect(screen.getByText(text)).toBeTruthy();
});
