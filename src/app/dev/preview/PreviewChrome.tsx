'use client';

import { useRouter } from 'next/navigation';
import { useTheme } from '@/components/theme/ThemeProvider';
import {
  THEME_LABEL,
  THEME_PREFERENCES,
  normaliseThemePreference,
} from '@/lib/theme';
import Link from 'next/link';
import type { ReactNode } from 'react';

export interface ScreenOption {
  id: string;
  label: string;
  group: string;
}

/**
 * Gallery chrome. Deliberately styled so it cannot be mistaken for part of the
 * application: neutral slate, LTR-ish controls, always pinned to the top.
 */
export function PreviewChrome({
  screens,
  current,
  note,
  children,
}: {
  screens: ScreenOption[];
  current: string;
  note?: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const index = screens.findIndex((screen) => screen.id === current);
  const previous = index > 0 ? screens[index - 1] : undefined;
  const next = index >= 0 && index < screens.length - 1 ? screens[index + 1] : undefined;

  const groups = [...new Set(screens.map((screen) => screen.group))];

  return (
    <div className="min-h-dvh bg-black">
      <div className="sticky top-0 z-[70] border-b border-white/10 bg-[#111318]/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-2 px-3 py-2">
          <span className="rounded bg-amber-400/15 px-1.5 py-0.5 text-[0.65rem] font-black tracking-wide text-amber-300">
            DEV
          </span>

          <select
            aria-label="בחירת מסך"
            value={current}
            onChange={(event) => router.push(`/dev/preview?screen=${event.target.value}`)}
            className="min-w-0 flex-1 rounded-md border border-white/15 bg-[#1b1e29] px-2 py-1.5 text-sm text-white"
          >
            {groups.map((group) => (
              <optgroup key={group} label={group}>
                {screens
                  .filter((screen) => screen.group === group)
                  .map((screen) => (
                    <option key={screen.id} value={screen.id}>
                      {screen.label}
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>

          <PreviewThemeSwitch />

          <div className="flex shrink-0 items-center gap-1">
            <NavButton href={previous ? `/dev/preview?screen=${previous.id}` : undefined}>
              ›
            </NavButton>
            <span className="tabular-nums text-[0.7rem] text-white/40" dir="ltr">
              {index + 1}/{screens.length}
            </span>
            <NavButton href={next ? `/dev/preview?screen=${next.id}` : undefined}>‹</NavButton>
          </div>

          <Link
            href={`/dev/preview?screen=${current}&bare=1`}
            className="shrink-0 rounded-md border border-white/15 px-2 py-1.5 text-[0.7rem] text-white/70 hover:text-white"
          >
            ללא סרגל
          </Link>
        </div>

        {note ? (
          <p className="mx-auto max-w-3xl px-3 pb-2 text-[0.7rem] text-white/45">{note}</p>
        ) : null}
      </div>

      {children}
    </div>
  );
}

function NavButton({ href, children }: { href?: string; children: ReactNode }) {
  if (!href) {
    return (
      <span className="grid size-7 place-items-center rounded-md border border-white/10 text-white/20">
        {children}
      </span>
    );
  }
  return (
    <Link
      href={href}
      className="grid size-7 place-items-center rounded-md border border-white/15 text-white/70 hover:text-white"
    >
      {children}
    </Link>
  );
}

/** Flips the real appearance preference, so the gallery reviews both themes. */
function PreviewThemeSwitch() {
  const { preference, setPreference, ready } = useTheme();
  return (
    <select
      aria-label="מראה"
      value={ready ? preference : 'system'}
      onChange={(event) => setPreference(normaliseThemePreference(event.target.value))}
      className="shrink-0 rounded-md border border-white/15 bg-[#1b1e29] px-2 py-1.5 text-[0.7rem] text-white"
    >
      {THEME_PREFERENCES.map((option) => (
        <option key={option} value={option}>
          {THEME_LABEL[option]}
        </option>
      ))}
    </select>
  );
}
