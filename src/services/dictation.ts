import { useCallback, useEffect, useRef, useState } from 'react';
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition';
import { dictationProblem, MIC_DENIED, NO_RECOGNIZER, NOT_ON_DEVICE, withDictation } from '../model/dictation';

export function useDictation(text: string, onText: (text: string) => void) {
  const [listening, setListening] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const base = useRef('');
  const active = useRef(false);
  const starting = useRef(false);
  const mounted = useRef(true);

  useSpeechRecognitionEvent('result', (event) => {
    if (active.current) onText(withDictation(base.current, event.results[0]?.transcript ?? ''));
  });
  useSpeechRecognitionEvent('end', () => {
    active.current = false;
    setListening(false);
  });
  useSpeechRecognitionEvent('error', (event) => {
    active.current = false;
    setListening(false);
    setProblem(dictationProblem(event.error));
  });

  const abort = useCallback(() => {
    if (!active.current) return;
    active.current = false;
    setListening(false);
    ExpoSpeechRecognitionModule.abort();
  }, []);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      abort();
    };
  }, [abort]);

  const start = useCallback(async () => {
    if (starting.current) return;
    starting.current = true;
    try {
      setProblem(null);
      if (!ExpoSpeechRecognitionModule.isRecognitionAvailable()) return setProblem(NO_RECOGNIZER);
      if (!ExpoSpeechRecognitionModule.supportsOnDeviceRecognition()) return setProblem(NOT_ON_DEVICE);
      const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!mounted.current) return;
      if (!permission.granted) return setProblem(MIC_DENIED);
      base.current = text;
      active.current = true;
      setListening(true);
      ExpoSpeechRecognitionModule.start({ lang: Intl.DateTimeFormat().resolvedOptions().locale, interimResults: true, requiresOnDeviceRecognition: true });
    } finally {
      starting.current = false;
    }
  }, [text]);

  const stop = useCallback(() => ExpoSpeechRecognitionModule.stop(), []);

  return { listening, problem, abort, toggle: () => (listening ? stop() : void start()) };
}
