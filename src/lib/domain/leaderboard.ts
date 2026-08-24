/**
 * Shapes and constants shared by the server fetchers and the client
 * components. Kept free of `server-only` so a client component can import the
 * types and the period list without pulling in the data layer.
 */

export type LeaderboardPeriod = 'ALL' | 'MONTH' | 'YEAR';

export const LEADERBOARD_PERIODS: { value: LeaderboardPeriod; label: string }[] = [
  { value: 'ALL', label: 'הכל' },
  { value: 'MONTH', label: 'החודש' },
  { value: 'YEAR', label: 'השנה' },
];

/** Guards the query-string value before it is passed to the RPC. */
export function isLeaderboardPeriod(value: string | undefined): value is LeaderboardPeriod {
  return value === 'ALL' || value === 'MONTH' || value === 'YEAR';
}

export interface LeaderboardEntry {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  games_played: number;
  net_agorot: number;
  total_buy_ins: number;
  total_invested_agorot: number;
  best_result_agorot: number;
  winning_games: number;
  average_agorot: number;
}

export interface PublicProfileStats {
  games_played: number;
  net_agorot: number;
  total_buy_ins: number;
  total_invested_agorot: number;
  winning_games: number;
  best_result_agorot: number;
  average_agorot: number;
}

export interface PublicProfileGame {
  table_name: string;
  completed_at: string;
  profit_loss_agorot: number;
  buy_in_count: number;
  total_paid_agorot: number;
}

export interface PublicProfile {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  is_guest: boolean;
  is_self: boolean;
  member_since: string | null;
  stats_visible: boolean;
  stats: PublicProfileStats | null;
  history_visible: boolean;
  recent_games: PublicProfileGame[];
}
