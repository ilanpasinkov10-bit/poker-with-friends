/**
 * Static fixture data for the development-only component gallery.
 *
 * Nothing here talks to Supabase, and nothing here is imported by the real
 * application — this module exists purely so /dev/preview can render the real
 * components without a backend.
 *
 * Where a figure could be computed, it is: the final values and the settlement
 * plan below come from the same `computeFinalResults` / `computeSettlement`
 * functions the production code uses, so the gallery shows real arithmetic
 * rather than numbers someone typed in.
 */
import { computeFinalResults, type PlayerLedgerTotals } from '@/lib/domain/chips';
import { buildTableActivity } from '@/lib/domain/activity';
import { computePotTotals, summariseCashOut } from '@/lib/domain/participation';
import { computeSettlement } from '@/lib/domain/settlement';
import type { CompletedGameRecord } from '@/lib/domain/stats';
import type { PendingRequestView, PlayerView, TableViewModel } from '@/lib/data/table';
import type { LeaderboardRow } from '@/lib/data/profile';
import type {
  GameResultRow,
  PokerTableRow,
  ProfilePrivacyRow,
  SettlementRow,
  TableStatus,
} from '@/types/database';

export const ECONOMICS = { buyInAgorot: 5_000, chipsPerBuyIn: 500 };

const TABLE_ID = '11111111-1111-4111-8111-111111111111';
const ADMIN_USER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PLAYER_USER_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

