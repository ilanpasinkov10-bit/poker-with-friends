'use client';

import {
  buildAvatarPath,
  computeOutputSize,
  computeSquareCrop,
  extensionForType,
  isAcceptableSize,
  isProcessableImage,
  isWithinHardLimit,
  QUALITY_LADDER,
} from './avatar';

export class ImageProcessingError extends Error {
  constructor(message = 'IMAGE_PROCESSING_FAILED') {
    super(message);
    this.name = 'ImageProcessingError';
  }
}

export interface PreparedAvatar {
  blob: Blob;
  contentType: string;
  extension: string;
  width: number;
  originalBytes: number;
}

/**
 * Decodes with EXIF orientation applied. `createImageBitmap` handles rotation
 * natively where available; the <img> fallback relies on browsers honouring
 * image-orientation, which they have done by default for years.
 */
async function decode(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      // Falls through — Safari with HEIC sometimes prefers the <img> route.
    }
  }

  const url = URL.createObjectURL(file);
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new ImageProcessingError());
      img.src = url;
    });
  } finally {
    // Revoked after decode; the bitmap has already been rasterised.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

function supportsWebp(): boolean {
  try {
    const probe = document.createElement('canvas');
    probe.width = 1;
    probe.height = 1;
    return probe.toDataURL('image/webp').startsWith('data:image/webp');
  } catch {
    return false;
  }
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/**
 * Turns whatever the phone handed us into a small square avatar: centre-cropped,
 * scaled to at most 1200px, and re-encoded down the quality ladder until it
 * fits. The original never leaves the device.
 */
export async function prepareAvatar(file: File): Promise<PreparedAvatar> {
  if (!isProcessableImage(file)) throw new ImageProcessingError();

  const source = await decode(file);
  const width = 'width' in source ? source.width : 0;
  const height = 'height' in source ? source.height : 0;
  if (!width || !height) throw new ImageProcessingError();

  const crop = computeSquareCrop(width, height);
  const output = computeOutputSize(crop.size);

  const canvas = document.createElement('canvas');
  canvas.width = output;
  canvas.height = output;
  const context = canvas.getContext('2d');
  if (!context) throw new ImageProcessingError();

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(source, crop.sx, crop.sy, crop.size, crop.size, 0, 0, output, output);
  if ('close' in source) source.close();

  const contentType = supportsWebp() ? 'image/webp' : 'image/jpeg';

  let encoded: Blob | null = null;
  for (const quality of QUALITY_LADDER) {
    encoded = await toBlob(canvas, contentType, quality);
    if (encoded && isAcceptableSize(encoded.size)) break;
  }
  if (!encoded) throw new ImageProcessingError();

  // Everything above the ladder still failing means something is very wrong
  // with the source; refuse rather than push a large file at storage.
  if (!isWithinHardLimit(encoded.size)) throw new ImageProcessingError();

  return {
    blob: encoded,
    contentType,
    extension: extensionForType(contentType),
    width: output,
    originalBytes: file.size,
  };
}

/**
 * A random file name, without requiring a secure context.
 *
 * `crypto.randomUUID` is undefined over plain HTTP, which is exactly how the
 * app gets opened when testing on a phone against a laptop's LAN address. The
 * name only needs to be unique within the user's own folder, so any decent
 * randomness will do — and getRandomValues is available far more widely.
 */
function randomFileName(): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = new Uint8Array(24);

  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }

  let name = '';
  for (const byte of bytes) name += alphabet[byte % alphabet.length];
  return name;
}

export function avatarObjectPath(userId: string, extension: string): string {
  return buildAvatarPath(userId, extension, randomFileName());
}
