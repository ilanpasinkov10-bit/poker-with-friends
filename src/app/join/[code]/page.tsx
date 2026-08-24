import { redirect } from 'next/navigation';
import { AppBar } from '@/components/layout/AppBar';
import { PageShell } from '@/components/layout/PageShell';
import { JoinChoice } from '@/components/join/JoinChoice';
import { JoinTableForm } from '@/components/join/JoinTableForm';
import { TablePreviewCard } from '@/components/join/TablePreviewCard';
import { getSessionUser } from '@/lib/auth';
import { lookupTableAction } from '@/lib/actions/players';
import { playersWord } from '@/lib/labels';
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

  // Someone with a session — registered or guest — skips the choice screen.
  const signedIn = Boolean(user);

  return (
    <>
      <AppBar title="הוזמנת לשולחן" backHref="/join" />
      <PageShell>
        <TablePreviewCard table={{ ...table, status }} />

        {closed ? (
          <div className="mt-6 rounded-2xl border border-warn/30 bg-warn-soft p-5 text-center text-sm font-semibold text-warn">
            השולחן כבר לא פתוח להצטרפות
          </div>
        ) : (
          <div className="mt-6">
            {signedIn ? (
              <JoinTableForm
                code={normalised}
                tableId={table.id}
                needsApproval={table.join_mode === 'ADMIN_APPROVAL'}
                defaultName={user?.profile?.display_name ?? ''}
                isSignedIn
              />
            ) : (
              <JoinChoice
                code={normalised}
                tableId={table.id}
                needsApproval={table.join_mode === 'ADMIN_APPROVAL'}
              />
            )}
          </div>
        )}

        <p className="mt-6 text-center text-xs text-ink-faint">
          כרגע יושבים בשולחן {playersWord(table.player_count)}.
        </p>
      </PageShell>
    </>
  );
}
