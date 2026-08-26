import Link from 'next/link';
import { BottomNav } from '@/components/layout/BottomNav';
import { PageShell } from '@/components/layout/PageShell';
import { TablesBrowser } from '@/components/tables/TablesBrowser';
import { EmptyState } from '@/components/ui/EmptyState';
import { requireUserId } from '@/lib/auth';
import { loadMyTables } from '@/lib/data/profile';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'השולחנות שלי' };

export default async function MyTablesPage() {
  const user = await requireUserId('/tables');
  const tables = await loadMyTables(user.id);

  return (
    <>
      <PageShell withNav>
        <div className="flex items-center justify-between gap-3 pt-2">
          <h1 className="min-w-0 text-2xl font-black tracking-tight text-ink">השולחנות שלי</h1>
          <Link
            href="/table/new"
            className="inline-flex h-10 shrink-0 items-center rounded-xl bg-brand px-4 text-sm font-bold text-on-brand"
          >
            שולחן חדש
          </Link>
        </div>

        {/* Nothing to search through is a different situation from finding
            nothing, and it gets a different answer: an invitation to start,
            not a suggestion to change the filters. */}
        {tables.length === 0 ? (
          <div className="mt-8">
            <EmptyState
              emoji="🎴"
              title="אין שולחנות עדיין"
              description="פתחו שולחן חדש או הצטרפו לשולחן של חבר עם קוד."
              action={
                <Link
                  href="/join"
                  className="inline-flex h-11 items-center rounded-xl border border-line bg-surface-2 px-5 font-semibold text-ink"
                >
                  הצטרפות עם קוד
                </Link>
              }
            />
          </div>
        ) : (
          <TablesBrowser items={tables} />
        )}
      </PageShell>
      <BottomNav />
    </>
  );
}
