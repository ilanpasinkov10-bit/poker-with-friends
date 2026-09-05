'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { guard, ok, type ActionResult } from '@/lib/action-result';
import { AppError } from '@/lib/errors';
import { notifyPlayerJoined, notifyPlayerLeft } from '@/lib/push/table-events';
import { createClient } from '@/lib/supabase/server';

const codeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9]{5}$/, 'קוד השולחן מורכב מ‑5 תווים');

const nameSchema = z.string().trim().min(1, 'צריך להזין שם').max(40, 'השם ארוך מדי');

export async function lookupTableAction(code: string): Promise<
  ActionResult<{
    id: string;
    name: string;
    join_code: string;
    status: string;
    join_mode: string;
    planned_start_at: string;
    planned_end_at: string;
    buy_in_agorot: number;
    chips_per_buy_in: number;
    admin_name: string;
    player_count: number;
    already_joined: boolean;
  }>
> {
  return guard(async () => {
    const joinCode = codeSchema.parse(code);
    const supabase = await createClient();
    const { data, error } = await supabase.rpc('get_table_preview', { p_code: joinCode });
    if (error) throw error;
    return ok(data as never);
  });
}

/**
 * Joins a table. A visitor with no session is given a Supabase *anonymous*
 * session first: a real, server-signed JWT stored in httpOnly cookies. The
 * seat is then created by a database function that reads auth.uid() itself,
 * so the browser never supplies the identity it is authorised as.
 */
export async function joinTableAction(input: {
  code: string;
  displayName: string;
}): Promise<ActionResult<{ tableId: string; tablePlayerId: string; status: string }>> {
  return guard(async () => {
    const joinCode = codeSchema.parse(input.code);
    const displayName = nameSchema.parse(input.displayName);

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      const { error: anonError } = await supabase.auth.signInAnonymously({
        options: { data: { display_name: displayName } },
      });
      if (anonError) throw anonError;
    }

    const { data, error } = await supabase.rpc('join_table', {
      p_code: joinCode,
      p_display_name: displayName,
    });
    if (error) throw error;

    const result = data as { table_id: string; table_player_id: string; status: string };

    // Only a seat that is actually at the table is news; a request awaiting
    // the admin's approval is not yet an arrival.
    if (result.status === 'ACTIVE') {
      const {
        data: { user: joiner },
      } = await supabase.auth.getUser();
      await notifyPlayerJoined(result.table_id, displayName, joiner?.id ?? null);
    }

    revalidatePath(`/table/${result.table_id}`);
    return ok({
      tableId: result.table_id,
      tablePlayerId: result.table_player_id,
      status: result.status,
    });
  });
}

export async function resolveJoinRequestAction(
  tableId: string,
  tablePlayerId: string,
  approve: boolean,
): Promise<ActionResult> {
  return guard(async () => {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { data: seat } = await supabase
      .from('table_players')
      .select('display_name')
      .eq('id', tablePlayerId)
      .maybeSingle();

    const { error } = await supabase.rpc('resolve_join_request', {
      p_table_player: tablePlayerId,
      p_approve: approve,
    });
    if (error) throw error;

    // Under ADMIN_APPROVAL this is the moment the player actually joins.
    if (approve && seat) {
      await notifyPlayerJoined(tableId, seat.display_name, user?.id ?? null);
    }

    revalidatePath(`/table/${tableId}`);
    return ok();
  });
}

/**
 * Cashes a player out of a game in progress.
 *
 * `leave_table` records the declared chip count as an approved submission and
 * stamps `left_at`, all under a row lock — so a second tap is refused and the
 * player's result continues through the same finalisation path as everyone
 * else's. Their buy-ins stay in the pot.
 */
export async function leaveTableAction(
  tableId: string,
  tablePlayerId: string,
  chips: number,
): Promise<ActionResult> {
  return guard(async () => {
    const parsed = z.number().int().min(0).max(100_000_000).safeParse(chips);
    if (!parsed.success) {
      throw new AppError('LEAVE_INVALID_CHIPS', undefined, `leave_table chips=${String(chips)}`);
    }
    const value = parsed.data;

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { error } = await supabase.rpc('leave_table', {
      p_table_player: tablePlayerId,
      p_chips: value,
    });
    if (error) throw error;

    // Only after the transaction has committed, so a refused leave never
    // announces a departure that did not happen.
    await notifyPlayerLeft(tablePlayerId, value, user?.id ?? null);

    revalidatePath(`/table/${tableId}`);
    return ok();
  });
}

export async function removePlayerAction(
  tableId: string,
  tablePlayerId: string,
): Promise<ActionResult> {
  return guard(async () => {
    const supabase = await createClient();
    const { error } = await supabase.rpc('remove_player', { p_table_player: tablePlayerId });
    if (error) throw error;
    revalidatePath(`/table/${tableId}`);
    return ok();
  });
}

/**
 * Seats somebody the admin names, with no account behind them.
 *
 * The table id travels from the browser and is an argument, not a permission:
 * `add_manual_player` checks `is_table_admin` before it looks the table up, so
 * a forged id is refused by the same rule a genuine one passes. The name is
 * checked here for the sake of a clear message and again in the database,
 * which is where the rule actually lives.
 *
 * No notification: there is nobody to notify. That is the whole point of the
 * feature — this person has no account, no device and no session.
 */
export async function addManualPlayerAction(
  tableId: string,
  displayName: string,
): Promise<ActionResult<{ displayName: string }>> {
  return guard(async () => {
    const table = z.string().uuid().parse(tableId);
    const name = nameSchema.parse(displayName);

    const supabase = await createClient();
    const { data, error } = await supabase.rpc('add_manual_player', {
      p_table: table,
      p_display_name: name,
    });
    if (error) throw error;

    const result = data as { table_player_id?: string; display_name?: string } | null;
    if (!result?.table_player_id) throw new AppError('RPC_BAD_SHAPE');

    revalidatePath(`/table/${table}`);
    return ok({ displayName: result.display_name ?? name });
  });
}
