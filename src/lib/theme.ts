/**
 * Appearance preference — dark, light, or whatever the device asks for.
 *
 * Three values live here rather than two because "follow the device" is a
 * preference in its own right: it has to survive a reload and keep tracking
 * the system setting afterwards. What CSS ever sees is the *resolved* theme,
 * `light` or `dark`, written to `<html data-theme>`.
 *
 * This module is deliberately free of React and of `window`, so the same
 * constants feed the pre-paint bootstrap script, the provider and the tests.
 */

export const THEME_PREFERENCES = ['light', 'dark', 'system'] as const;
export type ThemePreference = (typeof THEME_PREFERENCES)[number];

/** What is actually painted. "system" resolves to one of these. */
export type ResolvedTheme = 'light' | 'dark';

/** The dark theme is the product's baseline, and the fallback for everything. */
export const DEFAULT_PREFERENCE: ThemePreference = 'system';
export const FALLBACK_THEME: ResolvedTheme = 'dark';

export const THEME_STORAGE_KEY = 'pwf.appearance';
export const THEME_ATTRIBUTE = 'data-theme';
export const DARK_MEDIA_QUERY = '(prefers-color-scheme: dark)';

export const THEME_LABEL: Record<ThemePreference, string> = {
  light: 'בהיר',
  dark: 'כהה',
  system: 'לפי המכשיר',
};

export const THEME_DESCRIPTION: Record<ThemePreference, string> = {
  light: 'רקע בהיר',
  dark: 'רקע כהה',
  system: 'לפי הגדרת המכשיר',
};

/**
 * Anything unrecognised means "follow the device" — a value hand-edited in
 * localStorage, or written by an older version, must never wedge the app into
 * a theme nobody chose.
 */
export function normaliseThemePreference(value: unknown): ThemePreference {
  return THEME_PREFERENCES.includes(value as ThemePreference)
    ? (value as ThemePreference)
    : DEFAULT_PREFERENCE;
}

export function resolveTheme(
  preference: ThemePreference,
  systemPrefersDark: boolean,
): ResolvedTheme {
  if (preference === 'light') return 'light';
  if (preference === 'dark') return 'dark';
  return systemPrefersDark ? 'dark' : 'light';
}

/**
 * The script that runs in <head> before the first paint.
 *
 * It has to be inline and synchronous: anything deferred paints the wrong
 * theme first and corrects it afterwards, which is the flash. It reads the
 * same storage key and resolves with the same rule as the provider, both
 * spelled from the constants above so the two cannot drift apart. Any failure
 * — storage blocked in a private window, no matchMedia — falls back to the
 * dark baseline rather than leaving the page unthemed.
 */
export function themeBootstrapScript(): string {
  const key = JSON.stringify(THEME_STORAGE_KEY);
  const attr = JSON.stringify(THEME_ATTRIBUTE);
  const query = JSON.stringify(DARK_MEDIA_QUERY);
  const fallback = JSON.stringify(FALLBACK_THEME);
  return (
    '(function(){var e=document.documentElement;try{' +
    `var p=localStorage.getItem(${key});` +
    "if(p!=='light'&&p!=='dark')p='system';" +
    `var d=p==='dark'||(p==='system'&&window.matchMedia(${query}).matches);` +
    `e.setAttribute(${attr},d?'dark':'light');` +
    `}catch(_){e.setAttribute(${attr},${fallback});}})();`
  );
}
