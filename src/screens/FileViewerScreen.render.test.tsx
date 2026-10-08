import { beforeEach, expect, jest, test } from '@jest/globals';
import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { FileViewerScreen } from './FileViewerScreen';

const mockRpc: { caps: string[]; files: Record<string, string>; calls: [string, any][]; fail: Record<string, unknown>; emit: (type: string, payload: unknown) => void } = {
  caps: [],
  files: {},
  calls: [],
  fail: {},
  emit: () => {},
};

jest.mock('../services/rpc', () => ({
  OstiaRpc: {
    call: async (method: string, params: any) => {
      mockRpc.calls.push([method, params]);
      if (mockRpc.fail[method]) throw mockRpc.fail[method];
      if (params.root === '?') throw { code: -32602, message: 'invalid-root' };
      if (method === 'artifact.open') return { ok: true };
      const file = mockRpc.files[params.path];
      if (file === undefined) throw { code: -32602, message: 'not-found' };
      const offset = params.offset ?? 0;
      const slice = file.slice(offset, offset + 100);
      const truncated = offset + slice.length < file.length;
      return offset > 0 ? { base64: btoa(slice), size: file.length, truncated } : { text: slice, size: file.length, truncated };
    },
    addStatusListener: () => () => {},
    addEventListener: (listener: (type: string, payload: unknown) => void) => {
      mockRpc.emit = listener;
      return () => {};
    },
    getStatus: () => 'connected',
    addCapsListener: () => () => {},
    getCaps: () => mockRpc.caps,
  },
}));

const MARKDOWN = `# Plan

Ship **soon**. ![chart](https://evil.example/pixel.png) ![ok](data:image/png;base64,iVBORw0KGgo=)

<script>alert(1)</script>

<img src="http://evil.example/x.png" onerror="steal()">

\`\`\`mermaid
graph TD;A-->B
\`\`\`
`;

async function open(path: string, root: 'artifacts' | 'workspace' = 'artifacts') {
  return render(
    <FileViewerScreen
      navigation={{ setOptions: jest.fn() } as any}
      route={{ key: 'FileView', name: 'FileView', params: { sessionId: 's', path, name: path.split('/').pop(), root } } as any}
    />,
  );
}

beforeEach(() => {
  mockRpc.calls = [];
  mockRpc.fail = {};
  mockRpc.files = {};
  mockRpc.caps = ['read', 'notify'];
});

test('ART-V1 renders Markdown and never loads a remote image or raw HTML', async () => {
  mockRpc.files = { 'plan.md': MARKDOWN };
  await open('plan.md');
  expect(await screen.findByRole('header', { name: 'Plan' })).toBeTruthy();
  expect(screen.getByText('soon')).toBeTruthy();
  expect(screen.getByLabelText('ok').props.source.uri).toBe('data:image/png;base64,iVBORw0KGgo=');
  expect(screen.queryByLabelText('chart')).toBeNull();
  expect(screen.getByText(/image not loaded: chart/)).toBeTruthy();
  expect(screen.getByText('<script>alert(1)</script>')).toBeTruthy();
  expect(screen.getByText(/<img src="http:\/\/evil\.example\/x\.png" onerror="steal\(\)">/)).toBeTruthy();
});

test('ART-V2 draws a Mermaid block as a picture in a page that cannot navigate', async () => {
  mockRpc.files = { 'plan.md': MARKDOWN };
  await open('plan.md');
  const diagram = await screen.findByLabelText('Diagram');
  expect(diagram.props.source.html).toContain("securityLevel:'strict'");
  expect(diagram.props.source.html).toContain('graph TD;A-->B');
  expect(diagram.props.onShouldStartLoadWithRequest({ url: 'https://example.com/' })).toBe(false);
  expect(diagram.props.originWhitelist).toEqual(['about:blank']);
});

test('ART-V3 shows an SVG as a picture with scripts off', async () => {
  mockRpc.files = { 'chart.svg': '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>' };
  await open('chart.svg');
  const picture = await screen.findByLabelText('Picture');
  expect(picture.props.javaScriptEnabled).toBe(false);
  expect(picture.props.source.html).toContain('<img alt="" src="data:image/svg+xml;base64,');
  expect(picture.props.source.html).not.toContain('<script');
});

test('ART-V4 shows a CSV as a table', async () => {
  mockRpc.files = { 'timings.csv': 'route,p95\n"/ws, attach",9\n' };
  await open('timings.csv');
  expect(await screen.findByText('/ws, attach')).toBeTruthy();
  expect(screen.getByText('p95')).toBeTruthy();
});

