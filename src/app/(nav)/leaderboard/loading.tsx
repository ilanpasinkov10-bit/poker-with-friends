import { SkeletonLine, SkeletonPills, SkeletonRow, SkeletonShell } from '@/components/layout/RouteSkeleton';

/** The ranking: heading, the period tabs, then rows. */
export default function Loading() {
  return (
    <SkeletonShell>
      <SkeletonLine className="mt-2 h-7 w-40" />
      <SkeletonLine className="h-3 w-56" />
      <div className="mt-3">
        <SkeletonPills count={4} />
      </div>
      <div className="mt-3 grid gap-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <SkeletonRow key={i} />
        ))}
      </div>
    </SkeletonShell>
  );
}
