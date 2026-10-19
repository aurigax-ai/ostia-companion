export type ImageMime = 'image/png' | 'image/jpeg' | 'image/webp';

export interface PromptImage {
  mime: ImageMime;
  data: string;
}

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const IMAGE_MIMES: ImageMime[] = ['image/png', 'image/jpeg', 'image/webp'];

const START_SIDE = 2048;
const MIN_SIDE = 256;
const START_QUALITY = 0.85;

export function decodedBytes(base64: string): number {
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return Math.floor((base64.length * 3) / 4) - padding;
}

export interface Encoded {
  data: string;
  mime: ImageMime;
}

export async function fitImage(encode: (maxSide: number, quality: number) => Promise<Encoded>): Promise<PromptImage | null> {
  let side = START_SIDE;
  let quality = START_QUALITY;
  while (side >= MIN_SIDE) {
    const { data, mime } = await encode(side, quality);
    if (decodedBytes(data) <= MAX_IMAGE_BYTES) return { mime, data };
    side = Math.floor(side / 2);
    quality = Math.max(0.5, quality - 0.1);
  }
  return null;
}

const REFUSALS: Record<string, string> = {
  'image-type': "That image type isn't supported. Use PNG, JPEG or WebP.",
  'image-too-large': 'That image is too large for the desktop.',
  'rate-limited': 'Too many images in a short time. Wait a moment and try again.',
};

export const NO_IMAGES = "This desktop can't take images yet";

export function imageRefusal(message: unknown): string | null {
  return typeof message === 'string' ? (REFUSALS[message] ?? null) : null;
}

export function imageAccepted(answer: unknown): boolean {
  return typeof answer === 'object' && answer !== null && (answer as { image?: unknown }).image === 'pasted';
}
