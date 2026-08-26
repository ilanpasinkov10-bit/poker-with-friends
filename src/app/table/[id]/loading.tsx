import { SkeletonAppBar, SkeletonCard, SkeletonRow, SkeletonShell } from '@/components/layout/RouteSkeleton';

/**
 * A table. Opened from a list rather than the bottom navigation, so it has no
 * navigation of its own to preserve — but it keeps its header bar, and the
 * shape below it is the live table's: the countdown, the pot, then seats.
 */
export default function Loading() {
  return (
    <>
      <SkeletonAppBar />
      <SkeletonShell belowAppBar withNav={false}>
        <SkeletonCard className="h-24" />
        <SkeletonCard className="h-32" />
        <div className="mt-2 grid gap-2">
          <SkeletonRow />
          <SkeletonRow />
        </div>
      </SkeletonShell>
    </>
  );
}
