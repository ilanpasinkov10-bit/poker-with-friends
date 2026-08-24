'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { guard, ok, type ActionResult } from '@/lib/action-result';
import { AppError } from '@/lib/errors';
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
    const { error } = await supabase.rpc('resolve_join_request', {
      p_table_player: tablePlayerId,
      p_approve: approve,
    });
    if (error) throw error;
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
      throw new AppError('INVALID_CHIP_COUNT', undefined, `leave_table chips=${String(chips)}`);
    }
    const value = parsed.data;

    const supabase = await createClient();
    const { error } = await supabase.rpc('leave_table', {
      p_table_player: tablePlayerId,
      p_chips: value,
    });
    if (error) throw error;

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
