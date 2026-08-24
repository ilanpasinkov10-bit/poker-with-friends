import { describe, expect, it } from 'vitest';
import {
  buildAvatarPath,
  computeOutputSize,
  computeSquareCrop,
  extensionForType,
  HARD_MAX_BYTES,
  isAcceptableSize,
  isProcessableImage,
  isWithinHardLimit,
  MAX_DIMENSION,
} from '@/lib/image/avatar';

describe('accepting a photo from a phone', () => {
  it('accepts the formats phones actually produce', () => {
    for (const type of ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']) {
      expect(isProcessableImage({ type, name: 'photo' })).toBe(true);
    }
  });

  it('falls back to the extension when the picker gives no MIME type', () => {
    // Android pickers and iOS share sheets both do this.
    expect(isProcessableImage({ type: '', name: 'IMG_4821.HEIC' })).toBe(true);
    expect(isProcessableImage({ type: '', name: 'photo.jpg' })).toBe(true);
    expect(isProcessableImage({ type: '', name: 'notes.txt' })).toBe(false);
    expect(isProcessableImage({ type: '', name: 'noextension' })).toBe(false);
  });

  it('rejects things that are not images', () => {
    expect(isProcessableImage({ type: 'application/pdf', name: 'cv.pdf' })).toBe(false);
    expect(isProcessableImage({ type: 'video/mp4', name: 'clip.mp4' })).toBe(false);
    expect(isProcessableImage({ type: 'text/html', name: 'x.html' })).toBe(false);
  });
});

describe('squaring the photo', () => {
  it('centres the crop on a landscape photo', () => {
    expect(computeSquareCrop(4032, 3024)).toEqual({ sx: 504, sy: 0, size: 3024 });
  });

  it('centres the crop on a portrait camera photo', () => {
    expect(computeSquareCrop(3024, 4032)).toEqual({ sx: 0, sy: 504, size: 3024 });
  });

  it('leaves an already square photo alone', () => {
    expect(computeSquareCrop(1000, 1000)).toEqual({ sx: 0, sy: 0, size: 1000 });
  });

  it('refuses nonsense dimensions', () => {
    expect(() => computeSquareCrop(0, 100)).toThrow();
    expect(() => computeSquareCrop(-5, 100)).toThrow();
    expect(() => computeSquareCrop(Number.NaN, 100)).toThrow();
  });
});

describe('scaling', () => {
  it('scales a large camera photo down to the maximum', () => {
    expect(computeOutputSize(3024)).toBe(MAX_DIMENSION);
    expect(computeOutputSize(4032)).toBe(1200);
  });

  it('never upscales a small photo', () => {
    expect(computeOutputSize(400)).toBe(400);
    expect(computeOutputSize(1199)).toBe(1199);
  });
});

describe('size policy', () => {
  it('stops re-encoding once under the target', () => {
    expect(isAcceptableSize(900_000)).toBe(true);
    expect(isAcceptableSize(1_400_000)).toBe(false);
  });

  it('holds the bucket ceiling that storage also enforces', () => {
    expect(HARD_MAX_BYTES).toBe(2_000_000);
    expect(isWithinHardLimit(1_999_999)).toBe(true);
    expect(isWithinHardLimit(2_000_001)).toBe(false);
    expect(isWithinHardLimit(0)).toBe(false);
  });
});

describe('storage path', () => {
  const uid = '424e10d2-a78a-45de-8358-8e54aeb068d4';

  it('puts the file in the owner-scoped folder the policy requires', () => {
    expect(buildAvatarPath(uid, 'webp', 'abc123')).toBe(`${uid}/abc123.webp`);
  });

  it('refuses anything that could escape that folder', () => {
    expect(() => buildAvatarPath('../other', 'jpg', 'abc123')).toThrow();
    expect(() => buildAvatarPath(uid, '../js', 'abc123')).toThrow();
    expect(() => buildAvatarPath(uid, 'html', 'abc123')).toThrow();
    expect(() => buildAvatarPath(uid, 'svg', 'abc123')).toThrow();
    expect(() => buildAvatarPath(uid, 'jpg', '../../etc/passwd')).toThrow();
    expect(() => buildAvatarPath(uid, 'jpg', 'a/b')).toThrow();
  });

  it('maps the encoded type to an extension the bucket allows', () => {
    expect(extensionForType('image/webp')).toBe('webp');
    expect(extensionForType('image/jpeg')).toBe('jpg');
  });
});
