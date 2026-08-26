'use client';

import Link, { useLinkStatus } from 'next/link';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

/**
 * A link that says it has been tapped.
 *
 * Nothing in this app shows a loading screen between pages any more — the page
 * you are on stays until the next one is ready. That is right for the content
 * and wrong for the tap, which otherwise looks ignored for as long as the
 * server takes. This is the acknowledgement: the link itself dims and holds a
 * spinner while its navigation is in flight, and the page underneath is left
 * alone.
 *
 * Used where there is no navigation item to light up instead — the chips on
 * the profile that lead to settings and to friends.
 */
export function PendingLink({
  href,
  className,
  children,
  spinner = true,
  'aria-label': ariaLabel,
}: {
  href: string;
  className?: string;
  children: ReactNode;
  /** Off where a spinner would be clutter — beside an avatar, the dim is enough. */
  spinner?: boolean;
  'aria-label'?: string;
}) {
  return (
    <Link href={href} className={className} aria-label={ariaLabel}>
      <PendingBody spinner={spinner}>{children}</PendingBody>
    </Link>
  );
}

/** `useLinkStatus` only reports from inside the `Link` it belongs to. */
function PendingBody({ children, spinner }: { children: ReactNode; spinner: boolean }) {
  const { pending } = useLinkStatus();
  return (
    <>
      <span className={cn('inline-flex items-center gap-1.5', pending && 'opacity-70')}>
        {children}
      </span>
      {pending && spinner ? (
        <span
          aria-hidden
          className="size-3 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent"
        />
      ) : null}
    </>
  );
}

/**
 * A whole card that is also a link.
 *
 * Opening a table is the slowest navigation in the app — it loads seats, the
 * ledger, counts and requests — so the card it was opened from dims to show
 * the tap landed, while the list stays on screen until the table is ready.
 */
export function PendingCardLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="block">
      <PendingCardBody>{children}</PendingCardBody>
    </Link>
  );
}

function PendingCardBody({ children }: { children: ReactNode }) {
  const { pending } = useLinkStatus();
  return (
    <div className={cn('p-4 transition-opacity', pending && 'opacity-60')}>{children}</div>
  );
}
