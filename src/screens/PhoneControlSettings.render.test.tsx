import { beforeEach, expect, jest, test } from '@jest/globals';
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AllowModeScreen } from './AllowModeScreen';
import { SettingsScreen } from './SettingsScreen';

const mockControl = {
  supported: true,
  service: false,
  prefs: { mode: 'ask', chosen: [] as string[], level: 'control', limit: 15, fingerprint: true },
  confirm: jest.fn(async (..._args: unknown[]) => null as string | null),
  set: jest.fn(),
};

jest.mock('../services/phoneSession', () => ({
  phoneControlSupported: () => mockControl.supported,
  accessibilityEnabled: () => mockControl.service,
  openAccessibilitySettings: jest.fn(),
  confirmWithFingerprint: (...args: unknown[]) => mockControl.confirm(...args),
}));
jest.mock('../services/phoneControlStore', () => ({
  usePhoneControl: () => mockControl.prefs,
  setPhoneControl: (patch: object) => mockControl.set(patch),
}));
jest.mock('../services/blockedAppsStore', () => ({ useBlockedApps: () => [] }));
jest.mock('../services/rpc', () => ({ OstiaRpc: { getPairing: () => ({ desktopName: 'Studio', gatewayHost: '100.87.12.4', gatewayPort: 8722, deviceId: 'dev', pinnedFingerprint: 'sha256/x' }) } }));
jest.mock('../services/workspaceStore', () => ({
  useCaps: () => ['read'],
  useConnectionStatus: () => 'connected',
  useWorkspaces: () => ({
    sessions: [
      { sessionId: 's-ledger', name: 'ledger-api', kind: 'agent', workDir: '/l', state: 'idle', group: { id: 'g', name: 'goji' } },
      { sessionId: 's-scratch', name: 'scratch', kind: 'scratch', workDir: '/s', state: 'idle' },
    ],
  }),
}));
jest.mock('../services/prefsStore', () => {
  const prefs = { fontSize: 13, keyRow: true, haptics: false };
  return { usePrefs: () => prefs, getPrefs: () => prefs, setPrefs: jest.fn() };
});
jest.mock('../services/connectionLog', () => ({ connectionLogText: () => '' }));
jest.mock('../services/openTailscaleApp', () => ({ openTailscaleApp: jest.fn() }));
jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { version: '1.0.0' } } }));

const navigate = jest.fn();
const METRICS = { frame: { x: 0, y: 0, width: 412, height: 915 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
const inSafeArea = (node: React.ReactElement) => <SafeAreaProvider initialMetrics={METRICS}>{node}</SafeAreaProvider>;

beforeEach(() => {
  mockControl.supported = true;
  mockControl.service = false;
  mockControl.prefs = { mode: 'ask', chosen: [], level: 'control', limit: 15, fingerprint: true };
  mockControl.confirm.mockReset();
  mockControl.confirm.mockResolvedValue(null);
  mockControl.set.mockClear();
  navigate.mockClear();
});

test('PHA-C19 Settings holds every phone control setting in one section', async () => {
  await render(inSafeArea(<SettingsScreen navigation={{ navigate } as any} route={{} as any} onUnpair={jest.fn(async () => {})} />));
  for (const text of ['Phone control', 'Allow agents to use this phone', 'Ask every time', 'Default level', 'View and tap', 'Default time limit', '15 minutes', 'Require fingerprint', 'Accessibility service', 'Off · the desktop sees only black', 'Never-opened apps']) {
    expect(screen.getByText(text)).toBeTruthy();
  }
  await fireEvent.press(screen.getByText('Allow agents to use this phone'));
  expect(navigate).toHaveBeenCalledWith('AllowMode');
});

test('PHA-C20 a phone without phone control shows one disabled row with the reason', async () => {
  mockControl.supported = false;
  await render(inSafeArea(<SettingsScreen navigation={{ navigate } as any} route={{} as any} onUnpair={jest.fn(async () => {})} />));
  expect(screen.getByText('Use this phone')).toBeTruthy();
  expect(screen.getByText(/^Not available on/)).toBeTruthy();
  expect(screen.queryByText('Allow agents to use this phone')).toBeNull();
});

test('PHA-C16 changing the allow mode asks for the fingerprint first, and a failed check changes nothing', async () => {
  mockControl.confirm.mockResolvedValueOnce('not-verified');
  await render(inSafeArea(<AllowModeScreen navigation={{} as any} route={{} as any} />));
  await fireEvent.press(screen.getByLabelText('Off'));
  await waitFor(() => expect(mockControl.confirm).toHaveBeenCalled());
  expect(mockControl.set).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByLabelText('Off'));
  await waitFor(() => expect(mockControl.set).toHaveBeenCalledWith({ mode: 'off' }));
});

test('PHA-C15 chosen workspaces are ticked one by one, never a scratch workspace', async () => {
  mockControl.prefs = { ...mockControl.prefs, mode: 'chosen', fingerprint: false };
  await render(inSafeArea(<AllowModeScreen navigation={{} as any} route={{} as any} />));
  expect(screen.queryByText('scratch')).toBeNull();
  await fireEvent.press(screen.getByLabelText('ledger-api, not chosen'));
  await waitFor(() => expect(mockControl.set).toHaveBeenCalledWith({ chosen: ['s-ledger'] }));
  expect(mockControl.confirm).not.toHaveBeenCalled();
});

test('PHA-C27 Settings shows the Phone workspace the desktop set, read only', async () => {
  jest.requireMock<{ usePhoneWorkspace: jest.Mock }>('../services/phoneWorkspace').usePhoneWorkspace.mockReturnValue({ set: true, agent: 'codex' });
  await render(inSafeArea(<SettingsScreen navigation={{ navigate } as any} route={{} as any} onUnpair={jest.fn(async () => {})} />));
  expect(screen.getByText('Set on the desktop')).toBeTruthy();
  expect(screen.getByText('codex')).toBeTruthy();
});
