import { beforeEach, expect, jest, test } from '@jest/globals';
import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { ArtifactsScreen } from './ArtifactsScreen';
import { FileViewerScreen } from './FileViewerScreen';

const mockRpc: { legacy: boolean; caps: string[]; reply: (method: string, params: any) => unknown; emit: (type: string, payload: unknown) => void; status: () => void } = {
  legacy: false,
  caps: ['read', 'notify'],
  reply: () => ({}),
  emit: () => {},
  status: () => {},
};

jest.mock('../services/rpc', () => ({
  OstiaRpc: {
    call: async (method: string, params: any) => {
      if (params.root === '?' && !mockRpc.legacy) throw { code: -32602, message: 'invalid-root' };
      return mockRpc.reply(method, params);
    },
    addStatusListener: (listener: () => void) => {
      mockRpc.status = listener;
      return () => {};
    },
    addEventListener: (listener: (type: string, payload: unknown) => void) => {
      mockRpc.emit = listener;
      return () => {};
    },
    getStatus: () => 'connected',
    addCapsListener: () => () => {},
    getCaps: () => mockRpc.caps,
  },
}));

const NOW = Date.now();
const ENTRIES = [
  { name: 'old.md', kind: 'file', size: 10, mtime: NOW - 3 * 3_600_000 },
  { name: 'PAD.md', kind: 'file', size: 5, mtime: NOW - 60_000 },
  { name: 'new.csv', kind: 'file', size: 2048, mtime: NOW - 5 * 60_000 },
  { name: 'page', kind: 'dir', size: 0, mtime: NOW - 3_600_000 },
];

const navigation = { setOptions: jest.fn(), push: jest.fn(), navigate: jest.fn() };

async function renderArtifacts() {
  await render(
    <ArtifactsScreen navigation={navigation as any} route={{ key: 'Artifacts', name: 'Artifacts', params: { sessionId: 's', path: '', title: 'ostia' } } as any} />,
  );
}

beforeEach(() => {
  navigation.navigate.mockClear();
  mockRpc.legacy = false;
  mockRpc.status();
  mockRpc.reply = () => ({ entries: ENTRIES });
});

test('ART-S1 pins the Scratch Pad first, then lists newest first', async () => {
  await renderArtifacts();
  await screen.findByText('new.csv');
  const titles = screen.getAllByText(/^(Scratch Pad|new\.csv|page|old\.md)$/).map((node) => node.props.children);
  expect(titles).toEqual(['Scratch Pad', 'new.csv', 'page', 'old.md']);
  expect(screen.queryByText('PAD.md')).toBeNull();
  expect(screen.getByText('2 KB · 5 min ago')).toBeTruthy();
});

test('ART-S2 shows only the pad row, marked empty, when the folder is empty', async () => {
  mockRpc.reply = () => ({ entries: [] });
  await renderArtifacts();
  expect(await screen.findByText('Scratch Pad')).toBeTruthy();
  expect(screen.getByText('Empty')).toBeTruthy();
  expect(screen.getByText(/Nothing else yet/)).toBeTruthy();
});

test('ART-S3 shows no project file as an artifact when the desktop does not know roots', async () => {
  mockRpc.legacy = true;
  mockRpc.reply = () => ({ entries: [{ name: 'secret-project-file.ts', kind: 'file', size: 1, mtime: NOW }] });
  await renderArtifacts();
  expect(await screen.findByText(/This desktop can't share artifacts yet/)).toBeTruthy();
  expect(screen.queryByText('secret-project-file.ts')).toBeNull();
});

test('ART-S4 marks a changed artifact unread and clears the mark once it is opened', async () => {
  await renderArtifacts();
  await screen.findByText('old.md');
  expect(screen.queryByLabelText('Unread')).toBeNull();
  await act(async () => mockRpc.emit('artifact.changed', { sessionId: 's', path: 'old.md', change: 'changed' }));
  await act(async () => mockRpc.emit('artifact.changed', { sessionId: 'other', path: 'new.csv', change: 'changed' }));
  expect(screen.getAllByLabelText('Unread')).toHaveLength(1);

  await fireEvent.press(screen.getByText('old.md'));
  expect(navigation.navigate).toHaveBeenCalledWith('FileView', { sessionId: 's', path: 'old.md', name: 'old.md', root: 'artifacts' });
  mockRpc.reply = (method) =>
    method === 'fs.read' ? { text: '# old\n', size: 6, truncated: false } : { entries: ENTRIES };
  await render(
    <FileViewerScreen
      navigation={{ setOptions: jest.fn() } as any}
      route={{ key: 'FileView', name: 'FileView', params: { sessionId: 's', path: 'old.md', name: 'old.md', root: 'artifacts' } } as any}
    />,
  );
  await screen.findByText('old');
  expect(screen.queryByLabelText('Unread')).toBeNull();
});

test('ART-S5 marks a folder unread when a file inside it changed', async () => {
  await renderArtifacts();
  await screen.findByText('page');
  await act(async () => mockRpc.emit('artifact.changed', { sessionId: 's', path: 'page/index.html', change: 'added' }));
  expect(screen.getAllByLabelText('Unread')).toHaveLength(1);
  await fireEvent.press(screen.getByText('page'));
  expect(navigation.push).toHaveBeenCalledWith('Artifacts', { sessionId: 's', path: 'page', title: 'page' });
});

test('ART-S6 lists a workspace that has no artifact folder as empty', async () => {
  mockRpc.reply = () => {
    throw { code: -32602, message: 'not-found' };
  };
  await renderArtifacts();
  expect(await screen.findByText('Scratch Pad')).toBeTruthy();
  expect(screen.getByText('Empty')).toBeTruthy();
});
