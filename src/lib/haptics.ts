/**
 * A short buzz, where the device has one.
 *
 * Vibration is unsupported on iOS Safari and in an installed PWA there, which
 * is most of this app's audience — so this is a bonus for the devices that
 * have it, never something a feature depends on. It is deliberately silent
 * about failing: a phone that cannot buzz is not a problem to report.
 */
export function vibrate(pattern: number | number[]): void {
  try {
    if (typeof navigator === 'undefined') return;
    const host = navigator as Navigator & {
      vibrate?: (pattern: number | number[]) => boolean;
    };
    if (typeof host.vibrate !== 'function') return;
    host.vibrate(pattern);
  } catch {
    // Some browsers throw rather than returning false when the page is not
    // allowed to vibrate. Either way there is nothing to do about it.
  }
}
