'use client';

/**
 * A shared, reference-counted lock on page scrolling.
 *
 * The page's scroll is a single global, so it cannot be owned by whichever
 * component happens to want it. Each modal saving `document.body.style.overflow`
 * on open and restoring its own copy on close looks correct in isolation and is
 * broken as soon as two of them overlap:
 *
 *   menu opens    → saves ''        → sets hidden
 *   confirm opens → saves 'hidden'  → sets hidden      (saved the other's lock)
 *   confirm closes → restores 'hidden'                 (re-locks the page)
 *   menu closes    → restores whatever it saved
 *
 * Whichever cleanup runs last wins, and one of them is holding a value that was
 * itself a lock — so the page is left frozen with nothing on screen to explain
 * it. That is exactly what happened after cancelling a buy-in, where a
 * confirmation sits on top of the actions sheet and both close together.
 *
 * Counting fixes it: the original value is captured once, by the first holder,
 * and restored once, when the last one lets go. Nesting, closing in any order,
 * and closing several at the same moment all end with scrolling restored.
 */

let holders = 0;
let restore: (() => void) | null = null;

/**
 * Locks page scrolling and returns the release for *this* holder.
 *
 * The release is idempotent: calling it twice frees one hold, not two. React
 * runs effect cleanups twice under Strict Mode, and a double release would
 * otherwise unlock the page while another modal is still open.
 */
export function lockScroll(): () => void {
  if (typeof document === 'undefined') return () => undefined;

  if (holders === 0) {
    const body = document.body;
    const previousOverflow = body.style.overflow;
    body.style.overflow = 'hidden';
    restore = () => {
      body.style.overflow = previousOverflow;
    };
  }
  holders += 1;

  let released = false;
  return () => {
    if (released) return;
    released = true;
    holders -= 1;
    if (holders <= 0) {
      holders = 0;
      restore?.();
      restore = null;
    }
  };
}

/** How many holders the lock currently has. Exposed for tests. */
export function scrollLockHolders(): number {
  return holders;
}
