import { expect, jest, test } from '@jest/globals';
import React from 'react';
import { render, screen } from '@testing-library/react-native';
import * as Notifications from 'expo-notifications';
import { SettingsScreen } from './SettingsScreen';

jest.mock('../services/rpc', () => ({ OstiaRpc: { getPairing: () => null } }));
jest.mock('../services/workspaceStore', () => ({ useCaps: () => [], useConnectionStatus: () => 'connected' }));
jest.mock('../services/prefsStore', () => ({
  usePrefs: () => ({ fontSize: 13, fitWhenWatching: true, keyRow: true, haptics: true }),
  setPrefs: jest.fn(),
}));
jest.mock('../services/alertPrefsStore', () => ({
  useAlertPrefs: () => ({ waiting: true, done: true, failed: true }),
  setAlertPrefs: jest.fn(),
}));
jest.mock('../services/connectionLog', () => ({ connectionLogText: () => '' }));
jest.mock('../services/openTailscaleApp', () => ({ openTailscaleApp: jest.fn() }));

test('NTF-C7 shows Off with an Allow button when notification permission is denied', async () => {
  jest.mocked(Notifications.getPermissionsAsync).mockResolvedValue({ granted: false } as never);
  await render(<SettingsScreen navigation={{ navigate: jest.fn() } as any} route={{} as any} onUnpair={jest.fn(async () => {})} />);
  expect(await screen.findByText('Off')).toBeTruthy();
  expect(screen.getByText('Allow')).toBeTruthy();
  ['Agent needs you', 'Agent finished', 'Agent failed'].forEach((label) => expect(screen.getByText(label)).toBeTruthy());
});
