import { notFound } from 'next/navigation';
import { AppBar } from '@/components/layout/AppBar';
import { PageShell } from '@/components/layout/PageShell';
import { LeaderboardView } from '@/components/table/LeaderboardView';
import { requireAnyUser } from '@/lib/auth';
import { loadTableLeaderboard } from '@/lib/data/profile';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function LeaderboardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();

  await requireAnyUser(`/table/${id}/leaderboard`);

  const supabase = await createClient();
  const { data: table } = await supabase
    .from('poker_tables')
    .select('id, name, group_id')
    .eq('id', id)
    .maybeSingle();
  if (!table) notFound();

  const { scope, rows } = await loadTableLeaderboard(id);

  return (
    <>
      <AppBar
        title="דירוג השולחן"
        subtitle={scope === 'GROUP' ? `כל המשחקים של ${table.name}` : table.name}
        backHref={`/table/${id}`}
      />
      <PageShell>
        <LeaderboardView rows={rows} />
      </PageShell>
    </>
  );
}