/** A soft gradient stands in for an uploaded profile photo. */
function fixtureAvatar(from: string, to: string): string {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96">` +
    `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">` +
    `<stop offset="0%" stop-color="${from}"/><stop offset="100%" stop-color="${to}"/>` +
    `</linearGradient></defs><rect width="96" height="96" fill="url(#g)"/></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

export const AVATARS = {
  ilan: fixtureAvatar('#7c6cf6', '#34d399'),
  shay: fixtureAvatar('#f5b544', '#f87191'),
  michal: fixtureAvatar('#34d399', '#2dd4bf'),
};

interface SeatSpec {
  id: string;
  name: string;
  buyIns: number;
  finalChips: number;
  userId: string;
  avatarUrl: string | null;
  isAdmin: boolean;
  isGuest?: boolean;
}

/**
 * Six players, twenty entries: 1,000₪ in the pot and 10,000 chips on the
 * table. The final counts sum to exactly 10,000, so the game balances.
 */
const SEATS: SeatSpec[] = [
  { id: 'seat-ilan', name: 'אילן', buyIns: 4, finalChips: 3000, userId: ADMIN_USER_ID, avatarUrl: AVATARS.ilan, isAdmin: true },
  { id: 'seat-shay', name: 'שי', buyIns: 3, finalChips: 2000, userId: 'user-shay', avatarUrl: AVATARS.shay, isAdmin: false },
  { id: 'seat-daniel', name: 'דניאל', buyIns: 5, finalChips: 1700, userId: PLAYER_USER_ID, avatarUrl: null, isAdmin: false },
  { id: 'seat-roy', name: 'רועי', buyIns: 3, finalChips: 800, userId: 'user-roy', avatarUrl: null, isAdmin: false, isGuest: true },
  { id: 'seat-michal', name: 'מיכל', buyIns: 2, finalChips: 1500, userId: 'user-michal', avatarUrl: AVATARS.michal, isAdmin: false },
  { id: 'seat-noam', name: 'נועם', buyIns: 3, finalChips: 1000, userId: 'user-noam', avatarUrl: null, isAdmin: false },
];

const LEDGER: PlayerLedgerTotals[] = SEATS.map((seat) => ({
  id: seat.id,
  buyInCount: seat.buyIns,
  totalPaidAgorot: seat.buyIns * ECONOMICS.buyInAgorot,
  chipsIssued: seat.buyIns * ECONOMICS.chipsPerBuyIn,
  finalChips: seat.finalChips,
}));

/** Real arithmetic, not hand-written numbers. */
export const FINAL_RESULTS = computeFinalResults(LEDGER, ECONOMICS);
export const TRANSFERS = computeSettlement(
  FINAL_RESULTS.map((row) => ({ id: row.id, amountAgorot: row.profitLossAgorot })),
);

function seatToPlayerView(
  seat: SeatSpec,
  overrides: Partial<PlayerView> = {},
): PlayerView {
  const base: PlayerView = {
    id: seat.id,
    userId: seat.userId,
    displayName: seat.name,
    status: 'ACTIVE',
    isAdmin: seat.isAdmin,
    avatarUrl: seat.avatarUrl,
    isGuest: seat.isGuest ?? false,
    joinedAt: '2026-08-23T18:05:00.000Z',
    leftAt: null,
    buyInCount: seat.buyIns,
    totalPaidAgorot: seat.buyIns * ECONOMICS.buyInAgorot,
    chipsIssued: seat.buyIns * ECONOMICS.chipsPerBuyIn,
    submittedChips: null,
    approvedChips: null,
    hasFinancials: true,
    cashOut: null,
    lastReversibleTxId: `tx-${seat.id}`,
    ...overrides,
  };
  // Derived exactly as the real loader derives it, so the gallery cannot show
  // a cash-out summary the production rules would refuse.
  return { ...base, cashOut: summariseCashOut(base, ECONOMICS) };
}

export const PLAYERS: PlayerView[] = SEATS.map((seat) => seatToPlayerView(seat));

/**
 * Seats that cashed out mid-game, for the "עזבו את השולחן" section: one player
 * down on the night, one up, and one whose leave never completed — the count is
 * only submitted, so no summary may be shown.
 */
export const LEFT_PLAYERS: PlayerView[] = [
  seatToPlayerView(SEATS[3]!, {
    leftAt: '2026-08-23T20:55:00.000Z',
    submittedChips: 1_200,
    approvedChips: 1_200,
  }),
  seatToPlayerView(SEATS[5]!, {
    leftAt: '2026-08-23T21:10:00.000Z',
    submittedChips: 2_400,
    approvedChips: 2_400,
  }),
  seatToPlayerView(SEATS[4]!, {
    leftAt: '2026-08-23T21:18:00.000Z',
    submittedChips: 900,
    approvedChips: null,
  }),
];

/** The seats still playing once LEFT_PLAYERS have gone. */
export const SEATED_PLAYERS: PlayerView[] = PLAYERS.filter(
  (p) => !LEFT_PLAYERS.some((left) => left.id === p.id),
);

/** Someone waiting for the admin to let them in. */
export const PENDING_PLAYER: PlayerView = {
  ...seatToPlayerView({
    id: 'seat-tamar',
    name: 'תמר',
    buyIns: 0,
    finalChips: 0,
    userId: 'user-tamar',
    avatarUrl: null,
    isAdmin: false,
  }),
  status: 'PENDING',
  hasFinancials: false,
  lastReversibleTxId: null,
};

export const PENDING_REBUYS: PendingRequestView[] = [
  {
    id: 'req-daniel',
    tablePlayerId: 'seat-daniel',
    displayName: 'דניאל',
    avatarUrl: null,
    requestedAt: '2026-08-23T20:41:00.000Z',
    buyInCount: 5,
  },
  {
    id: 'req-noam',
    tablePlayerId: 'seat-noam',
    displayName: 'נועם',
    avatarUrl: null,
    requestedAt: '2026-08-23T20:44:00.000Z',
    buyInCount: 3,
  },
];

/** Ends 1:42:36 from now, so the live countdown reads like the real thing. */
function plannedEnd(): string {
  return new Date(Date.now() + 6_156_000).toISOString();
}

export function makeTable(overrides: Partial<PokerTableRow> = {}): PokerTableRow {
  return {
    id: TABLE_ID,
    group_id: 'group-hevre',
    owner_id: ADMIN_USER_ID,
    name: 'פוקר של יום חמישי',
    join_code: 'A7K92',
    game_date: '2026-08-23',
    planned_start_at: '2026-08-23T18:00:00.000Z',
    planned_end_at: plannedEnd(),
    buy_in_agorot: ECONOMICS.buyInAgorot,
    chips_per_buy_in: ECONOMICS.chipsPerBuyIn,
    max_buy_ins: 6,
    join_mode: 'AUTO_JOIN',
    player_visibility: 'OPEN',
    counting_mode: 'ADMIN_COUNT',
    status: 'ACTIVE',
    started_at: '2026-08-23T18:04:00.000Z',
    counting_started_at: null,
    completed_at: null,
    ending_soon_notified_at: null,
    created_at: '2026-08-23T15:00:00.000Z',
    updated_at: '2026-08-23T18:04:00.000Z',
    ...overrides,
  };
}

function totalsFor(players: PlayerView[], seated = players): TableViewModel['totals'] {
  const effective = (player: PlayerView) => player.approvedChips ?? player.submittedChips;
  const pot = computePotTotals(players);
  return {
    // The roster is the seated players; every money figure covers everyone
    // whose stake is in the game. Same split as the real loader.
    playerCount: seated.length,
    buyInCount: players.reduce((sum, p) => sum + p.buyInCount, 0),
    potAgorot: pot.potAgorot,
    chipsIssued: players.reduce((sum, p) => sum + p.chipsIssued, 0),
    chipsCounted: players.reduce((sum, p) => sum + (effective(p) ?? 0), 0),
    playersWithCount: players.filter((p) => effective(p) !== null).length,
    cashedOutAgorot: pot.cashedOutAgorot,
    activePotAgorot: pot.activePotAgorot,
    activeChips: pot.activeChips,
  };
}

/**
 * A ledger that matches the seats, so the activity feed in the gallery is
 * built by the real `buildTableActivity` rather than hand-written lines.
 */
function ledgerFor(players: PlayerView[]) {
  const START = Date.parse('2026-08-23T18:05:00.000Z');
  const rows = [];
  let step = 0;
  for (const player of players) {
    for (let i = 0; i < player.buyInCount; i += 1) {
      step += 1;
      rows.push({
        id: `tx-${player.id}-${i}`,
        table_player_id: player.id,
        type: 'BUY_IN',
        amount_agorot: ECONOMICS.buyInAgorot,
        chips: ECONOMICS.chipsPerBuyIn,
        created_at: new Date(START + step * 7 * 60_000).toISOString(),
        reverses_transaction_id: null,
      });
    }
  }
  return rows;
}

export interface ModelOptions {
  /** Seats that cashed out mid-game. */
  leftPlayers?: PlayerView[];
  status?: TableStatus;
  asAdmin?: boolean;
  /** Which seat the viewer occupies, or null for an admin who is not playing. */
  viewerSeatId?: string | null;
  players?: PlayerView[];
  pendingPlayers?: PlayerView[];
  pendingRequests?: PendingRequestView[];
  myPendingRequestId?: string | null;
  isAnonymous?: boolean;
  visibility?: 'OPEN' | 'PRIVATE';
  countingMode?: 'ADMIN_COUNT' | 'SELF_COUNT';
  results?: GameResultRow[];
  settlements?: SettlementRow[];
}

export function makeModel(options: ModelOptions = {}): TableViewModel {
  const {
    status = 'ACTIVE',
    asAdmin = true,
    viewerSeatId = asAdmin ? 'seat-ilan' : 'seat-daniel',
    players = PLAYERS,
    leftPlayers = [],
    pendingPlayers = [],
    pendingRequests = [],
    myPendingRequestId = null,
    isAnonymous = false,
    visibility = 'OPEN',
    countingMode = 'ADMIN_COUNT',
    results = [],
    settlements = [],
  } = options;

  const table = makeTable({
    status,
    player_visibility: visibility,
    counting_mode: countingMode,
    // A table that never started has no start timestamp — which is exactly
    // what gates the delete action.
    started_at: status === 'WAITING' ? null : '2026-08-23T18:04:00.000Z',
    counting_started_at: status === 'COUNTING' ? '2026-08-23T21:30:00.000Z' : null,
    completed_at: status === 'COMPLETED' ? '2026-08-23T21:55:00.000Z' : null,
  });

  const viewer = players.find((p) => p.id === viewerSeatId) ?? null;

  const participants = [...players, ...leftPlayers];

  return {
    table,
    viewer: {
      userId: asAdmin ? ADMIN_USER_ID : (viewer?.userId ?? PLAYER_USER_ID),
      isAnonymous,
      isAdmin: asAdmin,
      player: viewer,
      myPendingRequestId,
      soundsEnabled: true,
    },
    players,
    leftPlayers,
    participants,
    pendingPlayers,
    pendingRequests,
    totals: totalsFor(participants, players),
    recentActivity: buildTableActivity(participants, ledgerFor(participants)),
    canSeeEveryonesMoney: asAdmin || visibility === 'OPEN',
    results,
    settlements,
  };
}

/** Players with their final counts recorded, for the counting screens. */
export function playersWithCounts(mode: 'approved' | 'submitted' | 'partial' | 'mismatch') {
  return SEATS.map((seat, index) => {
    const base = seatToPlayerView(seat);
    if (mode === 'partial' && index >= 4) return base;

    const counted =
      mode === 'mismatch' && index === 2 ? seat.finalChips - 100 : seat.finalChips;

    return {
      ...base,
      submittedChips: counted,
      approvedChips: mode === 'submitted' ? null : counted,
    };
  });
}

export const RESULT_ROWS: GameResultRow[] = FINAL_RESULTS.map((row) => {
  const seat = SEATS.find((s) => s.id === row.id)!;
  return {
    id: `result-${row.id}`,
    table_id: TABLE_ID,
    table_player_id: row.id,
    user_id: seat.userId,
    display_name: seat.name,
    buy_in_count: row.buyInCount,
    total_paid_agorot: row.totalPaidAgorot,
    chips_issued: row.chipsIssued,
    final_chips: row.finalChips,
    final_value_agorot: row.finalValueAgorot,
    profit_loss_agorot: row.profitLossAgorot,
    revision: 1,
    created_at: '2026-08-23T21:55:00.000Z',
    updated_at: '2026-08-23T21:55:00.000Z',
  };
});

export const SETTLEMENT_ROWS: SettlementRow[] = TRANSFERS.map((transfer, index) => ({
  id: `settlement-${index}`,
  table_id: TABLE_ID,
  from_table_player_id: transfer.from,
  to_table_player_id: transfer.to,
  amount_agorot: transfer.amountAgorot,
  is_paid: index === 0,
  created_at: '2026-08-23T21:55:00.000Z',
}));

// ---------------------------------------------------------------------------
// Profile fixtures
// ---------------------------------------------------------------------------

const GAME_RESULTS_ILS = [
  50, -30, 100, 20, -75, 145, -40, 60, 210, -110, 35, 90, -55, 130,
];

/** Fourteen completed nights across two recurring circles. */
export const HISTORY: CompletedGameRecord[] = GAME_RESULTS_ILS.map((profitIls, index) => {
  const inMainGroup = index % 3 !== 2;
  const buyInCount = 2 + (index % 4);
  const totalPaidAgorot = buyInCount * ECONOMICS.buyInAgorot;
  const profitLossAgorot = profitIls * 100;
  const day = String(3 + index).padStart(2, '0');

  return {
    tableId: `table-${index}`,
    tableName: inMainGroup ? `פוקר של יום חמישי #${index + 1}` : `ערב אצל רועי #${index + 1}`,
    groupId: inMainGroup ? 'group-hevre' : 'group-roy',
    groupName: inMainGroup ? 'החבר׳ה מהשכונה' : 'ערב אצל רועי',
    playedAt: `2026-${String(1 + Math.floor(index / 6)).padStart(2, '0')}-${day}T19:30:00.000Z`,
    buyInCount,
    totalPaidAgorot,
    chipsIssued: buyInCount * ECONOMICS.chipsPerBuyIn,
    finalChips: Math.max(0, buyInCount * ECONOMICS.chipsPerBuyIn + profitIls * 10),
    finalValueAgorot: totalPaidAgorot + profitLossAgorot,
    profitLossAgorot,
    playerCount: 5 + (index % 3),
    potAgorot: (18 + index) * ECONOMICS.buyInAgorot,
  };
});

