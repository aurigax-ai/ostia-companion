import { expect, jest, test } from '@jest/globals';
import React from 'react';
import { AppState } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { lockLandscape, lockPortrait } from '../services/orientation';
import { TerminalScreen } from './TerminalScreen';

const rpc = {
  pty: (_base64: string) => {},
  event: (_type: string, _payload: object) => {},
  sent: [] as string[],
  caps: ['read', 'notify', 'input'],
  held: [] as string[],
  released: 0,
  attach: (_paneId: string, role: string) => {
    rpc.event('pty.attached', { role, cols: 40, rows: 8, cursor: 0, dropped: false });
    return Promise.resolve({ role });
  },
};

jest.mock('../services/rpc', () => ({
  OstiaRpc: {
    hasCap: (cap: string) => rpc.caps.includes(cap),
    addStatusListener: () => () => {},
    getStatus: () => 'connected',
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
    holdPty: (paneId: string, cols: number, rows: number) => {
      rpc.held.push(`${paneId} ${cols}x${rows}`);
      return Promise.resolve({ ok: true, cols, rows });
    },
    releasePty: () => {
      rpc.released += 1;
      return Promise.resolve({ ok: true });
    },
  },
}));
jest.mock('../services/workspaceStore', () => ({
  useCaps: () => rpc.caps,
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

const layout = (width: number, height: number) => fireEvent(screen.getByTestId('terminal-grid'), 'layout', { nativeEvent: { layout: { x: 0, y: 0, width, height } } });

async function openTerminal() {
  rpc.held.length = 0;
  rpc.released = 0;
  const { header } = await open();
  await act(async () => header().headerRight().props.onChange('terminal'));
  await act(async () => layout(360, 600));
  return { header };
}

test('CRD-C46 the Terminal view holds the pane at the phone grid, and Commands lets it go', async () => {
  rpc.caps = ['read', 'notify', 'input'];
  const { header } = await openTerminal();
  expect(rpc.held).toEqual(['p-zsh 50x38']);
  expect(screen.getByText('Sized to this phone')).toBeTruthy();
  await act(async () => header().headerRight().props.onChange('commands'));
  expect(rpc.released).toBe(1);
});

test('CRD-C47 when the desktop takes the size back the phone does not hold again until asked', async () => {
  rpc.caps = ['read', 'notify', 'input'];
  await openTerminal();
  await act(async () => rpc.event('pty.size', { paneId: 'p-zsh', cols: 120, rows: 40 }));
  expect(screen.getByText('The desktop took its size back')).toBeTruthy();
  await act(async () => layout(360, 580));
  expect(rpc.held).toEqual(['p-zsh 50x38']);
  await fireEvent.press(screen.getByText('Size to this phone'));
  expect(rpc.held).toEqual(['p-zsh 50x38', 'p-zsh 50x37']);
  expect(screen.getByText('Sized to this phone')).toBeTruthy();
});

test('CRD-C48 locking or backgrounding the phone releases the hold, and coming back holds again', async () => {
  rpc.caps = ['read', 'notify', 'input'];
  let change: (state: string) => void = () => {};
  const spy = jest.spyOn(AppState, 'addEventListener').mockImplementation(((_type: string, listener: (state: string) => void) => {
    change = listener;
    return { remove: () => {} };
  }) as never);
  await openTerminal();
  await act(async () => change('background'));
  expect(rpc.released).toBe(1);
  await act(async () => change('active'));
  expect(rpc.held).toEqual(['p-zsh 50x38', 'p-zsh 50x38']);
  spy.mockImplementation((() => ({ remove: () => {} })) as never);
});

test('CRD-C49 the landscape full-screen view holds the landscape grid, and a phone that cannot type never holds', async () => {
  rpc.caps = ['read', 'notify', 'input'];
  rpc.held.length = 0;
  await open();
  await feed(`${prompt}vim\r\n\x1b]133;C\x07\x1b[?1049hINSERT`);
  await fireEvent.press(screen.getByLabelText('vim, open full screen'));
  await act(async () => layout(800, 360));
  expect(rpc.held).toEqual(['p-zsh 111x23']);
  rpc.caps = ['read', 'notify'];
  rpc.held.length = 0;
  await openTerminal();
  expect(rpc.held).toEqual([]);
});
