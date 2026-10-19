import { expect, jest, test } from '@jest/globals';
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { BlockedAppsScreen } from './BlockedAppsScreen';

const mockSet = jest.fn();

jest.mock('../services/phoneSession', () => ({
  phoneApps: () => [
    { package: 'com.x8bit.bitwarden', label: 'Bitwarden', alwaysBlocked: true },
    { package: 'com.bank.app', label: 'My Bank', alwaysBlocked: false },
    { package: 'com.duolingo', label: 'Duolingo', alwaysBlocked: false },
  ],
}));
jest.mock('../services/blockedAppsStore', () => ({
  useBlockedApps: () => ['com.bank.app'],
  setBlocked: (...args: unknown[]) => mockSet(...args),
}));

test('PHC-C12 shows password managers as always blocked and lets the human add an app', async () => {
  await render(<BlockedAppsScreen />);
  expect(screen.getByLabelText('Never open Bitwarden').props.value).toBe(true);
  expect(screen.getByLabelText('Never open Bitwarden').props.disabled).toBe(true);
  expect(screen.getByLabelText('Never open My Bank').props.value).toBe(true);
  await fireEvent(screen.getByLabelText('Never open Duolingo'), 'valueChange', true);
  expect(mockSet).toHaveBeenCalledWith('com.duolingo', true);
});
