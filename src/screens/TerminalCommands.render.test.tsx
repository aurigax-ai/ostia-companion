import { expect, jest, test } from '@jest/globals';
import React from 'react';
import { AppState, BackHandler, Keyboard } from 'react-native';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
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
  holdMode: 'auto' as 'auto' | 'manual',
  answers: [] as { resolve: () => void }[],
  panes: [{ paneId: 'p-zsh', sessionId: 's', kind: 'terminal', title: 'zsh', running: false, blockCount: 0 }] as object[],
  attach: (paneId: string, role: string) => {
    rpc.event('pty.attached', { paneId, role, cols: 40, rows: 8, cursor: 0, dropped: false });
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
      if (rpc.holdMode === 'auto') return new Promise((resolve) => setTimeout(() => resolve({ ok: true, cols, rows }), 10));
      return new Promise((resolve) => rpc.answers.push({ resolve: () => resolve({ ok: true, cols, rows }) }));
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
    panes: rpc.panes,
  }),
}));
jest.mock('../services/prefsStore', () => {
  const prefs = { fontSize: 12, keyRow: true, haptics: false };
  return { usePrefs: () => prefs, getPrefs: () => prefs };
});

const METRICS = { frame: { x: 0, y: 0, width: 360, height: 800 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
const prompt = '\x1b]133;A\x07$ \x1b]133;B\x07';
const ran = (cmd: string, out: string, code: number) => `${prompt}${cmd}\r\n\x1b]133;C\x07${out}\x1b]133;D;${code}\x07`;
const sleep = async (ms: number) => {
  await act(async () => void (await new Promise((resolve) => setTimeout(resolve, ms))));
  await act(async () => {});
};

type Header = { headerShown: boolean; headerRight: () => React.ReactElement<{ onChange: (mode: string) => void; value: string; options: { value: string }[] }> };

async function open(paneId = 'p-zsh', navigation: object = {}) {
  const setOptions = jest.fn();
  await render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <TerminalScreen
        navigation={{ setOptions, ...navigation } as any}
        route={{ key: 'Terminal', name: 'Terminal', params: { paneId, title: paneId } } as any}
      />
    </SafeAreaProvider>,
  );
  const header = () => setOptions.mock.calls.at(-1)?.[0] as Header;
  return { header };
}

async function feed(text: string) {
  await act(async () => {
    rpc.pty(btoa(unescape(encodeURIComponent(text))));
    await new Promise((resolve) => setTimeout(resolve, 200));
  });
}

const layout = (width: number, height: number) =>
  fireEvent(screen.getByTestId('terminal-grid'), 'layout', { nativeEvent: { layout: { x: 0, y: 0, width, height } } });

function reset() {
  rpc.held.length = 0;
  rpc.sent.length = 0;
  rpc.released = 0;
  rpc.answers.length = 0;
  rpc.holdMode = 'auto';
  rpc.caps = ['read', 'notify', 'input'];
  rpc.panes = [{ paneId: 'p-zsh', sessionId: 's', kind: 'terminal', title: 'zsh', running: false, blockCount: 0 }];
}

async function openTerminal(caps?: string[]) {
  reset();
  if (caps) rpc.caps = caps;
  const { header } = await open();
  await act(async () => header().headerRight().props.onChange('terminal'));
  await act(async () => layout(360, 600));
  return { header };
}

test('CRD-C40 a shell opens in Commands: a card per command with its exit code, the composer and the key row', async () => {
  reset();
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

test('CRD-C41 Terminal draws the copy, and Commands is not computed while it is on screen', async () => {
  reset();
  const { TerminalCopy } = jest.requireActual<typeof import('../model/terminalCopy')>('../model/terminalCopy');
  const runs = jest.spyOn(TerminalCopy.prototype, 'runs');
  const { header } = await open();
  await feed(ran('ls', 'a.txt\r\n', 0));
  await act(async () => header().headerRight().props.onChange('terminal'));
  await act(async () => layout(360, 600));
  expect(screen.getByTestId('terminal-grid')).toBeTruthy();
  expect(screen.getByText(/a\.txt/)).toBeTruthy();
  expect(screen.queryByTestId('command-run')).toBeNull();
  runs.mockClear();
  await feed('more\r\n');
  await feed('more\r\n');
  expect(runs).not.toHaveBeenCalled();
  runs.mockRestore();
});

test('CRD-C42 a pty.size event resizes the copy and the output stays', async () => {
  const { header } = await openTerminal();
  await feed(ran('ls', 'a.txt\r\n', 0));
  await act(async () => rpc.event('pty.size', { paneId: 'p-zsh', cols: 50, rows: 12 }));
  await feed('');
  expect(screen.getByText(/a\.txt/)).toBeTruthy();
  expect(header().headerShown).toBe(true);
});

test('CRD-C43 a typed command goes out as one input with a return, and no resize is ever sent', async () => {
  reset();
  await open();
  await feed('');
  await fireEvent.changeText(screen.getByLabelText('Command'), 'ls -la');
  await fireEvent(screen.getByLabelText('Command'), 'submitEditing');
  expect(rpc.sent).toEqual(['ls -la\r']);
});

test('CRD-C44 a full-screen program is one row in Commands and opens the landscape view, which closes when the program exits', async () => {
  reset();
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

test('CRD-C45 Android back closes the full-screen view first, and the screen stays', async () => {
  reset();
  const backHandlers: (() => boolean | null | undefined)[] = [];
  const back = jest.spyOn(BackHandler, 'addEventListener').mockImplementation(((_event: string, handler: () => boolean) => {
    backHandlers.push(handler);
    return { remove: () => {} };
  }) as never);
  await open();
  await feed(`${prompt}vim\r\n\x1b]133;C\x07\x1b[?1049hINSERT`);
  await fireEvent.press(screen.getByLabelText('vim, open full screen'));
  expect(screen.getByTestId('fullscreen-terminal')).toBeTruthy();
  await act(async () => void backHandlers.at(-1)?.());
  expect(screen.queryByTestId('fullscreen-terminal')).toBeNull();
  expect(screen.getByText('full screen')).toBeTruthy();
  back.mockRestore();
});

test('CRD-C46 the Terminal view holds the phone grid once after layout, and Commands lets it go', async () => {
  const { header } = await openTerminal();
  expect(rpc.held).toEqual([]);
  await sleep(450);
  expect(rpc.held).toEqual(['p-zsh 46x38']);
  await waitFor(() => expect(screen.getByText('Sized to this phone')).toBeTruthy());
  await act(async () => header().headerRight().props.onChange('commands'));
  await sleep(50);
  expect(rpc.released).toBe(1);
});

test('CRD-C47 when the desktop takes the size back the phone does not hold again until asked', async () => {
  await openTerminal();
  await sleep(450);
  await waitFor(() => expect(screen.getByText('Sized to this phone')).toBeTruthy());
  await act(async () => rpc.event('pty.size', { paneId: 'p-zsh', cols: 120, rows: 40 }));
  expect(screen.getByText('The desktop took its size back')).toBeTruthy();
  await act(async () => layout(360, 580));
  await sleep(450);
  expect(rpc.held).toEqual(['p-zsh 46x38']);
  await fireEvent.press(screen.getByText('Size to this phone'));
  await waitFor(() => expect(rpc.held).toEqual(['p-zsh 46x38', 'p-zsh 46x37']));
  await waitFor(() => expect(screen.getByText('Sized to this phone')).toBeTruthy());
});

test('CRD-C48 locking the phone releases the hold and coming back holds again, but iOS inactive does neither', async () => {
  const listeners: ((state: string) => void)[] = [];
  const change = (state: string) => listeners.forEach((listener) => listener(state));
  const spy = jest.spyOn(AppState, 'addEventListener').mockImplementation(((_type: string, listener: (state: string) => void) => {
    listeners.push(listener);
    return { remove: () => {} };
  }) as never);
  await openTerminal();
  await sleep(450);
  await act(async () => change('inactive'));
  await sleep(50);
  expect(rpc.released).toBe(0);
  await act(async () => change('background'));
  await sleep(50);
  expect(rpc.released).toBe(1);
  await act(async () => change('active'));
  await sleep(450);
  expect(rpc.held).toEqual(['p-zsh 46x38', 'p-zsh 46x38']);
  spy.mockImplementation((() => ({ remove: () => {} })) as never);
});

test('CRD-C49 the landscape view holds the landscape grid once, never the portrait one first, and a phone that cannot type never holds', async () => {
  reset();
  await open();
  await feed(`${prompt}vim\r\n\x1b]133;C\x07\x1b[?1049hINSERT`);
  await fireEvent.press(screen.getByLabelText('vim, open full screen'));
  await act(async () => layout(360, 700));
  await sleep(450);
  expect(rpc.held).toEqual([]);
  await act(async () => layout(800, 360));
  await sleep(450);
  expect(rpc.held).toEqual(['p-zsh 107x23']);
  await openTerminal(['read', 'notify']);
  await sleep(450);
  expect(rpc.held).toEqual([]);
});

test('CRD-C50 leaving before the hold is answered releases it when the answer arrives', async () => {
  reset();
  rpc.holdMode = 'manual';
  const { header } = await open();
  await act(async () => header().headerRight().props.onChange('terminal'));
  await act(async () => layout(360, 600));
  await sleep(450);
  expect(rpc.held).toEqual(['p-zsh 46x38']);
  await act(async () => header().headerRight().props.onChange('commands'));
  await sleep(50);
  expect(rpc.released).toBe(0);
  await act(async () => rpc.answers[0].resolve());
  await sleep(50);
  expect(rpc.released).toBe(1);
});

test('CRD-C51 after a socket drop and re-attach the hold is sent again and the note follows', async () => {
  await openTerminal();
  await waitFor(() => expect(screen.getByText('Sized to this phone')).toBeTruthy());
  await act(async () => rpc.event('pty.attached', { paneId: 'p-zsh', role: 'owner', cols: 40, rows: 8, cursor: 0, dropped: false }));
  await waitFor(() => expect(rpc.held).toEqual(['p-zsh 46x38', 'p-zsh 46x38']));
  await waitFor(() => expect(screen.getByText('Sized to this phone')).toBeTruthy());
});

test('CRD-C52 showing the keyboard or two quick layouts cause no second hold, and the note row never changes the grid', async () => {
  const handlers: Record<string, () => void> = {};
  const spy = jest.spyOn(Keyboard, 'addListener').mockImplementation(((event: string, handler: () => void) => {
    handlers[event] = handler;
    return { remove: () => {} };
  }) as never);
  await openTerminal();
  await act(async () => layout(360, 560));
  await act(async () => layout(360, 600));
  await sleep(450);
  expect(rpc.held).toEqual(['p-zsh 46x38']);
  await act(async () => handlers.keyboardDidShow?.());
  await act(async () => layout(360, 300));
  await sleep(450);
  await act(async () => handlers.keyboardDidHide?.());
  await act(async () => layout(360, 600));
  await sleep(450);
  expect(rpc.held).toEqual(['p-zsh 46x38']);
  spy.mockRestore();
});

test('CRD-C53 old pane attach events and sizes are ignored by the new pane', async () => {
  await openTerminal();
  await sleep(450);
  await act(async () => rpc.event('pty.attached', { paneId: 'p-other', role: 'observer', cols: 20, rows: 5, cursor: 0, dropped: true }));
  await act(async () => rpc.event('pty.size', { paneId: 'p-other', cols: 20, rows: 5 }));
  await sleep(450);
  expect(screen.getByText('Sized to this phone')).toBeTruthy();
  expect(rpc.held).toEqual(['p-zsh 46x38']);
});

test('CRD-C54 a non-ASCII command is sent as UTF-8, not rejected by btoa', async () => {
  reset();
  await open();
  await feed('');
  await fireEvent.changeText(screen.getByLabelText('Command'), 'echo 你好');
  await fireEvent(screen.getByLabelText('Command'), 'submitEditing');
  expect(rpc.sent).toEqual(['echo 你好\r']);
});

test('CRD-C55 an agent pane has a Chat · Terminal switch that opens the conversation, and never holds while it is only watched', async () => {
  reset();
  rpc.panes = [{ paneId: 'p-claude', sessionId: 's', kind: 'terminal', title: 'claude', running: true, blockCount: 1, agent: 'claude', agentState: 'working' }];
  rpc.caps = ['read', 'notify'];
  const replace = jest.fn();
  const { header } = await open('p-claude', { replace });
  const switcher = header().headerRight();
  const bar = (switcher.props as unknown as { children: React.ReactElement<{ value: string; options: { value: string }[]; onChange: (m: string) => void }>[] }).children;
  const modes = [bar].flat().find((child) => child?.props?.options);
  expect(modes?.props.value).toBe('terminal');
  expect(modes?.props.options.map((option) => option.value)).toEqual(['chat', 'terminal']);
  await act(async () => modes?.props.onChange('chat'));
  expect(replace).toHaveBeenCalledWith('Conversation', { paneId: 'p-claude', title: 'p-claude' });
  await act(async () => layout(360, 600));
  await sleep(450);
  expect(rpc.held).toEqual([]);
});
