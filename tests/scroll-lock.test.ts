import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Regression cover for the production bug where the table page became
 * unscrollable after cancelling a buy-in.
 *
 * A confirmation dialog sits on top of the actions sheet, so two modals are
 * open at once and both close together when the cancellation succeeds. Each
 * one used to save and restore `document.body.style.overflow` itself, which
 * cannot compose: the second saved the first one's lock and handed it back on
 * close, leaving the page frozen with nothing on screen to explain it.
 *
 * These tests describe the lock as a shared count. Several of them fail
 * against the per-modal version — in particular "the page is unlocked once the
 * last holder lets go", which is the bug itself.
 */

// The module reads document.body.style.overflow and nothing else, so a minimal
// stand-in is enough and keeps the production code free of test-only seams.
function installFakeDocument(initialOverflow = '') {
  const body = { style: { overflow: initialOverflow } };
  vi.stubGlobal('document', { body });
  return body;
}

async function freshLock() {
  // Reset the module so each test starts with no holders.
  vi.resetModules();
  return import('@/lib/scroll-lock');
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

describe('locking page scroll', () => {
  it('locks on the first holder', async () => {
    const body = installFakeDocument();
    const { lockScroll } = await freshLock();

    lockScroll();
    expect(body.style.overflow).toBe('hidden');
  });

  it('unlocks when that holder lets go', async () => {
    const body = installFakeDocument();
    const { lockScroll } = await freshLock();

    const release = lockScroll();
    release();
    expect(body.style.overflow).toBe('');
  });

  it('restores whatever the page had before, not a blank', async () => {
    // The page could legitimately have been scroll-locked by something else.
    const body = installFakeDocument('clip');
    const { lockScroll } = await freshLock();

    const release = lockScroll();
    expect(body.style.overflow).toBe('hidden');
    release();
    expect(body.style.overflow).toBe('clip');
  });
});

describe('two modals open at once', () => {
  it('stays locked while either is still open', async () => {
    const body = installFakeDocument();
    const { lockScroll } = await freshLock();

    const releaseSheet = lockScroll();
    const releaseConfirm = lockScroll();

    releaseConfirm();
    expect(body.style.overflow).toBe('hidden');

    releaseSheet();
    expect(body.style.overflow).toBe('');
  });

  it('is unlocked once the last holder lets go, whatever the order', async () => {
    // This is the bug. Cancelling a buy-in closes the confirmation and the
    // actions sheet together, and the old code left the page locked because
    // the inner modal restored the outer one's lock.
    for (const order of [
      (a: () => void, b: () => void) => {
        a();
        b();
      },
      (a: () => void, b: () => void) => {
        b();
        a();
      },
    ]) {
      const body = installFakeDocument();
      const { lockScroll } = await freshLock();

      const first = lockScroll();
      const second = lockScroll();
      order(first, second);

      expect(body.style.overflow).toBe('');
    }
  });

  it('survives three deep, which the counting makes free', async () => {
    const body = installFakeDocument();
    const { lockScroll } = await freshLock();

    const releases = [lockScroll(), lockScroll(), lockScroll()];
    releases[0]!();
    releases[2]!();
    expect(body.style.overflow).toBe('hidden');
    releases[1]!();
    expect(body.style.overflow).toBe('');
  });
});

describe('releasing defensively', () => {
  it('frees one hold however many times it is called', async () => {
    // React runs effect cleanups twice under Strict Mode. A release that
    // decremented twice would unlock the page while a modal was still open.
    const body = installFakeDocument();
    const { lockScroll, scrollLockHolders } = await freshLock();

    const releaseSheet = lockScroll();
    const releaseConfirm = lockScroll();

    releaseConfirm();
    releaseConfirm();
    releaseConfirm();

    expect(scrollLockHolders()).toBe(1);
    expect(body.style.overflow).toBe('hidden');

    releaseSheet();
    expect(body.style.overflow).toBe('');
  });

  it('never lets the count go negative and strand a later lock', async () => {
    const body = installFakeDocument();
    const { lockScroll, scrollLockHolders } = await freshLock();

    const release = lockScroll();
    release();
    release();
    expect(scrollLockHolders()).toBe(0);

    // A modal opened afterwards must still lock and unlock correctly.
    const next = lockScroll();
    expect(body.style.overflow).toBe('hidden');
    next();
    expect(body.style.overflow).toBe('');
  });

  it('leaves the page usable when a modal unmounts without closing first', async () => {
    // Navigating away mid-dialog unmounts it; the cleanup is the only thing
    // that runs, and it must still release.
    const body = installFakeDocument();
    const { lockScroll } = await freshLock();

    const release = lockScroll();
    release(); // unmount cleanup
    expect(body.style.overflow).toBe('');
  });
});

describe('outside the browser', () => {
  it('does nothing rather than throwing during a server render', async () => {
    vi.stubGlobal('document', undefined);
    const { lockScroll } = await freshLock();

    expect(() => lockScroll()()).not.toThrow();
  });
});
