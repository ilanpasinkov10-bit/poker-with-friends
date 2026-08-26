'use client';

import Link, { useLinkStatus } from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/cn';

const ITEMS = [
  { href: '/', label: 'בית', icon: '🏠' },
  { href: '/tables', label: 'השולחנות שלי', icon: '🎴' },
  { href: '/leaderboard', label: 'לוח הישגים', icon: '🏆' },
  { href: '/profile', label: 'הפרופיל', icon: '👤' },
] as const;

/**
 * The bottom navigation, and the only thing that moves while a page loads.
 *
 * There are no loading screens between these four sections: tapping one keeps
 * the page you are on fully visible until the next one is ready, and then
 * swaps. That is the right behaviour for content — a half-drawn grey copy of a
 * screen tells you nothing the screen you are already looking at does not —
 * but it leaves the tap itself unacknowledged, and a tap that appears to do
 * nothing is the other way an app feels slow.
 *
 * So the acknowledgement lives here instead. `useLinkStatus` reports that a
 * link's navigation is in flight, and the item moves to its selected state
 * immediately, before the new page has arrived. The highlight leads, the
 * content follows.
 */
export function BottomNav() {
  const pathname = usePathname();
  // Which destination is being navigated to, if any. Held here rather than per
  // item so that exactly one item is ever lit — the one you tapped, not both
  // the one you left and the one you are going to.
  const [pendingHref, setPendingHref] = useState<string | null>(null);

  // The navigation has landed; the pathname is authoritative again.
  useEffect(() => {
    setPendingHref(null);
  }, [pathname]);

  const matchesPath = (href: string) =>
    href === '/' ? pathname === '/' : pathname.startsWith(href);

  return (
    <nav
      aria-label="ניווט ראשי"
      className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-line-soft bg-surface/95 pt-1 backdrop-blur"
    >
      <ul className="app-shell flex items-stretch justify-around px-2">
        {ITEMS.map((item) => {
          const active = pendingHref ? pendingHref === item.href : matchesPath(item.href);
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-xl px-1 text-center text-[0.62rem] font-semibold leading-tight transition-colors',
                  active ? 'text-brand-ink' : 'text-ink-faint hover:text-ink-muted',
                )}
              >
                <NavItemBody
                  href={item.href}
                  icon={item.icon}
                  label={item.label}
                  onPendingChange={setPendingHref}
                />
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/**
 * The inside of one item. `useLinkStatus` only works from within the `Link` it
 * reports on, which is why this is a component rather than a few lines above.
 */
function NavItemBody({
  href,
  icon,
  label,
  onPendingChange,
}: {
  href: string;
  icon: string;
  label: string;
  onPendingChange: (href: string | null) => void;
}) {
  const { pending } = useLinkStatus();

  useEffect(() => {
    if (pending) onPendingChange(href);
  }, [pending, href, onPendingChange]);

  return (
    <>
      <span
        aria-hidden
        className={cn('text-lg leading-none transition-opacity', pending && 'opacity-60')}
      >
        {icon}
      </span>
      {label}
    </>
  );
}
