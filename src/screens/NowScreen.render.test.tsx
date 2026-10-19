import { beforeEach, expect, jest, test } from '@jest/globals';
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NowScreen } from './NowScreen';

const mockNow = Date.now();
const mockData: { asks: object[]; unsupported: boolean; sessions: object[]; panes: object[] } = { asks: [], unsupported: false, sessions: [], panes: [] };

jest.mock('../services/rpc', () => ({
  OstiaRpc: {
    getPairing: () => ({ desktopName: 'Studio', gatewayHost: '192.168.1.20', gatewayPort: 8722 }),
    retry: jest.fn(),
  },
}));
jest.mock('../services/workspaceStore', () => ({
  useWorkspaces: () => ({
    sessions: [
      { sessionId: 's', name: 'api-server', kind: 'agent', workDir: '/w', state: 'waiting' },
      { sessionId: 't', name: 'atlas-web', kind: 'agent', workDir: '/t', state: 'working' },
      ...mockData.sessions,
    ],
    panes: [
      { paneId: 'p', sessionId: 's', kind: 'terminal', title: 'claude', running: true, blockCount: 1, agent: 'claude', agentState: 'waiting', agentMessage: 'Apply the migration?', since: mockNow - 6 * 60_000 },
      { paneId: 'w', sessionId: 't', kind: 'terminal', title: 'codex', running: true, blockCount: 1, agent: 'codex', agentState: 'working', agentMessage: 'editing settingsSchema.ts', since: mockNow - 60_000 },
      { paneId: 'd', sessionId: 't', kind: 'terminal', title: 'claude', running: false, blockCount: 1, agent: 'claude', agentState: 'done', agentMessage: 'changelog for 2.3', since: mockNow - 3 * 60 * 60_000 },
      { paneId: 'i', sessionId: 't', kind: 'terminal', title: 'claude', running: false, blockCount: 1, agent: 'claude', agentState: 'done', agentMessage: 'old work' },
      { paneId: 'h', sessionId: 't', kind: 'terminal', title: 'claude', running: false, blockCount: 1, agent: 'claude', hibernated: true },
      ...mockData.panes,
    ],
    seen: {},
    loading: false,
    refreshing: false,
    loadedAt: null,
  }),
  useConnectionStatus: () => 'connected',
  useCaps: () => ['read', 'notify'],
  refreshWorkspaces: jest.fn(),
}));
jest.mock('../services/askStore', () => ({
  useAsks: () => ({ asks: mockData.asks, unsupported: mockData.unsupported, pending: {}, errors: {} }),
  answerAsk: jest.fn(),
}));
jest.mock('../services/openTailscaleApp', () => ({ openTailscaleApp: jest.fn() }));

const METRICS = { frame: { x: 0, y: 0, width: 360, height: 800 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
const navigation = { setOptions: jest.fn(), navigate: jest.fn() };

async function renderNow() {
  await render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <NowScreen navigation={navigation as any} route={{} as any} />
    </SafeAreaProvider>,
  );
}

function textsInOrder(node: unknown, out: string[] = []): string[] {
  if (typeof node === 'string') out.push(node);
  else if (Array.isArray(node)) node.forEach((child) => textsInOrder(child, out));
  else if (node && typeof node === 'object' && 'children' in node) textsInOrder((node as { children: unknown }).children, out);
  return out;
}

const phoneWorkspace = jest.requireMock<{ usePhoneWorkspace: jest.Mock }>('../services/phoneWorkspace').usePhoneWorkspace;

beforeEach(() => {
  phoneWorkspace.mockReturnValue(null);
  mockData.sessions = [];
  mockData.panes = [];
  mockData.asks = [];
  mockData.unsupported = false;
  navigation.setOptions.mockClear();
  navigation.navigate.mockClear();
});

test('AGT-C13 a desktop without asks shows the update note and the waiting agent', async () => {
  mockData.unsupported = true;
  await renderNow();
  expect(screen.getByText('Update Ostia on the desktop to answer from here.')).toBeTruthy();
  expect(screen.getByText('claude · Apply the migration?')).toBeTruthy();
});

test('PHA-C1 the Chats tab counts what needs you on its badge', async () => {
  await renderNow();
  expect(navigation.setOptions).toHaveBeenLastCalledWith(expect.objectContaining({ tabBarBadge: 1 }));
});

test('PHA-C2 shows Needs you, Working and Done today in order and folds the rest into one line', async () => {
  await renderNow();
  const all = textsInOrder(screen.toJSON());
  const at = (text: string) => all.indexOf(text);
  const order = ['Needs you', 'claude · Apply the migration?', 'Working', 'codex · editing settingsSchema.ts', 'Done today', 'claude · changelog for 2.3', '1 idle · 1 hibernated'].map(at);
  expect(order.every((index) => index >= 0)).toBe(true);
  expect([...order].sort((a, b) => a - b)).toEqual(order);
  expect(screen.queryByText('claude · old work')).toBeNull();
  await fireEvent.press(screen.getByText('Show'));
  expect(screen.getByText('claude · old work')).toBeTruthy();
});

test('a row opens its agent', async () => {
  await renderNow();
  await fireEvent.press(screen.getByText('codex · editing settingsSchema.ts'));
  expect(navigation.navigate).toHaveBeenCalledWith('Conversation', { paneId: 'w', title: 'codex' });
});

test('PHA-C27 with a Phone workspace and no agent there yet, a pinned Phone row opens New chat', async () => {
  phoneWorkspace.mockReturnValue({ set: true, agent: 'claude' });
  await renderNow();
  const all = textsInOrder(screen.toJSON());
  expect(all.indexOf('Phone')).toBeLessThan(all.indexOf('Needs you'));
  await fireEvent.press(screen.getByText('Phone'));
  expect(navigation.navigate).toHaveBeenCalledWith('NewChat');
});

test('no Phone row without a Phone workspace', async () => {
  await renderNow();
  expect(screen.queryByText('Phone')).toBeNull();
});

test('PHA-C27 the pinned Phone row opens a pane run by another agent in its terminal', async () => {
  phoneWorkspace.mockReturnValue({ set: true, agent: 'claude' });
  mockData.sessions = [{ sessionId: 'ph', name: 'phone', kind: 'agent', workDir: '/p', state: 'done', phone: true }];
  mockData.panes = [{ paneId: 'aider', sessionId: 'ph', kind: 'terminal', title: 'aider', running: true, blockCount: 1, agent: 'other', agentState: 'done' }];
  await renderNow();
  await fireEvent.press(screen.getByText('Phone'));
  expect(navigation.navigate).toHaveBeenCalledWith('Terminal', { paneId: 'aider', title: 'aider' });
});

