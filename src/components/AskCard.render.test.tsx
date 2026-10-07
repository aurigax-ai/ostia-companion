import { expect, jest, test } from '@jest/globals';
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { Ask } from '../model/asks';
import { AskCard } from './AskCard';

const PERMISSION: Ask = {
  askId: 'ask-1',
  sessionId: 's',
  paneId: 'p',
  kind: 'permission',
  agent: 'claude',
  title: 'Run Bash: apply the migration?',
  detail: 'psql -f db/migrations/0042.sql',
  choices: [
    { id: 'allow-once', label: 'Allow once', tone: 'approve' },
    { id: 'allow-always', label: 'Always allow', tone: 'neutral' },
    { id: 'deny', label: 'Deny', tone: 'deny' },
  ],
  allowText: false,
  since: Date.now(),
};

test('AGT-C7 a permission card shows the detail and its three choices, and sends the one tapped', async () => {
  const onAnswer = jest.fn();
  await render(<AskCard ask={PERMISSION} workspace="api-server" canRespond onAnswer={onAnswer} />);
  expect(screen.getByText('psql -f db/migrations/0042.sql')).toBeTruthy();
  ['Allow once', 'Always allow', 'Deny'].forEach((label) => expect(screen.getByText(label)).toBeTruthy());
  await fireEvent.press(screen.getByText('Allow once'));
  expect(onAnswer).toHaveBeenCalledWith({ choiceId: 'allow-once' });
});

test('AGT-C8 a failed answer shows its reason and the buttons work again', async () => {
  const onAnswer = jest.fn();
  await render(
    <AskCard ask={PERMISSION} workspace="api-server" canRespond error="Not connected to the desktop" onAnswer={onAnswer} />,
  );
  expect(screen.getByText('Not connected to the desktop')).toBeTruthy();
  await fireEvent.press(screen.getByText('Deny'));
  expect(onAnswer).toHaveBeenCalledWith({ choiceId: 'deny' });
});

test('AGT-C10 without respond the buttons are disabled and the card says how to turn it on', async () => {
  const onAnswer = jest.fn();
  await render(<AskCard ask={PERMISSION} workspace="api-server" canRespond={false} onAnswer={onAnswer} />);
  await fireEvent.press(screen.getByText('Allow once'));
  expect(onAnswer).not.toHaveBeenCalled();
  expect(screen.getByText('Turn on Respond for this phone in Settings › Remote.')).toBeTruthy();
});
