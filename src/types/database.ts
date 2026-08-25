/**
 * Hand-maintained mirror of supabase/migrations. Keep in sync when the schema
 * changes (or regenerate with `supabase gen types typescript`).
 */

export type TableStatus = 'WAITING' | 'ACTIVE' | 'COUNTING' | 'COMPLETED' | 'CANCELLED';
export type JoinMode = 'AUTO_JOIN' | 'ADMIN_APPROVAL';
export type PlayerVisibility = 'OPEN' | 'PRIVATE';
export type CountingMode = 'ADMIN_COUNT' | 'SELF_COUNT';
export type PlayerStatus = 'PENDING' | 'ACTIVE' | 'REJECTED' | 'REMOVED';
export type BuyinType = 'INITIAL_BUYIN' | 'REBUY' | 'REVERSAL';
export type RequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';

export type ProfileRow = {
  id: string;
  display_name: string;
  avatar_url: string | null;
  is_guest: boolean;
  created_at: string;
  updated_at: string;
}

export type ProfilePrivacyRow = {
  profile_id: string;
  share_stats_with_table_members: boolean;
  share_detailed_history: boolean;
  /** Whether this player appears on the global leaderboard. */
  show_on_leaderboard: boolean;
  /** Whether table events may be pushed to this player's devices. */
  push_notifications_enabled: boolean;
  /** Whether the open app plays event sounds. Independent of push. */
  game_sounds_enabled: boolean;
  updated_at: string;
}

/** One browser or device that has accepted push permission. */
export type PushSubscriptionRow = {
  id: string;
  profile_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  user_agent: string | null;
  created_at: string;
  last_seen_at: string;
}

export type PokerGroupRow = {
  id: string;
  name: string;
  owner_id: string;
  created_at: string;
  updated_at: string;
}

export type PokerTableRow = {
  id: string;
  group_id: string | null;
  owner_id: string;
  name: string;
  join_code: string;
  game_date: string;
  planned_start_at: string;
  planned_end_at: string;
  buy_in_agorot: number;
  chips_per_buy_in: number;
  max_buy_ins: number;
  join_mode: JoinMode;
  player_visibility: PlayerVisibility;
  counting_mode: CountingMode;
  status: TableStatus;
  started_at: string | null;
  counting_started_at: string | null;
  completed_at: string | null;
  /** Set once the "one hour to go" reminder has been sent, so it fires once. */
  ending_soon_notified_at: string | null;
  created_at: string;
  updated_at: string;
}

export type TablePlayerRow = {
  id: string;
  table_id: string;
  user_id: string | null;
  display_name: string;
  status: PlayerStatus;
  is_admin: boolean;
  joined_at: string;
  approved_at: string | null;
  /** Set when the player cashed out of a game in progress. */
  left_at: string | null;
  created_at: string;
  updated_at: string;
}

export type RebuyRequestRow = {
  id: string;
  table_id: string;
  table_player_id: string;
  status: RequestStatus;
  requested_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
  created_at: string;
  updated_at: string;
}

export type BuyinTransactionRow = {
  id: string;
  table_id: string;
  table_player_id: string;
  type: BuyinType;
  amount_agorot: number;
  chips: number;
  request_id: string | null;
  reverses_transaction_id: string | null;
  note: string | null;
  created_by: string | null;
  created_at: string;
}

export type ChipCountRow = {
  id: string;
  table_id: string;
  table_player_id: string;
  submitted_chips: number | null;
  submitted_by: string | null;
  submitted_at: string | null;
  approved_chips: number | null;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
}

export type GameResultRow = {
  id: string;
  table_id: string;
  table_player_id: string;
  user_id: string | null;
  display_name: string;
  buy_in_count: number;
  total_paid_agorot: number;
  chips_issued: number;
  final_chips: number;
  final_value_agorot: number;
  profit_loss_agorot: number;
  revision: number;
  created_at: string;
  updated_at: string;
}

export type SettlementRow = {
  id: string;
  table_id: string;
  from_table_player_id: string;
  to_table_player_id: string;
  amount_agorot: number;
  is_paid: boolean;
  created_at: string;
}

export type GameCorrectionRow = {
  id: string;
  table_id: string;
  performed_by: string | null;
  reason: string;
  previous_snapshot: unknown;
  new_snapshot: unknown;
  created_at: string;
}

export type SavedPlayerRow = {
  id: string;
  owner_id: string;
  display_name: string;
  linked_user_id: string | null;
  created_at: string;
}

export type TablePlayerTotalsRow = {
  table_player_id: string;
  table_id: string;
  total_paid_agorot: number;
  chips_issued: number;
  buy_in_count: number;
}

export type FinalRowResult = {
  table_player_id: string;
  display_name: string;
  user_id: string | null;
  buy_in_count: number;
  total_paid_agorot: number;
  chips_issued: number;
  final_chips: number;
  has_count: boolean;
  final_value_agorot: number;
  profit_loss_agorot: number;
}

