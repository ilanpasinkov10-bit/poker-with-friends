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
import type { FriendRequestSummary, FriendSummary } from '@/lib/domain/friends';
import type { FriendInviteView, PendingInvitationView } from '@/lib/domain/invitations';
import type { TableListItem } from '@/components/tables/TablesBrowser';
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
    blind_levels: [],
    blind_status: 'DISABLED',
    blind_level_index: 0,
    blind_level_started_at: null,
    blind_paused_at: null,
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
        created_by: ADMIN_USER_ID,
        reverses_transaction_id: null,
      });
    }
  }

  // One cancelled entry, so the gallery shows the reversal event and the way
  // it removes the entry it undid.
  const last = rows[rows.length - 1];
  if (last) {
    step += 1;
    rows.push({
      id: `tx-reversal-${last.id}`,
      table_player_id: last.table_player_id,
      type: 'REVERSAL',
      amount_agorot: -ECONOMICS.buyInAgorot,
      chips: -ECONOMICS.chipsPerBuyIn,
      created_at: new Date(START + step * 7 * 60_000).toISOString(),
      created_by: ADMIN_USER_ID,
      reverses_transaction_id: last.id,
    });
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
  /** Which blind-timer situation to show, or nothing for a table without one. */
  blinds?: 'RUNNING' | 'URGENT' | 'BREAK' | 'PAUSED' | 'FINAL';
}

/**
 * A blind ladder anchored relative to now, so the gallery shows a clock that
 * is actually counting rather than one frozen at a fixed date.
 */
