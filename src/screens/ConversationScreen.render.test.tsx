import { beforeEach, expect, jest, test } from '@jest/globals';
import React, { useMemo, useState } from 'react';
import { AppState } from 'react-native';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ConversationScreen } from './ConversationScreen';

type Listener = (type: string, payload: any) => void;

const mockConv = {
  listeners: new Set<Listener>(),
  statusListeners: new Set<(status: string) => void>(),
  calls: [] as { method: string; params: any }[],
  openResult: (async () => ({ ok: true, paneId: 'p-agent', agent: 'claude', session: 's', truncated: false })) as () => Promise<unknown>,
  prompt: jest.fn(async (..._args: unknown[]) => ({ ok: true }) as unknown),
  interrupt: jest.fn(async (..._args: unknown[]) => ({ ok: true }) as unknown),
  answer: jest.fn(),
  asks: [] as object[],
  caps: ['read', 'notify', 'respond'],
  agentState: 'done' as string,
  app: [] as ((state: string) => void)[],
};

jest.mock('../services/rpc', () => ({
  OstiaRpc: {
    addEventListener: (listener: Listener) => (mockConv.listeners.add(listener), () => mockConv.listeners.delete(listener)),
    addStatusListener: (listener: (status: string) => void) => (mockConv.statusListeners.add(listener), () => mockConv.statusListeners.delete(listener)),
    getStatus: () => 'connected',
    call: async (method: string, params: any) => {
      mockConv.calls.push({ method, params });
      return method === 'agent.stream.open' ? mockConv.openResult() : { ok: true };
    },
  },
}));
jest.mock('../services/askStore', () => ({
  useAsks: () => ({ asks: mockConv.asks, unsupported: false, pending: {}, errors: {} }),
  answerAsk: (...args: unknown[]) => mockConv.answer(...args),
  promptAgent: (...args: unknown[]) => mockConv.prompt(...args),
  interruptAgent: (...args: unknown[]) => mockConv.interrupt(...args),
}));
jest.mock('../services/workspaceStore', () => ({
  useCaps: () => mockConv.caps,
  useFeatures: () => ['prompt-image'],
  useWorkspaces: () => ({
    sessions: [{ sessionId: 's-ostia', name: 'ostia', kind: 'agent', workDir: '/home/m/ostia', state: 'working' }],
    panes: [{ paneId: 'p-agent', sessionId: 's-ostia', kind: 'terminal', title: 'claude', cwd: '/home/m/ostia', running: true, blockCount: 1, agent: 'claude', agentState: mockConv.agentState }],
  }),
}));
jest.mock('../services/snippets', () => ({
  useSnippets: () => [
    { name: 'standup', command: 'Draft my standup for {{day}}', defaults: { day: 'yesterday' } },
    { name: 'handoff', command: 'Hand this to {{who}} with notes', defaults: {} },
  ],
}));
jest.mock('../services/phoneSession', () => ({ phoneControlSupported: () => true }));

const navListeners: Record<string, () => void> = {};
const navigation = {
  navigate: jest.fn(),
  replace: jest.fn(),
  setOptions: jest.fn(),
  addListener: (event: string, listener: () => void) => {
    navListeners[event] = listener;
    return () => {
      delete navListeners[event];
    };
  },
};

function WithHeader() {
  const [options, setOptions] = useState<{ headerRight?: () => React.ReactElement; headerTitle?: () => React.ReactElement }>({});
  const nav = useMemo(() => ({ ...navigation, setOptions: (next: typeof options) => setOptions(next) }), []);
  return (
    <>
      {options.headerTitle?.()}
      {options.headerRight?.()}
      <ConversationScreen navigation={nav as any} route={{ params: { paneId: 'p-agent', title: 'claude' } } as any} />
    </>
  );
}

async function renderConversation() {
  return render(
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 412, height: 915 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
      <WithHeader />
    </SafeAreaProvider>,
  );
}

let seq = 0;
async function stream(events: object[], backfill = false) {
  await act(async () => {
    mockConv.listeners.forEach((listener) => listener('agent.stream', { paneId: 'p-agent', seq: ++seq, backfill, events }));
    await new Promise((resolve) => setTimeout(resolve, 40));
  });
}

