import 'server-only';

import { chipsToAgorot } from '@/lib/domain/chips';
import type { TableEvent } from '@/lib/domain/events';
import { createClient } from '@/lib/supabase/server';
import { notifyTable } from './send';

/**
 * The bridge from a server action to a notification.
 *
 * Actions call one of these after the database work has already succeeded, and
 * never await anything that could fail the request: `notifyTable` swallows its
 * own errors, and these helpers add the lookups needed to write the sentence.
 *
 * The reads here use the *caller's* client, not the service role — the actor is
 * a member of the table, so RLS already lets them see the table's name and a
 * seat's display name. Only the send itself needs elevated access.
 */

interface TableFacts {
  name: string;
  ownerId: string;
}

async function tableFacts(tableId: string): Promise<TableFacts | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('poker_tables')
    .select('name, owner_id')
    .eq('id', tableId)
    .maybeSingle();
  return data ? { name: data.name, ownerId: data.owner_id } : null;
}

async function seatFacts(
  tablePlayerId: string,
): Promise<{ tableId: string; displayName: string; userId: string | null } | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('table_players')
    .select('table_id, display_name, user_id')
    .eq('id', tablePlayerId)
    .maybeSingle();
  return data
    ? { tableId: data.table_id, displayName: data.display_name, userId: data.user_id }
    : null;
}

async function send(tableId: string, event: TableEvent, actorUserId: string | null) {
  const table = await tableFacts(tableId);
  if (!table) return;
  await notifyTable({ tableId, tableName: table.name, event, actorUserId });
}

export async function notifyPlayerJoined(
  tableId: string,
  displayName: string,
  actorUserId: string | null,
) {
  await send(
    tableId,
    {
      id: `join:${tableId}:${Date.now()}`,
      kind: 'PLAYER_JOINED',
      at: new Date().toISOString(),
      playerName: displayName,
    },
    actorUserId,
  );
}

/**
 * A departure, with the figures the player actually left with.
 *
 * The chips come from the count the leave transaction stored and the money
 * from the shared conversion — the same numbers as the player's card, the
 * active pot and the final settlement. Nothing is recomputed for the message.
 */
export async function notifyPlayerLeft(
  tablePlayerId: string,
  chips: number,
  actorUserId: string | null,
) {
  const seat = await seatFacts(tablePlayerId);
  if (!seat) return;

  const supabase = await createClient();
  const { data: table } = await supabase
    .from('poker_tables')
    .select('name, buy_in_agorot, chips_per_buy_in')
    .eq('id', seat.tableId)
    .maybeSingle();
  if (!table) return;

  await notifyTable({
    tableId: seat.tableId,
    tableName: table.name,
    actorUserId,
    event: {
      id: `left:${tablePlayerId}`,
      kind: 'PLAYER_LEFT',
      at: new Date().toISOString(),
      playerName: seat.displayName,
      finalChips: chips,
      finalValueAgorot: chipsToAgorot(chips, {
        buyInAgorot: table.buy_in_agorot,
        chipsPerBuyIn: table.chips_per_buy_in,
      }),
    },
  });
}

/**
 * An additional entry.
 *
 * The actor is the admin who approved it, so they are not notified; the player
 * who bought in *is*, because from their side the approval is news.
 */
export async function notifyBuyIn(tablePlayerId: string, actorUserId: string | null) {
  const seat = await seatFacts(tablePlayerId);
  if (!seat) return;

  const supabase = await createClient();
  const { data: table } = await supabase
    .from('poker_tables')
    .select('name, buy_in_agorot, chips_per_buy_in')
    .eq('id', seat.tableId)
    .maybeSingle();
  if (!table) return;

  await notifyTable({
    tableId: seat.tableId,
    tableName: table.name,
    actorUserId,
    event: {
      id: `buyin:${tablePlayerId}:${Date.now()}`,
      kind: 'BUY_IN',
      at: new Date().toISOString(),
      playerName: seat.displayName,
      amountAgorot: table.buy_in_agorot,
      chips: table.chips_per_buy_in,
    },
  });
}

export async function notifyGameStarted(tableId: string, actorUserId: string | null) {
  const table = await tableFacts(tableId);
  if (!table) return;
  await notifyTable({
    tableId,
    tableName: table.name,
    actorUserId,
    event: {
      id: `started:${tableId}`,
      kind: 'GAME_STARTED',
      at: new Date().toISOString(),
      tableName: table.name,
    },
  });
}

/**
 * Results are in. Unlike the others this goes to *everyone*, the admin who
 * finalised included: the settlement is the thing every player is waiting for,
 * and the person who pressed the button still wants it on their phone.
 */
export async function notifyGameEnded(tableId: string) {
  const table = await tableFacts(tableId);
  if (!table) return;
  await notifyTable({
    tableId,
    tableName: table.name,
    actorUserId: null,
    event: {
      id: `ended:${tableId}`,
      kind: 'GAME_ENDED',
      at: new Date().toISOString(),
      tableName: table.name,
    },
  });
}

/**
 * A cancelled entry.
 *
 * The admin who cancelled it is excluded — they are already looking at their
 * own confirmation — but the player whose entry it was is told, because money
 * moving off their stack without them touching anything is exactly the sort of
 * thing they should not discover by accident.
 */
export async function notifyBuyInReversed(
  tablePlayerId: string,
  refundedAgorot: number,
  actorUserId: string | null,
) {
  const seat = await seatFacts(tablePlayerId);
  if (!seat) return;

  const table = await tableFacts(seat.tableId);
  if (!table) return;

  await notifyTable({
    tableId: seat.tableId,
    tableName: table.name,
    actorUserId,
    event: {
      id: `reversal:${tablePlayerId}:${Date.now()}`,
      kind: 'BUY_IN_REVERSED',
      at: new Date().toISOString(),
      playerName: seat.displayName,
      refundedAgorot,
      refundedChips: 0,
    },
  });
}

/**
 * The game was called off.
 *
 * Goes to everyone including the admin who cancelled it, for the same reason
 * the results do: this is the answer to "are we still playing?", and the person
 * who pressed the button still wants it on their phone. There is no settlement
 * and no result to report — only that the game has ended without one.
 */
export async function notifyGameCancelled(tableId: string) {
  const table = await tableFacts(tableId);
  if (!table) return;
  await notifyTable({
    tableId,
    tableName: table.name,
    actorUserId: null,
    event: {
      id: `cancelled:${tableId}`,
      kind: 'GAME_CANCELLED',
      at: new Date().toISOString(),
      tableName: table.name,
    },
  });
}
