import { expect, jest, test } from '@jest/globals';
import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { TerminalScreen } from './TerminalScreen';

jest.mock('expo-libghostty', () => {
  const ReactActual = jest.requireActual<typeof import('react')>('react');
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    TerminalView: ReactActual.forwardRef((_props: object, ref: any) => {
      ReactActual.useImperativeHandle(ref, () => ({ write: jest.fn(), writeText: jest.fn() }));
      return <View />;
    }),
  };
});

const ASK = {
  askId: 'ask-1',
  sessionId: 's',
  paneId: 'p-agent',
  kind: 'question',
  agent: 'claude',
  title: 'Which environment should the release notes cover?',
  choices: [
    { id: 'staging', label: 'Staging', tone: 'neutral' },
    { id: 'production', label: 'Production', tone: 'neutral' },
  ],
  allowText: true,
  since: Date.now(),
};

const mockAsks = { asks: [ASK] as object[], listeners: new Set<() => void>(), answered: [] as object[] };

jest.mock('../services/askStore', () => {
  const ReactActual = jest.requireActual<typeof import('react')>('react');
  return {
    useAsks: () => {
      const [, force] = ReactActual.useState(0);
      ReactActual.useEffect(() => {
        const listener = () => force((n: number) => n + 1);
        mockAsks.listeners.add(listener);
        return () => void mockAsks.listeners.delete(listener);
      }, []);
      return { asks: mockAsks.asks, unsupported: false, pending: {}, errors: {} };
    },
    answerAsk: async (askId: string, answer: object) => {
      mockAsks.answered.push({ askId, ...answer });
    },
    promptAgent: jest.fn(),
    interruptAgent: jest.fn(),
  };
});
jest.mock('../services/rpc', () => ({
  OstiaRpc: {
    hasCap: () => true,
    addPtyListener: () => () => {},
    addEventListener: () => () => {},
    attachPty: () => new Promise(() => {}),
    detachPty: () => Promise.resolve(),
    sendInput: jest.fn(),
    sendResize: jest.fn(),
  },
}));
jest.mock('../services/workspaceStore', () => ({
  useCaps: () => ['read', 'respond', 'input'],
  useWorkspaces: () => ({
    sessions: [{ sessionId: 's', name: 'ostia', kind: 'project', workDir: '/w', state: 'waiting' }],
    panes: [{ paneId: 'p-agent', sessionId: 's', kind: 'terminal', title: 'claude', running: true, blockCount: 1, agent: 'claude', agentState: 'waiting' }],
  }),
}));
jest.mock('../services/prefsStore', () => {
  const prefs = { fontSize: 13, fitWhenWatching: true, keyRow: true, haptics: false };
  return { usePrefs: () => prefs, getPrefs: () => prefs };
});

const METRICS = { frame: { x: 0, y: 0, width: 360, height: 800 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };

async function renderTerminal() {
  mockAsks.asks = [ASK];
  mockAsks.answered = [];
  await render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <TerminalScreen
        navigation={{ setOptions: jest.fn(), setParams: jest.fn(), goBack: jest.fn() } as any}
        route={{ key: 'Terminal', name: 'Terminal', params: { paneId: 'p-agent', title: 'claude' } } as any}
      />
    </SafeAreaProvider>,
  );
}

test('AGT-C16 an open ask shows as a one-line heads-up, not a full card', async () => {
  await renderTerminal();
  expect(screen.getByText(ASK.title)).toBeTruthy();
  expect(screen.getByText('Answer')).toBeTruthy();
  expect(screen.queryByText('Staging')).toBeNull();
});

test('AGT-C17 Answer opens the full card in a sheet; a choice sends it and closes the sheet', async () => {
  await renderTerminal();
  await fireEvent.press(screen.getByText('Answer'));
  await fireEvent.press(screen.getByText('Staging'));
  expect(mockAsks.answered).toEqual([{ askId: 'ask-1', choiceId: 'staging' }]);
  expect(screen.queryByText('Production')).toBeNull();
});

test('AGT-C18 the sheet closes and the heads-up goes when the desktop answers the ask', async () => {
  await renderTerminal();
  await fireEvent.press(screen.getByText('Answer'));
  mockAsks.asks = [];
  await act(async () => mockAsks.listeners.forEach((listener) => listener()));
  expect(screen.queryByText('Staging')).toBeNull();
  expect(screen.queryByText('Answer')).toBeNull();
});
