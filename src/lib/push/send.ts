import 'server-only';

import webpush, { WebPushError } from 'web-push';
import { siteUrl } from '@/lib/env';
import { notificationCopy, type TableEvent } from '@/lib/domain/events';
import { createAdminClient } from '@/lib/supabase/admin';
import { isPushConfigured, vapidKeys } from './config';

/**
 * Sending a table event to everyone at the table except whoever caused it.
 *
 * Two rules shape this module.
 *
 * It reads other people's push subscriptions, which are the credentials for
 * messaging their devices, so it runs under the service role and lives behind
 * `server-only`. There is deliberately no database function that would let one
 * player read another's subscription: a table-mate who could call it could
 * harvest endpoints and push to those devices directly.
 *
 * And it never fails the action that called it. A player who joined a table
 * has joined it whether or not the push service was reachable; a rejected
 * notification must not surface as "joining failed". Every path here resolves,
 * and problems go to the server log.
 */

export interface NotifyOptions {
  tableId: string;
  tableName: string;
  event: TableEvent;
  /**
   * The user whose action this was. They already know it happened — they are
   * looking at the confirmation — so they are not notified about themselves.
   * Pass null for events with no actor, such as the end-of-game reminder.
   */
  actorUserId: string | null;
}

interface SubscriptionRow {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

export async function notifyTable(options: NotifyOptions): Promise<{ sent: number }> {
  if (!isPushConfigured()) return { sent: 0 };

  try {
    return await deliver(options);
  } catch (error) {
    console.error('[push] delivery failed', {
      tableId: options.tableId,
      kind: options.event.kind,
      error: error instanceof Error ? error.message : String(error),
    });
    return { sent: 0 };
  }
}

async function deliver({
  tableId,
  tableName,
  event,
  actorUserId,
}: NotifyOptions): Promise<{ sent: number }> {
  const admin = createAdminClient();

  // Who is at this table. A player who has left keeps their seat row, and
  // their money is still in the game, so they still hear about it until the
  // results are in.
  const { data: seats, error: seatError } = await admin
    .from('table_players')
    .select('user_id')
    .eq('table_id', tableId)
    .in('status', ['ACTIVE', 'PENDING']);
  if (seatError) throw seatError;

  const recipientIds = [
    ...new Set(
      (seats ?? [])
        .map((seat) => seat.user_id)
        .filter((id): id is string => !!id && id !== actorUserId),
    ),
  ];

  const copy = notificationCopy(event, tableName);
  return sendToUsers({
    recipientIds,
    title: copy.title,
    body: copy.body,
    kind: event.kind,
    url: `${siteUrl()}/table/${tableId}`,
    // Collapses a burst at the push service and in the tray: several buy-ins
    // in a row become one line rather than a column of near-identical alerts.
    tag: `table-${tableId}-${event.kind}`,
  });
}

export interface DirectMessage {
  /** Who should hear about it. Deduplicated here; may be empty. */
  recipientIds: readonly string[];
  title: string;
  body: string;
  /** Machine name for the service worker, mirroring a table event's kind. */
  kind: string;
  url: string;
  /**
   * The collapse key. Two messages sharing a tag replace each other in the
   * tray rather than stacking, which is how a repeated notification is kept
   * from becoming a column of near-identical lines.
   */
  tag: string;
}

/**
 * Sends one message to a set of users.
 *
 * The shared half of every notification this app sends: honour the per-user
 * switch, look up the devices, deliver, and prune the endpoints the browser
 * has thrown away. `notifyTable` decides *who* is at a table; this decides
 * nothing about who — it is told.
 */
export async function notifyUsers(message: DirectMessage): Promise<{ sent: number }> {
  if (!isPushConfigured()) return { sent: 0 };
  try {
    return await sendToUsers(message);
  } catch (error) {
    console.error('[push] delivery failed', {
      kind: message.kind,
      error: error instanceof Error ? error.message : String(error),
    });
    return { sent: 0 };
  }
}

async function sendToUsers({
  recipientIds,
  title,
  body,
  kind,
  url,
  tag,
}: DirectMessage): Promise<{ sent: number }> {
  const keys = vapidKeys();
  if (!keys) return { sent: 0 };
  webpush.setVapidDetails(keys.subject, keys.publicKey, keys.privateKey);

  const unique = [...new Set(recipientIds)];
  if (unique.length === 0) return { sent: 0 };

  const admin = createAdminClient();

  // Respect the switch. This is the authority, not the browser permission:
  // a player may have granted permission months ago and turned us off since.
  const { data: settings, error: settingsError } = await admin
    .from('profile_privacy_settings')
    .select('profile_id, push_notifications_enabled')
    .in('profile_id', unique);
  if (settingsError) throw settingsError;

  const optedOut = new Set(
    (settings ?? [])
      .filter((row) => row.push_notifications_enabled === false)
      .map((row) => row.profile_id),
  );
  const willing = unique.filter((id) => !optedOut.has(id));
  if (willing.length === 0) return { sent: 0 };

  const { data: subscriptions, error: subError } = await admin
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .in('profile_id', willing);
  if (subError) throw subError;
  if (!subscriptions || subscriptions.length === 0) return { sent: 0 };

  const payload = JSON.stringify({ title, body, kind, url, tag });

  const results = await Promise.allSettled(
    (subscriptions as SubscriptionRow[]).map((row) =>
      webpush.sendNotification(
        { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } },
        payload,
        { TTL: 60 * 60 },
      ),
    ),
  );

  const gone: string[] = [];
  let sent = 0;
  results.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      sent += 1;
      return;
    }
    const reason = result.reason;
    // 404/410 mean the browser threw this subscription away. Keeping it would
    // mean retrying a dead endpoint on every future event.
    if (reason instanceof WebPushError && (reason.statusCode === 404 || reason.statusCode === 410)) {
      const row = (subscriptions as SubscriptionRow[])[index];
      if (row) gone.push(row.id);
      return;
    }
    console.error('[push] one subscription failed', {
      kind,
      error: reason instanceof Error ? reason.message : String(reason),
    });
  });

  if (gone.length > 0) {
    const { error } = await admin.from('push_subscriptions').delete().in('id', gone);
    if (error) console.error('[push] could not prune dead subscriptions', error.message);
  }

  return { sent };
}