export const PRIVACY_SETTINGS: ProfilePrivacyRow = {
  profile_id: ADMIN_USER_ID,
  share_stats_with_table_members: true,
  share_detailed_history: false,
  show_on_leaderboard: false,
  push_notifications_enabled: true,
  game_sounds_enabled: true,
  updated_at: '2026-08-23T10:00:00.000Z',
};

export const LEADERBOARD: LeaderboardRow[] = [
  { key: 'user-shay', display_name: 'שי', user_id: 'user-shay', games_played: 22, net_agorot: 87_000, total_buy_ins: 61, winning_games: 14, best_result_agorot: 24_000 },
  { key: ADMIN_USER_ID, display_name: 'אילן', user_id: ADMIN_USER_ID, games_played: 24, net_agorot: 43_000, total_buy_ins: 68, winning_games: 14, best_result_agorot: 21_000 },
  { key: 'user-daniel', display_name: 'דניאל', user_id: 'user-daniel', games_played: 19, net_agorot: 12_000, total_buy_ins: 58, winning_games: 9, best_result_agorot: 16_500 },
  { key: 'user-michal', display_name: 'מיכל', user_id: 'user-michal', games_played: 11, net_agorot: 4_500, total_buy_ins: 24, winning_games: 6, best_result_agorot: 9_000 },
  { key: 'user-roy', display_name: 'רועי', user_id: 'user-roy', games_played: 20, net_agorot: -25_000, total_buy_ins: 72, winning_games: 7, best_result_agorot: 11_000 },
  { key: 'user-noam', display_name: 'נועם', user_id: 'user-noam', games_played: 8, net_agorot: -31_500, total_buy_ins: 33, winning_games: 2, best_result_agorot: 3_000 },
];

