import 'server-only';

import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
import type { CompletedGameRecord } from '@/lib/domain/stats';
import type { GameResultRow, PokerTableRow, ProfilePrivacyRow } from '@/types/database';

export interface HistoryPage {
  games: CompletedGameRecord[];
  /** True when more completed games exist beyond this page. */
  hasMore: boolean;
}

/**
 * A player's completed games. `game_results` is the frozen source of truth —
 * nothing here recomputes money from the live ledger.
 */
export const loadPlayerHistory = cache(async function loadPlayerHistory(
  userId: string,
  limit = 50,
  offset = 0,
): Promise<HistoryPage> {

  const supabase = await createClient();
  const { data: results } = await supabase
    .from('game_results')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit);

  const rows = (results ?? []) as GameResultRow[];
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  if (page.length === 0) return { games: [], hasMore: false };

  const tableIds = [...new Set(page.map((r) => r.table_id))];
  const [{ data: tables }, { data: siblings }] = await Promise.all([
    supabase.from('poker_tables').select('*').in('id', tableIds),
    supabase
      .from('game_results')
      .select('table_id, total_paid_agorot')
      .in('table_id', tableIds),
  ]);

  const tableRows = (tables ?? []) as PokerTableRow[];
  const tableById = new Map(tableRows.map((t) => [t.id, t] as const));

  const groupIds = [...new Set(tableRows.map((t) => t.group_id).filter((id): id is string => !!id))];
  const { data: groups } = groupIds.length
    ? await supabase.from('poker_groups').select('id, name').in('id', groupIds)
    : { data: [] };
  const groupNameById = new Map((groups ?? []).map((g) => [g.id, g.name] as const));
  const aggregates = new Map<string, { players: number; pot: number }>();
  for (const row of siblings ?? []) {
    const current = aggregates.get(row.table_id) ?? { players: 0, pot: 0 };
    current.players += 1;
    current.pot += row.total_paid_agorot;
    aggregates.set(row.table_id, current);
  }

  const games: CompletedGameRecord[] = page.map((result) => {
    const table = tableById.get(result.table_id);
    const aggregate = aggregates.get(result.table_id) ?? { players: 0, pot: 0 };
    return {
      tableId: result.table_id,
      tableName: table?.name ?? 'שולחן',
      groupId: table?.group_id ?? null,
      groupName: table?.group_id ? (groupNameById.get(table.group_id) ?? null) : null,
      playedAt: table?.completed_at ?? result.created_at,
      buyInCount: result.buy_in_count,
      totalPaidAgorot: result.total_paid_agorot,
      chipsIssued: result.chips_issued,
      finalChips: result.final_chips,
      finalValueAgorot: result.final_value_agorot,
      profitLossAgorot: result.profit_loss_agorot,
      playerCount: aggregate.players,
      potAgorot: aggregate.pot,
    };
  });

  return { games, hasMore };
});

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
      updated_at: new Date().toISOString(),
    }
  );
}

export interface MyTableSummary {
  table: PokerTableRow;
  role: 'ADMIN' | 'PLAYER';
  playerCount: number;
}

/** Tables the user owns or holds a seat at, newest first. */
export async function loadMyTables(userId: string): Promise<MyTableSummary[]> {
  const supabase = await createClient();

  const { data: tables } = await supabase
    .from('poker_tables')
    .select('*')
    .order('planned_start_at', { ascending: false })
    .limit(100);

  const rows = (tables ?? []) as PokerTableRow[];
  if (rows.length === 0) return [];

  const { data: counts } = await supabase
    .from('table_players')
    .select('table_id, status')
    .in(
      'table_id',
      rows.map((t) => t.id),
    );

  const countByTable = new Map<string, number>();
  for (const row of counts ?? []) {
    if (row.status !== 'ACTIVE') continue;
    countByTable.set(row.table_id, (countByTable.get(row.table_id) ?? 0) + 1);
  }

  return rows.map((table) => ({
    table,
    role: table.owner_id === userId ? ('ADMIN' as const) : ('PLAYER' as const),
    playerCount: countByTable.get(table.id) ?? 0,
  }));
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
