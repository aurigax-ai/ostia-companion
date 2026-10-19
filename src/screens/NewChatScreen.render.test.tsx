import { beforeEach, expect, jest, test } from '@jest/globals';
import React, { useMemo, useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NewChatScreen } from './NewChatScreen';

const mockChat = {
  caps: ['read', 'notify', 'respond'],
  phone: true,
  last: null as string | null,
  start: jest.fn(async (..._args: unknown[]) => ({ ok: true, paneId: 'p-new' }) as { ok: boolean; paneId?: string; text?: string }),
  remember: jest.fn(),
};

jest.mock('../services/agentStart', () => ({ startAgent: (...args: unknown[]) => mockChat.start(...args) }));
jest.mock('../services/workspaceStore', () => ({
  useCaps: () => mockChat.caps,
  useWorkspaces: () => ({
    sessions: [
      { sessionId: 's-scratch', name: 'scratch', kind: 'scratch', workDir: '/s', state: 'idle' },
      { sessionId: 's-api', name: 'api-server', kind: 'agent', workDir: '/a', state: 'idle' },
      { sessionId: 's-ledger', name: 'ledger-api', kind: 'agent', workDir: '/l', state: 'idle' },
    ],
  }),
}));
jest.mock('../services/listPrefsStore', () => ({
  useListPrefs: () => ({ unfolded: [], recent: [], lastChat: mockChat.last }),
  rememberChatWorkspace: (id: string) => mockChat.remember(id),
}));
jest.mock('../services/phoneSession', () => ({ phoneControlSupported: () => mockChat.phone }));
jest.mock('../services/snippets', () => ({ useSnippets: () => [] }));

const navigation = { replace: jest.fn(), setOptions: jest.fn() };

function WithHeader({ sessionId }: { sessionId?: string }) {
  const [options, setOptions] = useState<{ headerTitle?: () => React.ReactElement }>({});
  const withHeader = useMemo(() => ({ ...navigation, setOptions: (next: typeof options) => (navigation.setOptions(next), setOptions(next)) }), []);
  return (
    <>
      {options.headerTitle?.()}
      <NewChatScreen navigation={withHeader as any} route={{ params: sessionId ? { sessionId } : undefined } as any} />
    </>
  );
}

async function renderScreen(sessionId?: string) {
  await render(
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 412, height: 915 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
      <WithHeader sessionId={sessionId} />
    </SafeAreaProvider>,
  );
}

async function send(text: string) {
  await fireEvent.changeText(screen.getByLabelText('Message'), text);
  await fireEvent.press(screen.getByLabelText('Send'));
}

const phoneWorkspace = jest.requireMock<{ usePhoneWorkspace: jest.Mock }>('../services/phoneWorkspace').usePhoneWorkspace;

beforeEach(() => {
  phoneWorkspace.mockReturnValue(null);
  mockChat.caps = ['read', 'notify', 'respond'];
  mockChat.phone = true;
  mockChat.last = null;
  mockChat.start.mockClear();
  mockChat.remember.mockClear();
  navigation.replace.mockClear();
});

test('PHC-C20 PHA-C8 the first message starts claude in the first agent workspace once and opens its pane', async () => {
  await renderScreen();
  expect(screen.getByLabelText('In api-server. Choose the workspace')).toBeTruthy();
  await send('  fix the failing build  ');
  expect(mockChat.start).toHaveBeenCalledTimes(1);
  expect(mockChat.start).toHaveBeenCalledWith('s-api', 'claude', 'fix the failing build');
  expect(mockChat.remember).toHaveBeenCalledWith('s-api');
  expect(navigation.replace).toHaveBeenCalledWith('Conversation', { paneId: 'p-new', title: 'claude' });
});

