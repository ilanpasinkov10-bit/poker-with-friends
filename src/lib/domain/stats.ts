export interface CompletedGameRecord {
  tableId: string;
  tableName: string;
  groupId: string | null;
  playedAt: string; // ISO timestamp of completion
  buyInCount: number;
  totalPaidAgorot: number;
  chipsIssued: number;
  finalChips: number;
  finalValueAgorot: number;
  profitLossAgorot: number;
  playerCount: number;
  potAgorot: number;
}

export interface LifetimeStats {
  gamesPlayed: number;
  netAgorot: number;
  totalBuyIns: number;
  totalInvestedAgorot: number;
  lifetimeFinalValueAgorot: number;
  averageResultAgorot: number;
  winningGames: number;
  winRatePercent: number;
  averageBuyInsPerGame: number;
  biggestWinAgorot: number;
  biggestLossAgorot: number;
  currentStreak: number;
  longestWinStreak: number;
}

const chronological = (games: readonly CompletedGameRecord[]) =>
  [...games].sort((a, b) => Date.parse(a.playedAt) - Date.parse(b.playedAt));

export function computeLifetimeStats(games: readonly CompletedGameRecord[]): LifetimeStats {
  const ordered = chronological(games);
  const n = ordered.length;

  if (n === 0) {
    return {
      gamesPlayed: 0,
      netAgorot: 0,
      totalBuyIns: 0,
      totalInvestedAgorot: 0,
      lifetimeFinalValueAgorot: 0,
      averageResultAgorot: 0,
      winningGames: 0,
      winRatePercent: 0,
      averageBuyInsPerGame: 0,
      biggestWinAgorot: 0,
      biggestLossAgorot: 0,
      currentStreak: 0,
      longestWinStreak: 0,
    };
  }

  let netAgorot = 0;
  let totalBuyIns = 0;
  let totalInvestedAgorot = 0;
  let lifetimeFinalValueAgorot = 0;
  let winningGames = 0;
  let biggestWinAgorot = 0;
  let biggestLossAgorot = 0;
  let longestWinStreak = 0;
  let runningWinStreak = 0;

  for (const g of ordered) {
    netAgorot += g.profitLossAgorot;
    totalBuyIns += g.buyInCount;
    totalInvestedAgorot += g.totalPaidAgorot;
    lifetimeFinalValueAgorot += g.finalValueAgorot;
    if (g.profitLossAgorot > 0) {
      winningGames += 1;
      runningWinStreak += 1;
      longestWinStreak = Math.max(longestWinStreak, runningWinStreak);
    } else {
      runningWinStreak = 0;
    }
    biggestWinAgorot = Math.max(biggestWinAgorot, g.profitLossAgorot);
    biggestLossAgorot = Math.min(biggestLossAgorot, g.profitLossAgorot);
  }

  // Current streak: positive = consecutive wins, negative = consecutive losses.
  let currentStreak = 0;
  const lastSign = Math.sign(ordered[n - 1]!.profitLossAgorot);
  if (lastSign !== 0) {
    for (let i = n - 1; i >= 0; i -= 1) {
      if (Math.sign(ordered[i]!.profitLossAgorot) !== lastSign) break;
      currentStreak += lastSign;
    }
  }

  return {
    gamesPlayed: n,
    netAgorot,
    totalBuyIns,
    totalInvestedAgorot,
    lifetimeFinalValueAgorot,
    averageResultAgorot: Math.round(netAgorot / n),
    winningGames,
    winRatePercent: Math.round((winningGames / n) * 100),
    averageBuyInsPerGame: Math.round((totalBuyIns / n) * 10) / 10,
    biggestWinAgorot,
    biggestLossAgorot,
    currentStreak,
    longestWinStreak,
  };
}

export interface ProfitPoint {
  index: number;
  label: string;
  resultAgorot: number;
  cumulativeAgorot: number;
}

