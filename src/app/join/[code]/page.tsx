import { redirect } from 'next/navigation';
import { AppBar } from '@/components/layout/AppBar';
import { PageShell } from '@/components/layout/PageShell';
import { JoinTableForm } from '@/components/join/JoinTableForm';
import { Badge } from '@/components/ui/Badge';
import { Num } from '@/components/ui/Num';
import { getSessionUser } from '@/lib/auth';
import { lookupTableAction } from '@/lib/actions/players';
import { formatMoney, formatTime } from '@/lib/format';
import { TABLE_STATUS_LABEL, TABLE_STATUS_TONE, chipsWord, playersWord } from '@/lib/labels';
import type { TableStatus } from '@/types/database';

export const dynamic = 'force-dynamic';

export default async function JoinTablePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const normalised = code.toUpperCase();

  const preview = await lookupTableAction(normalised);
  if (!preview.ok) {
    return (
      <>
        <AppBar title="הצטרפות לשולחן" backHref="/join" />
        <PageShell>
          <div className="mt-8 rounded-2xl border border-loss/30 bg-loss-soft p-6 text-center">
            <p className="text-lg font-bold text-loss">{preview.message}</p>
            <p className="mt-2 text-sm text-ink-muted">בדקו את הקוד מול מנהל השולחן ונסו שוב.</p>
          </div>
        </PageShell>
      </>
    );
  }

  const table = preview.data;
  const user = await getSessionUser();

  // Someone who already holds a seat goes straight to the table.
  if (table.already_joined) redirect(`/table/${table.id}`);

  const status = table.status as TableStatus;
  const closed = status === 'COMPLETED' || status === 'CANCELLED' || status === 'COUNTING';

  return (
    <>
      <AppBar title="הצטרפות לשולחן" backHref="/join" />
      <PageShell>
        <section className="card-grad rounded-3xl border border-line bg-surface p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="truncate text-xl font-black text-ink">{table.name}</h2>
              <p className="mt-0.5 text-sm text-ink-faint">מנהל השולחן: {table.admin_name}</p>
            </div>
            <Badge tone={TABLE_STATUS_TONE[status]} dot>
              {TABLE_STATUS_LABEL[status]}
            </Badge>
          </div>

          <dl className="mt-5 grid grid-cols-3 gap-2 text-center">
            <Info label="שחקנים" value={<Num>{table.player_count}</Num>} />
            <Info label="כניסה" value={<Num>{formatMoney(table.buy_in_agorot)}</Num>} />
            <Info label="שעת סיום" value={<Num>{formatTime(table.planned_end_at)}</Num>} />
          </dl>

          <p className="mt-4 text-center text-xs text-ink-faint">
            כל כניסה: <Num>{formatMoney(table.buy_in_agorot)}</Num> ·{' '}
            {chipsWord(table.chips_per_buy_in)}
          </p>
        </section>

        {closed ? (
          <div className="mt-6 rounded-2xl border border-warn/30 bg-warn-soft p-5 text-center text-sm font-semibold text-warn">
            השולחן כבר לא פתוח להצטרפות
          </div>
        ) : (
          <div className="mt-6">
            <JoinTableForm
              code={normalised}
              tableId={table.id}
              needsApproval={table.join_mode === 'ADMIN_APPROVAL'}
              defaultName={user?.profile?.display_name ?? ''}
              isSignedIn={Boolean(user)}
            />
          </div>
        )}

        <p className="mt-6 text-center text-xs text-ink-faint">
          כרגע יושבים בשולחן {playersWord(table.player_count)}.
        </p>
      </PageShell>
    </>
  );
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-surface-2 px-2 py-3">
      <dt className="text-[0.7rem] text-ink-faint">{label}</dt>
      <dd className="mt-0.5 text-base font-bold text-ink">{value}</dd>
    </div>
  );
}
