import Link from 'next/link';
import { BottomNav } from '@/components/layout/BottomNav';
import { PageShell } from '@/components/layout/PageShell';
import { Badge } from '@/components/ui/Badge';
import { Card, SectionTitle } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Num } from '@/components/ui/Num';
import { requireAnyUser } from '@/lib/auth';
import { loadMyTables } from '@/lib/data/profile';
import { formatDate, formatMoney, formatTime } from '@/lib/format';
import { TABLE_STATUS_LABEL, TABLE_STATUS_TONE, playersWord } from '@/lib/labels';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'השולחנות שלי' };

export default async function MyTablesPage() {
  const user = await requireAnyUser('/tables');
  const tables = await loadMyTables(user.id);

  const live = tables.filter((t) => t.table.status !== 'COMPLETED' && t.table.status !== 'CANCELLED');
  const past = tables.filter((t) => t.table.status === 'COMPLETED' || t.table.status === 'CANCELLED');

  return (
    <>
      <PageShell withNav>
        <div className="flex items-center justify-between gap-3 pt-2">
          <h1 className="text-2xl font-black tracking-tight text-ink">השולחנות שלי</h1>
          <Link
            href="/table/new"
            className="inline-flex h-10 items-center rounded-xl bg-brand px-4 text-sm font-bold text-white"
          >
            שולחן חדש
          </Link>
        </div>

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
        ) : null}

        {live.length > 0 ? (
          <section className="mt-6">
            <SectionTitle>פעילים</SectionTitle>
            <TableList items={live} />
          </section>
        ) : null}

        {past.length > 0 ? (
          <section className="mt-8">
            <SectionTitle>שולחנות קודמים</SectionTitle>
            <TableList items={past} />
          </section>
        ) : null}
      </PageShell>
      <BottomNav />
    </>
  );
}

function TableList({ items }: { items: Awaited<ReturnType<typeof loadMyTables>> }) {
  return (
    <ul className="grid gap-2">
      {items.map(({ table, role, playerCount }) => (
        <Card as="li" key={table.id} className="p-0">
          <Link href={`/table/${table.id}`} className="block p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-bold text-ink">{table.name}</p>
                <p className="mt-0.5 text-[0.7rem] text-ink-faint">
                  <Num>{formatDate(table.game_date)}</Num> ·{' '}
                  <Num>{formatTime(table.planned_start_at)}</Num> ·{' '}
                  <Num>{playersWord(playerCount)}</Num>
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <Badge tone={TABLE_STATUS_TONE[table.status]} dot>
                  {TABLE_STATUS_LABEL[table.status]}
                </Badge>
                {role === 'ADMIN' ? (
                  <span className="text-[0.65rem] font-semibold text-brand-ink">מנהל שולחן</span>
                ) : null}
              </div>
            </div>
            <p className="mt-2 text-[0.7rem] text-ink-faint">
              כניסה <Num>{formatMoney(table.buy_in_agorot)}</Num> · מקסימום{' '}
              <Num>{table.max_buy_ins}</Num> כניסות · קוד{' '}
              <Num className="font-bold text-ink-muted">{table.join_code}</Num>
            </p>
          </Link>
        </Card>
      ))}
    </ul>
  );
}
