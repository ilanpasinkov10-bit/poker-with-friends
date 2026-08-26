import Link from 'next/link';
import { Avatar } from '@/components/ui/Avatar';
import { Num } from '@/components/ui/Num';
import { cn } from '@/lib/cn';
import { formatSignedMoney } from '@/lib/format';
import { gamesWord } from '@/lib/labels';
import type { LifetimeStats } from '@/lib/domain/stats';

const CHIP =
  'inline-flex h-8 items-center gap-1.5 rounded-full border border-line bg-surface-2 px-3 text-xs font-semibold text-ink-muted';

export function ProfileHeader({
  name,
  avatarUrl,
  stats,
  tableCount,
  pendingRequests = 0,
}: {
  name: string;
  avatarUrl: string | null;
  stats: LifetimeStats;
  tableCount: number;
  /** Friend requests waiting to be answered. */
  pendingRequests?: number;
}) {
  return (
    <header className="card-grad rounded-3xl border border-line bg-surface p-5">
      <div className="flex items-center gap-4">
        <Avatar name={name} src={avatarUrl} size="xl" ring />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-2xl font-black text-ink">{name}</h1>
          <p className="mt-0.5 text-sm text-ink-faint">
            {gamesWord(stats.gamesPlayed)}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <Link href="/profile/settings" className={CHIP}>
              הגדרות פרופיל
            </Link>
            <Link href="/profile/friends" className={CHIP}>
              חברים
              {/* Requests waiting are the only reason to open this screen
                  without being asked to, so the count is the entry point. */}
              {pendingRequests > 0 ? (
                <span className="grid size-4 place-items-center rounded-full bg-brand text-[0.6rem] font-black text-on-brand">
                  <Num>{pendingRequests}</Num>
                </span>
              ) : null}
            </Link>
          </div>
        </div>
      </div>

      <dl className="mt-5 grid grid-cols-3 gap-2 text-center">
        <Cell
          label="מאזן"
          value={formatSignedMoney(stats.netAgorot)}
          tone={stats.netAgorot >= 0 ? 'profit' : 'loss'}
        />
        <Cell label="משחקים ברווח" value={`${stats.winRatePercent}%`} />
        <Cell label="שולחנות" value={String(tableCount)} />
      </dl>
    </header>
  );
}

function Cell({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'profit' | 'loss';
}) {
  return (
    <div className="rounded-xl bg-surface-2 px-2 py-2.5">
      <dt className="text-[0.65rem] text-ink-faint">{label}</dt>
      <dd
        className={cn(
          'mt-0.5 text-base font-black',
          tone === 'profit' && 'text-profit',
          tone === 'loss' && 'text-loss',
          !tone && 'text-ink',
        )}
      >
        <Num>{value}</Num>
      </dd>
    </div>
  );
}
