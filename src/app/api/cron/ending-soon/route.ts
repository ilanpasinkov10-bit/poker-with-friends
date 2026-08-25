import { NextResponse } from 'next/server';
import { claimAndNotifyDueTables } from '@/lib/push/ending-soon';

/**
 * The "one hour to go" reminder, driven from outside.
 *
 * This endpoint is *not* the primary mechanism any more. The reminder is
 * normally sent by the app itself: a client with the table open checks as the
 * finish approaches (see `checkEndingSoonAction`). That works with no
 * scheduler at all, which is what makes the feature viable on hosting plans
 * where frequent cron jobs are not available.
 *
 * The endpoint remains for two reasons: it catches a game that ran its final
 * hour with nobody's app open, and it lets any external scheduler — Supabase
 * `pg_cron`, a free uptime pinger, a daily platform cron — drive the sweep on
 * whatever cadence is available. Both paths share one claim, so running both
 * cannot double up.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request): Promise<NextResponse> {
  if (!isAuthorised(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  try {
    const { sent } = await claimAndNotifyDueTables();
    return NextResponse.json({ sent });
  } catch (error) {
    // A missing service key means the sweep is simply unavailable on this
    // deployment, which is a configuration state rather than a fault.
    console.error('[cron] ending-soon sweep failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: 'sweep-failed' }, { status: 500 });
  }
}

/**
 * A scheduler sends `Authorization: Bearer $CRON_SECRET`. Without a secret
 * configured the route refuses everything, rather than leaving an endpoint
 * anyone could use to burn through notifications.
 */
function isAuthorised(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  return request.headers.get('authorization') === `Bearer ${secret}`;
}
