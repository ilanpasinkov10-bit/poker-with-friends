import { afterEach, describe, expect, it, vi } from 'vitest';
import { fullResultsHeight } from '@/lib/share/render';
import { canShareFile, shareFileName, shareOrSave } from '@/lib/share/share';

const png = () => new File([new Uint8Array([1, 2, 3])], 'card.png', { type: 'image/png' });

/** A browser that can, or cannot, do the things this feature asks about. */
function browser(options: {
  share?: (data: ShareData) => Promise<void>;
  canShare?: (data: ShareData) => boolean;
}) {
  vi.stubGlobal('navigator', options as unknown as Navigator);
}

const clicks: string[] = [];
function documentWithAnchor() {
  const anchor = {
    href: '', download: '', rel: '',
    click() { clicks.push(this.download); },
    remove() {},
  };
  vi.stubGlobal('document', {
    createElement: () => anchor,
    body: { appendChild() {} },
  } as unknown as Document);
  vi.stubGlobal('URL', {
    createObjectURL: () => 'blob:card',
    revokeObjectURL: () => {},
  } as unknown as typeof URL);
  return anchor;
}

afterEach(() => {
  vi.unstubAllGlobals();
  clicks.length = 0;
});

describe('asking the browser what it can actually do', () => {
  it('takes yes for an answer only when the file itself is accepted', () => {
    browser({ share: async () => {}, canShare: (data) => Boolean(data.files?.length) });
    expect(canShareFile(png())).toBe(true);
  });

  it('says no when sharing exists but files are refused', () => {
    // Safari has shipped `share` without file support before; asking about the
    // real file is the only honest question.
    browser({ share: async () => {}, canShare: () => false });
    expect(canShareFile(png())).toBe(false);
  });

  it('says no when there is no share at all', () => {
    browser({});
    expect(canShareFile(png())).toBe(false);
  });

  it('says no rather than throwing when canShare itself throws', () => {
    browser({ share: async () => {}, canShare: () => { throw new Error('nope'); } });
    expect(canShareFile(png())).toBe(false);
  });
});

describe('getting the picture out', () => {
  it('opens the share sheet with the file when the phone supports it', async () => {
    const shared: ShareData[] = [];
    browser({
      canShare: () => true,
      share: async (data) => { shared.push(data); },
    });
    expect(await shareOrSave(png(), 'ערב פוקר')).toBe('SHARED');
    expect(shared[0]!.files?.[0]!.name).toBe('card.png');
    expect(shared[0]!.text).toBe('ערב פוקר');
  });

  it('treats backing out of the sheet as its own outcome, not a failure', async () => {
    browser({
      canShare: () => true,
      share: async () => {
        const error = new Error('cancelled');
        error.name = 'AbortError';
        throw error;
      },
    });
    // Nothing is downloaded behind their back for a share they cancelled.
    documentWithAnchor();
    expect(await shareOrSave(png(), '')).toBe('CANCELLED');
    expect(clicks).toEqual([]);
  });

  it('saves the file when the browser cannot share files', async () => {
    browser({});
    documentWithAnchor();
    expect(await shareOrSave(png(), '')).toBe('DOWNLOADED');
    expect(clicks).toEqual(['card.png']);
  });

  it('falls back to saving when the sheet fails for any other reason', async () => {
    browser({ canShare: () => true, share: async () => { throw new Error('boom'); } });
    documentWithAnchor();
    expect(await shareOrSave(png(), '')).toBe('DOWNLOADED');
    expect(clicks).toEqual(['card.png']);
  });

  it('can be asked again after a share, as many times as wanted', async () => {
    let count = 0;
    browser({ canShare: () => true, share: async () => { count += 1; } });
    for (let i = 0; i < 3; i += 1) expect(await shareOrSave(png(), '')).toBe('SHARED');
    expect(count).toBe(3);
  });
});

describe('the file it hands over', () => {
  it('is named for the app and the night, and for nobody', () => {
    expect(shareFileName('2026-08-28', 'QUICK')).toBe('poker-with-friends-summary-20260828.png');
    expect(shareFileName('2026-08-28', 'FULL')).toBe('poker-with-friends-results-20260828.png');
  });
});

describe('how tall the full-results card has to be', () => {
  it('is a story for any table that fits one', () => {
    for (const players of [2, 4, 6, 8, 10]) {
      expect(fullResultsHeight(players)).toBe(1920);
    }
  });

  it('grows rather than shrinking the type when it does not', () => {
    // Twenty players is a card you scroll, not a card you squint at.
    expect(fullResultsHeight(20)).toBeGreaterThan(1920);
    expect(fullResultsHeight(30)).toBeGreaterThan(fullResultsHeight(20));
  });

  it('grows by exactly the room the extra rows need', () => {
    expect(fullResultsHeight(30) - fullResultsHeight(20)).toBe(10 * 96);
  });

  it('always leaves the date somewhere to sit', () => {
    // The list, the divider and the four summary lines all have to be above
    // the date. Getting this wrong prints one on top of the other, and only on
    // the biggest tables — which is exactly where nobody would look.
    const LIST_TOP = 470;
    const ROW = 96;
    const SUMMARY = 40 + 66 + 4 * 62;
    for (let players = 2; players <= 30; players += 1) {
      const contentEnd = LIST_TOP + players * ROW + SUMMARY;
      const dateBaseline = fullResultsHeight(players) - 74;
      expect(dateBaseline).toBeGreaterThan(contentEnd);
    }
  });
});
