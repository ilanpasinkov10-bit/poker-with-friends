import { SkeletonAppBar, SkeletonCard, SkeletonLine, SkeletonShell } from '@/components/layout/RouteSkeleton';

/** Settings: its own header, then the four sections in order. */
export default function Loading() {
  return (
    <>
      <SkeletonAppBar />
      <SkeletonShell belowAppBar>
        <SkeletonLine className="h-5 w-32" />
        <SkeletonCard className="h-40" />
        <SkeletonLine className="mt-2 h-5 w-32" />
        <SkeletonCard className="h-24" />
        <SkeletonLine className="mt-2 h-5 w-24" />
        <SkeletonCard className="h-20" />
      </SkeletonShell>
    </>
  );
}
