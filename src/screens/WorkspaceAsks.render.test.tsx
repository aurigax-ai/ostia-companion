import { expect, jest, test } from '@jest/globals';
import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { WorkspaceScreen } from './WorkspaceScreen';

const mockAsks: { asks: object[] } = { asks: [] };

jest.mock('../services/askStore', () => ({
  useAsks: () => ({ asks: mockAsks.asks, unsupported: false, pending: {}, errors: {} }),
  answerAsk: jest.fn(),
}));
jest.mock('../services/rpc', () => ({ OstiaRpc: { getPairing: () => null, retry: jest.fn() } }));
jest.mock('../services/workspaceStore', () => ({
  useCaps: () => ['read', 'respond'],
  useConnectionStatus: () => 'connected',
  refreshWorkspaces: jest.fn(),
  useWorkspaces: () => ({
    sessions: [{ sessionId: 's', name: 'ostia', kind: 'project', workDir: '/home/me/ostia', state: 'waiting' }],
    panes: [
      { paneId: 'p-agent', sessionId: 's', kind: 'terminal', title: 'claude', running: true, blockCount: 1, agent: 'claude', agentState: 'waiting' },
      { paneId: 'p-web', sessionId: 's', kind: 'browser', title: 'localhost:5173', running: false, blockCount: 0 },
    ],
    refreshing: false,
    loadedAt: 1,
  }),
}));
jest.mock('../services/openTailscaleApp', () => ({ openTailscaleApp: jest.fn() }));

async function renderWorkspace() {
  await render(
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 360, height: 800 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
      <WorkspaceScreen
        navigation={{ setOptions: jest.fn(), navigate: jest.fn(), popToTop: jest.fn() } as any}
        route={{ key: 'Workspace', name: 'Workspace', params: { sessionId: 's', name: 'ostia' } } as any}
      />
    </SafeAreaProvider>,
  );
}

const ASK = {
  askId: 'ask-1', sessionId: 's', paneId: 'p-agent', kind: 'question', agent: 'claude',
  title: 'Which environment?', choices: [{ id: 'staging', label: 'Staging', tone: 'neutral' }], allowText: false, since: Date.now(),
};

function textsInOrder(node: unknown, out: string[] = []): string[] {
  if (typeof node === 'string') out.push(node);
  else if (Array.isArray(node)) node.forEach((child) => textsInOrder(child, out));
  else if (node && typeof node === 'object' && 'children' in node) textsInOrder((node as { children: unknown }).children, out);
  return out;
}

function order(texts: string[]) {
  const all = textsInOrder(screen.toJSON());
  return texts.map((text) => all.indexOf(text));
}

test('AGT-C19 the workspace lists its ask first, then Terminals, then More with Files and desktop-only panes', async () => {
  mockAsks.asks = [ASK];
  await renderWorkspace();
  const positions = order(['Which environment?', 'Terminals', 'More', 'Files', 'localhost:5173']);
  expect(positions.every((p) => p >= 0)).toBe(true);
  expect([...positions].sort((a, b) => a - b)).toEqual(positions);
});

test('AGT-C20 a workspace with no open ask has no Needs you section', async () => {
  mockAsks.asks = [];
  await renderWorkspace();
  expect(screen.queryByText('Needs you')).toBeNull();
  expect(screen.getByText('Terminals')).toBeTruthy();
});
