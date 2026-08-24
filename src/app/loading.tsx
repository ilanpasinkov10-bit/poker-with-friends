import { PageShell } from '@/components/layout/PageShell';
import { SkeletonRows } from '@/components/ui/EmptyState';

export default function Loading() {
  return (
    <PageShell>
      <div className="mt-10">
        <SkeletonRows rows={4} />
      </div>
    </PageShell>
  );
}
