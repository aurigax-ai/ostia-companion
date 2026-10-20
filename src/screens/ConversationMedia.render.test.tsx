import { beforeEach, expect, jest, test } from '@jest/globals';
import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ConversationScreen } from './ConversationScreen';

const IMAGE = { mime: 'image/jpeg', data: 'AAAA' };

const mockMedia = {
  prompt: jest.fn(async (..._args: unknown[]) => ({ ok: true, image: 'pasted' }) as unknown),
  pick: jest.fn(async (..._args: unknown[]) => ({ picked: { uri: 'file:///cat.jpg', image: IMAGE } }) as unknown),
  dictation: { listening: false, problem: null as string | null },
  toggle: jest.fn(),
  abort: jest.fn(),
  features: ['prompt-image'] as string[],
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
  useFeatures: () => mockMedia.features,
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
    return { ...mockMedia.dictation, toggle: mockMedia.toggle, abort: mockMedia.abort };
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
  mockMedia.pick.mockReset();
  mockMedia.pick.mockResolvedValue({ picked: { uri: 'file:///cat.jpg', image: IMAGE } });
  mockMedia.toggle.mockClear();
  mockMedia.abort.mockClear();
  mockMedia.features = ['prompt-image'];
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

test('a desktop without the prompt-image feature shows no attach buttons and says why', async () => {
  mockMedia.features = [];
  await renderConversation();
  expect(screen.queryByLabelText('Attach from gallery')).toBeNull();
  expect(screen.queryByLabelText('Take a photo')).toBeNull();
  expect(screen.getByText("This desktop can't take images yet")).toBeTruthy();
  expect(screen.getByLabelText('Dictate')).toBeTruthy();
});

test('an image with no text can be sent', async () => {
  await renderConversation();
  await fireEvent.press(await screen.findByLabelText('Attach from gallery'));
  await fireEvent.press(screen.getByLabelText('Send'));
  expect(mockMedia.prompt).toHaveBeenCalledWith('p-agent', '', IMAGE);
  expect(screen.queryByLabelText('Attached image')).toBeNull();
});

test('with no text and no image Send does nothing', async () => {
  await renderConversation();
  await fireEvent.press(await screen.findByLabelText('Send'));
  expect(mockMedia.prompt).not.toHaveBeenCalled();
});

test('a not-submitted answer drops the thumbnail, because the desktop already pasted it, and keeps the draft', async () => {
  mockMedia.prompt.mockRejectedValue({ code: -32005, message: 'not-submitted' });
  await attachAndType('what is this');
  await fireEvent.press(screen.getByLabelText('Send'));
  expect(await screen.findByText(/did not start a turn/)).toBeTruthy();
  expect(screen.queryByLabelText('Attached image')).toBeNull();
  expect(screen.getByLabelText('Message').props.value).toBe('what is this');
  mockMedia.prompt.mockResolvedValue({ ok: true });
  await fireEvent.press(screen.getByLabelText('Send'));
  expect(mockMedia.prompt).toHaveBeenLastCalledWith('p-agent', 'what is this');
});

test('a picker that throws shows a message instead of crashing', async () => {
  mockMedia.pick.mockRejectedValue(new Error('manipulator failed'));
  await renderConversation();
  await fireEvent.press(await screen.findByLabelText('Attach from gallery'));
  expect(await screen.findByText("Couldn't attach that image.")).toBeTruthy();
  expect(screen.queryByLabelText('Attached image')).toBeNull();
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

test('the mic button toggles dictation and its problem shows', async () => {
  mockMedia.dictation = { listening: false, problem: 'This phone has no speech recognizer.' };
  await renderConversation();
  await fireEvent.press(await screen.findByLabelText('Dictate'));
  expect(mockMedia.toggle).toHaveBeenCalled();
  expect(screen.getByText('This phone has no speech recognizer.')).toBeTruthy();
});

test('what dictation hears lands in the composer through the hook callback', async () => {
  await renderConversation();
  await act(async () => mockMedia.onText?.('run the tests'));
  expect(screen.getByLabelText('Message').props.value).toBe('run the tests');
});

test('Send stops the recognizer first, so a later result cannot refill the composer', async () => {
  await renderConversation();
  await act(async () => mockMedia.onText?.('run the tests'));
  await fireEvent.press(screen.getByLabelText('Send'));
  expect(mockMedia.abort).toHaveBeenCalled();
  expect(mockMedia.abort.mock.invocationCallOrder[0]).toBeLessThan(mockMedia.prompt.mock.invocationCallOrder[0]);
});

test('typing while dictating stops the recognizer and keeps what was typed', async () => {
  await renderConversation();
  await act(async () => mockMedia.onText?.('run the'));
  await fireEvent.changeText(screen.getByLabelText('Message'), 'run the tests now');
  expect(mockMedia.abort).toHaveBeenCalled();
  expect(screen.getByLabelText('Message').props.value).toBe('run the tests now');
});