import type { LeaderboardEntry } from '@/lib/domain/leaderboard';

/** Global ranking fixture — registered users only, guests absent by design. */
export const GLOBAL_LEADERBOARD: LeaderboardEntry[] = [
  { user_id: 'user-shay', display_name: 'שי', avatar_url: AVATARS.shay, games_played: 22, net_agorot: 425_000, total_buy_ins: 61, total_invested_agorot: 305_000, best_result_agorot: 24_000, winning_games: 14, average_agorot: 19_318 },
  { user_id: 'user-ilan', display_name: 'אילן', avatar_url: AVATARS.ilan, games_played: 24, net_agorot: 43_000, total_buy_ins: 68, total_invested_agorot: 340_000, best_result_agorot: 21_000, winning_games: 14, average_agorot: 1_791 },
  { user_id: 'user-michal', display_name: 'מיכל', avatar_url: AVATARS.michal, games_played: 11, net_agorot: 0, total_buy_ins: 24, total_invested_agorot: 120_000, best_result_agorot: 9_000, winning_games: 5, average_agorot: 0 },
  { user_id: 'user-daniel', display_name: 'דניאל', avatar_url: null, games_played: 19, net_agorot: -12_000, total_buy_ins: 58, total_invested_agorot: 290_000, best_result_agorot: 16_500, winning_games: 9, average_agorot: -631 },
  { user_id: 'user-noam', display_name: 'נועם', avatar_url: null, games_played: 8, net_agorot: -31_500, total_buy_ins: 33, total_invested_agorot: 165_000, best_result_agorot: 3_000, winning_games: 2, average_agorot: -3_937 },
];

export const JOIN_PREVIEW = {
  name: 'פוקר של יום חמישי',
  admin_name: 'אילן',
  status: 'WAITING' as TableStatus,
  planned_end_at: '2026-08-23T22:30:00.000Z',
  buy_in_agorot: ECONOMICS.buyInAgorot,
  chips_per_buy_in: ECONOMICS.chipsPerBuyIn,
  player_count: 5,
};

export const PROFILE = {
  displayName: 'אילן',
  avatarUrl: AVATARS.ilan,
};