test.each(['dashboard/index.html', 'Counter.tsx', 'Widget.jsx'])('ART-V5 shows %s as source and never runs it', async (path) => {
  mockRpc.files = { [path]: 'const SOURCE = "<script>run()</script>";\n' };
  await open(path);
  expect(await screen.findByText('const SOURCE = "<script>run()</script>";')).toBeTruthy();
  expect(screen.queryByLabelText('Picture')).toBeNull();
  expect(screen.queryByLabelText('Diagram')).toBeNull();
  expect(screen.getByText(/runs on the desktop only/)).toBeTruthy();
  expect(screen.queryByText('Open on desktop')).toBeNull();
  expect(mockRpc.calls.every(([method]) => method === 'fs.list' || method === 'fs.read')).toBe(true);
});

test('ART-V6 opens an artifact on the desktop when the phone may run commands', async () => {
  mockRpc.caps = ['read', 'notify', 'command'];
  mockRpc.files = { 'page.html': '<p>hi</p>\n' };
  await open('page.html');
  await fireEvent.press(await screen.findByText('Open on desktop'));
  expect(mockRpc.calls).toContainEqual(['artifact.open', { sessionId: 's', path: 'page.html' }]);
  expect(await screen.findByText('Opened on the desktop.')).toBeTruthy();
});

test('ART-V12 says which desktop setting is off when the desktop refuses to open it', async () => {
  mockRpc.caps = ['read', 'notify', 'command'];
  mockRpc.files = { 'page.html': '<p>hi</p>\n' };
  mockRpc.fail = { 'artifact.open': { code: -32003, message: 'needs-elevation', data: { cap: 'command' } } };
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  await open('page.html');
  await fireEvent.press(await screen.findByText('Open on desktop'));
  expect(alert).toHaveBeenCalledWith("Couldn't open it on the desktop", expect.stringContaining('Run Ostia commands'));
});

test('ART-V7 reads a project file from the workspace root, with no root in the request', async () => {
  mockRpc.files = { 'index.html': '<p>hi</p>\n' };
  await open('index.html', 'workspace');
  mockRpc.caps = ['read', 'notify', 'command'];
  expect(await screen.findByText('<p>hi</p>')).toBeTruthy();
  expect(screen.queryByText('Open on desktop')).toBeNull();
  expect(mockRpc.calls).toEqual([['fs.read', { sessionId: 's', path: 'index.html' }]]);
});

test('ART-V8 shows the pad read-only, and says what it is while it is empty', async () => {
  await open('PAD.md');
  expect(await screen.findByText('Nothing on the pad yet')).toBeTruthy();
  expect(screen.getByText(/A working note for this workspace, shared with its agents/)).toBeTruthy();
  expect(mockRpc.calls.map(([method]) => method).filter((method) => !method.startsWith('fs.'))).toEqual([]);
});

test('ART-V9 reads the next piece of a long file when the list reaches its end', async () => {
  mockRpc.files = { 'trace.log': Array.from({ length: 30 }, (_, index) => `line-${String(index).padStart(3, '0')}`).join('\n') };
  await open('trace.log');
  expect(await screen.findByText('line-000')).toBeTruthy();
  expect(screen.getByText(/Showing the first 100 B of 269 B/)).toBeTruthy();
  await fireEvent(screen.getByTestId('source'), 'endReached');
  await fireEvent(screen.getByTestId('source'), 'endReached');
  expect(mockRpc.calls.filter(([method]) => method === 'fs.read').map(([, params]) => params.offset)).toEqual([undefined, 100, 200]);
  expect(screen.queryByText(/Showing the first/)).toBeNull();
});

test('ART-V10 shows the new text when the open artifact changes on the desktop', async () => {
  mockRpc.files = { 'notes.txt': 'before\n' };
  await open('notes.txt');
  expect(await screen.findByText('before')).toBeTruthy();
  mockRpc.files = { 'notes.txt': 'after\n' };
  await act(async () => mockRpc.emit('artifact.changed', { sessionId: 's', path: 'notes.txt', change: 'changed' }));
  expect(await screen.findByText('after')).toBeTruthy();
});

test('ART-V11 sends a PDF to another app instead of previewing it', async () => {
  mockRpc.files = { 'paper.pdf': '%PDF-1.7' };
  await open('paper.pdf');
  expect(await screen.findByText('PDFs open in another app.')).toBeTruthy();
  expect(screen.getByText('Open in another app')).toBeTruthy();
  expect(mockRpc.calls.filter(([method]) => method === 'fs.read')).toEqual([]);
});
