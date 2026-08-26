import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

/**
 * The page body.
 *
 * `safeTop` is on by default, and that direction matters. Installed to the
 * Home Screen the app runs full-bleed — `viewport-fit=cover` plus iOS's
 * translucent status bar — so the very top of the page sits under the clock
 * and the Dynamic Island unless something reserves that space. Pages with an
 * `AppBar` already do: the bar carries `safe-top` and, being sticky, keeps its
 * padding when it sticks. Pages without one had nothing, which is why the home
 * screen — the app's start URL, and so the first thing seen on launch — was
 * the one that overlapped.
 *
 * Defaulting to safe means a page added later is correct without anyone
 * remembering this, and getting it wrong costs a little dead space rather than
 * unreadable content. Pages that render an `AppBar` pass `belowAppBar` to opt
 * out, since the bar has already reserved the inset.
 *
 * In Safari the inset is zero, so `max()` leaves the existing 1rem and nothing
 * about the browser layout changes.
 */
export function PageShell({
  children,
  withNav = false,
  belowAppBar = false,
  className,
}: {
  children: ReactNode;
  withNav?: boolean;
  /** Set when an AppBar above has already reserved the top inset. */
  belowAppBar?: boolean;
  className?: string;
}) {
  return (
    <main
      className={cn(
        'app-shell px-4',
        belowAppBar ? 'pt-4' : 'safe-page-top',
        withNav ? 'pb-28' : 'pb-10',
        className,
      )}
    >
      {children}
    </main>
  );
}
