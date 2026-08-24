import Link from 'next/link';
import { PageShell } from '@/components/layout/PageShell';
import { EmptyState } from '@/components/ui/EmptyState';

export default function NotFound() {
  return (
    <PageShell>
      <div className="mt-16">
        <EmptyState
          emoji="🔎"
          title="הדף לא נמצא"
          description="ייתכן שהקישור שגוי או שהשולחן כבר לא קיים."
          action={
            <Link
              href="/"
              className="inline-flex h-11 items-center rounded-xl bg-brand px-5 font-semibold text-white"
            >
              חזרה לדף הבית
            </Link>
          }
        />
      </div>
    </PageShell>
  );
}
