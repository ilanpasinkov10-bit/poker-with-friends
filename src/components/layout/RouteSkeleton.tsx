import { BottomNav } from '@/components/layout/BottomNav';
import { PageShell } from '@/components/layout/PageShell';
import { SkeletonRows } from '@/components/ui/EmptyState';

/**
 * The shell a route shows while its data is on the way.
 *
 * Two things matter here, and neither is decoration.
 *
 * It keeps the chrome. The bottom navigation is fixed and always present, so a
 * fallback that omits it makes the whole app blink out and back on every tap —
 * which reads as slower than the same wait with the nav still on screen.
 *
 * And it exists at all. Next prefetches a dynamic route only as far as its
 * nearest loading boundary, and shows that boundary the instant a link is
 * tapped. Without one, the router has nothing to prefetch and nothing to
 * paint, so it holds the *old* page on screen until the server responds and
 * the tap appears to have done nothing. That was worth a quarter of a second
 * of dead time on the profile's own links.
 */
export function RouteSkeleton({
  title,
  rows = 4,
  withNav = true,
}: {
  /** Rendered at the same size as the real heading, so nothing jumps. */
  title?: string;
  rows?: number;
  withNav?: boolean;
}) {
  return (
    <>
      <PageShell withNav={withNav}>
        {title ? (
          <div className="pt-2">
            <h1 className="text-2xl font-black tracking-tight text-ink">{title}</h1>
          </div>
        ) : null}
        <div className={title ? 'mt-5' : 'mt-10'}>
          <SkeletonRows rows={rows} />
        </div>
      </PageShell>
      {withNav ? <BottomNav /> : null}
    </>
  );
}