const TURN = [
  { type: 'turn.started', turn: 1 },
  { type: 'prompt', turn: 1, id: 'p1', text: 'Split the ledger export into monthly files' },
  { type: 'tool', turn: 1, id: 't1', kind: 'read', name: 'Read', target: 'src/export/month.ts' },
  { type: 'tool', turn: 1, id: 't2', kind: 'command', name: 'Bash', target: 'pnpm test export', input: 'pnpm test export' },
  { type: 'tool.result', turn: 1, id: 't2', output: ' FAIL month.test.ts\nTests 1 failed', exitCode: 1 },
  { type: 'text', turn: 1, id: 'a1', text: 'The totals row is pushed twice.' },
  { type: 'edit', turn: 1, id: 'e1', path: 'src/export/month.ts', change: 'update', diff: '@@ -41,2 +41,3 @@\n a\n-b\n+c\n+d\n' },
  { type: 'plan', turn: 1, id: 'pl', items: [{ text: 'Guard the totals row', status: 'done' }, { text: 'Open a PR', status: 'active' }] },
  { type: 'live' },
];

beforeEach(() => {
  seq = 0;
  mockConv.app = [];
  jest.spyOn(AppState, 'addEventListener').mockImplementation(((_: string, handler: (state: string) => void) => (mockConv.app.push(handler), { remove: () => {} })) as any);
  mockConv.listeners.clear();
  mockConv.statusListeners.clear();
  mockConv.calls = [];
  mockConv.openResult = async () => ({ ok: true, paneId: 'p-agent', agent: 'claude', session: 's', truncated: false });
  mockConv.asks = [];
  mockConv.caps = ['read', 'notify', 'respond'];
  mockConv.agentState = 'done';
  mockConv.prompt.mockClear();
  mockConv.interrupt.mockClear();
  mockConv.answer.mockClear();
  navigation.navigate.mockClear();
  navigation.replace.mockClear();
});

const opens = () => mockConv.calls.filter((call) => call.method === 'agent.stream.open');
const closes = () => mockConv.calls.filter((call) => call.method === 'agent.stream.close');

test('PHC-C20 the conversation opens the agent stream for its pane and draws what arrives', async () => {
  await renderConversation();
  await waitFor(() => expect(opens()).toHaveLength(1));
  expect(opens()[0].params.paneId).toBe('p-agent');
  await stream(TURN, true);
  expect(await screen.findByText('Split the ledger export into monthly files')).toBeTruthy();
  expect(screen.getAllByText('src/export/month.ts')).toHaveLength(2);
  expect(screen.getByText('pnpm test export')).toBeTruthy();
  expect(screen.getByText('· exit 1')).toBeTruthy();
  expect(screen.getByText('The totals row is pushed twice.')).toBeTruthy();
  expect(screen.getByText('+2')).toBeTruthy();
  expect(screen.getByText('Plan · 1 of 2 done')).toBeTruthy();
  expect(screen.getByText('Open a PR')).toBeTruthy();
});

test('PHC-C21 the reply streams in as it arrives, and Working shows with the time while the turn runs', async () => {
  await renderConversation();
  await waitFor(() => expect(opens()).toHaveLength(1));
  await stream([{ type: 'live' }], true);
  await stream([{ type: 'turn.started', turn: 2 }, { type: 'text', turn: 2, id: 'a', text: 'All 61 export tests ' }]);
  expect(screen.getByText('All 61 export tests')).toBeTruthy();
  await stream([{ type: 'text', turn: 2, id: 'a', text: 'pass now.', append: true }]);
  expect(screen.getByText('All 61 export tests pass now.')).toBeTruthy();
  expect(screen.getByText(/^Working · \d+ s$/)).toBeTruthy();
  await stream([{ type: 'turn.ended', turn: 2, status: 'done' }]);
  expect(screen.queryByText(/^Working/)).toBeNull();
});

test('PHC-C22 a tool line with output opens it; one without does not', async () => {
  await renderConversation();
  await waitFor(() => expect(opens()).toHaveLength(1));
  await stream(TURN, true);
  await fireEvent.press(await screen.findByLabelText('Ran pnpm test export, show details'));
  expect(await screen.findByText(/Tests 1 failed/)).toBeTruthy();
  expect(screen.queryByLabelText('Read src/export/month.ts, show details')).toBeNull();
});

