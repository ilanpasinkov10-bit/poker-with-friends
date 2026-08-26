import { PageShell } from '@/components/layout/PageShell';
import { cn } from '@/lib/cn';

/**
 * The pieces a route's loading state is built from.
 *
 * Two rules hold everywhere these are used.
 *
 * None of them renders the bottom navigation. That lives in the `(nav)` layout,
 * which sits *above* every loading boundary and therefore stays mounted through
 * a route change — so the navigation is genuinely persistent rather than being
 * torn down and drawn again by each fallback.
 *
 * And each route composes its own shape rather than sharing one generic block.
 * A skeleton is a promise about what is arriving; four identical grey cards on
 * every screen in the app is not a promise, it is a shrug — and on the screens
 * that were quickest it read as the app blinking out for no reason.
 */

const PULSE = 'animate-pulse rounded-2xl bg-surface-2';

export function SkeletonLine({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-lg bg-surface-2', className)} aria-hidden />;
}

export function SkeletonCard({ className }: { className?: string }) {
  return <div className={cn(PULSE, 'h-16', className)} aria-hidden />;
}

export function SkeletonRow({ className }: { className?: string }) {
  return <div className={cn(PULSE, 'h-[4.5rem]', className)} aria-hidden />;
}

/** The pill row a tab strip occupies, so tabs do not jump in later. */
export function SkeletonPills({ count = 3 }: { count?: number }) {
  return (
    <div className="flex gap-1.5" aria-hidden>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="h-10 w-24 animate-pulse rounded-full bg-surface-2" />
      ))}
    </div>
  );
}

/** Stands in for a sticky AppBar on the routes that have one. */
export function SkeletonAppBar() {
  return (
    <header className="safe-top sticky top-0 z-30 border-b border-line-soft bg-base/90 backdrop-blur">
      <div className="app-shell flex items-center gap-3 px-4 py-3">
        <div className="size-9 shrink-0 animate-pulse rounded-full bg-surface-2" aria-hidden />
        <SkeletonLine className="h-4 w-40" />
      </div>
    </header>
  );
}

/**
 * The body of a loading state. `belowAppBar` must match the real page, or the
 * safe-area inset is reserved twice and the content shifts down when it lands.
 */
export function SkeletonShell({
  children,
  belowAppBar = false,
  withNav = true,
}: {
  children: React.ReactNode;
  belowAppBar?: boolean;
  /** Matches the real route: only the bottom-nav screens reserve that space. */
  withNav?: boolean;
}) {
  return (
    <PageShell withNav={withNav} belowAppBar={belowAppBar}>
      {/* Announced politely rather than silently: a screen reader is told the
          page is loading instead of meeting an empty region. */}
      <div role="status" aria-busy="true" aria-label="טוען…" className="grid gap-3">
        {children}
      </div>
    </PageShell>
  );
}
