import { beforeEach, expect, jest, test } from '@jest/globals';
import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { AppState } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { RequestSheet } from './RequestSheet';
import { SnackbarHost } from './ui';
import { denyRequest, receiveRequest } from '../services/screenRequests';
import { DEFAULT_PHONE_CONTROL, PhoneControlPrefs } from '../model/phoneControlPrefs';

const mockPhone = {
  prefs: { mode: 'ask', chosen: [], level: 'control', limit: 15, fingerprint: true } as PhoneControlPrefs,
  service: true,
  supported: true,
  state: 'idle',
  start: jest.fn(async (..._args: unknown[]) => null as string | null),
};

jest.mock('../services/phoneSession', () => ({
  phoneControlSupported: () => mockPhone.supported,
  accessibilityEnabled: () => mockPhone.service,
  openAccessibilitySettings: jest.fn(),
  currentPhoneSession: () => ({ state: mockPhone.state }),
  startPhoneSession: (...args: unknown[]) => mockPhone.start(...args),
}));
jest.mock('../services/phoneControlStore', () => ({
  getPhoneControl: () => mockPhone.prefs,
  usePhoneControl: () => mockPhone.prefs,
}));
jest.mock('../services/rpc', () => ({ OstiaRpc: { getPairing: () => ({ desktopName: 'studio' }), addEventListener: () => () => {} } }));
jest.mock('../services/workspaceStore', () => ({ onWorkspaces: () => () => {} }));
jest.mock('expo-notifications', () => ({
  scheduleNotificationAsync: jest.fn(async () => 'id'),
  dismissNotificationAsync: jest.fn(async () => {}),
  setNotificationCategoryAsync: jest.fn(async () => null),
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
}));

Object.defineProperty(AppState, 'currentState', { configurable: true, get: () => 'active' });

const SESSIONS = [
  { sessionId: 's-ledger', name: 'ledger-api', kind: 'agent', workDir: '/l', state: 'idle' as const },
  { sessionId: 's-atlas', name: 'atlas-web', kind: 'agent', workDir: '/a', state: 'idle' as const },
];
const LEDGER = { sessionId: 's-ledger', by: 'agent', agent: 'claude', reason: 'Free up space: find apps unused for 3 months' };
const METRICS = { frame: { x: 0, y: 0, width: 412, height: 915 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };

async function renderSheet() {
  await render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <RequestSheet />
      <SnackbarHost />
    </SafeAreaProvider>,
  );
}

async function request(payload: object) {
  await act(async () => receiveRequest(payload, SESSIONS));
}

beforeEach(async () => {
  mockPhone.prefs = { ...DEFAULT_PHONE_CONTROL };
  mockPhone.service = true;
  mockPhone.supported = true;
  mockPhone.state = 'idle';
  mockPhone.start.mockClear();
  mockPhone.start.mockResolvedValue(null);
  await act(async () => denyRequest());
});

test('PHA-C11 shows the agent, its workspace and its reason with the default level and limit', async () => {
  await renderSheet();
  await request(LEDGER);
  expect(screen.getByText('claude in ledger-api wants to use this phone')).toBeTruthy();
  expect(screen.getByText('Free up space: find apps unused for 3 months')).toBeTruthy();
  expect(screen.getByRole('radio', { name: 'View and tap' }).props.accessibilityState).toEqual({ checked: true });
  expect(screen.getByRole('radio', { name: '15 min' }).props.accessibilityState).toEqual({ checked: true });
  expect(screen.getByText('Next, Android asks you to share your screen.')).toBeTruthy();
});

test('PHC-C1 PHA-C12 Allow starts the session with the level and limit chosen on the sheet', async () => {
  await renderSheet();
  await request(LEDGER);
  await fireEvent.press(screen.getByRole('radio', { name: 'View only' }));
  await fireEvent.press(screen.getByRole('radio', { name: '30 min' }));
  await fireEvent.press(screen.getByText('Allow'));
  expect(mockPhone.start).toHaveBeenCalledWith('s-ledger', 'ledger-api', { level: 'view', limit: 30, fingerprint: true });
  expect(screen.queryByText('claude in ledger-api wants to use this phone')).toBeNull();
});