export function buildProfitSeries(games: readonly CompletedGameRecord[]): ProfitPoint[] {
  let cumulative = 0;
  return chronological(games).map((g, i) => {
    cumulative += g.profitLossAgorot;
    return {
      index: i + 1,
      label: g.tableName,
      resultAgorot: g.profitLossAgorot,
      cumulativeAgorot: cumulative,
    };
  });
}

export interface PersonalRecord {
  key: string;
  emoji: string;
  title: string;
  valueAgorot?: number;
  valueNumber?: number;
  gameLabel: string | null;
}

/** Records are always derived from real completed games — never hardcoded. */
export function computeRecords(games: readonly CompletedGameRecord[]): PersonalRecord[] {
  const stats = computeLifetimeStats(games);
  const best = games.reduce<CompletedGameRecord | null>(
    (acc, g) => (acc === null || g.profitLossAgorot > acc.profitLossAgorot ? g : acc),
    null,
  );
  const worst = games.reduce<CompletedGameRecord | null>(
    (acc, g) => (acc === null || g.profitLossAgorot < acc.profitLossAgorot ? g : acc),
    null,
  );
  const mostBuyIns = games.reduce<CompletedGameRecord | null>(
    (acc, g) => (acc === null || g.buyInCount > acc.buyInCount ? g : acc),
    null,
  );
  const biggestPot = games.reduce<CompletedGameRecord | null>(
    (acc, g) => (acc === null || g.potAgorot > acc.potAgorot ? g : acc),
    null,
  );

  return [
    {
      key: 'biggest_win',
      emoji: '🏆',
      title: 'הרווח הגדול ביותר',
      valueAgorot: best && best.profitLossAgorot > 0 ? best.profitLossAgorot : undefined,
      gameLabel: best && best.profitLossAgorot > 0 ? best.tableName : null,
    },
    {
      key: 'biggest_loss',
      emoji: '📉',
      title: 'ההפסד הגדול ביותר',
      valueAgorot: worst && worst.profitLossAgorot < 0 ? worst.profitLossAgorot : undefined,
      gameLabel: worst && worst.profitLossAgorot < 0 ? worst.tableName : null,
    },
    {
      key: 'streak',
      emoji: '🔥',
      title: 'הרצף החיובי הארוך ביותר',
      valueNumber: stats.longestWinStreak || undefined,
      gameLabel: stats.longestWinStreak ? `${stats.longestWinStreak} משחקים ברצף` : null,
    },
    {
      key: 'most_buyins',
      emoji: '🎲',
      title: 'הכי הרבה כניסות במשחק',
      valueNumber: mostBuyIns?.buyInCount,
      gameLabel: mostBuyIns?.tableName ?? null,
    },
    {
      key: 'biggest_pot',
      emoji: '💰',
      title: 'המשחק עם הקופה הגדולה ביותר',
      valueAgorot: biggestPot?.potAgorot,
      gameLabel: biggestPot?.tableName ?? null,
    },
  ];
}

export interface TableGroupSummary {
  key: string;
  name: string;
  gamesPlayed: number;
  firstPlayedAt: string;
  lastPlayedAt: string;
  netAgorot: number;
}

/** Groups a player's history by recurring poker circle (or standalone table). */
export function summariseByGroup(games: readonly CompletedGameRecord[]): TableGroupSummary[] {
  const map = new Map<string, TableGroupSummary>();
  for (const g of chronological(games)) {
    const key = g.groupId ?? `table:${g.tableId}`;
    const existing = map.get(key);
    if (existing) {
      existing.gamesPlayed += 1;
      existing.netAgorot += g.profitLossAgorot;
      existing.lastPlayedAt = g.playedAt;
    } else {
      map.set(key, {
        key,
        name: g.tableName,
        gamesPlayed: 1,
        firstPlayedAt: g.playedAt,
        lastPlayedAt: g.playedAt,
        netAgorot: g.profitLossAgorot,
      });
    }
  }
  return [...map.values()].sort((a, b) => Date.parse(b.lastPlayedAt) - Date.parse(a.lastPlayedAt));
}
