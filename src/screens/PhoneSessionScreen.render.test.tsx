import { beforeEach, expect, jest, test } from '@jest/globals';
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { PhoneSessionScreen } from './PhoneSessionScreen';

const mockSession = {
  status: { state: 'idle', reason: null, endsAt: 0, screenId: null, sessionId: null } as Record<string, unknown>,
  stop: jest.fn(),
  resume: jest.fn(),
};

jest.mock('../services/phoneSession', () => ({
  usePhoneSession: () => mockSession.status,
  stopPhoneSession: () => mockSession.stop(),
  resumePhoneSession: () => mockSession.resume(),
}));
jest.mock('../services/rpc', () => ({ OstiaRpc: { getPairing: () => ({ desktopName: 'studio' }) } }));
jest.mock('../services/workspaceStore', () => ({
  useWorkspaces: () => ({ sessions: [{ sessionId: 's-phone', name: 'phone', kind: 'agent', workDir: '/p', state: 'idle' }] }),
}));

async function renderScreen() {
  await render(<PhoneSessionScreen navigation={{} as any} route={{} as any} />);
}

beforeEach(() => {
  mockSession.status = { state: 'idle', reason: null, endsAt: 0, screenId: null, sessionId: null };
  mockSession.stop.mockClear();
  mockSession.resume.mockClear();
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
  expect(screen.getByText(/The time limit ended the session\./)).toBeTruthy();
});

test('PHC-C9 shows a paused session with Resume', async () => {
  mockSession.status = { state: 'paused', reason: 'human-touch', endsAt: Date.now() + 61_000, screenId: 'scr_1', sessionId: 's-phone' };
  await renderScreen();
  expect(screen.getByText('Paused because you touched the screen')).toBeTruthy();
  await fireEvent.press(screen.getByText('Resume'));
  expect(mockSession.resume).toHaveBeenCalled();
});

test('PHA-C19 offers no start: an agent asks when a job needs the phone', async () => {
  await renderScreen();
  expect(screen.getByText(/An agent asks when a job needs this phone\./)).toBeTruthy();
  expect(screen.queryByText('Start')).toBeNull();
});
