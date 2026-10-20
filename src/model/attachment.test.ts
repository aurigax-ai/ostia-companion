import { describe, expect, it } from 'vitest';
import { decodedBytes, fitImage, imageRefusal, MAX_IMAGE_BYTES } from './attachment';

const base64Of = (bytes: number) => Buffer.alloc(bytes, 7).toString('base64');

describe('image attachments', () => {
  it('counts the decoded size of base64, padding included', () => {
    for (const size of [0, 1, 2, 3, 10, 1000, 4097]) expect(decodedBytes(base64Of(size))).toBe(size);
  });

  it('keeps the first encoding that fits in 10 MiB', async () => {
    const asked: [number, number][] = [];
    const image = await fitImage(async (side, quality) => {
      asked.push([side, quality]);
      return { mime: 'image/jpeg', data: base64Of(1000) };
    });
    expect(image).toEqual({ mime: 'image/jpeg', data: base64Of(1000) });
    expect(asked).toHaveLength(1);
  });

  it('shrinks until the decoded size fits', async () => {
    const sides: number[] = [];
    const image = await fitImage(async (side) => {
      sides.push(side);
      return { mime: 'image/jpeg', data: base64Of(side > 1024 ? MAX_IMAGE_BYTES + 1 : MAX_IMAGE_BYTES) };
    });
    expect(sides).toEqual([2048, 1024]);
    expect(image && decodedBytes(image.data)).toBe(MAX_IMAGE_BYTES);
  });

  it('gives up when even the smallest encoding is too big', async () => {
    expect(await fitImage(async () => ({ mime: 'image/jpeg', data: base64Of(MAX_IMAGE_BYTES + 1) }))).toBeNull();
  });

  it('words the desktop refusals plainly and leaves other errors alone', () => {
    expect(imageRefusal('image-type')).toMatch(/PNG, JPEG or WebP/);
    expect(imageRefusal('image-too-large')).toMatch(/too large/);
    expect(imageRefusal('rate-limited')).toMatch(/Too many images/);
    expect(imageRefusal('not-submitted')).toBeNull();
    expect(imageRefusal(undefined)).toBeNull();
  });
});
