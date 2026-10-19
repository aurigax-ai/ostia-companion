export function withDictation(base: string, transcript: string): string {
  const spoken = transcript.trim();
  if (!spoken) return base;
  return base && !/\s$/.test(base) ? `${base} ${spoken}` : `${base}${spoken}`;
}

const PROBLEMS: Record<string, string> = {
  'not-allowed': 'Allow the microphone for Ostia in Settings to dictate.',
  'service-not-allowed': "This phone can't recognise speech on the device.",
  'language-not-supported': "This phone can't recognise speech on the device in your language.",
  'audio-capture': "Couldn't use the microphone.",
  network: "This phone can't recognise speech on the device.",
};

const QUIET = ['aborted', 'no-speech'];

export function dictationProblem(code: string): string | null {
  if (QUIET.includes(code)) return null;
  return PROBLEMS[code] ?? "Couldn't dictate. Try again.";
}

export const NO_RECOGNIZER = 'This phone has no speech recognizer.';
export const NOT_ON_DEVICE = "This phone can't recognise speech on the device, so nothing is dictated. No audio leaves it.";
export const MIC_DENIED = 'Allow the microphone for Ostia in Settings to dictate.';
