'use server';

import { revalidatePath } from 'next/cache';
import { guard, ok, type ActionResult } from '@/lib/action-result';
import { notifyBuyIn } from '@/lib/push/table-events';
import { createClient } from '@/lib/supabase/server';

/**
 * All of these are thin wrappers: the enforcement (ownership, max buy-ins,
 * "already handled", double-click protection) lives in the database functions,
 * under a row lock, so it holds even for concurrent requests from two devices.
 */

export async function requestRebuyAction(
  tableId: string,
  tablePlayerId: string,
): Promise<ActionResult<{ requestId: string }>> {
  return guard(async () => {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc('request_rebuy', { p_table_player: tablePlayerId });
    if (error) throw error;
    revalidatePath(`/table/${tableId}`);
    return ok({ requestId: String(data) });
  });
}

export async function cancelRebuyRequestAction(
  tableId: string,
  requestId: string,
): Promise<ActionResult> {
  return guard(async () => {
    const supabase = await createClient();
    const { error } = await supabase.rpc('cancel_rebuy_request', { p_request: requestId });
    if (error) throw error;
    revalidatePath(`/table/${tableId}`);
    return ok();
  });
}

export async function resolveRebuyRequestAction(
  tableId: string,
  requestId: string,
  approve: boolean,
): Promise<ActionResult> {
  return guard(async () => {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { data: request } = await supabase
      .from('rebuy_requests')
      .select('table_player_id')
      .eq('id', requestId)
      .maybeSingle();

    const { error } = await supabase.rpc('resolve_rebuy_request', {
      p_request: requestId,
      p_approve: approve,
    });
    if (error) throw error;

    // An approval is the entry; a refusal is between the admin and that
    // player, and is not announced to the table.
    if (approve && request) {
      await notifyBuyIn(request.table_player_id, user?.id ?? null);
    }

    revalidatePath(`/table/${tableId}`);
    return ok();
  });
}

export async function adminAddBuyInAction(
  tableId: string,
  tablePlayerId: string,
): Promise<ActionResult> {
  return guard(async () => {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { error } = await supabase.rpc('admin_add_buyin', { p_table_player: tablePlayerId });
    if (error) throw error;

    await notifyBuyIn(tablePlayerId, user?.id ?? null);

    revalidatePath(`/table/${tableId}`);
    return ok();
  });
}

export async function reverseBuyInAction(
  tableId: string,
  transactionId: string,
  note?: string,
): Promise<ActionResult> {
  return guard(async () => {
    const supabase = await createClient();
    const { error } = await supabase.rpc('reverse_buyin', {
      p_transaction: transactionId,
      p_note: note ?? null,
    });
    if (error) throw error;
    revalidatePath(`/table/${tableId}`);
    return ok();
  });
}
