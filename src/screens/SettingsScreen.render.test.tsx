import { expect, jest, test } from '@jest/globals';
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import * as Haptics from 'expo-haptics';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SettingsScreen } from './SettingsScreen';

const METRICS = { frame: { x: 0, y: 0, width: 360, height: 800 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };

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
  usePrefs: () => ({ fontSize: 13, keyRow: true, haptics: true }),
  setPrefs: jest.fn(),
}));
const mockRename = jest.fn(async (_text: string) => true);
jest.mock('../services/phoneIdentity', () => ({
  usePhoneName: () => 'Pixel 9',
  renamePhone: (text: string) => mockRename(text),
}));
jest.mock('../services/connectionLog', () => ({ connectionLogText: () => '' }));
jest.mock('../services/openTailscaleApp', () => ({ openTailscaleApp: jest.fn() }));
jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(),
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
  NotificationFeedbackType: { Success: 'success', Warning: 'warning' },
}));
jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { version: '1.0.0' } } }));

async function renderSettings() {
  await render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <SettingsScreen navigation={{ navigate: jest.fn() } as any} route={{} as any} onUnpair={jest.fn(async () => {})} />
    </SafeAreaProvider>,
  );
}

test('SET-C11 shows the desktop, its connection, access, terminal options and the version', async () => {
  mockState.status = 'connected';
  await renderSettings();
  for (const text of ['Studio Linux', 'Connected', 'Tailscale', '100.87.12.4:8722', 'ct2Vi9f8LA9T', 'dev_abc123',
    'Type in terminals', 'Text size', 'Key row', 'Haptics', '1.0.0', 'Share connection log']) {
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

test('SET-C13 pressing rows, buttons and the stepper makes no haptic call, and Haptics says what it still covers', async () => {
  mockState.status = 'connected';
  await renderSettings();
  await fireEvent.press(screen.getByText('Desktops'));
  await fireEvent.press(screen.getByLabelText('Larger text'));
  await fireEvent.press(screen.getByLabelText('Smaller text'));
  await fireEvent.press(screen.getByLabelText('Key row'));
  expect(Haptics.selectionAsync).not.toHaveBeenCalled();
  expect(Haptics.impactAsync).not.toHaveBeenCalled();
  expect(Haptics.notificationAsync).not.toHaveBeenCalled();
  expect(screen.getByText('Buzz when pairing is approved or fails')).toBeTruthy();
});

test('PID-P16 shows the phone name and changes it from a sheet', async () => {
  mockState.status = 'connected';
  await renderSettings();
  expect(screen.getByText('Pixel 9')).toBeTruthy();
  await fireEvent.press(screen.getByText('Name'));
  const field = await screen.findByLabelText('Phone name');
  await fireEvent.changeText(field, 'Desk phone');
  await fireEvent.press(screen.getByText('Save'));
  expect(mockRename).toHaveBeenCalledWith('Desk phone');
});

test('PID-P17 will not save a name with a hidden character', async () => {
  mockState.status = 'connected';
  mockRename.mockClear();
  await renderSettings();
  await fireEvent.press(screen.getByText('Name'));
  await fireEvent.changeText(await screen.findByLabelText('Phone name'), 'bad\u202Ename');
  expect(screen.getByText('Use letters, numbers and punctuation only.')).toBeTruthy();
  await fireEvent.press(screen.getByText('Save'));
  expect(mockRename).not.toHaveBeenCalled();
});