test('PHA-C13 Deny closes the sheet and starts nothing', async () => {
  await renderSheet();
  await request(LEDGER);
  await fireEvent.press(screen.getByText('Deny'));
  expect(screen.queryByText('claude in ledger-api wants to use this phone')).toBeNull();
  expect(mockPhone.start).not.toHaveBeenCalled();
});

test('PHA-C13 a request nobody answers goes after 60 seconds', async () => {
  jest.useFakeTimers();
  try {
    await renderSheet();
    await request(LEDGER);
    await act(async () => jest.advanceTimersByTime(60_000));
    expect(screen.queryByText('claude in ledger-api wants to use this phone')).toBeNull();
    expect(mockPhone.start).not.toHaveBeenCalled();
  } finally {
    jest.useRealTimers();
  }
});

test('PHA-C14 Off shows nothing and starts nothing', async () => {
  mockPhone.prefs = { ...DEFAULT_PHONE_CONTROL, mode: 'off' };
  await renderSheet();
  await request(LEDGER);
  expect(screen.queryByText('claude in ledger-api wants to use this phone')).toBeNull();
  expect(mockPhone.start).not.toHaveBeenCalled();
});

test('PHA-C15 a chosen workspace skips the sheet and goes straight to the checks; another one asks', async () => {
  mockPhone.prefs = { ...DEFAULT_PHONE_CONTROL, mode: 'chosen', chosen: ['s-ledger'], level: 'view', limit: 5 };
  await renderSheet();
  await request(LEDGER);
  expect(screen.queryByText('claude in ledger-api wants to use this phone')).toBeNull();
  expect(mockPhone.start).toHaveBeenCalledWith('s-ledger', 'ledger-api', { level: 'view', limit: 5, fingerprint: true });
  await request({ ...LEDGER, sessionId: 's-atlas' });
  expect(screen.getByText('claude in atlas-web wants to use this phone')).toBeTruthy();
});

test('PHA-C18 a second request replaces the first', async () => {
  await renderSheet();
  await request(LEDGER);
  await request({ sessionId: 's-atlas', by: 'desktop' });
  expect(screen.queryByText('claude in ledger-api wants to use this phone')).toBeNull();
  expect(screen.getByText('studio asks to use this phone')).toBeTruthy();
});

test('Allow waits for the accessibility service', async () => {
  mockPhone.service = false;
  await renderSheet();
  await request(LEDGER);
  expect(screen.getByText(/Without it the desktop sees only black/)).toBeTruthy();
  await fireEvent.press(screen.getByText('Allow'));
  expect(mockPhone.start).not.toHaveBeenCalled();
});

test('PHC-C2 a cancelled sharing dialog says nothing was sent', async () => {
  mockPhone.start.mockResolvedValueOnce('cancelled');
  await renderSheet();
  await request(LEDGER);
  await fireEvent.press(screen.getByText('Allow'));
  expect(await screen.findByText('Not started. Nothing was sent to the desktop.')).toBeTruthy();
});

test('PHC-C3 a phone without a screen lock is told to set one', async () => {
  mockPhone.start.mockResolvedValueOnce('lock-needed');
  await renderSheet();
  await request(LEDGER);
  await fireEvent.press(screen.getByText('Allow'));
  expect(await screen.findByText('Set a screen lock on this phone first. Sharing needs your fingerprint or PIN.')).toBeTruthy();
});

test('a request during a running session is left alone', async () => {
  mockPhone.state = 'running';
  await renderSheet();
  await request(LEDGER);
  expect(screen.queryByText('claude in ledger-api wants to use this phone')).toBeNull();
});
