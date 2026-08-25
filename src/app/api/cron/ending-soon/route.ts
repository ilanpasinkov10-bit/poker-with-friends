import { NextResponse } from 'next/server';
import { notifyTable } from '@/lib/push/send';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * The "one hour to go" reminder.
 *
 * Every other notification is sent by the action that caused it. This one has
 * no action behind it — nobody presses a button an hour before the end — so a
 * scheduler has to look for games approaching their planned finish. It is
 * wired to Vercel Cron in vercel.json.
 *
 * Exactly-once, not at-most-once: the claiming UPDATE stamps
 * `ending_soon_notified_at` and returns only the rows it actually changed, in
 * one atomic statement. Two overlapping runs cannot both claim the same table,
 * and a table already reminded is invisible to the next run.
 *
 * The window is generous on the late side (an hour and a bit) so a missed or
 * delayed run still reminds rather than skipping the game entirely; the claim
 * is what stops that generosity turning into duplicates.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const WINDOW_OPENS_MINUTES = 75;
const WINDOW_CLOSES_MINUTES = 5;

export async function GET(request: Request): Promise<NextResponse> {
  if (!isAuthorised(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    // No service key configured: the reminder is simply not available on this
    // deployment. Not an error worth alerting a scheduler about.
    return NextResponse.json({ claimed: 0, reason: 'not-configured' });
  }

  const now = Date.now();
  const opensAt = new Date(now + WINDOW_CLOSES_MINUTES * 60_000).toISOString();
  const closesAt = new Date(now + WINDOW_OPENS_MINUTES * 60_000).toISOString();

  const { data: claimed, error } = await admin
    .from('poker_tables')
    .update({ ending_soon_notified_at: new Date().toISOString() })
    .eq('status', 'ACTIVE')
    .is('ending_soon_notified_at', null)
    .gt('planned_end_at', opensAt)
    .lte('planned_end_at', closesAt)
    .select('id, name');

  if (error) {
    console.error('[cron] could not claim tables ending soon', error.message);
    return NextResponse.json({ error: 'claim-failed' }, { status: 500 });
  }

  const tables = claimed ?? [];
  for (const table of tables) {
    await notifyTable({
      tableId: table.id,
      tableName: table.name,
      actorUserId: null,
      event: { kind: 'ENDING_SOON', at: new Date().toISOString(), tableName: table.name },
    });
  }

  return NextResponse.json({ claimed: tables.length });
}

/**
 * Vercel Cron sends `Authorization: Bearer $CRON_SECRET` when the variable is
 * set. Without a secret configured the route refuses everything rather than
 * leaving an endpoint that anyone could use to burn through notifications.
 */
function isAuthorised(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  return request.headers.get('authorization') === `Bearer ${secret}`;
}
