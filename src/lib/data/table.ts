import 'server-only';

import { notFound } from 'next/navigation';
import { buildTableActivity } from '@/lib/domain/activity';
import type { TableEvent } from '@/lib/domain/events';
import {
  hasLeftTable,
  isStillSeated,
  normaliseLeftAt,
  computePotTotals,
  summariseCashOut,
  type CashOutSummary,
} from '@/lib/domain/participation';
import { createClient } from '@/lib/supabase/server';
import type {
  BuyinTransactionRow,
  ChipCountRow,
  GameResultRow,
  PokerTableRow,
  RebuyRequestRow,
  SettlementRow,
  TablePlayerRow,
} from '@/types/database';

export interface PlayerView {
  id: string;
  userId: string | null;
  displayName: string;
  status: TablePlayerRow['status'];
  isAdmin: boolean;
  avatarUrl: string | null;
  /** True for a player using an anonymous (guest) session. */
  isGuest: boolean;
  /** Added by the admin, by name. No account, no session, this table only. */
  isManual: boolean;
  joinedAt: string;
  /** Set when the player cashed out of a game in progress. */
  leftAt: string | null;
  buyInCount: number;
  totalPaidAgorot: number;
  chipsIssued: number;
  /** Null until this player has a chip count recorded. */
  submittedChips: number | null;
  approvedChips: number | null;
  hasFinancials: boolean;
  /**
   * Set only for a player whose leave transaction completed: the chips they
   * declared, what those are worth, and their realised result. Null for seated
   * players, failed leave attempts and counts still awaiting approval.
   */
  cashOut: CashOutSummary | null;
  /** Most recent buy-in that has not been reversed — what "undo" would target. */
  lastReversibleTxId: string | null;
}

export interface PendingRequestView {
  id: string;
  tablePlayerId: string;
  displayName: string;
  avatarUrl: string | null;
  requestedAt: string;
  buyInCount: number;
}

export interface TableViewModel {
  table: PokerTableRow;
  viewer: {
    userId: string;
    isAnonymous: boolean;
    isAdmin: boolean;
    player: PlayerView | null;
    myPendingRequestId: string | null;
    /** This player's own switch for in-app event sounds. */
    soundsEnabled: boolean;
  };
  /** Still seated and able to act. */
  players: PlayerView[];
  /** Cashed out mid-game. Their money and chips remain part of the game. */
  leftPlayers: PlayerView[];
  /** Everyone whose money is in this game: seated players plus leavers. */
  participants: PlayerView[];
  pendingPlayers: PlayerView[];
  pendingRequests: PendingRequestView[];
  totals: {
    playerCount: number;
    buyInCount: number;
    potAgorot: number;
    chipsIssued: number;
    chipsCounted: number;
    playersWithCount: number;
    /** Cash already taken off the table by players who left mid-game. */
    cashedOutAgorot: number;
    /** What is still in play: the pot minus everything cashed out. */
    activePotAgorot: number;
    /** Chips still in front of the seated players. */
    activeChips: number;
  };
  /** Newest first. Derived from the seats and the ledger, never stored. */
  recentActivity: TableEvent[];
  canSeeEveryonesMoney: boolean;
  results: GameResultRow[];
  settlements: SettlementRow[];
}

/**
 * One round-trip bundle for every table screen. RLS decides what actually comes
 * back — under PRIVATE visibility a non-admin simply receives no ledger rows
 * for other players, and the UI hides those columns accordingly.
 */
