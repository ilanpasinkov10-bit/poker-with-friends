'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { guard, ok, type ActionResult } from '@/lib/action-result';
import { computeFinalResults, validateChipCount } from '@/lib/domain/chips';
import { computeSettlement, verifySettlement } from '@/lib/domain/settlement';
import { AppError } from '@/lib/errors';
import { createClient } from '@/lib/supabase/server';
import type { FinalRowResult } from '@/types/database';

const chipsSchema = z.number().int().min(0, 'מספר הז׳יטונים לא יכול להיות שלילי').max(100_000_000);

export async function submitChipCountAction(
  tableId: string,
  tablePlayerId: string,
  chips: number,
): Promise<ActionResult> {
  return guard(async () => {
    const value = chipsSchema.parse(chips);
    const supabase = await createClient();
    const { error } = await supabase.rpc('submit_chip_count', {
      p_table_player: tablePlayerId,
      p_chips: value,
    });
    if (error) throw error;
    revalidatePath(`/table/${tableId}`);
    return ok();
  });
}

export async function adminSetChipCountAction(
  tableId: string,
  tablePlayerId: string,
  chips: number,
): Promise<ActionResult> {
  return guard(async () => {
    const value = chipsSchema.parse(chips);
    const supabase = await createClient();
    const { error } = await supabase.rpc('admin_set_chip_count', {
      p_table_player: tablePlayerId,
      p_chips: value,
    });
    if (error) throw error;
    revalidatePath(`/table/${tableId}`);
    return ok();
  });
}

export async function approveAllChipCountsAction(tableId: string): Promise<ActionResult<number>> {
  return guard(async () => {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc('approve_all_chip_counts', { p_table: tableId });
    if (error) throw error;
    revalidatePath(`/table/${tableId}`);
    return ok(Number(data ?? 0));
  });
}

/**
 * Finalises the game.
 *
 * The per-player results are computed by the database (authoritative). We read
 * them back, build the transfer plan with the unit-tested settlement algorithm,
 * and hand it to finalize_game — which re-computes the results itself and
 * refuses the plan unless it exactly resolves every balance. So a tampered or
 * stale plan cannot be stored.
 */
export async function finalizeGameAction(tableId: string): Promise<ActionResult> {
  return guard(async () => {
    const supabase = await createClient();

    const { data, error } = await supabase.rpc('compute_final_rows', {
      p_table: tableId,
      p_require_approved: true,
    });
    if (error) throw error;

    const rows = (data ?? []) as FinalRowResult[];
    if (rows.length === 0) throw new AppError('MISSING_CHIP_COUNTS');
    if (rows.some((row) => !row.has_count)) throw new AppError('MISSING_CHIP_COUNTS');

    const issued = rows.reduce((sum, row) => sum + row.chips_issued, 0);
    const counted = rows.reduce((sum, row) => sum + row.final_chips, 0);
    if (issued !== counted) throw new AppError('CHIP_MISMATCH');

    const balances = rows.map((row) => ({
      id: row.table_player_id,
      amountAgorot: row.profit_loss_agorot,
    }));
    const transfers = computeSettlement(balances);
    if (!verifySettlement(balances, transfers)) throw new AppError('INVALID_SETTLEMENT');

    const payload = transfers.map((t) => ({ from: t.from, to: t.to, amount: t.amountAgorot }));
    const { error: finalizeError } = await supabase.rpc('finalize_game', {
      p_table: tableId,
      p_settlements: payload,
    });
    if (finalizeError) throw finalizeError;

    revalidatePath(`/table/${tableId}`);
    revalidatePath('/profile', 'layout');
    return ok();
  });
}

const correctionSchema = z.object({
  reason: z.string().trim().min(3, 'צריך לפרט את סיבת התיקון').max(500),
  counts: z
    .array(z.object({ tablePlayerId: z.string().uuid(), chips: z.number().int().min(0) }))
    .min(1),
});

/**
 * Audited correction of a game that has already been finalised.
 *
 * The corrected chip counts are projected through the same conversion the
 * database uses, so the transfer plan we submit matches the numbers the
 * database will recompute. `correct_game_results` still re-validates both the
 * chip balance and the plan, and snapshots the previous state before writing.
 */
export async function correctGameResultsAction(
  tableId: string,
  input: z.input<typeof correctionSchema>,
): Promise<ActionResult> {
  return guard(async () => {
    const values = correctionSchema.parse(input);
    const supabase = await createClient();

    const { data: table, error: tableError } = await supabase
      .from('poker_tables')
      .select('buy_in_agorot, chips_per_buy_in')
      .eq('id', tableId)
      .single();
    if (tableError) throw tableError;

    const { data, error } = await supabase.rpc('compute_final_rows', {
      p_table: tableId,
      p_require_approved: false,
    });
    if (error) throw error;

    const corrected = new Map(values.counts.map((c) => [c.tablePlayerId, c.chips]));
    const projected = ((data ?? []) as FinalRowResult[]).map((row) => ({
      id: row.table_player_id,
      buyInCount: row.buy_in_count,
      totalPaidAgorot: row.total_paid_agorot,
      chipsIssued: row.chips_issued,
      finalChips: corrected.get(row.table_player_id) ?? row.final_chips,
    }));

    const check = validateChipCount(projected);
    if (check.verdict !== 'BALANCED') throw new AppError('CHIP_MISMATCH');

    const results = computeFinalResults(projected, {
      buyInAgorot: table.buy_in_agorot,
      chipsPerBuyIn: table.chips_per_buy_in,
    });
    const balances = results.map((r) => ({ id: r.id, amountAgorot: r.profitLossAgorot }));
    const transfers = computeSettlement(balances);
    if (!verifySettlement(balances, transfers)) throw new AppError('INVALID_SETTLEMENT');

    const { error: applyError } = await supabase.rpc('correct_game_results', {
      p_table: tableId,
      p_counts: values.counts.map((c) => ({ table_player_id: c.tablePlayerId, chips: c.chips })),
      p_settlements: transfers.map((t) => ({ from: t.from, to: t.to, amount: t.amountAgorot })),
      p_reason: values.reason,
    });
    if (applyError) throw applyError;

    revalidatePath(`/table/${tableId}`);
    revalidatePath('/profile', 'layout');
    return ok();
  });
}

export async function markSettlementPaidAction(
  tableId: string,
  settlementId: string,
  paid: boolean,
): Promise<ActionResult> {
  return guard(async () => {
    const supabase = await createClient();
    const { error } = await supabase.rpc('mark_settlement_paid', {
      p_settlement: settlementId,
      p_paid: paid,
    });
    if (error) throw error;
    revalidatePath(`/table/${tableId}`);
    return ok();
  });
}
