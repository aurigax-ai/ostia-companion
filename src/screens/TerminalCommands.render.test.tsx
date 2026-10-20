import { expect, jest, test } from '@jest/globals';
import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { lockLandscape, lockPortrait } from '../services/orientation';
import { TerminalScreen } from './TerminalScreen';

const rpc = {
  pty: (_base64: string) => {},
  event: (_type: string, _payload: object) => {},
  sent: [] as string[],
  attach: (_paneId: string, role: string) => {
    rpc.event('pty.attached', { role, cols: 40, rows: 8, cursor: 0, dropped: false });
    return Promise.resolve({ role });
  },
};

jest.mock('../services/rpc', () => ({
  OstiaRpc: {
    hasCap: () => true,
    addStatusListener: () => () => {},
    addPtyListener: (listener: (base64: string) => void) => {
      rpc.pty = listener;
      return () => {};
    },
    addEventListener: (listener: (type: string, payload: object) => void) => {
      rpc.event = listener;
      return () => {};
    },
    attachPty: (paneId: string, role: string) => rpc.attach(paneId, role),
    detachPty: () => Promise.resolve(),
    sendInput: (base64: string) => rpc.sent.push(atob(base64)),
    sendKeystroke: (text: string) => rpc.sent.push(text),
  },
}));
jest.mock('../services/workspaceStore', () => ({
  useCaps: () => ['read', 'notify', 'input'],
  useWorkspaces: () => ({
    sessions: [{ sessionId: 's', name: 'api', kind: 'project', workDir: '/w', state: 'idle' }],
    panes: [{ paneId: 'p-zsh', sessionId: 's', kind: 'terminal', title: 'zsh', running: false, blockCount: 0 }],
  }),
}));
jest.mock('../services/prefsStore', () => {
  const prefs = { fontSize: 12, keyRow: true, haptics: false };
  return { usePrefs: () => prefs, getPrefs: () => prefs };
});

const METRICS = { frame: { x: 0, y: 0, width: 360, height: 800 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
const prompt = '\x1b]133;A\x07$ \x1b]133;B\x07';
const ran = (cmd: string, out: string, code: number) => `${prompt}${cmd}\r\n\x1b]133;C\x07${out}\x1b]133;D;${code}\x07`;

async function open() {
  const setOptions = jest.fn();
  await render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <TerminalScreen
        navigation={{ setOptions } as any}
        route={{ key: 'Terminal', name: 'Terminal', params: { paneId: 'p-zsh', title: 'zsh' } } as any}
      />
    </SafeAreaProvider>,
  );
  const header = () => setOptions.mock.calls.at(-1)?.[0] as { headerShown: boolean; headerRight: () => React.ReactElement<{ onChange: (mode: string) => void; value: string }> };
  return { header };
}

async function feed(text: string) {
  await act(async () => {
    rpc.pty(btoa(unescape(encodeURIComponent(text))));
    await new Promise((resolve) => setTimeout(resolve, 200));
  });
}

test('CRD-C40 a shell opens in Commands: a card per command with its exit code, the composer and the key row', async () => {
  const { header } = await open();
  await feed(ran('ls', 'a.txt\r\n', 0) + ran('make', '\x1b[31mboom\x1b[0m\r\n', 2));
  expect(screen.getAllByTestId('command-run')).toHaveLength(2);
  expect(screen.getByText('$ make')).toBeTruthy();
  expect(screen.getByText('exit 2')).toBeTruthy();
  expect(screen.getByLabelText('Command')).toBeTruthy();
  expect(screen.getByText('esc')).toBeTruthy();
  expect(screen.queryByTestId('terminal-grid')).toBeNull();
  expect(header().headerRight().props.value).toBe('commands');
});

test('CRD-C41 Terminal shows the copy at the desktop grid, drawn one row per desktop row', async () => {
  const { header } = await open();
  await feed(ran('ls', 'a.txt\r\n', 0));
  await act(async () => header().headerRight().props.onChange('terminal'));
  expect(screen.getByTestId('terminal-grid')).toBeTruthy();
  expect(screen.getAllByTestId('grid-row')).toHaveLength(8);
  expect(screen.queryByTestId('command-run')).toBeNull();
});

test('CRD-C42 a pty.size event resizes the copy and the drawn grid follows', async () => {
  const { header } = await open();
  await act(async () => header().headerRight().props.onChange('terminal'));
  await act(async () => rpc.event('pty.size', { paneId: 'p-zsh', cols: 50, rows: 12 }));
  await feed('');
  expect(screen.getAllByTestId('grid-row')).toHaveLength(12);
});

test('CRD-C43 a typed command goes out as one input with a return, and no resize is ever sent', async () => {
  rpc.sent.length = 0;
  await open();
  await feed('');
  await fireEvent.changeText(screen.getByLabelText('Command'), 'ls -la');
  await fireEvent(screen.getByLabelText('Command'), 'submitEditing');
  expect(rpc.sent).toEqual(['ls -la\r']);
});

test('CRD-C44 a full-screen program is one row in Commands and opens the landscape view, which closes when the program exits', async () => {
  const { header } = await open();
  await feed(`${prompt}vim\r\n\x1b]133;C\x07\x1b[?1049hINSERT`);
  expect(screen.getByText('full screen')).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('vim, open full screen'));
  expect(screen.getByTestId('fullscreen-terminal')).toBeTruthy();
  expect(lockLandscape).toHaveBeenCalled();
  expect(header().headerShown).toBe(false);
  await feed('\x1b[?1049l\x1b]133;D;0\x07');
  expect(screen.queryByTestId('fullscreen-terminal')).toBeNull();
  expect(header().headerShown).toBe(true);
  expect(lockPortrait).toHaveBeenCalled();
});
