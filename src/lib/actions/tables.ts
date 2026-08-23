'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { guard, ok, type ActionResult } from '@/lib/action-result';
import { AppError } from '@/lib/errors';
import { shekelsToAgorot } from '@/lib/domain/money';
import { createClient } from '@/lib/supabase/server';
import { jerusalemToUtc } from '@/lib/timezone';

const createSchema = z.object({
  name: z.string().trim().min(1, 'צריך לתת שם לשולחן').max(60),
  gameDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'תאריך לא תקין'),
  startTime: z.string().regex(/^\d{2}:\d{2}$/, 'שעה לא תקינה'),
  endTime: z.string().regex(/^\d{2}:\d{2}$/, 'שעה לא תקינה'),
  buyInShekels: z.number().positive().max(100000),
  chipsPerBuyIn: z.number().int().positive().max(1000000),
  maxBuyIns: z.number().int().min(1).max(50),
  joinMode: z.enum(['AUTO_JOIN', 'ADMIN_APPROVAL']),
  playerVisibility: z.enum(['OPEN', 'PRIVATE']),
  countingMode: z.enum(['ADMIN_COUNT', 'SELF_COUNT']),
  adminPlays: z.boolean(),
});

export type CreateTableInput = z.input<typeof createSchema>;

export async function createTableAction(
  input: CreateTableInput,
): Promise<ActionResult<{ tableId: string; joinCode: string }>> {
  return guard(async () => {
    const values = createSchema.parse(input);

    const startAt = jerusalemToUtc(values.gameDate, values.startTime);
    let endAt = jerusalemToUtc(values.gameDate, values.endTime);
    // Poker nights routinely run past midnight — roll the end time to the next day.
    if (endAt.getTime() <= startAt.getTime()) {
      endAt = new Date(endAt.getTime() + 24 * 60 * 60 * 1000);
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new AppError('NOT_AUTHENTICATED');
    if ((user as { is_anonymous?: boolean }).is_anonymous) {
      throw new AppError('NOT_AUTHORIZED', 'כדי לפתוח שולחן צריך חשבון רשום');
    }

    const { data, error } = await supabase.rpc('create_poker_table', {
      p_name: values.name,
      p_game_date: values.gameDate,
      p_planned_start_at: startAt.toISOString(),
      p_planned_end_at: endAt.toISOString(),
      p_buy_in_agorot: shekelsToAgorot(values.buyInShekels),
      p_chips_per_buy_in: values.chipsPerBuyIn,
      p_max_buy_ins: values.maxBuyIns,
      p_join_mode: values.joinMode,
      p_player_visibility: values.playerVisibility,
      p_counting_mode: values.countingMode,
      p_admin_plays: values.adminPlays,
    });
    if (error) throw error;

    const table = data as { id: string; join_code: string };
    revalidatePath('/tables');
    return ok({ tableId: table.id, joinCode: table.join_code });
  });
}

export async function setTableStatusAction(
  tableId: string,
  status: 'ACTIVE' | 'COUNTING' | 'CANCELLED',
): Promise<ActionResult> {
  return guard(async () => {
    const supabase = await createClient();
    const { error } = await supabase.rpc('set_table_status', {
      p_table: tableId,
      p_status: status,
    });
    if (error) throw error;
    revalidatePath(`/table/${tableId}`);
    return ok();
  });
}

export async function extendGameAction(
  tableId: string,
  input: { minutes?: number; newEnd?: { date: string; time: string } },
): Promise<ActionResult<{ plannedEndAt: string }>> {
  return guard(async () => {
    const supabase = await createClient();
    const newEndIso = input.newEnd
      ? jerusalemToUtc(input.newEnd.date, input.newEnd.time).toISOString()
      : null;

    const { data, error } = await supabase.rpc('extend_game', {
      p_table: tableId,
      p_minutes: input.minutes ?? null,
      p_new_end: newEndIso,
    });
    if (error) throw error;
    revalidatePath(`/table/${tableId}`);
    return ok({ plannedEndAt: String(data) });
  });
}

const settingsSchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  maxBuyIns: z.number().int().min(1).max(50).optional(),
  joinMode: z.enum(['AUTO_JOIN', 'ADMIN_APPROVAL']).optional(),
  playerVisibility: z.enum(['OPEN', 'PRIVATE']).optional(),
  countingMode: z.enum(['ADMIN_COUNT', 'SELF_COUNT']).optional(),
});

export async function updateTableSettingsAction(
  tableId: string,
  input: z.input<typeof settingsSchema>,
): Promise<ActionResult> {
  return guard(async () => {
    const values = settingsSchema.parse(input);
    const supabase = await createClient();
    const { error } = await supabase.rpc('update_table_settings', {
      p_table: tableId,
      p_name: values.name ?? null,
      p_max_buy_ins: values.maxBuyIns ?? null,
      p_join_mode: values.joinMode ?? null,
      p_player_visibility: values.playerVisibility ?? null,
      p_counting_mode: values.countingMode ?? null,
    });
    if (error) throw error;
    revalidatePath(`/table/${tableId}`);
    return ok();
  });
}
