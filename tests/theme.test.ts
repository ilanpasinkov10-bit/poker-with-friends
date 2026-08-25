import { describe, expect, it } from 'vitest';
import {
  DARK_MEDIA_QUERY,
  DEFAULT_PREFERENCE,
  THEME_ATTRIBUTE,
  THEME_LABEL,
  THEME_PREFERENCES,
  THEME_STORAGE_KEY,
  normaliseThemePreference,
  resolveTheme,
  themeBootstrapScript,
} from '@/lib/theme';

describe('resolving a preference to a painted theme', () => {
  it('honours an explicit choice whatever the device says', () => {
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('light', false)).toBe('light');
    expect(resolveTheme('dark', true)).toBe('dark');
    expect(resolveTheme('dark', false)).toBe('dark');
  });

  it('follows the device under "לפי המכשיר"', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
  });
});

describe('reading a stored preference', () => {
  it('accepts the three real values', () => {
    for (const value of THEME_PREFERENCES) {
      expect(normaliseThemePreference(value)).toBe(value);
    }
  });

  it('falls back to following the device for anything else', () => {
    // A value hand-edited in localStorage, or left by an older build, must not
    // wedge the app into a theme nobody chose.
    for (const value of [null, undefined, '', 'LIGHT', 'auto', 0, 1, true, {}, []]) {
      expect(normaliseThemePreference(value)).toBe(DEFAULT_PREFERENCE);
    }
  });
});

describe('the pre-paint bootstrap script', () => {
  const script = themeBootstrapScript();

  /** Runs the script against a stubbed document/localStorage/matchMedia. */
  function run({
    stored,
    prefersDark,
    storageThrows = false,
  }: {
    stored: string | null;
    prefersDark: boolean;
    storageThrows?: boolean;
  }): string | null {
    let painted: string | null = null;
    const documentStub = {
      documentElement: {
        setAttribute: (name: string, value: string) => {
          if (name === THEME_ATTRIBUTE) painted = value;
        },
      },
    };
    const localStorageStub = {
      getItem: (key: string) => {
        if (storageThrows) throw new Error('storage blocked');
        return key === THEME_STORAGE_KEY ? stored : null;
      },
    };
    const windowStub = {
      matchMedia: (query: string) => ({ matches: query === DARK_MEDIA_QUERY && prefersDark }),
    };
    new Function('document', 'localStorage', 'window', script)(
      documentStub,
      localStorageStub,
      windowStub,
    );
    return painted;
  }

  it('paints the stored explicit choice', () => {
    expect(run({ stored: 'light', prefersDark: true })).toBe('light');
    expect(run({ stored: 'dark', prefersDark: false })).toBe('dark');
  });

  it('paints the device preference when nothing is stored', () => {
    expect(run({ stored: null, prefersDark: true })).toBe('dark');
    expect(run({ stored: null, prefersDark: false })).toBe('light');
  });

  it('paints the device preference for an explicit "system"', () => {
    expect(run({ stored: 'system', prefersDark: false })).toBe('light');
    expect(run({ stored: 'system', prefersDark: true })).toBe('dark');
  });

  it('ignores a corrupted stored value rather than trusting it', () => {
    expect(run({ stored: 'neon', prefersDark: false })).toBe('light');
    expect(run({ stored: 'neon', prefersDark: true })).toBe('dark');
  });

  it('falls back to the dark baseline when storage is unavailable', () => {
    // A private window, or a browser set to block site data.
    expect(run({ stored: null, prefersDark: false, storageThrows: true })).toBe('dark');
  });

  it('always paints something, so the page is never left unthemed', () => {
    for (const stored of [null, 'light', 'dark', 'system', 'nonsense']) {
      for (const prefersDark of [true, false]) {
        expect(run({ stored, prefersDark })).toMatch(/^(light|dark)$/);
      }
    }
  });

  it('resolves identically to the provider, so the first paint never changes', () => {
    // The flash this script exists to prevent would come back the moment the
    // two resolvers disagreed about any combination.
    for (const stored of THEME_PREFERENCES) {
      for (const prefersDark of [true, false]) {
        expect(run({ stored, prefersDark })).toBe(
          resolveTheme(normaliseThemePreference(stored), prefersDark),
        );
      }
    }
  });
});

describe('the appearance labels', () => {
  it('names every preference in Hebrew', () => {
    expect(THEME_LABEL.light).toBe('בהיר');
    expect(THEME_LABEL.dark).toBe('כהה');
    expect(THEME_LABEL.system).toBe('לפי המכשיר');
  });
});
