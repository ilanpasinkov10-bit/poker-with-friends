/**
 * The activity feed, derived rather than recorded.
 *
 * Every event shown already exists in the data: a seat carries `joined_at` and
 * `left_at`, and the ledger is append-only with a timestamp on every row. So
 * there is no event table to write to, nothing to keep in step with the
 * accounting, and no way for the feed to disagree with the pot it sits under.
 *
 * Two judgement calls are worth stating outright.
 *
 * The opening buy-in is not an event. Joining a table creates the seat and its
 * first entry in the same transaction, so showing both would report one action
 * twice — "הצטרף לשולחן" immediately followed by "נכנס בעוד כניסה". Only
 * entries after the first are additional entries.
 *
 * A cancelled entry is reported, but the entry it cancelled is not. The
 * refunded buy-in did not happen as far as the table's money is concerned —
 * the ledger's REVERSAL row carries negative amounts and chips, so every total
 * already excludes it — but the *cancelling* is something the admin did in
 * front of everyone, and it needs to be visible.
 */

import { sortEvents, type TableEvent } from './events';

/** How much history the feed keeps. The UI shows a few and offers the rest. */
export const ACTIVITY_HISTORY_LIMIT = 60;

/** How many lines the compact preview shows before "ראה עוד פעילות". */
export const ACTIVITY_PREVIEW_COUNT = 4;

export interface ActivityPlayer {
  id: string;
  userId: string | null;
  displayName: string;
  joinedAt: string;
  leftAt: string | null;
  cashOut: { finalChips: number; finalValueAgorot: number; leftAt: string } | null;
}

export interface ActivityLedgerRow {
  id: string;
  table_player_id: string;
  type: string;
  amount_agorot: number;
  chips: number;
  created_at: string;
  created_by: string | null;
  reverses_transaction_id: string | null;
}

export function buildTableActivity(
  players: readonly ActivityPlayer[],
  ledger: readonly ActivityLedgerRow[],
  limit: number = ACTIVITY_HISTORY_LIMIT,
): TableEvent[] {
  const byId = new Map(players.map((p) => [p.id, p] as const));
  const events: TableEvent[] = [];

  for (const player of players) {
    events.push({
      // Derived from the row, so the same join keeps the same identity across
      // every refresh and can never be toasted twice.
      id: `join:${player.id}`,
      kind: 'PLAYER_JOINED',
      at: player.joinedAt,
      playerName: player.displayName,
      subjectUserId: player.userId,
    });

    // Only a completed leave has a summary, so only a completed leave is
    // reported — and with the same figures the player's card shows.
    if (player.cashOut) {
      events.push({
        id: `left:${player.id}`,
        kind: 'PLAYER_LEFT',
        at: player.cashOut.leftAt,
        playerName: player.displayName,
        finalChips: player.cashOut.finalChips,
        finalValueAgorot: player.cashOut.finalValueAgorot,
        subjectUserId: player.userId,
        actorUserId: player.userId,
      });
    }
  }

  const reversedIds = new Set(
    ledger.map((tx) => tx.reverses_transaction_id).filter((id): id is string => !!id),
  );
  const seenPerPlayer = new Map<string, number>();
  const chronological = [...ledger].sort(
    (a, b) => Date.parse(a.created_at) - Date.parse(b.created_at),
  );

  for (const tx of chronological) {
    const player = byId.get(tx.table_player_id);
    if (!player) continue;

    if (tx.type === 'REVERSAL') {
      // The stored amounts are negative — they are what the ledger subtracts.
      // The sentence talks about what came back, so the sign is flipped here
      // rather than in the wording.
      events.push({
        id: `reversal:${tx.id}`,
        kind: 'BUY_IN_REVERSED',
        at: tx.created_at,
        playerName: player.displayName,
        refundedAgorot: Math.abs(tx.amount_agorot),
        refundedChips: Math.abs(tx.chips),
        subjectUserId: player.userId,
        actorUserId: tx.created_by,
      });
      continue;
    }

    // A reversed entry never happened as far as the table is concerned.
    if (reversedIds.has(tx.id)) continue;

    const seen = (seenPerPlayer.get(tx.table_player_id) ?? 0) + 1;
    seenPerPlayer.set(tx.table_player_id, seen);
    if (seen === 1) continue; // the opening entry, already reported as a join

    events.push({
      id: `buyin:${tx.id}`,
      kind: 'BUY_IN',
      at: tx.created_at,
      playerName: player.displayName,
      amountAgorot: tx.amount_agorot,
      chips: tx.chips,
      subjectUserId: player.userId,
      actorUserId: tx.created_by,
    });
  }

  return sortEvents(events, limit);
}
