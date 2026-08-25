import 'server-only';

import {
  REMINDER_CLOSES_MINUTES,
  REMINDER_OPENS_MINUTES,
} from '@/lib/domain/ending-soon';
import { createAdminClient } from '@/lib/supabase/admin';
import { notifyTable } from './send';

/**
 * Claiming and sending the "one hour to go" reminder.
 *
 * Shared by the two things that can drive it — an open client during the final
 * stretch, and the HTTP endpoint an external scheduler can call — so there is
 * one definition of what "due" means and one place the claim happens.
 *
 * Exactly-once comes from the claim, not from the caller. The UPDATE stamps
 * `ending_soon_notified_at` and returns only the rows it actually changed, in
 * a single atomic statement. Six phones checking in the same second, plus a
 * scheduler, cannot between them send more than one reminder: the first writer
 * takes the row and everyone else matches nothing.
 */

interface ClaimedTable {
  id: string;
  name: string;
}

async function sendFor(tables: ClaimedTable[]): Promise<number> {
  for (const table of tables) {
    await notifyTable({
      tableId: table.id,
      tableName: table.name,
      actorUserId: null,
      event: {
        id: `ending-soon:${table.id}`,
        kind: 'ENDING_SOON',
        at: new Date().toISOString(),
        tableName: table.name,
      },
    });
  }
  return tables.length;
}

function windowBounds(now = Date.now()) {
  return {
    // Named from the game's point of view: `notBefore` is the earliest finish
    // time still worth a reminder, `notAfter` the latest.
    notBefore: new Date(now + REMINDER_CLOSES_MINUTES * 60_000).toISOString(),
    notAfter: new Date(now + REMINDER_OPENS_MINUTES * 60_000).toISOString(),
  };
}

/**
 * Sweeps every table that is due. Used by the HTTP endpoint, where there is no
 * particular table in view.
 */
export async function claimAndNotifyDueTables(): Promise<{ sent: number }> {
  const admin = createAdminClient();
  const { notBefore, notAfter } = windowBounds();

  const { data, error } = await admin
    .from('poker_tables')
    .update({ ending_soon_notified_at: new Date().toISOString() })
    .eq('status', 'ACTIVE')
    .is('ending_soon_notified_at', null)
    .gt('planned_end_at', notBefore)
    .lte('planned_end_at', notAfter)
    .select('id, name');

  if (error) throw error;
  return { sent: await sendFor(data ?? []) };
}

/**
 * The same claim narrowed to one table, for a client that is watching its own
 * game. Scoping it by id keeps the write to a single indexed row, so a phone
 * checking every couple of minutes costs almost nothing.
 *
 * Returns quietly when the table is not due — which is the usual answer, and
 * not a condition worth reporting to anyone.
 */
export async function claimAndNotifyTable(tableId: string): Promise<{ sent: number }> {
  const admin = createAdminClient();
  const { notBefore, notAfter } = windowBounds();

  const { data, error } = await admin
    .from('poker_tables')
    .update({ ending_soon_notified_at: new Date().toISOString() })
    .eq('id', tableId)
    .eq('status', 'ACTIVE')
    .is('ending_soon_notified_at', null)
    .gt('planned_end_at', notBefore)
    .lte('planned_end_at', notAfter)
    .select('id, name');

  if (error) throw error;
  return { sent: await sendFor(data ?? []) };
}
