'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  DARK_MEDIA_QUERY,
  DEFAULT_PREFERENCE,
  FALLBACK_THEME,
  THEME_ATTRIBUTE,
  THEME_STORAGE_KEY,
  normaliseThemePreference,
  resolveTheme,
  type ResolvedTheme,
  type ThemePreference,
} from '@/lib/theme';

interface ThemeContextValue {
  preference: ThemePreference;
  resolved: ResolvedTheme;
  setPreference: (next: ThemePreference) => void;
  /** False until the stored preference has been read in the browser. */
  ready: boolean;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

/**
 * Owns the appearance preference for the whole app.
 *
 * The pre-paint script in <head> has already written the correct
 * `data-theme` by the time this mounts, so the provider never causes the
 * first paint — it takes over afterwards, keeping the attribute in step when
 * the preference changes and, under "לפי המכשיר", when the device flips.
 *
 * Both pieces of browser state are read in the initialiser rather than in an
 * effect, so the provider agrees with the script from its very first render.
 * Reading them in an effect looked equivalent and was not: the effect that
 * writes the attribute runs in the same commit as the effects that read the
 * device, so it ran once with the fallback still in place and stamped `dark`
 * over the script's correct `light` — a one-frame flash on any light device
 * with no stored choice, which is exactly what the script exists to prevent.
 *
 * What must *not* move into render is `ready`: the server cannot see
 * localStorage, so the selected option is only marked once mounted, and the
 * markup React hydrates matches what the server sent.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>(readStoredPreference);
  const [systemPrefersDark, setSystemPrefersDark] = useState(readSystemPrefersDark);
  const [ready, setReady] = useState(false);

  useEffect(() => setReady(true), []);

  // Track the device setting whether or not it is currently in use, so that
  // switching to "לפי המכשיר" applies immediately rather than on the next
  // system change.
  useEffect(() => {
    const media = window.matchMedia(DARK_MEDIA_QUERY);
    setSystemPrefersDark(media.matches);
    const onChange = (event: MediaQueryListEvent) => setSystemPrefersDark(event.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  const resolved = resolveTheme(preference, systemPrefersDark);

  useEffect(() => {
    // Guarded so the common case — the script already got it right — does not
    // touch the DOM at all.
    const root = document.documentElement;
    if (root.getAttribute(THEME_ATTRIBUTE) !== resolved) {
      root.setAttribute(THEME_ATTRIBUTE, resolved);
    }
  }, [resolved]);

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Private browsing or blocked storage: the choice still applies for this
      // session, it just will not survive a reload. Nothing to tell the user.
    }
  }, []);

  const value = useMemo(
    () => ({ preference, resolved, setPreference, ready }),
    [preference, resolved, setPreference, ready],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used inside ThemeProvider');
  return context;
}

/** On the server, and wherever storage is blocked, the baseline applies. */
function readStoredPreference(): ThemePreference {
  if (typeof window === 'undefined') return DEFAULT_PREFERENCE;
  try {
    return normaliseThemePreference(window.localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return DEFAULT_PREFERENCE;
  }
}

function readSystemPrefersDark(): boolean {
  if (typeof window === 'undefined') return FALLBACK_THEME === 'dark';
  try {
    return window.matchMedia(DARK_MEDIA_QUERY).matches;
  } catch {
    return FALLBACK_THEME === 'dark';
  }
}
