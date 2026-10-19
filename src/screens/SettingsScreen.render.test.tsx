import { expect, jest, test } from '@jest/globals';
import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { SettingsScreen } from './SettingsScreen';

const mockState = { status: 'connected' as string };

jest.mock('../services/rpc', () => ({
  OstiaRpc: {
    getPairing: () => ({
      deviceToken: 'tok',
      deviceId: 'dev_abc123',
      pinnedFingerprint: 'sha256/ct2Vi9f8LA9Tqt327EitnbCE4esxoxyvNCatZHNRjKA=',
      desktopName: 'Studio Linux',
      gatewayHost: '100.87.12.4',
      gatewayPort: 8722,
      privateKey: 'priv',
      publicKey: 'pub',
    }),
  },
}));
jest.mock('../services/workspaceStore', () => ({
  useCaps: () => ['read', 'notify', 'input'],
  useConnectionStatus: () => mockState.status,
}));
jest.mock('../services/prefsStore', () => ({
  usePrefs: () => ({ fontSize: 13, fitWhenWatching: true, keyRow: true, haptics: true }),
  setPrefs: jest.fn(),
}));
jest.mock('../services/connectionLog', () => ({ connectionLogText: () => '' }));
jest.mock('../services/openTailscaleApp', () => ({ openTailscaleApp: jest.fn() }));
jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { version: '1.0.0' } } }));

async function renderSettings() {
  await render(<SettingsScreen navigation={{ navigate: jest.fn() } as any} route={{} as any} onUnpair={jest.fn(async () => {})} />);
}

test('SET-C11 shows the desktop, its connection, access, terminal options and the version', async () => {
  mockState.status = 'connected';
  await renderSettings();
  for (const text of ['Studio Linux', 'Connected', 'Tailscale', '100.87.12.4:8722', 'ct2Vi9f8LA9T', 'dev_abc123',
    'Type in terminals', 'Text size', 'Key row', 'Haptics', 'Fit desktop width when watching', '1.0.0', 'Share connection log']) {
    expect(screen.getByText(text)).toBeTruthy();
  }
});

test('SET-C12 keeps showing the stored details while the desktop is offline', async () => {
  mockState.status = 'disconnected';
  await renderSettings();
  expect(screen.getByText('Offline')).toBeTruthy();
  expect(screen.getByText('100.87.12.4:8722')).toBeTruthy();
  expect(screen.getByText('ct2Vi9f8LA9T')).toBeTruthy();
});
