import { SkeletonCard, SkeletonPills, SkeletonRow, SkeletonShell } from '@/components/layout/RouteSkeleton';

/**
 * The profile, including its tab strip.
 *
 * The summary card and the tabs are rendered by the profile's own layout, which
 * loads data — so they are inside this boundary and have to be drawn here, or
 * they would appear to pop in after the rest of the screen.
 */
export default function Loading() {
  return (
    <SkeletonShell>
      <SkeletonCard className="h-48 rounded-3xl" />
      <div className="mt-2">
        <SkeletonPills count={4} />
      </div>
      <div className="mt-2 grid gap-2">
        <SkeletonRow />
        <SkeletonRow />
      </div>
    </SkeletonShell>
  );
}
