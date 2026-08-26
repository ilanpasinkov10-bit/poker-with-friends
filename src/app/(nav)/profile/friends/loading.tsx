import {
  SkeletonAppBar,
  SkeletonPills,
  SkeletonRow,
  SkeletonShell,
} from '@/components/layout/RouteSkeleton';

/** Friends: its own header, the three sub-sections, then people. */
export default function Loading() {
  return (
    <>
      <SkeletonAppBar />
      <SkeletonShell belowAppBar>
        <SkeletonPills count={3} />
        <div className="mt-2 grid gap-2">
          <SkeletonRow />
          <SkeletonRow />
          <SkeletonRow />
        </div>
      </SkeletonShell>
    </>
  );
}
