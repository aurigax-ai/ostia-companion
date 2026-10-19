import { beforeEach, expect, jest, test } from '@jest/globals';
import React, { useMemo, useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ConversationScreen } from './ConversationScreen';

const mockConv = {
  turns: { kind: 'turns', list: { turns: [] as object[], truncated: false } } as object,
  later: null as object | null,
  loads: 0,
  output: jest.fn(async (..._args: unknown[]) => ({ ok: true, output: ' FAIL month.test.ts\nTests 1 failed' }) as object),
  prompt: jest.fn(async (..._args: unknown[]) => ({ ok: true }) as unknown),
  interrupt: jest.fn(async (..._args: unknown[]) => ({ ok: true }) as unknown),
  asks: [] as object[],
  caps: ['read', 'notify', 'respond'],
  agentState: 'done' as string,
};

const TURNS = {
  kind: 'turns',
  list: {
    truncated: true,
    turns: [
      {
        id: 't-1',
        startedAt: 1,
        prompt: 'Split the ledger export into monthly files',
        steps: [
          { id: 'st-1', kind: 'edit', target: 'src/export/month.ts', output: false },
          { id: 'st-3', kind: 'command', target: 'pnpm test export', exitCode: 1, output: true },
        ],
        final: 'Export now writes one file per month.',
        commands: 14,
        filesEdited: 4,
        ended: true,
      },
    ],
  },
};

jest.mock('../services/turns', () => ({
  loadTurns: async () => (mockConv.loads++ > 0 && mockConv.later ? mockConv.later : mockConv.turns),
  loadStepOutput: (...args: unknown[]) => mockConv.output(...args),
}));
jest.mock('../services/askStore', () => ({
  useAsks: () => ({ asks: mockConv.asks, unsupported: false, pending: {}, errors: {} }),
  answerAsk: jest.fn(),
  promptAgent: (...args: unknown[]) => mockConv.prompt(...args),
  interruptAgent: (...args: unknown[]) => mockConv.interrupt(...args),
}));
jest.mock('../services/workspaceStore', () => ({
  useCaps: () => mockConv.caps,
  useWorkspaces: () => ({
    sessions: [{ sessionId: 's-ostia', name: 'ostia', kind: 'agent', workDir: '/o', state: 'working' }],
    panes: [{ paneId: 'p-agent', sessionId: 's-ostia', kind: 'terminal', title: 'claude', running: true, blockCount: 1, agent: 'claude', agentState: mockConv.agentState }],
  }),
}));
jest.mock('../services/rpc', () => ({ OstiaRpc: { addEventListener: () => () => {} } }));
jest.mock('../services/snippets', () => ({
  useSnippets: () => [
    { name: 'standup', command: 'Draft my standup for {{day}}', defaults: { day: 'yesterday' } },
    { name: 'handoff', command: 'Hand this to {{who}} with notes', defaults: {} },
  ],
}));
jest.mock('../services/phoneSession', () => ({ phoneControlSupported: () => true }));

const navigation = { navigate: jest.fn(), replace: jest.fn(), setOptions: jest.fn() };

function WithHeader() {
  const [options, setOptions] = useState<{ headerRight?: () => React.ReactElement }>({});
  const nav = useMemo(() => ({ ...navigation, setOptions: (next: typeof options) => setOptions(next) }), []);
  return (
    <>
      {options.headerRight?.()}
      <ConversationScreen navigation={nav as any} route={{ params: { paneId: 'p-agent', title: 'claude' } } as any} />
    </>
  );
}

async function renderConversation() {
  await render(
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 412, height: 915 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
      <WithHeader />
    </SafeAreaProvider>,
  );
}

beforeEach(() => {
  mockConv.turns = TURNS;
  mockConv.later = null;
  mockConv.loads = 0;
  mockConv.asks = [];
  mockConv.caps = ['read', 'notify', 'respond'];
  mockConv.agentState = 'done';
  mockConv.output.mockClear();
  mockConv.prompt.mockClear();
  mockConv.interrupt.mockClear();
  navigation.navigate.mockClear();
  navigation.replace.mockClear();
});

test('PHA-C22 an agent reads as turns: the prompt, quiet steps, its answer and a summary', async () => {
  await renderConversation();
  expect(await screen.findByText('Split the ledger export into monthly files')).toBeTruthy();
  expect(screen.getByText('Edited src/export/month.ts')).toBeTruthy();
  expect(screen.getByText('Ran pnpm test export')).toBeTruthy();
  expect(screen.getByText('exit 1')).toBeTruthy();
  expect(screen.getByText('Export now writes one file per month.')).toBeTruthy();
  expect(screen.getByText('14 commands, 4 files edited')).toBeTruthy();
  expect(screen.getByText('Older turns stay on the desktop.')).toBeTruthy();
});

