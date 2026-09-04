import 'server-only';

import { acceptsInvitations, type PendingInvitationView } from '@/lib/domain/invitations';
import { createClient } from '@/lib/supabase/server';
import type { InvitationStatus, TableStatus } from '@/types/database';

/**
 * Reading invitations, as the caller.
 *
 * Never the service role. The RLS policy on `table_invitations` returns a row
 * only to the person invited and to the people running the table, so an
 * invitation belonging to strangers is not something these queries could
 * return even if they asked for it.
 *
 * The table and the person who sent it come back embedded rather than from
 * follow-up queries: those could not start until the first had returned the
 * ids, so each would cost a whole network leg in the middle of the home
 * screen's load. PostgREST resolves embeds by *constraint name* and returns
 * nothing at all for a name that does not exist, so both are named explicitly
 * and both are pinned in the database test suite.
 */
const WITH_TABLE_AND_INVITER =
  'id, table_id, poker_tables!table_invitations_table_id_fkey(id, name, status, game_date, planned_start_at, buy_in_agorot),' +
  ' inviter:profiles!table_invitations_inviter_id_fkey(display_name, avatar_url)';

interface RawPending {
  id: string;
  table_id: string;
  poker_tables: {
    id: string;
    name: string;
    status: TableStatus;
    game_date: string;
    planned_start_at: string;
    buy_in_agorot: number;
  } | null;
  inviter: { display_name: string; avatar_url: string | null } | null;
}

/**
 * Invitations waiting for this person's answer.
 *
 * The `invitee_id` filter is not doing security work — RLS has already settled
 * that — it is what separates "invitations to me" from "invitations I sent",
 * both of which this caller is entitled to read.
 *
 * Games that have finished, been cancelled or moved to counting are dropped
 * here rather than marked closed in the database. That is the whole reason
 * there is no fourth `EXPIRED` status to keep up to date: the table's own
 * status is the answer, and it cannot fall behind.
 */
export async function loadPendingInvitations(userId: string): Promise<PendingInvitationView[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('table_invitations')
    .select(WITH_TABLE_AND_INVITER)
    .eq('invitee_id', userId)
    .eq('status', 'PENDING')
    .order('created_at', { ascending: false })
    .limit(20);

  return ((data ?? []) as unknown as RawPending[]).flatMap((row) => {
    const table = row.poker_tables;
    if (!table || !acceptsInvitations(table.status)) return [];
    return [
      {
        id: row.id,
        tableId: table.id,
        tableName: table.name,
        gameDate: table.game_date,
        plannedStartAt: table.planned_start_at,
        buyInAgorot: table.buy_in_agorot,
        inviterName: row.inviter?.display_name ?? 'מארגן השולחן',
        inviterAvatarUrl: row.inviter?.avatar_url ?? null,
      },
    ];
  });
}

/**
 * Who has already been invited to one table, and what they said.
 *
 * One row per invited person, read in a single query — the invite sheet then
 * looks each friend up in the map rather than asking the database per friend.
 */
export async function loadTableInvitationStatuses(
  tableId: string,
): Promise<Map<string, InvitationStatus>> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('table_invitations')
    .select('invitee_id, status')
    .eq('table_id', tableId);

  const rows = (data ?? []) as unknown as { invitee_id: string; status: InvitationStatus }[];
  return new Map(rows.map((row) => [row.invitee_id, row.status]));
}
