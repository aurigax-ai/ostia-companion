import { beforeEach, expect, jest, test } from '@jest/globals';
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ConversationScreen } from './ConversationScreen';

const IMAGE = { mime: 'image/jpeg', data: 'AAAA' };

const mockMedia = {
  prompt: jest.fn(async (..._args: unknown[]) => ({ ok: true, image: 'pasted' }) as unknown),
  pick: jest.fn(async (..._args: unknown[]) => ({ picked: { uri: 'file:///cat.jpg', image: IMAGE } }) as unknown),
  dictation: { listening: false, problem: null as string | null },
  toggle: jest.fn(),
  onText: null as null | ((text: string) => void),
};

jest.mock('../services/turns', () => ({
  loadTurns: async () => ({ kind: 'turns', list: { turns: [], truncated: false } }),
  loadStepOutput: jest.fn(),
}));
jest.mock('../services/askStore', () => ({
  useAsks: () => ({ asks: [], unsupported: false, pending: {}, errors: {} }),
  answerAsk: jest.fn(),
  promptAgent: (...args: unknown[]) => mockMedia.prompt(...args),
  interruptAgent: jest.fn(),
}));
jest.mock('../services/workspaceStore', () => ({
  useCaps: () => ['read', 'notify', 'respond'],
  useWorkspaces: () => ({
    sessions: [{ sessionId: 's-ostia', name: 'ostia', kind: 'agent', workDir: '/o', state: 'working' }],
    panes: [{ paneId: 'p-agent', sessionId: 's-ostia', kind: 'terminal', title: 'claude', running: true, blockCount: 1, agent: 'claude', agentState: 'done' }],
  }),
}));
jest.mock('../services/rpc', () => ({ OstiaRpc: { addEventListener: () => () => {} } }));
jest.mock('../services/snippets', () => ({ useSnippets: () => [] }));
jest.mock('../services/phoneSession', () => ({ phoneControlSupported: () => true }));
jest.mock('../services/images', () => ({ pickImage: (...args: unknown[]) => mockMedia.pick(...args) }));
jest.mock('../services/dictation', () => ({
  useDictation: (_text: string, onText: (text: string) => void) => {
    mockMedia.onText = onText;
    return { ...mockMedia.dictation, toggle: mockMedia.toggle };
  },
}));

const navigation = { navigate: jest.fn(), replace: jest.fn(), setOptions: jest.fn() };

async function renderConversation() {
  await render(
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 412, height: 915 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
      <ConversationScreen navigation={navigation as any} route={{ params: { paneId: 'p-agent', title: 'claude' } } as any} />
    </SafeAreaProvider>,
  );
}

async function attachAndType(text: string) {
  await renderConversation();
  await fireEvent.press(await screen.findByLabelText('Attach from gallery'));
  await fireEvent.changeText(screen.getByLabelText('Message'), text);
}

beforeEach(() => {
  mockMedia.prompt.mockClear();
  mockMedia.prompt.mockResolvedValue({ ok: true, image: 'pasted' });
  mockMedia.pick.mockClear();
  mockMedia.toggle.mockClear();
  mockMedia.dictation = { listening: false, problem: null };
});

test('an attached image shows as a thumbnail the human can remove before Send', async () => {
  await attachAndType('what is this');
  expect(screen.getByLabelText('Attached image')).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('Remove image'));
  expect(screen.queryByLabelText('Attached image')).toBeNull();
  await fireEvent.press(screen.getByLabelText('Send'));
  expect(mockMedia.prompt).toHaveBeenCalledWith('p-agent', 'what is this');
});

test('Send passes the image to agent.prompt and clears the thumbnail when the desktop pasted it', async () => {
  await attachAndType('what is this');
  await fireEvent.press(screen.getByLabelText('Send'));
  expect(mockMedia.prompt).toHaveBeenCalledWith('p-agent', 'what is this', IMAGE);
  expect(screen.queryByLabelText('Attached image')).toBeNull();
  expect(screen.queryByText("This desktop can't take images yet")).toBeNull();
});

test('an answer without image: pasted says the desktop cannot take images yet', async () => {
  mockMedia.prompt.mockResolvedValue({ ok: true });
  await attachAndType('what is this');
  await fireEvent.press(screen.getByLabelText('Send'));
  expect(await screen.findByText("This desktop can't take images yet")).toBeTruthy();
});

test.each([
  ['image-type', "That image type isn't supported. Use PNG, JPEG or WebP."],
  ['image-too-large', 'That image is too large for the desktop.'],
  ['rate-limited', 'Too many images in a short time. Wait a moment and try again.'],
])('the desktop refusing with %s reads as a plain message and keeps the draft', async (code, message) => {
  mockMedia.prompt.mockRejectedValue({ code: -32602, message: code });
  await attachAndType('what is this');
  await fireEvent.press(screen.getByLabelText('Send'));
  expect(await screen.findByText(message)).toBeTruthy();
  expect(screen.getByLabelText('Attached image')).toBeTruthy();
  expect(screen.getByLabelText('Message').props.value).toBe('what is this');
});

test('a picker problem shows as a message and attaches nothing', async () => {
  mockMedia.pick.mockResolvedValue({ problem: 'Allow the camera for Ostia in Settings to take a photo.' });
  await renderConversation();
  await fireEvent.press(await screen.findByLabelText('Take a photo'));
  expect(await screen.findByText('Allow the camera for Ostia in Settings to take a photo.')).toBeTruthy();
  expect(screen.queryByLabelText('Attached image')).toBeNull();
});

test('the mic button toggles dictation, its text lands in the composer, and its problem shows', async () => {
  mockMedia.dictation = { listening: false, problem: "This phone has no speech recognizer." };
  await renderConversation();
  await fireEvent.press(await screen.findByLabelText('Dictate'));
  expect(mockMedia.toggle).toHaveBeenCalled();
  expect(screen.getByText('This phone has no speech recognizer.')).toBeTruthy();
  await fireEvent.changeText(screen.getByLabelText('Message'), 'run the tests');
  expect(screen.getByLabelText('Message').props.value).toBe('run the tests');
});