test('PHA-C23 a step that kept output opens it; one without output does not', async () => {
  await renderConversation();
  await fireEvent.press(await screen.findByLabelText('Ran pnpm test export, show output'));
  expect(mockConv.output).toHaveBeenCalledWith('p-agent', 'st-3');
  expect(await screen.findByText(/Tests 1 failed/)).toBeTruthy();
  expect(screen.queryByLabelText('Edited src/export/month.ts, show output')).toBeNull();
});

test('PHA-C24 the human\'s message goes to the agent through agent.prompt, and Stop interrupts a working agent', async () => {
  mockConv.agentState = 'working';
  await renderConversation();
  await fireEvent.changeText(await screen.findByLabelText('Message'), '  run the export tests too  ');
  await fireEvent.press(screen.getByLabelText('Send'));
  expect(mockConv.prompt).toHaveBeenCalledWith('p-agent', 'run the export tests too');
  await fireEvent.press(screen.getByText('Stop'));
  expect(mockConv.interrupt).toHaveBeenCalledWith('p-agent', 'esc');
});

test('PHA-C25 a desktop without turns opens the terminal instead', async () => {
  mockConv.turns = { kind: 'terminal' };
  await renderConversation();
  await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith('Terminal', { paneId: 'p-agent', title: 'claude' }));
});

test('the terminal is one tap away', async () => {
  await renderConversation();
  await fireEvent.press(await screen.findByLabelText('Open the terminal'));
  expect(navigation.navigate).toHaveBeenCalledWith('Terminal', { paneId: 'p-agent', title: 'claude' });
});

test('PHA-C26 a snippet pick fills the message and sends nothing', async () => {
  await renderConversation();
  await fireEvent.changeText(await screen.findByLabelText('Message'), '/st');
  expect(screen.getByText('From your snippets')).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('/standup'));
  expect(screen.getByLabelText('Message').props.value).toBe('Draft my standup for yesterday');
  expect(mockConv.prompt).not.toHaveBeenCalled();
});

test('an open ask for this agent shows in the thread', async () => {
  mockConv.asks = [{ askId: 'a1', sessionId: 's-ostia', paneId: 'p-agent', kind: 'question', agent: 'claude', title: 'Which environment?', choices: [{ id: 'staging', label: 'Staging', tone: 'neutral' }], allowText: false, since: 1 }];
  await renderConversation();
  expect(await screen.findByText('Which environment?')).toBeTruthy();
});

test('PHA-C24 a message the agent did not take says so, and the message stays shown until the next send', async () => {
  mockConv.prompt.mockRejectedValueOnce({ code: -32005, message: 'not-submitted' });
  await renderConversation();
  await fireEvent.changeText(await screen.findByLabelText('Message'), 'run the export tests too');
  await fireEvent.press(screen.getByLabelText('Send'));
  expect(await screen.findByText(/did not start a turn/)).toBeTruthy();
  await waitFor(() => expect(mockConv.loads).toBeGreaterThan(1));
  expect(screen.getByText(/did not start a turn/)).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('Send'));
  await waitFor(() => expect(screen.queryByText(/did not start a turn/)).toBeNull());
});

test('PHA-C25 a thread whose pane goes away later stays and says so instead of jumping to the terminal', async () => {
  mockConv.later = { kind: 'error', text: 'This agent is no longer on the desktop.' };
  mockConv.prompt.mockResolvedValueOnce({ ok: true });
  await renderConversation();
  await fireEvent.changeText(await screen.findByLabelText('Message'), 'one more thing please');
  await fireEvent.press(screen.getByLabelText('Send'));
  expect(await screen.findByText('This agent is no longer on the desktop.')).toBeTruthy();
  expect(screen.getByText('Split the ledger export into monthly files')).toBeTruthy();
  expect(navigation.replace).not.toHaveBeenCalled();
});

test('PHA-C26 a picked snippet with a blank is not sent until the human fills it', async () => {
  await renderConversation();
  await fireEvent.changeText(await screen.findByLabelText('Message'), '/hand');
  await fireEvent.press(screen.getByLabelText('/handoff'));
  expect(screen.getByLabelText('Message').props.value).toBe('Hand this to <who> with notes');
  await fireEvent.press(screen.getByLabelText('Send'));
  expect(screen.getByText('Fill in <who> first.')).toBeTruthy();
  expect(mockConv.prompt).not.toHaveBeenCalled();
  await fireEvent.changeText(screen.getByLabelText('Message'), 'Hand this to Dana with notes');
  expect(screen.queryByText('Fill in <who> first.')).toBeNull();
  await fireEvent.press(screen.getByLabelText('Send'));
  expect(mockConv.prompt).toHaveBeenCalledWith('p-agent', 'Hand this to Dana with notes');
});

