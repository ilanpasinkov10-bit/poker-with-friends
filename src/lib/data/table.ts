import 'server-only';

import { notFound } from 'next/navigation';
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
  };
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

  const { data: table } = await supabase
    .from('poker_tables')
    .select('*')
    .eq('id', tableId)
    .maybeSingle();
  if (!table) notFound();

  const [playersRes, totalsRes, requestsRes, countsRes, ledgerRes, resultsRes, settlementsRes] =
    await Promise.all([
      supabase.from('table_players').select('*').eq('table_id', tableId).order('joined_at'),
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
      table.status === 'COMPLETED'
        ? supabase.from('game_results').select('*').eq('table_id', tableId)
        : Promise.resolve({ data: [] as GameResultRow[] }),
      table.status === 'COMPLETED'
        ? supabase.from('settlements').select('*').eq('table_id', tableId)
        : Promise.resolve({ data: [] as SettlementRow[] }),
    ]);

  const playerRows = (playersRes.data ?? []) as TablePlayerRow[];
  const userIds = [...new Set(playerRows.map((p) => p.user_id).filter((id): id is string => !!id))];
  const { data: profileRows } = userIds.length
    ? await supabase.from('profiles').select('id, avatar_url, is_guest').in('id', userIds)
    : { data: [] };

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

  const toView = (row: TablePlayerRow): PlayerView => {
    const totals = totalsById.get(row.id);
    const count = countsById.get(row.id);
    return {
      id: row.id,
      userId: row.user_id,
      displayName: row.display_name,
      status: row.status,
      isAdmin: row.user_id === table.owner_id,
      avatarUrl: row.user_id ? (avatarByUser.get(row.user_id) ?? null) : null,
      isGuest: row.user_id ? (guestByUser.get(row.user_id) ?? false) : false,
      leftAt: row.left_at,
      joinedAt: row.joined_at,
      buyInCount: totals?.buy_in_count ?? 0,
      totalPaidAgorot: totals?.total_paid_agorot ?? 0,
      chipsIssued: totals?.chips_issued ?? 0,
      submittedChips: count?.submitted_chips ?? null,
      approvedChips: count?.approved_chips ?? null,
      hasFinancials: totals !== undefined,
      lastReversibleTxId: lastReversibleByPlayer.get(row.id) ?? null,
    };
  };

  const allViews = playerRows.map(toView);
  // A leaver keeps status ACTIVE so their result stays in the settlement; only
  // `leftAt` decides whether they are still at the table.
  const participants = allViews.filter((p) => p.status === 'ACTIVE');
  const players = participants.filter((p) => p.leftAt === null);
  const leftPlayers = participants.filter((p) => p.leftAt !== null);
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

  return {
    table,
    viewer: {
      userId: viewerId,
      isAnonymous,
      isAdmin,
      player: myPlayer,
      myPendingRequestId: myPendingRequest?.id ?? null,
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
      potAgorot: participants.reduce((sum, p) => sum + p.totalPaidAgorot, 0),
      chipsIssued: participants.reduce((sum, p) => sum + p.chipsIssued, 0),
      chipsCounted: participants.reduce((sum, p) => sum + (effectiveChips(p) ?? 0), 0),
      playersWithCount: participants.filter((p) => effectiveChips(p) !== null).length,
    },
    canSeeEveryonesMoney: isAdmin || table.player_visibility === 'OPEN',
    results: (resultsRes.data ?? []) as GameResultRow[],
    settlements: (settlementsRes.data ?? []) as SettlementRow[],
  };
}
