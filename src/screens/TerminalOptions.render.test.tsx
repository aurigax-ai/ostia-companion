import { expect, jest, test } from '@jest/globals';
import React from 'react';
import { render, screen } from '@testing-library/react-native';
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

const mockPrefs = { fontSize: 13, fitWhenWatching: true, keyRow: false, haptics: true };

const mockRpc = {
  canInput: false,
  attach: 'answer' as 'answer' | 'hang',
  emit: (_type: string, _payload: object) => {},
};

jest.mock('../services/rpc', () => ({
  OstiaRpc: {
    hasCap: (cap: string) => cap === 'read' || (cap === 'input' && mockRpc.canInput),
    addPtyListener: () => () => {},
    addEventListener: (listener: (type: string, payload: object) => void) => {
      mockRpc.emit = listener;
      return () => {};
    },
    attachPty: (_paneId: string, role: string) => {
      if (mockRpc.attach === 'hang') return new Promise(() => {});
      mockRpc.emit('pty.attached', { role, cols: 80, rows: 24, cursor: 0, dropped: false });
      return Promise.resolve({ role });
    },
    detachPty: () => Promise.resolve(),
    sendInput: jest.fn(),
    sendResize: jest.fn(),
  },
}));

jest.mock('../services/prefsStore', () => ({
  usePrefs: () => mockPrefs,
  getPrefs: () => mockPrefs,
}));

jest.mock('../services/workspaceStore', () => ({
  useCaps: () => (mockRpc.canInput ? ['read', 'notify', 'input'] : ['read', 'notify']),
  useWorkspaces: () => ({
    sessions: [{ sessionId: 's-api', name: 'api-server', kind: 'project', workDir: '/w', state: 'waiting' }],
    panes: [{ paneId: 'p-claude', sessionId: 's-api', kind: 'terminal', title: 'claude', running: true, blockCount: 1 }],
  }),
}));

const METRICS = { frame: { x: 0, y: 0, width: 360, height: 800 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };

async function renderTerminal() {
  const setOptions = jest.fn();
  await render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <TerminalScreen
        navigation={{ setOptions } as any}
        route={{ key: 'Terminal', name: 'Terminal', params: { paneId: 'p-claude', title: 'claude' } } as any}
      />
    </SafeAreaProvider>,
  );
  const options = (setOptions.mock.calls.at(-1)?.[0] ?? {}) as { headerRight?: () => React.ReactElement<{ label: string }> | null };
  return { headerRight: options.headerRight?.() ?? null };
}

test('SET-C8 a typing terminal shows no key row when the key row is off', async () => {
  mockRpc.canInput = true;
  mockRpc.attach = 'answer';
  const { headerRight } = await renderTerminal();
  expect(headerRight?.props.label).toBe('Done');
  ['esc', 'tab', 'ctrl', '⏎'].forEach((key) => expect(screen.queryByText(key)).toBeNull());
});
