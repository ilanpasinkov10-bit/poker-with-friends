/**
 * Getting a generated image out of the app.
 *
 * Two ways, in order of how good they feel: the native share sheet with the
 * file attached — which is what puts the card into WhatsApp on a phone — and
 * a plain download for everything else.
 *
 * Both are guarded by real feature detection. `navigator.share` existing does
 * not mean it will accept a file: iOS has had both, at different times, for
 * different types. `canShare({ files })` is the only honest question, and it
 * is asked with the actual file.
 */

export type ShareOutcome = 'SHARED' | 'CANCELLED' | 'DOWNLOADED' | 'FAILED';

interface Sharer {
  share?: (data: ShareData) => Promise<void>;
  canShare?: (data: ShareData) => boolean;
}

/** Whether this browser will take *this* file through the share sheet. */
export function canShareFile(file: File): boolean {
  if (typeof navigator === 'undefined') return false;
  const nav = navigator as Navigator & Sharer;
  if (typeof nav.share !== 'function' || typeof nav.canShare !== 'function') return false;
  try {
    return nav.canShare({ files: [file] });
  } catch {
    return false;
  }
}

export function fileFromBlob(blob: Blob, name: string): File {
  return new File([blob], name, { type: blob.type || 'image/png', lastModified: Date.now() });
}

/**
 * Opens the share sheet, or saves the file.
 *
 * A user who opens the sheet and backs out has not failed at anything, so
 * `AbortError` comes back as its own outcome and the screen says nothing. Any
 * other failure falls through to a download rather than leaving them with
 * an image they cannot reach.
 */
export async function shareOrSave(file: File, text: string): Promise<ShareOutcome> {
  const nav = typeof navigator === 'undefined' ? null : (navigator as Navigator & Sharer);

  if (nav && canShareFile(file) && typeof nav.share === 'function') {
    try {
      await nav.share({ files: [file], text });
      return 'SHARED';
    } catch (error) {
      if (isAbort(error)) return 'CANCELLED';
      // Fall through: a sheet that refused the file is not a reason to leave
      // the user with nothing.
    }
  }

  return download(file) ? 'DOWNLOADED' : 'FAILED';
}

function isAbort(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    (error as { name?: unknown }).name === 'AbortError'
  );
}

/** Saves the file the ordinary way, and always cleans up its object URL. */
export function download(file: File): boolean {
  try {
    const url = URL.createObjectURL(file);
    const link = document.createElement('a');
    link.href = url;
    link.download = file.name;
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
    link.remove();
    // Long enough for the download to have started, short enough not to hold
    // a several-megabyte bitmap for the life of the page.
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    return true;
  } catch {
    return false;
  }
}

/** A filename that says what it is without leaking anything about who. */
export function shareFileName(playedOn: string, kind: 'QUICK' | 'FULL'): string {
  const date = playedOn.replaceAll('-', '');
  return `poker-with-friends-${kind === 'QUICK' ? 'summary' : 'results'}-${date}.png`;
}
