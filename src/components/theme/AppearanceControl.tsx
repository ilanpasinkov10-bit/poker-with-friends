'use client';

import { cn } from '@/lib/cn';
import { THEME_DESCRIPTION, THEME_LABEL, THEME_PREFERENCES } from '@/lib/theme';
import { useTheme } from './ThemeProvider';

/**
 * The appearance picker: בהיר · כהה · לפי המכשיר.
 *
 * A segmented control rather than a switch, because "follow the device" is a
 * third choice and not an off state. Nothing is highlighted until the stored
 * preference has been read, so the control never shows a selection the user
 * did not make and then correct itself.
 */
export function AppearanceControl() {
  const { preference, setPreference, ready } = useTheme();

  return (
    <div
      role="radiogroup"
      aria-label="מראה"
      className="grid grid-cols-3 gap-1 rounded-xl border border-line bg-surface-2 p-1"
    >
      {THEME_PREFERENCES.map((option) => {
        const active = ready && preference === option;
        return (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => setPreference(option)}
            className={cn(
              'min-h-11 rounded-lg px-2 py-2 text-sm font-semibold transition-colors',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand',
              active
                ? 'bg-brand text-on-brand'
                : 'text-ink-muted hover:bg-surface-3 hover:text-ink',
            )}
          >
            {/* Three equal columns on a 320px phone leave about eighty pixels
                each, and "לפי המכשיר" needs more than that. Wrapping rather
                than truncating: a taller cell costs nothing, a label reading
                "לפי המכ…" tells the player nothing about what it does. */}
            <span className="block leading-tight">{THEME_LABEL[option]}</span>
            <span
              className={cn(
                'mt-0.5 block text-[0.65rem] leading-tight font-medium',
                active ? 'text-on-brand/80' : 'text-ink-faint',
              )}
            >
              {THEME_DESCRIPTION[option]}
            </span>
          </button>
        );
      })}
    </div>
  );
}
