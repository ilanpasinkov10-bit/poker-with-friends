/**
 * The one way into a table.
 *
 * Copy-link, the native share sheet and the QR code all resolve the address
 * through here, so the code scanned off a phone is by construction the same
 * link that gets pasted into a group chat — same route, same approval rules,
 * same guest handling. There is no second joining mechanism to keep in step.
 */

/** The in-app path, which is all that is needed for a link inside the app. */
export function joinPath(joinCode: string): string {
  return `/join/${joinCode}`;
}

/**
 * The absolute address, for anything that leaves the app — a share sheet, a
 * pasted link, a QR code. A QR in particular *must* be absolute: it is scanned
 * by a camera with no notion of the current origin.
 *
 * Falls back to the path when there is no origin to build on, which is what
 * the server render sees. That keeps the copy button useful before hydration
 * rather than handing over an empty string.
 */
export function joinUrl(origin: string | null | undefined, joinCode: string): string {
  const path = joinPath(joinCode);
  const trimmed = origin?.trim().replace(/\/+$/, '');
  return trimmed ? `${trimmed}${path}` : path;
}

/** True once the address is scannable — a camera cannot resolve a bare path. */
export function isScannable(url: string): boolean {
  return /^https?:\/\//i.test(url);
}
