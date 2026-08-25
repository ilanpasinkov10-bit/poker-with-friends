'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { guard, ok, type ActionResult } from '@/lib/action-result';
import { AppError } from '@/lib/errors';
import { publicVapidKey } from '@/lib/push/config';
import { claimAndNotifyTable } from '@/lib/push/ending-soon';
import { createClient } from '@/lib/supabase/server';

/**
 * The player's own notification settings and push subscriptions.
 *
 * Everything here is scoped to the caller by RLS: a subscription row may only
 * be written with `profile_id = auth.uid()`, so a forged profile id in the
 * request is rejected by the database rather than trusted here.
 */

const settingsSchema = z.object({
  pushNotificationsEnabled: z.boolean(),
  gameSoundsEnabled: z.boolean(),
});

export async function updateNotificationSettingsAction(
  input: z.input<typeof settingsSchema>,
): Promise<ActionResult> {
  return guard(async () => {
    const values = settingsSchema.parse(input);
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new AppError('NOT_AUTHENTICATED');

    const { error } = await supabase.from('profile_privacy_settings').upsert(
      {
        profile_id: user.id,
        push_notifications_enabled: values.pushNotificationsEnabled,
        game_sounds_enabled: values.gameSoundsEnabled,
      },
      { onConflict: 'profile_id' },
    );
    if (error) throw error;

    revalidatePath('/profile', 'layout');
    return ok();
  });
}

const subscriptionSchema = z.object({
  endpoint: z.string().url().max(2048),
  p256dh: z.string().min(1).max(512),
  auth: z.string().min(1).max(512),
  userAgent: z.string().max(512).optional(),
});

/**
 * Records this browser's push subscription.
 *
 * Conflict on `endpoint` rather than insert-or-nothing: a browser can hand out
 * the same endpoint with rotated keys, and re-subscribing must refresh the row
 * instead of leaving a stale one that would fail to decrypt — or worse, adding
 * a second row for one device and sending everything twice.
 */
export async function savePushSubscriptionAction(
  input: z.input<typeof subscriptionSchema>,
): Promise<ActionResult> {
  return guard(async () => {
    const values = subscriptionSchema.parse(input);
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new AppError('NOT_AUTHENTICATED');

    const { error } = await supabase.from('push_subscriptions').upsert(
      {
        profile_id: user.id,
        endpoint: values.endpoint,
        p256dh: values.p256dh,
        auth: values.auth,
        user_agent: values.userAgent ?? null,
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: 'endpoint' },
    );
    if (error) throw error;
    return ok();
  });
}

export async function removePushSubscriptionAction(endpoint: string): Promise<ActionResult> {
  return guard(async () => {
    const value = z.string().url().max(2048).parse(endpoint);
    const supabase = await createClient();
    const { error } = await supabase.from('push_subscriptions').delete().eq('endpoint', value);
    if (error) throw error;
    return ok();
  });
}

/**
 * The VAPID public key, or null when push is not configured for this
 * deployment. The browser needs it to subscribe; it is public by design.
 */
export async function pushPublicKeyAction(): Promise<ActionResult<{ publicKey: string | null }>> {
  return guard(async () => ok({ publicKey: publicVapidKey() }));
}

/**
 * Asks whether this table's "one hour to go" reminder is due, and sends it if
 * so. Called by an open client during the final stretch of a game.
 *
 * This is what replaces a frequent scheduler. An active poker table reliably
 * has someone's app open — the admin approving rebuys, at the very least — and
 * that client already refreshes every thirty seconds. Letting it ask a cheap
 * question every couple of minutes near the end delivers the reminder without
 * any cron at all.
 *
 * It is safe to call from anywhere, by anyone with a seat at the table:
 * membership is checked through RLS below, the reply says nothing (so it
 * cannot be used to probe for tables), and the claim inside means repeated
 * calls — from one phone or six — still send at most one reminder, ever.
 */
export async function checkEndingSoonAction(tableId: string): Promise<ActionResult> {
  return guard(async () => {
    const id = z.string().uuid().parse(tableId);

    // Read as the caller, not as the service role: if RLS will not show them
    // this table, they have no business triggering anything on it.
    const supabase = await createClient();
    const { data: table } = await supabase
      .from('poker_tables')
      .select('id')
      .eq('id', id)
      .maybeSingle();
    if (!table) return ok();

    try {
      await claimAndNotifyTable(id);
    } catch (error) {
      // A reminder that could not be sent must never surface to a player who
      // was only looking at their table.
      console.error('[push] ending-soon check failed', {
        tableId: id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    return ok();
  });
}
