import 'server-only';

import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
import type { CompletedGameRecord } from '@/lib/domain/stats';
import type { TableWithSeats } from '@/lib/domain/tables';
import type { GameResultRow, ProfilePrivacyRow } from '@/types/database';

export interface HistoryPage {
  games: CompletedGameRecord[];
  /** True when more completed games exist beyond this page. */
  hasMore: boolean;
}

/**
 * A player's completed games. `game_results` is the frozen source of truth —
 * nothing here recomputes money from the live ledger.
 *
 * One request, not four. This used to read the results, then the tables those
 * results point at, then the groups those tables belong to, each waiting on the
 * ids the previous one returned — three network legs in series before the
 * profile could render, on the screen a player opens most. Everything hanging
 * off a result row is reachable by foreign key, so PostgREST can return the
 * whole shape at once:
 *
 *   game_results → poker_tables → poker_groups
 *                              └→ game_results   (everyone else at that table)
 *
 * The last embed is what the separate "siblings" query was for: the player
 * count and the pot are sums over every result row of the same table, and
 * those rows are reachable from the table itself.
 *
 * RLS is untouched. Each embedded relation is filtered by its own policies, so
 * a table or a group the viewer may not read comes back absent here exactly as
 * it came back absent from the separate query.
 */
export const loadPlayerHistory = cache(async function loadPlayerHistory(
  userId: string,
  limit = 50,
  offset = 0,
): Promise<HistoryPage> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('game_results')
    .select(
      '*, poker_tables(id, name, group_id, completed_at, poker_groups(id, name), game_results(total_paid_agorot))',
    )
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit);

  const rows = (data ?? []) as HistoryRow[];
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  if (page.length === 0) return { games: [], hasMore: false };

  const games: CompletedGameRecord[] = page.map((result) => {
    const table = result.poker_tables;
    const siblings = table?.game_results ?? [];
    return {
      tableId: result.table_id,
      tableName: table?.name ?? 'שולחן',
      groupId: table?.group_id ?? null,
      groupName: table?.poker_groups?.name ?? null,
      playedAt: table?.completed_at ?? result.created_at,
      buyInCount: result.buy_in_count,
      totalPaidAgorot: result.total_paid_agorot,
      chipsIssued: result.chips_issued,
      finalChips: result.final_chips,
      finalValueAgorot: result.final_value_agorot,
      profitLossAgorot: result.profit_loss_agorot,
      playerCount: siblings.length,
      potAgorot: siblings.reduce((sum, row) => sum + row.total_paid_agorot, 0),
    };
  });

  return { games, hasMore };
});

type HistoryRow = GameResultRow & {
  poker_tables: {
    id: string;
    name: string;
    group_id: string | null;
    completed_at: string | null;
    poker_groups: { id: string; name: string } | null;
    game_results: { total_paid_agorot: number }[];
  } | null;
};

export async function loadPrivacySettings(userId: string): Promise<ProfilePrivacyRow> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('profile_privacy_settings')
    .select('*')
    .eq('profile_id', userId)
    .maybeSingle();

  return (
    data ?? {
      profile_id: userId,
      share_stats_with_table_members: true,
      share_detailed_history: false,
      show_on_leaderboard: false,
      // Both default on, matching the column defaults in 0011. A missing row
      // must read the same as a freshly created one.
      push_notifications_enabled: true,
      game_sounds_enabled: true,
      updated_at: new Date().toISOString(),
    }
  );
}

/**
 * Tables the user owns or holds a seat at, newest first.
 *
 * The seats come back attached to the tables rather than from a second query
 * keyed on the ids the first one returned. That second query could not begin
 * until the first had finished — it needed the ids — so it cost a full network
 * leg to count a number the same request could have carried.
 *
 * RLS is unchanged by this: an embedded resource is filtered by its own
 * policies exactly as a standalone select on it would be, so this sees the
 * same seats the separate query saw.
 *
 * No user id is needed to *ask*: which tables are visible is decided by RLS,
 * not by a filter here. The id only says which of them the viewer runs, which
 * is `summariseMyTables`' job, so this can start before the session check has
 * finished.
 */
export async function loadMyTables(): Promise<TableWithSeats[]> {
  const supabase = await createClient();

  const { data } = await supabase
    .from('poker_tables')
    .select('*, table_players(status)')
    .order('planned_start_at', { ascending: false })
    .limit(100);

  return (data ?? []) as TableWithSeats[];
}

export interface LeaderboardRow {
  key: string;
  display_name: string;
  user_id: string | null;
  games_played: number;
  net_agorot: number;
  total_buy_ins: number;
  winning_games: number;
  best_result_agorot: number;
}

export async function loadTableLeaderboard(
  tableId: string,
): Promise<{ scope: 'TABLE' | 'GROUP'; rows: LeaderboardRow[] }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('get_table_leaderboard', { p_table: tableId });
  if (error) return { scope: 'TABLE', rows: [] };
  const payload = data as { scope: 'TABLE' | 'GROUP'; rows: LeaderboardRow[] };
  return { scope: payload.scope, rows: payload.rows ?? [] };
}
