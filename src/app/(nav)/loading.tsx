import { SkeletonCard, SkeletonLine, SkeletonShell } from '@/components/layout/RouteSkeleton';

/** Home: a greeting, then the two big actions and any live table. */
export default function Loading() {
  return (
    <SkeletonShell>
      <SkeletonLine className="mt-2 h-7 w-48" />
      <SkeletonLine className="h-4 w-32" />
      <div className="mt-3 grid grid-cols-2 gap-3">
        <SkeletonCard className="h-28" />
        <SkeletonCard className="h-28" />
      </div>
    </SkeletonShell>
  );
}
