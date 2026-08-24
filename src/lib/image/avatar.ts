/**
 * Preparation rules for profile photos.
 *
 * A photo straight off a phone camera is routinely 5–15 MB, far above the
 * storage bucket's 2 MB ceiling. Rather than raise that ceiling — which would
 * mean accepting arbitrarily large uploads — the image is decoded, squared,
 * scaled down and re-encoded in the browser, so what reaches Supabase is
 * always a small, web-friendly file.
 *
 * The geometry and policy live here, free of any browser API, so they can be
 * tested directly. The canvas work that uses them is in `prepare.ts`.
 */

/** Longest edge of the stored avatar. Ample for any display size in the app. */
export const MAX_DIMENSION = 1200;

/** What we aim for. Most photos land well under this. */
export const TARGET_BYTES = 1_000_000;

/** The bucket's hard limit. Anything above this is rejected rather than sent. */
export const HARD_MAX_BYTES = 2_000_000;

/** Tried in order until the encoded result fits. */
export const QUALITY_LADDER = [0.85, 0.78, 0.7, 0.6, 0.5] as const;

/**
 * Types worth attempting to decode. HEIC/HEIF is included because Safari can
 * decode it natively, and because iOS usually converts to JPEG on upload
 * anyway; where a browser cannot, the caller reports it clearly rather than
 * failing as a generic upload error.
 */
const DECODABLE_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif',
]);

const DECODABLE_EXTENSIONS = new Set([
  'jpg', 'jpeg', 'png', 'webp', 'gif', 'heic', 'heif',
]);

/**
 * Some Android pickers and iOS share sheets hand over a file with an empty
 * MIME type, so the extension is used as a fallback rather than rejecting a
 * perfectly good photo.
 */
export function isProcessableImage(file: { type: string; name: string }): boolean {
  const type = file.type.toLowerCase().trim();
  if (type && DECODABLE_TYPES.has(type)) return true;
  if (type && !type.startsWith('image/')) return false;

  const extension = file.name.toLowerCase().split('.').pop() ?? '';
  return DECODABLE_EXTENSIONS.has(extension);
}

export interface SquareCrop {
  sx: number;
  sy: number;
  size: number;
}

/** Largest centred square that fits the source image. */
export function computeSquareCrop(width: number, height: number): SquareCrop {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error('computeSquareCrop: invalid source dimensions');
  }
  const size = Math.min(width, height);
  return {
    sx: Math.floor((width - size) / 2),
    sy: Math.floor((height - size) / 2),
    size: Math.floor(size),
  };
}

/** Never upscales: a small photo is stored at its own size. */
export function computeOutputSize(sourceSize: number, max: number = MAX_DIMENSION): number {
  if (!Number.isFinite(sourceSize) || sourceSize <= 0) {
    throw new Error('computeOutputSize: invalid source size');
  }
  return Math.max(1, Math.min(Math.floor(sourceSize), max));
}

/** True once an encoded candidate is small enough to stop re-encoding. */
export function isAcceptableSize(bytes: number, target: number = TARGET_BYTES): boolean {
  return bytes <= target;
}

export function isWithinHardLimit(bytes: number): boolean {
  return bytes > 0 && bytes <= HARD_MAX_BYTES;
}

/** Only what this code encodes, and only what the bucket accepts. */
const WRITABLE_EXTENSIONS = new Set(['jpg', 'webp']);

/**
 * Storage path is `<user-id>/<random>.<ext>`, which the bucket policy pins to
 * auth.uid(). The extension is checked against an allowlist rather than a
 * shape, so no other file type can be written even if a caller asked for one.
 */
export function buildAvatarPath(userId: string, extension: string, random: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) {
    throw new Error('buildAvatarPath: invalid user id');
  }
  if (!WRITABLE_EXTENSIONS.has(extension)) {
    throw new Error('buildAvatarPath: unsupported extension');
  }
  if (!/^[A-Za-z0-9_-]{4,64}$/.test(random)) {
    throw new Error('buildAvatarPath: invalid file name');
  }
  return `${userId}/${random}.${extension}`;
}

export function extensionForType(contentType: string): string {
  return contentType === 'image/webp' ? 'webp' : 'jpg';
}
