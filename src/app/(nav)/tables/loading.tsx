import { SkeletonLine, SkeletonRow, SkeletonShell } from '@/components/layout/RouteSkeleton';

/** The tables list: heading, the search and filter row, then table cards. */
export default function Loading() {
  return (
    <SkeletonShell>
      <div className="mt-2 flex items-center justify-between gap-3">
        <SkeletonLine className="h-7 w-40" />
        <SkeletonLine className="h-10 w-28 rounded-xl" />
      </div>
      <SkeletonLine className="mt-3 h-12 rounded-xl" />
      <div className="mt-3 grid gap-2">
        <SkeletonRow className="h-24" />
        <SkeletonRow className="h-24" />
        <SkeletonRow className="h-24" />
      </div>
    </SkeletonShell>
  );
}