test('PHA-C8 the header switches the agent and the workspace', async () => {
  await renderScreen('s-api');
  await fireEvent.press(screen.getByLabelText('To claude. Choose the agent'));
  await fireEvent.press(screen.getByText('codex'));
  await fireEvent.press(screen.getByLabelText('In api-server. Choose the workspace'));
  expect(screen.queryByText('scratch')).toBeNull();
  await fireEvent.press(screen.getByText('ledger-api'));
  await send('tidy the export module');
  expect(mockChat.start).toHaveBeenCalledWith('s-ledger', 'codex', 'tidy the export module');
});

test('PHA-C8 starts in the workspace used last when none is asked for', async () => {
  mockChat.last = 's-ledger';
  await renderScreen();
  expect(screen.getByLabelText('In ledger-api. Choose the workspace')).toBeTruthy();
});

test('PHA-C9 a slash shows the shortcuts, and a pick fills the message without sending', async () => {
  await renderScreen();
  await fireEvent.changeText(screen.getByLabelText('Message'), '/');
  expect(screen.getByLabelText('/storage')).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('/review'));
  await fireEvent.press(screen.getByText('ledger-api'));
  expect(screen.getByLabelText('Message').props.value).toBe('Review the last changes in ledger-api');
  expect(mockChat.start).not.toHaveBeenCalled();
  expect(navigation.replace).not.toHaveBeenCalled();
  await fireEvent.changeText(screen.getByLabelText('Message'), '/su');
  await fireEvent.press(screen.getByLabelText('/summary'));
  expect(screen.getByLabelText('Message').props.value).toBe('What changed today across my workspaces?');
  expect(mockChat.start).not.toHaveBeenCalled();
  expect(navigation.replace).not.toHaveBeenCalled();
});

test('PHA-C10 no /storage without phone control', async () => {
  mockChat.phone = false;
  await renderScreen();
  await fireEvent.changeText(screen.getByLabelText('Message'), '/');
  expect(screen.queryByLabelText('/storage')).toBeNull();
});

test('PHC-C21 a refusal is shown, the message stays and nothing opens', async () => {
  mockChat.start.mockResolvedValueOnce({ ok: false, text: 'That workspace is closed on the desktop.' });
  await renderScreen();
  await send('fix the failing build');
  expect(await screen.findByText('That workspace is closed on the desktop.')).toBeTruthy();
  expect(screen.getByLabelText('Message').props.value).toBe('fix the failing build');
  expect(navigation.replace).not.toHaveBeenCalled();
});

test('PHC-C22 without respond the composer is off and nothing is sent', async () => {
  mockChat.caps = ['read', 'notify'];
  await renderScreen();
  expect(screen.getByPlaceholderText('Turn on Respond in Settings › Remote')).toBeTruthy();
  await send('fix the failing build');
  expect(mockChat.start).not.toHaveBeenCalled();
});

test('an empty message sends nothing', async () => {
  await renderScreen();
  await send('   ');
  expect(mockChat.start).not.toHaveBeenCalled();
});

test('PHA-C27 with a Phone workspace, New chat talks to the Phone agent and sends no workspace or agent', async () => {
  phoneWorkspace.mockReturnValue({ set: true, agent: 'codex' });
  await renderScreen();
  expect(screen.getByLabelText('To Phone agent. Choose the agent')).toBeTruthy();
  expect(screen.getByLabelText('In codex · Phone. Choose the workspace')).toBeTruthy();
  await send('free up space on this phone');
  expect(mockChat.start).toHaveBeenCalledWith(null, null, 'free up space on this phone');
  expect(mockChat.remember).toHaveBeenCalledWith('phone');
});

test('PHA-C27 a workspace picked instead of the Phone workspace gets the chat', async () => {
  phoneWorkspace.mockReturnValue({ set: true, agent: 'claude' });
  await renderScreen();
  await fireEvent.press(screen.getByLabelText('In claude · Phone. Choose the workspace'));
  expect(screen.getByText('Phone')).toBeTruthy();
  await fireEvent.press(screen.getByText('ledger-api'));
  await send('tidy the export module');
  expect(mockChat.start).toHaveBeenCalledWith('s-ledger', 'claude', 'tidy the export module');
});
