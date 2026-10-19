import { useCallback, useRef, useState } from 'react';
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition';
import { dictationProblem, MIC_DENIED, NO_RECOGNIZER, NOT_ON_DEVICE, withDictation } from '../model/dictation';

export function useDictation(text: string, onText: (text: string) => void) {
  const [listening, setListening] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const base = useRef('');

  useSpeechRecognitionEvent('result', (event) => onText(withDictation(base.current, event.results[0]?.transcript ?? '')));
  useSpeechRecognitionEvent('end', () => setListening(false));
  useSpeechRecognitionEvent('error', (event) => {
    setListening(false);
    setProblem(dictationProblem(event.error));
  });

  const start = useCallback(async () => {
    setProblem(null);
    if (!ExpoSpeechRecognitionModule.isRecognitionAvailable()) return setProblem(NO_RECOGNIZER);
    if (!ExpoSpeechRecognitionModule.supportsOnDeviceRecognition()) return setProblem(NOT_ON_DEVICE);
    const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!permission.granted) return setProblem(MIC_DENIED);
    base.current = text;
    setListening(true);
    ExpoSpeechRecognitionModule.start({ lang: Intl.DateTimeFormat().resolvedOptions().locale, interimResults: true, requiresOnDeviceRecognition: true });
  }, [text]);

  const stop = useCallback(() => ExpoSpeechRecognitionModule.stop(), []);

  return { listening, problem, toggle: () => (listening ? stop() : void start()) };
}