test('PHC-C23 the stream is closed when the human leaves, and when the app goes to the background', async () => {
  const view = await renderConversation();
  await waitFor(() => expect(opens()).toHaveLength(1));
  await act(async () => {
    mockConv.app.forEach((handler) => handler('background'));
  });
  await waitFor(() => expect(closes()).toHaveLength(1));
  expect(closes()[0].params).toEqual({ paneId: 'p-agent' });
  await act(async () => {
    mockConv.app.forEach((handler) => handler('inactive'));
    mockConv.app.forEach((handler) => handler('active'));
  });
  await waitFor(() => expect(opens()).toHaveLength(2));
  expect(closes()).toHaveLength(1);
  await view.unmount();
  await waitFor(() => expect(closes()).toHaveLength(2));
});

test('PHC-C29 the stream closes when another screen (the terminal) is pushed above, and reopens when the human comes back', async () => {
  await renderConversation();
  await waitFor(() => expect(opens()).toHaveLength(1));
  await act(async () => navListeners.blur());
  await waitFor(() => expect(closes()).toHaveLength(1));
  await act(async () => navListeners.focus());
  await waitFor(() => expect(opens()).toHaveLength(2));
});

test('PHC-C30 frames that arrive in one tick are queued and both drawn, in order, on the next animation frame', async () => {
  await renderConversation();
  await waitFor(() => expect(opens()).toHaveLength(1));
  await act(async () => {
    mockConv.listeners.forEach((listener) => listener('agent.stream', { paneId: 'p-agent', seq: 1, backfill: true, events: [{ type: 'turn.started', turn: 1 }, { type: 'text', turn: 1, id: 'a', text: 'one ' }] }));
    mockConv.listeners.forEach((listener) => listener('agent.stream', { paneId: 'p-agent', seq: 2, backfill: false, events: [{ type: 'text', turn: 1, id: 'a', text: 'two', append: true }] }));
    expect(screen.queryByText('one two')).toBeNull();
    await new Promise((resolve) => setTimeout(resolve, 40));
  });
  expect(screen.getByText('one two')).toBeTruthy();
});

test('PHC-C31 a tool detail that is open follows the output as it streams', async () => {
  await renderConversation();
  await waitFor(() => expect(opens()).toHaveLength(1));
  await stream([{ type: 'turn.started', turn: 1 }, { type: 'tool', turn: 1, id: 't', kind: 'command', name: 'Bash', target: 'pnpm build', input: 'pnpm build' }, { type: 'tool.result', turn: 1, id: 't', output: 'first line' }, { type: 'live' }], true);
  await fireEvent.press(await screen.findByLabelText('Ran pnpm build, show details'));
  expect(await screen.findByText(/first line/)).toBeTruthy();
  await stream([{ type: 'tool.result', turn: 1, id: 't', output: '\nsecond line', append: true }]);
  expect(await screen.findByText(/second line/)).toBeTruthy();
});

test('PHC-C32 a different ask opens with an empty reply box', async () => {
  const ask = (askId: string) => ({ askId, sessionId: 's-ostia', paneId: 'p-agent', kind: 'question', agent: 'claude', title: `Question ${askId}`, choices: [], allowText: true, since: 1 });
  mockConv.asks = [ask('a1')];
  const view = await renderConversation();
  await fireEvent.changeText(await screen.findByLabelText('Reply to Question a1'), 'half typed');
  mockConv.asks = [ask('a2')];
  await view.rerender(<SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 412, height: 915 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}><WithHeader /></SafeAreaProvider>);
  expect((await screen.findByLabelText('Reply to Question a2')).props.value).toBe('');
});

test('PHC-C24 a pane with no agent hooks (not-an-agent) opens the terminal instead', async () => {
  mockConv.openResult = async () => Promise.reject({ code: -32602, message: 'not-an-agent' });
  await renderConversation();
  await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith('Terminal', { paneId: 'p-agent', title: 'claude' }));
});

test('PHC-C25 a desktop without the stream says so and leaves the terminal switch', async () => {
  mockConv.openResult = async () => Promise.reject({ code: -32601, message: 'method not found' });
  await renderConversation();
  expect(await screen.findByText(/too old for chat/)).toBeTruthy();
  expect(navigation.replace).not.toHaveBeenCalled();
});

test('PHC-C26 a frame that skips ahead opens the stream again', async () => {
  await renderConversation();
  await waitFor(() => expect(opens()).toHaveLength(1));
  await stream([{ type: 'live' }], true);
  seq += 2;
  await stream([{ type: 'turn.started', turn: 3 }]);
  await waitFor(() => expect(opens()).toHaveLength(2));
});

