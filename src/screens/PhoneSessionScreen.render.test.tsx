import { beforeEach, expect, jest, test } from '@jest/globals';
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { PhoneSessionScreen } from './PhoneSessionScreen';

const mockSession = {
  supported: true,
  status: { state: 'idle', reason: null, endsAt: 0, screenId: null, sessionId: null } as Record<string, unknown>,
  start: jest.fn(async (..._args: unknown[]) => null as string | null),
  stop: jest.fn(),
};

jest.mock('../services/phoneSession', () => ({
  phoneControlSupported: () => mockSession.supported,
  usePhoneSession: () => mockSession.status,
  startPhoneSession: (...args: unknown[]) => mockSession.start(...args),
  stopPhoneSession: () => mockSession.stop(),
}));
jest.mock('../services/rpc', () => ({ OstiaRpc: { getPairing: () => ({ desktopName: 'studio' }) } }));
jest.mock('../services/workspaceStore', () => ({ useConnectionStatus: () => 'connected' }));

async function renderScreen() {
  await render(<PhoneSessionScreen navigation={{} as any} route={{ params: { sessionId: 's-phone', name: 'phone' } } as any} />);
}

beforeEach(() => {
  mockSession.supported = true;
  mockSession.status = { state: 'idle', reason: null, endsAt: 0, screenId: null, sessionId: null };
  mockSession.start.mockClear();
  mockSession.stop.mockClear();
});

test('PHC-C1 starts a session for this workspace with the chosen limit', async () => {
  await renderScreen();
  expect(screen.getByText('An agent on studio will see this screen while the session runs.')).toBeTruthy();
  await fireEvent.press(screen.getByText('30 min'));
  await fireEvent.press(screen.getByText('Start'));
  expect(mockSession.start).toHaveBeenCalledWith('s-phone', 'phone', 30);
});

test('PHC-C2 says nothing was sent when the capture prompt is cancelled', async () => {
  mockSession.start.mockResolvedValueOnce('cancelled');
  await renderScreen();
  await fireEvent.press(screen.getByText('Start'));
  expect(await screen.findByText('Not started. Nothing was sent to the desktop.')).toBeTruthy();
});

test('PHC-C3 asks for a screen lock before anything starts', async () => {
  mockSession.start.mockResolvedValueOnce('lock-needed');
  await renderScreen();
  await fireEvent.press(screen.getByText('Start'));
  expect(await screen.findByText('Set a screen lock on this phone first. Sharing needs your fingerprint or PIN.')).toBeTruthy();
});

test('PHC-C15 offers nothing on a phone that cannot be shared', async () => {
  mockSession.supported = false;
  await renderScreen();
  expect(screen.getByText(/This phone cannot be shared/)).toBeTruthy();
  await fireEvent.press(screen.getByText('Start'));
  expect(mockSession.start).not.toHaveBeenCalled();
});

test('PHC-C7 shows the running session with the time left and stops it', async () => {
  mockSession.status = { state: 'running', reason: null, endsAt: Date.now() + 61_000, screenId: 'scr_1', sessionId: 's-phone' };
  await renderScreen();
  expect(screen.getByText('studio can see this screen')).toBeTruthy();
  expect(screen.getByText(/phone · 1:0\d left/)).toBeTruthy();
  await fireEvent.press(screen.getByText('Stop'));
  expect(mockSession.stop).toHaveBeenCalled();
});

test('PHC-C5 says why the last session ended', async () => {
  mockSession.status = { state: 'stopped', reason: 'time-limit', endsAt: 1, screenId: 'scr_1', sessionId: 's-phone' };
  await renderScreen();
  expect(screen.getByText('The time limit ended the session.')).toBeTruthy();
});
