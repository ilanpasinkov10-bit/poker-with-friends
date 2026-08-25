/**
 * The recent-activity feed, derived rather than recorded.
 *
 * Every event shown already exists in the data: a seat carries `joined_at` and
 * `left_at`, and the ledger is append-only with a timestamp on every row. So
 * there is no event table to write to, nothing to keep in step with the
 * accounting, and no way for the feed to disagree with the pot it sits under.
 *
 * The one judgement here is the opening buy-in. Joining a table creates the
 * seat and its first entry in the same transaction, so showing both would
 * report one action twice — "הצטרף לשולחן" immediately followed by "נכנס בעוד
 * כניסה". Only entries after the first are additional entries, which is what
 * the wording claims and what a player means by a rebuy.
 */

import { sortEvents, type TableEvent } from './events';

export interface ActivityPlayer {
  id: string;
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
  reverses_transaction_id: string | null;
}

export function buildTableActivity(
  players: readonly ActivityPlayer[],
  ledger: readonly ActivityLedgerRow[],
  limit = 8,
): TableEvent[] {
  const nameById = new Map(players.map((p) => [p.id, p.displayName] as const));
  const events: TableEvent[] = [];

  for (const player of players) {
    events.push({
      kind: 'PLAYER_JOINED',
      at: player.joinedAt,
      playerName: player.displayName,
    });

    // Only a completed leave has a summary, so only a completed leave is
    // reported — and with the same figures the player's card shows.
    if (player.cashOut) {
      events.push({
        kind: 'PLAYER_LEFT',
        at: player.cashOut.leftAt,
        playerName: player.displayName,
        finalChips: player.cashOut.finalChips,
        finalValueAgorot: player.cashOut.finalValueAgorot,
      });
    }
  }

  // A reversed entry never happened as far as the players are concerned, and
  // the reversal row itself is bookkeeping rather than an event.
  const reversed = new Set(
    ledger.map((tx) => tx.reverses_transaction_id).filter((id): id is string => !!id),
  );
  const seenPerPlayer = new Map<string, number>();

  for (const tx of [...ledger].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at))) {
    if (tx.type === 'REVERSAL' || reversed.has(tx.id)) continue;

    const seen = (seenPerPlayer.get(tx.table_player_id) ?? 0) + 1;
    seenPerPlayer.set(tx.table_player_id, seen);
    if (seen === 1) continue; // the opening entry, already reported as a join

    const name = nameById.get(tx.table_player_id);
    if (!name) continue;

    events.push({
      kind: 'BUY_IN',
      at: tx.created_at,
      playerName: name,
      amountAgorot: tx.amount_agorot,
      chips: tx.chips,
    });
  }

  return sortEvents(events, limit);
}