test('PHC-C27 the header says the folder, and switches Chat and Terminal', async () => {
  await renderConversation();
  expect(await screen.findByText('~/ostia')).toBeTruthy();
  expect(screen.getByLabelText('Chat').props.accessibilityState).toEqual({ checked: true });
  await fireEvent.press(screen.getByLabelText('Terminal'));
  expect(navigation.navigate).toHaveBeenCalledWith('Terminal', { paneId: 'p-agent', title: 'claude' });
});

test('PHC-C28 a permission prompt rises as a compact sheet with the exact command and small buttons', async () => {
  mockConv.asks = [
    {
      askId: 'a1',
      sessionId: 's-ostia',
      paneId: 'p-agent',
      kind: 'permission',
      agent: 'claude',
      title: 'Claude wants to run a command',
      detail: 'git push -u origin fix/export',
      choices: [
        { id: 'deny', label: 'Deny', tone: 'deny' },
        { id: 'session', label: 'Allow for this session', tone: 'neutral' },
        { id: 'once', label: 'Allow', tone: 'approve' },
      ],
      allowText: false,
      since: 1,
    },
  ];
  await renderConversation();
  expect(await screen.findByText('git push -u origin fix/export')).toBeTruthy();
  expect(screen.getByText('Allow for this session')).toBeTruthy();
  for (const label of ['Allow', 'Allow for this session', 'Deny']) {
    let button: any = screen.getByText(label);
    while (button && !button.props.hitSlop) button = button.parent;
    const style = Object.assign({}, ...[button.props.style].flat(Infinity).filter(Boolean));
    expect(style.width).toBeUndefined();
    expect(style.minHeight).toBeLessThanOrEqual(40);
    expect(button.props.hitSlop).toBeTruthy();
  }
  await fireEvent.press(screen.getByText('Allow for this session'));
  expect(mockConv.answer).toHaveBeenCalledWith('a1', { choiceId: 'session' });
});

test('PHC-C28 closing the sheet leaves a one-line reminder that reopens it', async () => {
  mockConv.asks = [{ askId: 'a1', sessionId: 's-ostia', paneId: 'p-agent', kind: 'permission', agent: 'claude', title: 'Run a command', detail: 'ls', choices: [{ id: 'once', label: 'Allow', tone: 'approve' }], allowText: false, since: 1 }];
  await renderConversation();
  await fireEvent.press(await screen.findByLabelText('Close'));
  expect(screen.queryByText('ls')).toBeNull();
  await fireEvent.press(await screen.findByLabelText('Review the request'));
  expect(await screen.findByText('ls')).toBeTruthy();
});

test('PHA-C24 the human\'s message goes to the agent through agent.prompt, and Stop interrupts a running turn', async () => {
  await renderConversation();
  await waitFor(() => expect(opens()).toHaveLength(1));
  await stream([{ type: 'turn.started', turn: 1 }, { type: 'live' }]);
  await fireEvent.changeText(await screen.findByLabelText('Message'), '  run the export tests too  ');
  await fireEvent.press(screen.getByLabelText('Send'));
  expect(mockConv.prompt).toHaveBeenCalledWith('p-agent', 'run the export tests too');
  await fireEvent.press(screen.getByText('Stop'));
  expect(mockConv.interrupt).toHaveBeenCalledWith('p-agent', 'esc');
});

test('PHA-C24 a message the agent did not take says so, and the message stays shown until the next send', async () => {
  mockConv.prompt.mockRejectedValueOnce({ code: -32005, message: 'not-submitted' });
  await renderConversation();
  await fireEvent.changeText(await screen.findByLabelText('Message'), 'run the export tests too');
  await fireEvent.press(screen.getByLabelText('Send'));
  expect(await screen.findByText(/did not start a turn/)).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('Send'));
  await waitFor(() => expect(screen.queryByText(/did not start a turn/)).toBeNull());
});

test('PHA-C26 a snippet pick fills the message and sends nothing', async () => {
  await renderConversation();
  await fireEvent.changeText(await screen.findByLabelText('Message'), '/st');
  expect(screen.getByText('From your snippets')).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('/standup'));
  expect(screen.getByLabelText('Message').props.value).toBe('Draft my standup for yesterday');
  expect(mockConv.prompt).not.toHaveBeenCalled();
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
