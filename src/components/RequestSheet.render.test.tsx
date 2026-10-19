import { beforeEach, expect, jest, test } from '@jest/globals';
import React from 'react';
import { AppState } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
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
  appState: 'active',
  start: jest.fn(async (..._args: unknown[]) => null as string | null),
  call: jest.fn(async (..._args: unknown[]) => ({})),
  notify: jest.fn(async (..._args: unknown[]) => 'id'),
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
jest.mock('../services/rpc', () => ({
  OstiaRpc: { getPairing: () => ({ desktopName: 'studio' }), addEventListener: () => () => {}, call: (...args: unknown[]) => mockPhone.call(...args) },
}));
jest.mock('../services/workspaceStore', () => ({ onWorkspaces: () => () => {} }));
jest.mock('expo-notifications', () => ({
  scheduleNotificationAsync: (...args: unknown[]) => mockPhone.notify(...args),
  dismissNotificationAsync: jest.fn(async () => {}),
  setNotificationCategoryAsync: jest.fn(async () => null),
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
}));

Object.defineProperty(AppState, 'currentState', { configurable: true, get: () => mockPhone.appState });

const SESSIONS = [
  { sessionId: 's-ledger', name: 'ledger-api', kind: 'agent', workDir: '/l', state: 'idle' as const },
  { sessionId: 's-atlas', name: 'atlas-web', kind: 'agent', workDir: '/a', state: 'idle' as const },
];
const LEDGER = { requestId: 'req-1', sessionId: 's-ledger', by: 'agent', agent: 'claude', reason: 'Free up space: find apps unused for 3 months' };
const METRICS = { frame: { x: 0, y: 0, width: 412, height: 915 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
const TITLE = 'claude in ledger-api wants to use this phone';

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

const declines = () => mockPhone.call.mock.calls.filter(([method]) => method === 'screen.decline').map(([, params]) => params);

beforeEach(async () => {
  await act(async () => denyRequest());
  mockPhone.prefs = { ...DEFAULT_PHONE_CONTROL };
  mockPhone.service = true;
  mockPhone.supported = true;
  mockPhone.state = 'idle';
  mockPhone.appState = 'active';
  mockPhone.start.mockClear();
  mockPhone.start.mockResolvedValue(null);
  mockPhone.call.mockClear();
  mockPhone.notify.mockClear();
});

test('PHA-C11 shows the agent, its workspace and its reason with the default level and limit', async () => {
  await renderSheet();
  await request(LEDGER);
  expect(screen.getByText(TITLE)).toBeTruthy();
  expect(screen.getByText('Free up space: find apps unused for 3 months')).toBeTruthy();
  expect(screen.getByRole('radio', { name: 'View and tap' }).props.accessibilityState).toEqual({ checked: true });
  expect(screen.getByRole('radio', { name: '15 min' }).props.accessibilityState).toEqual({ checked: true });
  expect(screen.getByText('Next, Android asks you to share your screen.')).toBeTruthy();
});

test('PHC-C1 PHA-C12 Allow starts the session with the sheet\'s level and limit, the agent and the request it answers', async () => {
  await renderSheet();
  await request(LEDGER);
  await fireEvent.press(screen.getByRole('radio', { name: 'View only' }));
  await fireEvent.press(screen.getByRole('radio', { name: '30 min' }));
  await fireEvent.press(screen.getByText('Allow'));
  expect(mockPhone.start).toHaveBeenCalledWith('s-ledger', 'ledger-api', { level: 'view', limit: 30, fingerprint: true, agent: 'claude', requestId: 'req-1' });
  expect(screen.queryByText(TITLE)).toBeNull();
  expect(declines()).toEqual([]);
});

test('PHA-C13 Deny closes the sheet, starts nothing and declines once', async () => {
  await renderSheet();
  await request(LEDGER);
  await fireEvent.press(screen.getByText('Deny'));
  expect(screen.queryByText(TITLE)).toBeNull();
  expect(mockPhone.start).not.toHaveBeenCalled();
  expect(declines()).toEqual([{ requestId: 'req-1', reason: 'denied' }]);
});

test('PHA-C13 a request nobody answers is declined after 60 seconds', async () => {
  jest.useFakeTimers();
  try {
    await renderSheet();
    await request(LEDGER);
    await act(async () => jest.advanceTimersByTime(60_000));
    expect(screen.queryByText(TITLE)).toBeNull();
    expect(mockPhone.start).not.toHaveBeenCalled();
    expect(declines()).toEqual([{ requestId: 'req-1', reason: 'denied' }]);
  } finally {
    jest.useRealTimers();
  }
});

test('PHA-C14 Off shows nothing, starts nothing and declines with off', async () => {
  mockPhone.prefs = { ...DEFAULT_PHONE_CONTROL, mode: 'off' };
  await renderSheet();
  await request(LEDGER);
  expect(screen.queryByText(TITLE)).toBeNull();
  expect(mockPhone.start).not.toHaveBeenCalled();
  expect(declines()).toEqual([{ requestId: 'req-1', reason: 'off' }]);
});

test('PHA-C20 a phone without phone control declines with unsupported', async () => {
  mockPhone.supported = false;
  await renderSheet();
  await request(LEDGER);
  expect(screen.queryByText(TITLE)).toBeNull();
  expect(declines()).toEqual([{ requestId: 'req-1', reason: 'unsupported' }]);
});

test('PHA-C15 a chosen workspace skips the sheet and goes straight to the checks; another one asks', async () => {
  mockPhone.prefs = { ...DEFAULT_PHONE_CONTROL, mode: 'chosen', chosen: ['s-ledger'], level: 'view', limit: 5 };
  await renderSheet();
  await request(LEDGER);
  expect(screen.queryByText(TITLE)).toBeNull();
  expect(mockPhone.start).toHaveBeenCalledWith('s-ledger', 'ledger-api', { level: 'view', limit: 5, fingerprint: true, agent: 'claude', requestId: 'req-1' });
  await request({ ...LEDGER, requestId: 'req-2', sessionId: 's-atlas' });
  expect(screen.getByText('claude in atlas-web wants to use this phone')).toBeTruthy();
});

test('PHA-C15 in the background a chosen workspace says plainly it will start there, and waits for the app', async () => {
  mockPhone.prefs = { ...DEFAULT_PHONE_CONTROL, mode: 'chosen', chosen: ['s-ledger'] };
  mockPhone.appState = 'background';
  await renderSheet();
  await request(LEDGER);
  expect(mockPhone.start).not.toHaveBeenCalled();
  expect(mockPhone.notify).toHaveBeenCalledWith(
    expect.objectContaining({ content: expect.objectContaining({ title: 'claude in ledger-api will use this phone', categoryIdentifier: 'screen-request-allowed' }) }),
  );
});

test('PHA-C18 a second request replaces the first, which is declined as busy', async () => {
  await renderSheet();
  await request(LEDGER);
  await request({ requestId: 'req-2', sessionId: 's-atlas', by: 'desktop' });
  expect(screen.queryByText(TITLE)).toBeNull();
  expect(screen.getByText('An agent in atlas-web wants to use this phone')).toBeTruthy();
  expect(declines()).toEqual([{ requestId: 'req-1', reason: 'busy' }]);
});

test('a request during a running session is declined as busy and shows nothing', async () => {
  mockPhone.state = 'running';
  await renderSheet();
  await request(LEDGER);
  expect(screen.queryByText(TITLE)).toBeNull();
  expect(declines()).toEqual([{ requestId: 'req-1', reason: 'busy' }]);
});

test('a v1.8 desktop sends no request id, so nothing is declined', async () => {
  await renderSheet();
  await request({ sessionId: 's-ledger', by: 'desktop' });
  await fireEvent.press(screen.getByText('Deny'));
  expect(mockPhone.call).not.toHaveBeenCalled();
});

test('PHA-C17 the allow mode and the ticked workspaces never leave the phone', async () => {
  mockPhone.prefs = { ...DEFAULT_PHONE_CONTROL, mode: 'chosen', chosen: ['s-secret'] };
  await renderSheet();
  await request(LEDGER);
  await fireEvent.press(screen.getByText('Deny'));
  mockPhone.prefs = { ...DEFAULT_PHONE_CONTROL, mode: 'off', chosen: ['s-secret'] };
  await request({ ...LEDGER, requestId: 'req-3' });
  const sent = JSON.stringify([...mockPhone.call.mock.calls, ...mockPhone.start.mock.calls, ...mockPhone.notify.mock.calls]);
  expect(sent).not.toContain('s-secret');
  expect(sent).not.toContain('chosen');
  expect(sent).not.toContain('mode');
  expect(declines()).toEqual([{ requestId: 'req-1', reason: 'denied' }, { requestId: 'req-3', reason: 'off' }]);
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
  expect(declines()).toEqual([{ requestId: 'req-1', reason: 'denied' }]);
});

test('PHC-C3 a phone without a screen lock is told to set one', async () => {
  mockPhone.start.mockResolvedValueOnce('lock-needed');
  await renderSheet();
  await request(LEDGER);
  await fireEvent.press(screen.getByText('Allow'));
  expect(await screen.findByText('Set a screen lock on this phone first. Sharing needs your fingerprint or PIN.')).toBeTruthy();
});