type ReadOnly<T> = { Row: T; Insert: never; Update: never; Relationships: [] };
type Writable<T, I = Partial<T>, U = Partial<T>> = {
  Row: T;
  Insert: I;
  Update: U;
  Relationships: [];
};

export type Database = {
  public: {
    Tables: {
      profiles: Writable<ProfileRow, Partial<ProfileRow>, Pick<Partial<ProfileRow>, 'display_name' | 'avatar_url'>>;
      profile_privacy_settings: Writable<ProfilePrivacyRow>;
      push_subscriptions: Writable<PushSubscriptionRow>;
      poker_groups: ReadOnly<PokerGroupRow>;
      poker_tables: Writable<PokerTableRow>;
      table_players: ReadOnly<TablePlayerRow>;
      rebuy_requests: ReadOnly<RebuyRequestRow>;
      buyin_transactions: ReadOnly<BuyinTransactionRow>;
      chip_count_submissions: ReadOnly<ChipCountRow>;
      game_results: ReadOnly<GameResultRow>;
      settlements: ReadOnly<SettlementRow>;
      game_corrections: ReadOnly<GameCorrectionRow>;
      saved_players: Writable<SavedPlayerRow>;
    };
    Views: {
      table_player_totals: ReadOnly<TablePlayerTotalsRow>;
    };
    Functions: {
      get_table_preview: { Args: { p_code: string }; Returns: unknown };
      join_table: { Args: { p_code: string; p_display_name: string }; Returns: unknown };
      create_poker_table: {
        Args: {
          p_name: string;
          p_game_date: string;
          p_planned_start_at: string;
          p_planned_end_at: string;
          p_buy_in_agorot: number;
          p_chips_per_buy_in: number;
          p_max_buy_ins: number;
          p_join_mode: string;
          p_player_visibility: string;
          p_counting_mode: string;
          p_admin_plays: boolean;
          p_group_id?: string | null;
        };
        Returns: PokerTableRow;
      };
      resolve_join_request: { Args: { p_table_player: string; p_approve: boolean }; Returns: undefined };
      remove_player: { Args: { p_table_player: string }; Returns: undefined };
      request_rebuy: { Args: { p_table_player: string }; Returns: string };
      cancel_rebuy_request: { Args: { p_request: string }; Returns: undefined };
      resolve_rebuy_request: { Args: { p_request: string; p_approve: boolean }; Returns: undefined };
      admin_add_buyin: { Args: { p_table_player: string }; Returns: undefined };
      reverse_buyin: { Args: { p_transaction: string; p_note?: string | null }; Returns: undefined };
      set_table_status: { Args: { p_table: string; p_status: string }; Returns: undefined };
      extend_game: {
        Args: { p_table: string; p_minutes?: number | null; p_new_end?: string | null };
        Returns: string;
      };
      update_table_settings: {
        Args: {
          p_table: string;
          p_name?: string | null;
          p_max_buy_ins?: number | null;
          p_join_mode?: string | null;
          p_player_visibility?: string | null;
          p_counting_mode?: string | null;
        };
        Returns: undefined;
      };
      submit_chip_count: { Args: { p_table_player: string; p_chips: number }; Returns: undefined };
      admin_set_chip_count: { Args: { p_table_player: string; p_chips: number }; Returns: undefined };
      approve_all_chip_counts: { Args: { p_table: string }; Returns: number };
      table_final_preview: { Args: { p_table: string }; Returns: unknown };
      compute_final_rows: {
        Args: { p_table: string; p_require_approved: boolean };
        Returns: FinalRowResult[];
      };
      finalize_game: { Args: { p_table: string; p_settlements: unknown }; Returns: undefined };
      correct_game_results: {
        Args: { p_table: string; p_counts: unknown; p_settlements: unknown; p_reason: string };
        Returns: undefined;
      };
      mark_settlement_paid: { Args: { p_settlement: string; p_paid: boolean }; Returns: undefined };
      get_or_create_poker_group: { Args: { p_name: string }; Returns: string };
      delete_poker_table: { Args: { p_table: string }; Returns: undefined };
      leave_table: { Args: { p_table_player: string; p_chips: number }; Returns: undefined };
      get_global_leaderboard: {
        Args: { p_period?: string; p_limit?: number };
        Returns: unknown;
      };
      get_public_profile: { Args: { p_user: string }; Returns: unknown };
      get_table_leaderboard: { Args: { p_table: string }; Returns: unknown };
      get_shared_profile_stats: { Args: { p_user: string }; Returns: unknown };
    };
    Enums: {
      table_status: TableStatus;
      join_mode: JoinMode;
      player_visibility: PlayerVisibility;
      counting_mode: CountingMode;
      player_status: PlayerStatus;
      buyin_type: BuyinType;
      request_status: RequestStatus;
    };
    CompositeTypes: Record<string, never>;
  };
}