function blindFixture(
  blinds: 'RUNNING' | 'URGENT' | 'BREAK' | 'PAUSED' | 'FINAL' | undefined,
): Partial<PokerTableRow> {
  if (!blinds) return {};
  const levels = [
    { kind: 'BLINDS', small_blind: 5, big_blind: 10, minutes: 20 },
    { kind: 'BLINDS', small_blind: 10, big_blind: 25, minutes: 20 },
    { kind: 'BREAK', minutes: 10 },
    { kind: 'BLINDS', small_blind: 25, big_blind: 50, minutes: 20 },
  ];
  const minutesIn = { RUNNING: 8, URGENT: 19.3, BREAK: 41, PAUSED: 12, FINAL: 55 }[blinds];
  return {
    blind_levels: levels,
    blind_status: blinds === 'PAUSED' ? 'PAUSED' : 'RUNNING',
    blind_level_index: 0,
    blind_level_started_at: new Date(Date.now() - minutesIn * 60_000).toISOString(),
    blind_paused_at: blinds === 'PAUSED' ? new Date().toISOString() : null,
  };
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
    blinds,
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
    ...blindFixture(blinds),
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

/**
 * The name/badge pressure case: a long Hebrew name on the seat that also
 * carries the "מנהל שולחן" badge, which is exactly where the name used to be
 * truncated. Kept as a fixture so the gallery shows the worst case rather than
 * the comfortable one.
 */
export const LONG_NAME_PLAYERS: PlayerView[] = [
  seatToPlayerView({ ...SEATS[0]!, name: 'אילן פסינקוב' }),
  seatToPlayerView({ ...SEATS[1]!, name: 'ירדן בן-אברהם הכהן', isAdmin: false }),
  seatToPlayerView({ ...SEATS[3]!, name: 'אבישי רוזנצוויג', isGuest: true }),
];

/**
 * A player's table list, wide enough to be worth filtering: five statuses,
 * Hebrew and Latin names, names that share a word, and dates spread from today
 * back past thirty days so every date option selects something different.
 */
const TABLE_LIST_SPECS: {
  name: string;
  status: TableStatus;
  daysAgo: number;
  role: 'ADMIN' | 'PLAYER';
}[] = [
  { name: 'פוקר של יום חמישי', status: 'ACTIVE', daysAgo: 0, role: 'ADMIN' },
  { name: 'משחק חדש אצל שי', status: 'WAITING', daysAgo: 0, role: 'PLAYER' },
  { name: 'פוקר בשבת', status: 'COUNTING', daysAgo: 1, role: 'ADMIN' },
  { name: 'ערב פוקר בתל אביב', status: 'COMPLETED', daysAgo: 3, role: 'PLAYER' },
  { name: 'Home Game', status: 'COMPLETED', daysAgo: 12, role: 'ADMIN' },
  { name: 'טורניר החברים', status: 'CANCELLED', daysAgo: 20, role: 'PLAYER' },
  { name: 'פוקר של פעם', status: 'COMPLETED', daysAgo: 60, role: 'PLAYER' },
];

function daysBefore(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

/**
 * The lifecycle timestamps each section sorts by, set from how long ago the
 * game was — so the gallery shows a real ordering rather than an arbitrary one.
 */
function lifecycleTimes(status: TableStatus, daysAgo: number): Partial<PokerTableRow> {
  const at = (hoursAfterMidnight: number) =>
    new Date(Date.now() - daysAgo * 86_400_000 + hoursAfterMidnight * 3_600_000).toISOString();
  if (status === 'WAITING') return { planned_start_at: at(20) };
  if (status === 'ACTIVE') return { planned_start_at: at(20), started_at: at(20.2) };
  if (status === 'COUNTING') {
    return { planned_start_at: at(20), started_at: at(20.2), counting_started_at: at(23.5) };
  }
  if (status === 'COMPLETED') {
    return { planned_start_at: at(20), started_at: at(20.2), completed_at: at(23.9) };
  }
  return { planned_start_at: at(20), updated_at: at(21) };
}

function listItem(
  spec: { name: string; status: TableStatus; daysAgo: number; role: 'ADMIN' | 'PLAYER' },
  index: number,
): TableListItem {
  return {
    table: makeTable({
      id: `table-${index}`,
      name: spec.name,
      status: spec.status,
      game_date: daysBefore(spec.daysAgo),
      join_code: `PW${1000 + index}`,
      ...lifecycleTimes(spec.status, spec.daysAgo),
    }),
    role: spec.role,
    playerCount: 3 + (index % 4),
  };
}

export const MY_TABLES: TableListItem[] = TABLE_LIST_SPECS.map(listItem);

/**
 * The case the grouping exists for: two waiting, none active, one counting,
 * three finished, none cancelled — so only three headings should appear.
 */
export const MY_TABLES_SPARSE: TableListItem[] = [
  { name: 'חמישי הבא', status: 'WAITING' as TableStatus, daysAgo: -2, role: 'ADMIN' as const },
  { name: 'שבת אצל דנה', status: 'WAITING' as TableStatus, daysAgo: -5, role: 'PLAYER' as const },
  { name: 'סופרים ז׳יטונים', status: 'COUNTING' as TableStatus, daysAgo: 0, role: 'ADMIN' as const },
  { name: 'ערב פוקר בתל אביב', status: 'COMPLETED' as TableStatus, daysAgo: 3, role: 'PLAYER' as const },
  { name: 'Home Game', status: 'COMPLETED' as TableStatus, daysAgo: 12, role: 'ADMIN' as const },
  { name: 'פוקר של פעם', status: 'COMPLETED' as TableStatus, daysAgo: 60, role: 'PLAYER' as const },
].map(listItem);

/**
 * Friends, requests and search results — with a long Hebrew name and a Latin
 * one, because the row has to wrap on a 320px phone rather than truncate.
 */
export const FRIENDS: FriendSummary[] = [
  { userId: 'friend-1', displayName: 'שי', avatarUrl: AVATARS.shay },
  { userId: 'friend-2', displayName: 'מיכל כהן-ברששת', avatarUrl: AVATARS.michal },
  { userId: 'friend-3', displayName: 'Daniel', avatarUrl: null },
  { userId: 'friend-4', displayName: 'אבישי רוזנצוויג', avatarUrl: null },
];

/** One friend in each state the invite sheet can show, including a long name. */
export const FRIEND_INVITES: FriendInviteView[] = [
  { userId: 'friend-1', displayName: 'שי', avatarUrl: AVATARS.shay, state: 'CAN_INVITE' },
  {
    userId: 'friend-2',
    displayName: 'מיכל כהן-ברששת',
    avatarUrl: AVATARS.michal,
    state: 'INVITED',
  },
  { userId: 'friend-3', displayName: 'Daniel', avatarUrl: null, state: 'JOINED' },
  { userId: 'friend-4', displayName: 'אבישי רוזנצוויג', avatarUrl: null, state: 'DECLINED' },
];

/** Two invitations waiting on the home screen: a short name and a long one. */
export const PENDING_INVITATIONS: PendingInvitationView[] = [
  {
    id: 'inv-1',
    tableId: 'table-1',
    tableName: 'פוקר של יום חמישי',
    gameDate: '2026-08-28',
    buyInAgorot: 5000,
    inviterName: 'שי',
    inviterAvatarUrl: AVATARS.shay,
  },
  {
    id: 'inv-2',
    tableId: 'table-2',
    tableName: 'ערב פוקר גדול במיוחד אצל מיכל',
    gameDate: '2026-08-30',
    buyInAgorot: 12000,
    inviterName: 'מיכל כהן-ברששת',
    inviterAvatarUrl: AVATARS.michal,
  },
];

export const INCOMING_REQUESTS: FriendRequestSummary[] = [
  {
    userId: 'req-1',
    displayName: 'ירדן בן-אברהם הכהן',
    avatarUrl: null,
    requestedAt: '2026-08-26T09:00:00.000Z',
  },
  { userId: 'req-2', displayName: 'רועי', avatarUrl: null, requestedAt: '2026-08-25T18:30:00.000Z' },
];

export const OUTGOING_REQUESTS: FriendRequestSummary[] = [
  { userId: 'out-1', displayName: 'נועם', avatarUrl: null, requestedAt: '2026-08-24T20:00:00.000Z' },
];

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

// ---------------------------------------------------------------------------
// Share cards. Deliberately awkward: the longest names anyone might type, a
// table too big for one story, a game where nobody won, and mixed Hebrew and
// English on the same card.
// ---------------------------------------------------------------------------
const SHARE_TABLE = {
  game_date: '2026-08-28',
  started_at: '2026-08-28T18:04:00.000Z',
  completed_at: '2026-08-28T22:36:00.000Z',
  created_at: '2026-08-28T15:00:00.000Z',
};

function shareResult(
  name: string,
  net: number,
  buyIns: number,
  paid: number,
  index: number,
): GameResultRow {
  return {
    id: `share-${index}`,
    table_id: TABLE_ID,
    table_player_id: `share-seat-${index}`,
    user_id: `share-user-${index}`,
    display_name: name,
    buy_in_count: buyIns,
    total_paid_agorot: paid,
    chips_issued: buyIns * 500,
    final_chips: 500,
    final_value_agorot: paid + net,
    profit_loss_agorot: net,
    revision: 1,
    created_at: '2026-08-28T22:36:00.000Z',
    updated_at: '2026-08-28T22:36:00.000Z',
  };
}

const SHARE_NIGHT: GameResultRow[] = [
  ['אילן', 54_000, 2, 10_000],
  ['ליאור', 22_000, 1, 5_000],
  ['שי', 9_000, 2, 10_000],
  ['Andy', -15_000, 3, 15_000],
  ['דניאל', -30_000, 5, 25_000],
  ['Tom', -40_000, 4, 20_000],
].map(([n, net, b, p], i) => shareResult(n as string, net as number, b as number, p as number, i));

const SHARE_LONG_NAMES: GameResultRow[] = [
  ['ירדן בן-אברהם הכהן מירושלים', 41_000, 3, 15_000],
  ['Alexander Constantinopoulos', 12_000, 1, 5_000],
  ['אבישי רוזנצוויג', 0, 2, 10_000],
  ['Christopher Wallace-Fitzgerald', -18_000, 4, 20_000],
  ['מיכל', -35_000, 6, 30_000],
].map(([n, net, b, p], i) => shareResult(n as string, net as number, b as number, p as number, i));

const SHARE_BIG_TABLE: GameResultRow[] = Array.from({ length: 14 }, (_, i) =>
  shareResult(
    i % 2 === 0 ? `שחקן מספר ${i + 1}` : `Player ${i + 1}`,
    (7 - i) * 6_000,
    1 + (i % 4),
    (1 + (i % 4)) * 5_000,
    i,
  ),
);

const SHARE_NOBODY_WON: GameResultRow[] = [
  ['אילן', 0, 1, 5_000],
  ['ליאור', 0, 1, 5_000],
].map(([n, net, b, p], i) => shareResult(n as string, net as number, b as number, p as number, i));

export const SHARE_CARD_CASES = [
  { label: 'סיכום קצר', kind: 'QUICK' as const, table: SHARE_TABLE, results: SHARE_NIGHT },
  { label: 'תוצאות מלאות', kind: 'FULL' as const, table: SHARE_TABLE, results: SHARE_NIGHT },
  { label: 'שמות ארוכים · מעורב עברית ואנגלית', kind: 'FULL' as const, table: SHARE_TABLE, results: SHARE_LONG_NAMES },
  { label: 'שולחן גדול — 14 שחקנים', kind: 'FULL' as const, table: SHARE_TABLE, results: SHARE_BIG_TABLE },
  { label: 'שני שחקנים, אף אחד לא ברווח', kind: 'QUICK' as const, table: SHARE_TABLE, results: SHARE_NOBODY_WON },
  {
    label: 'משחק קצר בלי חותמות זמן',
    kind: 'QUICK' as const,
    table: { ...SHARE_TABLE, started_at: null, completed_at: null },
    results: SHARE_NIGHT.slice(0, 3),
  },
];
