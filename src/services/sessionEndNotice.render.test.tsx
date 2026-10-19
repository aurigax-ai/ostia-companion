import { expect, jest, test } from '@jest/globals';
import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { SnackbarHost } from '../components/ui';
import { startSessionEndNotice } from './phoneSession';

const mockNative: { listener: (status: { state: string; reason: string | null }) => void } = { listener: () => {} };

jest.mock('phone-control', () => ({
  isSupported: () => true,
  sessionStatus: () => ({ state: 'idle', reason: null, endsAt: 0, screenId: null, sessionId: null }),
  addStatusListener: (listener: (status: { state: string; reason: string | null }) => void) => {
    mockNative.listener = listener;
    return () => {};
  },
}));
jest.mock('./rpc', () => ({ OstiaRpc: { getPairing: () => null } }));

test('PHA-C21 a session that ended at its limit says so once, with Details and no question', async () => {
  const details = jest.fn();
  startSessionEndNotice(details);
  await render(<SnackbarHost />);
  await act(async () => mockNative.listener({ state: 'running', reason: null }));
  expect(screen.queryByText(/Phone control ended/)).toBeNull();
  await act(async () => mockNative.listener({ state: 'stopped', reason: 'time-limit' }));
  expect(screen.getByText('Phone control ended · time limit')).toBeTruthy();
  expect(screen.getAllByRole('button').map((button) => button.props.accessibilityLabel ?? '')).not.toContain('Allow');
  await fireEvent.press(screen.getByText('Details'));
  expect(details).toHaveBeenCalledTimes(1);
  await act(async () => mockNative.listener({ state: 'stopped', reason: 'time-limit' }));
  expect(screen.queryByText(/Phone control ended/)).toBeNull();
});
