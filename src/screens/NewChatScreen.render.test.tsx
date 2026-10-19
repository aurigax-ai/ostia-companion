import { beforeEach, expect, jest, test } from '@jest/globals';
import React, { useMemo, useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NewChatScreen } from './NewChatScreen';

const mockStart = {
  caps: ['read', 'notify', 'respond'],
  start: jest.fn(async (..._args: unknown[]) => ({ ok: true, paneId: 'p-new' }) as { ok: boolean; paneId?: string; text?: string }),
};

jest.mock('../services/agentStart', () => ({ startAgent: (...args: unknown[]) => mockStart.start(...args) }));
jest.mock('../services/workspaceStore', () => ({ useCaps: () => mockStart.caps }));

const navigation = { replace: jest.fn(), setOptions: jest.fn() };

function WithHeader() {
  const [options, setOptions] = useState<{ headerTitle?: () => React.ReactElement }>({});
  const withHeader = useMemo(() => ({ ...navigation, setOptions: (next: typeof options) => (navigation.setOptions(next), setOptions(next)) }), []);
  return (
    <>
      {options.headerTitle?.()}
      <NewChatScreen navigation={withHeader as any} route={{ params: { sessionId: 's-api', name: 'api-server' } } as any} />
    </>
  );
}

async function renderScreen() {
  await render(
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 412, height: 915 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
      <WithHeader />
    </SafeAreaProvider>,
  );
}

beforeEach(() => {
  mockStart.caps = ['read', 'notify', 'respond'];
  mockStart.start.mockClear();
  navigation.replace.mockClear();
  navigation.setOptions.mockClear();
});

test('PHC-C20 the first message starts claude in this workspace once and opens its pane', async () => {
  await renderScreen();
  expect(screen.getByText('Your message starts claude in a new tab of api-server.')).toBeTruthy();
  await fireEvent.changeText(screen.getByLabelText('Message'), '  fix the failing build  ');
  await fireEvent.press(screen.getByLabelText('Send'));
  expect(mockStart.start).toHaveBeenCalledTimes(1);
  expect(mockStart.start).toHaveBeenCalledWith('s-api', 'claude', 'fix the failing build');
  expect(navigation.replace).toHaveBeenCalledWith('Terminal', { paneId: 'p-new', title: 'claude' });
});

test('PHC-C20 the header switches the message to codex', async () => {
  await renderScreen();
  await fireEvent.press(screen.getByLabelText('To claude in api-server. Switch to codex'));
  expect(screen.getByText('Your message starts codex in a new tab of api-server.')).toBeTruthy();
});

test('PHC-C21 a refusal is shown, the message stays and nothing opens', async () => {
  mockStart.start.mockResolvedValueOnce({ ok: false, text: 'That workspace is closed on the desktop.' });
  await renderScreen();
  await fireEvent.changeText(screen.getByLabelText('Message'), 'fix the failing build');
  await fireEvent.press(screen.getByLabelText('Send'));
  expect(await screen.findByText('That workspace is closed on the desktop.')).toBeTruthy();
  expect(screen.getByLabelText('Message').props.value).toBe('fix the failing build');
  expect(navigation.replace).not.toHaveBeenCalled();
});

test('PHC-C22 without respond the composer is off and nothing is sent', async () => {
  mockStart.caps = ['read', 'notify'];
  await renderScreen();
  expect(screen.getByPlaceholderText('Turn on Respond in Settings › Remote')).toBeTruthy();
  await fireEvent.changeText(screen.getByLabelText('Message'), 'fix the failing build');
  await fireEvent.press(screen.getByLabelText('Send'));
  expect(mockStart.start).not.toHaveBeenCalled();
});

test('an empty message sends nothing', async () => {
  await renderScreen();
  await fireEvent.changeText(screen.getByLabelText('Message'), '   ');
  await fireEvent.press(screen.getByLabelText('Send'));
  expect(mockStart.start).not.toHaveBeenCalled();
});