export async function loadTableView(
  tableId: string,
  viewerId: string,
  isAnonymous: boolean,
): Promise<TableViewModel> {
  const supabase = await createClient();

  // Everything here is keyed on the table id, which came in with the URL, so
  // nothing needs to wait for anything else to come back first. It used to:
  // the table row was fetched, then the seats and the ledger, and then — once
  // the seats named them — the players' profiles. Three network legs in series
  // for a screen whose every query already knew what to ask for.
  //
  // The two dependent parts are folded into the requests that carry them. The
  // finished game's results and settlements ride along with the table (for a
  // game still in progress those rows do not exist yet, so asking costs
  // nothing), and each player's avatar rides along with their seat.
  const [
    tableRes,
    playersRes,
    totalsRes,
    requestsRes,
    countsRes,
    ledgerRes,
    soundsRes,
  ] = await Promise.all([
      supabase
        .from('poker_tables')
        .select('*, game_results(*), settlements(*)')
        .eq('id', tableId)
        .maybeSingle(),
      supabase
        .from('table_players')
        .select('*, profiles(id, avatar_url, is_guest)')
        .eq('table_id', tableId)
        .order('joined_at'),
      supabase.from('table_player_totals').select('*').eq('table_id', tableId),
      supabase
        .from('rebuy_requests')
        .select('*')
        .eq('table_id', tableId)
        .eq('status', 'PENDING')
        .order('requested_at'),
      supabase.from('chip_count_submissions').select('*').eq('table_id', tableId),
      supabase
        .from('buyin_transactions')
        .select('*')
        .eq('table_id', tableId)
        .order('created_at', { ascending: true }),
      // Own row only — RLS allows nothing else, which is all that is needed.
      supabase
        .from('profile_privacy_settings')
        .select('game_sounds_enabled')
        .eq('profile_id', viewerId)
        .maybeSingle(),
  ]);

  const withChildren = tableRes.data as
    | (PokerTableRow & { game_results: GameResultRow[]; settlements: SettlementRow[] })
    | null;
  if (!withChildren) notFound();
  const { game_results: gameResults, settlements, ...table } = withChildren;
  // A game still running has no frozen results; only a finished one does.
  const resultsRes = { data: table.status === 'COMPLETED' ? gameResults : [] };
  const settlementsRes = { data: table.status === 'COMPLETED' ? settlements : [] };

  const seatRows = (playersRes.data ?? []) as (TablePlayerRow & {
    profiles: { id: string; avatar_url: string | null; is_guest: boolean } | null;
  })[];
  const playerRows: TablePlayerRow[] = seatRows;
  const profileRows = seatRows
    .map((row) => row.profiles)
    .filter((profile) => profile !== null);

  const avatarByUser = new Map((profileRows ?? []).map((p) => [p.id, p.avatar_url]));
  const guestByUser = new Map((profileRows ?? []).map((p) => [p.id, p.is_guest]));
  const totalsById = new Map(
    (totalsRes.data ?? []).map((t) => [t.table_player_id, t] as const),
  );
  const countsById = new Map(
    ((countsRes.data ?? []) as ChipCountRow[]).map((c) => [c.table_player_id, c] as const),
  );

  const ledger = (ledgerRes.data ?? []) as BuyinTransactionRow[];
  const reversedIds = new Set(
    ledger.map((tx) => tx.reverses_transaction_id).filter((id): id is string => !!id),
  );
  const lastReversibleByPlayer = new Map<string, string>();
  for (const tx of ledger) {
    if (tx.type === 'REVERSAL' || reversedIds.has(tx.id)) continue;
    lastReversibleByPlayer.set(tx.table_player_id, tx.id);
  }

  const economics = {
    buyInAgorot: table.buy_in_agorot,
    chipsPerBuyIn: table.chips_per_buy_in,
  };

  const toView = (row: TablePlayerRow): PlayerView => {
    const totals = totalsById.get(row.id);
    const count = countsById.get(row.id);
    const base = {
      id: row.id,
      userId: row.user_id,
      displayName: row.display_name,
      status: row.status,
      isAdmin: row.user_id === table.owner_id,
      avatarUrl: row.user_id ? (avatarByUser.get(row.user_id) ?? null) : null,
      isGuest: row.user_id ? (guestByUser.get(row.user_id) ?? false) : false,
      // Read from the column, not inferred from a missing user: a deleted
      // account leaves real seats with no user either (0018).
      isManual: row.is_manual === true,
      // Normalised rather than taken raw: an absent column must mean seated.
      leftAt: normaliseLeftAt(row.left_at),
      joinedAt: row.joined_at,
      buyInCount: totals?.buy_in_count ?? 0,
      totalPaidAgorot: totals?.total_paid_agorot ?? 0,
      chipsIssued: totals?.chips_issued ?? 0,
      submittedChips: count?.submitted_chips ?? null,
      approvedChips: count?.approved_chips ?? null,
      hasFinancials: totals !== undefined,
      lastReversibleTxId: lastReversibleByPlayer.get(row.id) ?? null,
    };
    // Derived once, here, from the values the leave transaction persisted —
    // never recomputed in a component.
    return { ...base, cashOut: summariseCashOut(base, economics) };
  };

  const allViews = playerRows.map(toView);
  // A leaver keeps status ACTIVE so their result stays in the settlement; only
  // `leftAt` decides whether they are still at the table.
  const participants = allViews.filter((p) => p.status === 'ACTIVE');
  const players = participants.filter((p) => isStillSeated(p.leftAt));
  const leftPlayers = participants.filter((p) => hasLeftTable(p.leftAt));
  const pendingPlayers = allViews.filter((p) => p.status === 'PENDING');
  const isAdmin = table.owner_id === viewerId;
  const myPlayer = allViews.find((p) => p.userId === viewerId) ?? null;

  const requestRows = (requestsRes.data ?? []) as RebuyRequestRow[];
  const byPlayerId = new Map(allViews.map((p) => [p.id, p] as const));
  const pendingRequests: PendingRequestView[] = requestRows.map((row) => {
    const player = byPlayerId.get(row.table_player_id);
    return {
      id: row.id,
      tablePlayerId: row.table_player_id,
      displayName: player?.displayName ?? 'שחקן',
      avatarUrl: player?.avatarUrl ?? null,
      requestedAt: row.requested_at,
      buyInCount: player?.buyInCount ?? 0,
    };
  });

  const myPendingRequest = myPlayer
    ? (requestRows.find((r) => r.table_player_id === myPlayer.id) ?? null)
    : null;

  const effectiveChips = (p: PlayerView) => p.approvedChips ?? p.submittedChips;

  const pot = computePotTotals(participants);

  return {
    table,
    viewer: {
      userId: viewerId,
      isAnonymous,
      isAdmin,
      player: myPlayer,
      myPendingRequestId: myPendingRequest?.id ?? null,
      // Defaults on, matching the column default: a missing settings row must
      // behave like a freshly created one.
      soundsEnabled: soundsRes.data?.game_sounds_enabled ?? true,
    },
    players,
    leftPlayers,
    participants,
    pendingPlayers,
    pendingRequests,
    totals: {
      // The live roster is the seated players…
      playerCount: players.length,
      // …but every financial figure covers everyone who bought in, because a
      // leaver's money stays in the pot and their chips came off the rack.
      buyInCount: participants.reduce((sum, p) => sum + p.buyInCount, 0),
      potAgorot: pot.potAgorot,
      chipsIssued: participants.reduce((sum, p) => sum + p.chipsIssued, 0),
      chipsCounted: participants.reduce((sum, p) => sum + (effectiveChips(p) ?? 0), 0),
      playersWithCount: participants.filter((p) => effectiveChips(p) !== null).length,
      cashedOutAgorot: pot.cashedOutAgorot,
      activePotAgorot: pot.activePotAgorot,
      activeChips: pot.activeChips,
    },
    recentActivity: buildTableActivity(participants, ledger, {
      id: table.id,
      name: table.name,
      status: table.status,
      updatedAt: table.updated_at,
    }),
    canSeeEveryonesMoney: isAdmin || table.player_visibility === 'OPEN',
    results: (resultsRes.data ?? []) as GameResultRow[],
    settlements: (settlementsRes.data ?? []) as SettlementRow[],
  };
}
