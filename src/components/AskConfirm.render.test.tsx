import { expect, jest, test } from '@jest/globals';
import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { Ask } from '../model/asks';
import { AskCard } from './AskCard';

function ask(detail: string): Ask {
  return {
    askId: 'ask-1', sessionId: 's', paneId: 'p', kind: 'permission', agent: 'claude', title: 'Run Bash?', detail,
    choices: [
      { id: 'allow-once', label: 'Allow once', tone: 'approve' },
      { id: 'allow-always', label: 'Always allow', tone: 'neutral' },
      { id: 'deny', label: 'Deny', tone: 'deny' },
    ],
    allowText: false, since: Date.now(),
  };
}

type Buttons = { text?: string; onPress?: () => void }[];

async function tapWith(detail: string, label: string, confirmWith?: 'Allow' | 'Cancel') {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
    if (confirmWith) (buttons as Buttons).find((b) => b.text === confirmWith)?.onPress?.();
  });
  const onAnswer = jest.fn();
  await render(<AskCard ask={ask(detail)} workspace="api" canRespond onAnswer={onAnswer} />);
  await fireEvent.press(screen.getByText(label));
  const asked = alert.mock.calls.length > 0;
  alert.mockRestore();
  return { asked, onAnswer };
}

test('AGT-C21 Always allow asks to confirm and sends only after Allow', async () => {
  const cancelled = await tapWith('npm test', 'Always allow', 'Cancel');
  expect(cancelled.asked).toBe(true);
  expect(cancelled.onAnswer).not.toHaveBeenCalled();
  const allowed = await tapWith('npm test', 'Always allow', 'Allow');
  expect(allowed.onAnswer).toHaveBeenCalledWith({ choiceId: 'allow-always' });
});

test('AGT-C22 a destructive command asks to confirm, and Cancel sends nothing', async () => {
  for (const detail of ['rm -rf build', 'git push --force origin main', 'DROP TABLE users;', 'sudo apt remove x']) {
    const result = await tapWith(detail, 'Allow once', 'Cancel');
    expect(result.asked).toBe(true);
    expect(result.onAnswer).not.toHaveBeenCalled();
  }
});

test('AGT-C23 an ordinary Allow once or Deny sends without a confirm', async () => {
  const allow = await tapWith('npm test', 'Allow once');
  expect(allow.asked).toBe(false);
  expect(allow.onAnswer).toHaveBeenCalledWith({ choiceId: 'allow-once' });
  const deny = await tapWith('rm -rf build', 'Deny');
  expect(deny.asked).toBe(false);
  expect(deny.onAnswer).toHaveBeenCalledWith({ choiceId: 'deny' });
});
