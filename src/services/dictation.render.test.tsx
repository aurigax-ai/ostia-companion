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
  start: jest.fn(),
  stop: jest.fn(),
  handlers: {} as Record<string, (event: any) => void>,
};

jest.mock('expo-speech-recognition', () => ({
  ExpoSpeechRecognitionModule: {
    isRecognitionAvailable: () => mockSpeech.available,
    supportsOnDeviceRecognition: () => mockSpeech.onDevice,
    requestPermissionsAsync: async () => ({ granted: mockSpeech.granted }),
    start: (options: unknown) => mockSpeech.start(options),
    stop: () => mockSpeech.stop(),
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
