import { expect, jest, test } from '@jest/globals';
import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { HomeScreen } from './HomeScreen';

jest.mock('../services/rpc', () => ({
  OstiaRpc: {
    getPairing: () => ({ desktopName: 'Studio', gatewayHost: '192.168.1.20', gatewayPort: 8722 }),
    retry: jest.fn(),
  },
}));
jest.mock('../services/workspaceStore', () => ({
  useWorkspaces: () => ({
    sessions: [{ sessionId: 's', name: 'api-server', kind: 'project', workDir: '/w', state: 'waiting' }],
    panes: [
      { paneId: 'p', sessionId: 's', kind: 'terminal', title: 'claude', running: true, blockCount: 1, agent: 'claude', agentState: 'waiting', agentMessage: 'Apply the migration?' },
    ],
    loading: false,
    refreshing: false,
    loadedAt: null,
  }),
  useConnectionStatus: () => 'connected',
  useCaps: () => ['read', 'notify'],
  refreshWorkspaces: jest.fn(),
}));
jest.mock('../services/askStore', () => ({
  useAsks: () => ({ asks: [], unsupported: true, pending: {}, errors: {} }),
  answerAsk: jest.fn(),
}));
jest.mock('../services/openTailscaleApp', () => ({ openTailscaleApp: jest.fn() }));

const METRICS = { frame: { x: 0, y: 0, width: 360, height: 800 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };

test('AGT-C13 a desktop without asks shows the update note and the waiting agent with Open', async () => {
  await render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <HomeScreen navigation={{ setOptions: jest.fn(), navigate: jest.fn() } as any} route={{} as any} onUnpair={jest.fn(async () => {})} />
    </SafeAreaProvider>,
  );
  expect(screen.getByText('Update Ostia on the desktop to answer from here.')).toBeTruthy();
  expect(screen.getByText('Apply the migration?')).toBeTruthy();
  expect(screen.getByText('Open')).toBeTruthy();
});
