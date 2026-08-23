import Link from 'next/link';
import { Num } from '@/components/ui/Num';
import { cn } from '@/lib/cn';
import { formatChips, formatDate, formatMoney, formatSignedMoney } from '@/lib/format';
import { buyInsWord, playersWord } from '@/lib/labels';
import type { CompletedGameRecord } from '@/lib/domain/stats';

export function GameHistoryList({ games }: { games: CompletedGameRecord[] }) {
  return (
    <ul className="grid gap-2">
      {games.map((game) => (
        <li key={game.tableId}>
          <Link
            href={`/table/${game.tableId}`}
            className="block rounded-2xl border border-line-soft bg-surface p-4 transition-colors hover:border-line"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-bold text-ink">{game.tableName}</p>
                <p className="mt-0.5 text-[0.7rem] text-ink-faint">
                  <Num>{formatDate(game.playedAt)}</Num> ·{' '}
                  <Num>{playersWord(game.playerCount)}</Num> ·{' '}
                  <Num>{buyInsWord(game.buyInCount)}</Num>
                </p>
              </div>
              <span
                className={cn(
                  'shrink-0 text-lg font-black',
                  game.profitLossAgorot >= 0 ? 'text-profit' : 'text-loss',
                )}
              >
                <Num>{formatSignedMoney(game.profitLossAgorot)}</Num>
              </span>
            </div>

            <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
              <Cell label="השקעה" value={formatMoney(game.totalPaidAgorot)} />
              <Cell label="ז׳יטונים בסוף" value={formatChips(game.finalChips)} />
              <Cell label="שווי סופי" value={formatMoney(game.finalValueAgorot)} />
            </dl>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-surface-2 px-2 py-1.5">
      <dt className="text-[0.6rem] text-ink-faint">{label}</dt>
      <dd className="mt-0.5 text-sm font-bold text-ink">
        <Num>{value}</Num>
      </dd>
    </div>
  );
}
