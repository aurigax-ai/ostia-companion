import { beforeEach, expect, jest, test } from '@jest/globals';
import React from 'react';
import { Text } from 'react-native';
import { act, render, screen } from '@testing-library/react-native';
import { useDictation } from './dictation';

jest.unmock('../services/dictation');
jest.unmock('./dictation');

const mockSpeech = {
  available: true,
  onDevice: true,
  granted: true,
  permission: null as null | (() => Promise<{ granted: boolean }>),
  start: jest.fn(),
  stop: jest.fn(),
  abort: jest.fn(),
  handlers: {} as Record<string, (event: any) => void>,
};

jest.mock('expo-speech-recognition', () => ({
  ExpoSpeechRecognitionModule: {
    isRecognitionAvailable: () => mockSpeech.available,
    supportsOnDeviceRecognition: () => mockSpeech.onDevice,
    requestPermissionsAsync: async () => (mockSpeech.permission ? mockSpeech.permission() : { granted: mockSpeech.granted }),
    start: (options: unknown) => mockSpeech.start(options),
    stop: () => mockSpeech.stop(),
    abort: () => mockSpeech.abort(),
  },
  useSpeechRecognitionEvent: (name: string, handler: (event: any) => void) => {
    mockSpeech.handlers[name] = handler;
  },
}));

let api: ReturnType<typeof useDictation>;
let current = '';

function Probe({ initial }: { initial: string }) {
  const [text, setText] = React.useState(initial);
  current = text;
  api = useDictation(text, setText);
  return <Text>{api.problem ?? (api.listening ? 'listening' : 'idle')}</Text>;
}

beforeEach(() => {
  Object.assign(mockSpeech, { available: true, onDevice: true, granted: true });
  mockSpeech.start.mockClear();
  mockSpeech.stop.mockClear();
  mockSpeech.abort.mockClear();
});

test('dictation starts on-device only and writes what was heard after the draft', async () => {
  await render(<Probe initial="run" />);
  await act(async () => api.toggle());
  expect(mockSpeech.start).toHaveBeenCalledWith(expect.objectContaining({ requiresOnDeviceRecognition: true, interimResults: true }));
  expect(screen.getByText('listening')).toBeTruthy();
  await act(async () => mockSpeech.handlers.result({ results: [{ transcript: 'the tests' }] }));
  expect(current).toBe('run the tests');
  await act(async () => mockSpeech.handlers.result({ results: [{ transcript: 'the tests please' }] }));
  expect(current).toBe('run the tests please');
  await act(async () => mockSpeech.handlers.end({}));
  expect(screen.getByText('idle')).toBeTruthy();
});

test('toggling while listening stops it', async () => {
  await render(<Probe initial="" />);
  await act(async () => api.toggle());
  await act(async () => api.toggle());
  expect(mockSpeech.stop).toHaveBeenCalled();
});

test('no recognizer says so and never starts', async () => {
  mockSpeech.available = false;
  await render(<Probe initial="" />);
  await act(async () => api.toggle());
  expect(screen.getByText('This phone has no speech recognizer.')).toBeTruthy();
  expect(mockSpeech.start).not.toHaveBeenCalled();
});

test('a phone that cannot recognise on the device does not fall back to sending audio', async () => {
  mockSpeech.onDevice = false;
  await render(<Probe initial="" />);
  await act(async () => api.toggle());
  expect(screen.getByText(/can't recognise speech on the device/)).toBeTruthy();
  expect(mockSpeech.start).not.toHaveBeenCalled();
});

test('a denied microphone permission says so and never starts', async () => {
  mockSpeech.granted = false;
  await render(<Probe initial="" />);
  await act(async () => api.toggle());
  expect(screen.getByText('Allow the microphone for Ostia in Settings to dictate.')).toBeTruthy();
  expect(mockSpeech.start).not.toHaveBeenCalled();
});

test('a recognizer error shows its problem, but silence and abort stay quiet', async () => {
  await render(<Probe initial="" />);
  await act(async () => api.toggle());
  await act(async () => mockSpeech.handlers.error({ error: 'no-speech' }));
  expect(screen.getByText('idle')).toBeTruthy();
  await act(async () => mockSpeech.handlers.error({ error: 'audio-capture' }));
  expect(screen.getByText("Couldn't use the microphone.")).toBeTruthy();
});

test('abort stops the recognizer and ignores every later result', async () => {
  await render(<Probe initial="run" />);
  await act(async () => api.toggle());
  await act(async () => mockSpeech.handlers.result({ results: [{ transcript: 'the tests' }] }));
  await act(async () => api.abort());
  expect(mockSpeech.abort).toHaveBeenCalledTimes(1);
  expect(screen.getByText('idle')).toBeTruthy();
  await act(async () => mockSpeech.handlers.result({ results: [{ transcript: 'the tests please' }] }));
  expect(current).toBe('run the tests');
});

test('abort with nothing listening does nothing', async () => {
  await render(<Probe initial="" />);
  await act(async () => api.abort());
  expect(mockSpeech.abort).not.toHaveBeenCalled();
});

test('leaving the screen aborts a running recognizer', async () => {
  const view = await render(<Probe initial="" />);
  await act(async () => api.toggle());
  await view.unmount();
  expect(mockSpeech.abort).toHaveBeenCalledTimes(1);
});

test('leaving the screen while the permission is pending never starts the recognizer', async () => {
  let grant: (value: { granted: boolean }) => void = () => {};
  mockSpeech.permission = () => new Promise((resolve) => (grant = resolve));
  const view = await render(<Probe initial="" />);
  let started: Promise<void> | undefined;
  await act(async () => {
    started = Promise.resolve(api.toggle());
  });
  await view.unmount();
  await act(async () => grant({ granted: true }));
  await started;
  expect(mockSpeech.start).not.toHaveBeenCalled();
  mockSpeech.permission = null;
});

test('a second tap while the permission is pending starts dictation once', async () => {
  let grant: (value: { granted: boolean }) => void = () => {};
  mockSpeech.permission = () => new Promise((resolve) => (grant = resolve));
  await render(<Probe initial="" />);
  await act(async () => {
    api.toggle();
    api.toggle();
  });
  await act(async () => grant({ granted: true }));
  expect(mockSpeech.start).toHaveBeenCalledTimes(1);
  mockSpeech.permission = null;
});
