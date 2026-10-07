import { expect, jest, test } from '@jest/globals';
import React, { useState } from 'react';
import { View } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { TerminalScreen } from './TerminalScreen';

jest.mock('expo-libghostty', () => {
  const ReactActual = jest.requireActual<typeof import('react')>('react');
  const { View: NativeView } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    TerminalView: ReactActual.forwardRef((_props: object, ref: any) => {
      ReactActual.useImperativeHandle(ref, () => ({ write: jest.fn(), writeText: jest.fn() }));
      return <NativeView testID="terminal-view" />;
    }),
  };
});

const terminal = (paneId: string, extra: object = {}) => ({
  paneId,
  sessionId: 's-api',
  kind: 'terminal',
  title: paneId,
  running: false,
  blockCount: 0,
  ...extra,
});

const mockData = {
  panes: [terminal('claude', { running: true }), terminal('zsh'), terminal('logs')] as object[],
  listeners: new Set<() => void>(),
};

jest.mock('../services/rpc', () => ({
  OstiaRpc: {
    hasCap: (cap: string) => cap === 'read',
    addPtyListener: () => () => {},
    addEventListener: () => () => {},
    attachPty: () => new Promise(() => {}),
    detachPty: () => Promise.resolve(),
    sendInput: jest.fn(),
    sendResize: jest.fn(),
  },
}));
jest.mock('../services/workspaceStore', () => {
  const ReactActual = jest.requireActual<typeof import('react')>('react');
  return {
    useCaps: () => ['read'],
    useWorkspaces: () => {
      const [, force] = ReactActual.useState(0);
      ReactActual.useEffect(() => {
        const listener = () => force((n: number) => n + 1);
        mockData.listeners.add(listener);
        return () => void mockData.listeners.delete(listener);
      }, []);
      return {
        sessions: [{ sessionId: 's-api', name: 'api-server', kind: 'project', workDir: '/w', state: 'idle' }],
        panes: mockData.panes,
      };
    },
  };
});
jest.mock('../services/prefsStore', () => {
  const prefs = { fontSize: 13, fitWhenWatching: true, keyRow: true, haptics: false };
  return { usePrefs: () => prefs, getPrefs: () => prefs };
});

const METRICS = { frame: { x: 0, y: 0, width: 360, height: 800 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };

function Harness({ paneId }: { paneId: string }) {
  const [params, setParams] = useState({ paneId, title: paneId });
  const [options, setOptions] = useState<{ headerTitle?: () => React.ReactNode }>({});
  const [navigation] = useState(() => ({
    setOptions: (next: object) => setOptions((old) => ({ ...old, ...next })),
    setParams: (next: object) => setParams((old) => ({ ...old, ...next })),
    goBack: jest.fn(),
  }));
  return (
    <SafeAreaProvider initialMetrics={METRICS}>
      <View testID="header">{options.headerTitle?.()}</View>
      <TerminalScreen navigation={navigation as any} route={{ key: 'Terminal', name: 'Terminal', params } as any} />
    </SafeAreaProvider>
  );
}

async function setPanes(panes: object[]) {
  mockData.panes = panes;
  if (mockData.listeners.size > 0) await act(async () => mockData.listeners.forEach((listener) => listener()));
}

test('NAV-C10 shows one terminal at full screen with no tab strip', async () => {
  await setPanes([terminal('claude', { running: true }), terminal('zsh'), terminal('logs')]);
  await render(<Harness paneId="zsh" />);
  expect(screen.getAllByTestId('terminal-view')).toHaveLength(1);
  expect(screen.queryByRole('tablist')).toBeNull();
});

test('NAV-C5 shows no position dots for a workspace with one terminal', async () => {
  await setPanes([terminal('claude')]);
  await render(<Harness paneId="claude" />);
  expect(screen.queryByLabelText(/Terminal \d of \d/)).toBeNull();
});

test('NAV-C6 lists the terminals in order from the title and switches to the one chosen', async () => {
  await setPanes([terminal('zsh'), terminal('claude', { agentState: 'waiting', running: true }), terminal('logs', { running: true })]);
  await render(<Harness paneId="zsh" />);
  expect(screen.getByLabelText('Terminal 3 of 3')).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('zsh, list terminals'));
  const rows = screen.getAllByText(/^(claude|logs|zsh)$/).map((node) => node.props.children);
  expect(rows.slice(-3)).toEqual(['claude', 'logs', 'zsh']);
  expect(screen.getByLabelText('Current')).toBeTruthy();
  await fireEvent.press(screen.getAllByText('claude').at(-1)!);
  expect(screen.getByLabelText('claude, list terminals')).toBeTruthy();
  expect(screen.getByLabelText('Terminal 1 of 3')).toBeTruthy();
});

test('NAV-C11 drops a closed terminal from the open sheet and moves the check to the one now shown', async () => {
  await setPanes([terminal('a'), terminal('b'), terminal('c')]);
  await render(<Harness paneId="b" />);
  await fireEvent.press(screen.getByLabelText('b, list terminals'));
  await setPanes([terminal('a'), terminal('c')]);
  expect(screen.queryAllByText('b')).toHaveLength(0);
  expect(screen.getByLabelText('c, list terminals')).toBeTruthy();
  expect(screen.getByLabelText('Terminal 2 of 2')).toBeTruthy();
});
