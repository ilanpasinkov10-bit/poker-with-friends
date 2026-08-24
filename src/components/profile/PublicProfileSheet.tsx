'use client';

import { useEffect, useState } from 'react';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { LoadingBlock } from '@/components/ui/EmptyState';
import { Modal } from '@/components/ui/Modal';
import { Num } from '@/components/ui/Num';
import { cn } from '@/lib/cn';
import { formatDate, formatMoney, formatSignedMoney } from '@/lib/format';
import { buyInsWord } from '@/lib/labels';
import { fetchPublicProfileAction } from '@/lib/actions/profile';
import type { PublicProfile } from '@/lib/domain/leaderboard';

/**
 * Mobile-first profile sheet, opened from a table's player list or from the
 * leaderboard. Everything shown here is decided by `get_public_profile` on the
 * server; the component only renders what it is given.
 */
export function PublicProfileSheet({
  userId,
  open,
  onClose,
}: {
  userId: string | null;
  open: boolean;
  onClose: () => void;
}) {
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [state, setState] = useState<'idle' | 'loading' | 'error'>('idle');

  useEffect(() => {
    if (!open || !userId) {
      setProfile(null);
      setState('idle');
      return;
    }
    let cancelled = false;
    setState('loading');
    void fetchPublicProfileAction(userId).then((result) => {
      if (cancelled) return;
      if (result.ok && result.data) {
        setProfile(result.data);
        setState('idle');
      } else {
        setState('error');
      }
    });
    return () => {
      cancelled = true;
    };
  }, [open, userId]);

  return (
    <Modal open={open} onClose={onClose} title="פרופיל שחקן">
      {state === 'loading' ? <LoadingBlock /> : null}

      {state === 'error' ? (
        <p className="py-8 text-center text-sm text-ink-muted">
          השחקן בחר להסתיר את הפרופיל שלו
        </p>
      ) : null}

      {profile ? (
        <div className="grid gap-5">
          <header className="flex items-center gap-4">
            <Avatar name={profile.display_name} src={profile.avatar_url} size="lg" ring />
            <div className="min-w-0 flex-1">
              <p className="truncate text-lg font-black text-ink">{profile.display_name}</p>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                {profile.is_guest ? (
                  <Badge tone="neutral">אורח</Badge>
                ) : (
                  <Badge tone="brand">חשבון רשום</Badge>
                )}
                {profile.is_self ? <Badge tone="profit">זה אני</Badge> : null}
              </div>
              {profile.member_since ? (
                <p className="mt-1 text-[0.7rem] text-ink-faint">
                  חבר מאז <Num>{formatDate(profile.member_since)}</Num>
                </p>
              ) : null}
            </div>
          </header>

          {profile.is_guest ? (
            <p className="rounded-xl bg-surface-2 px-4 py-3 text-center text-sm text-ink-muted">
              שחקן אורח — אין היסטוריית משחקים שמורה.
            </p>
          ) : profile.stats_visible && profile.stats ? (
            <>
              <div className="text-center">
                <p
                  className={cn(
                    'text-3xl font-black',
                    profile.stats.net_agorot > 0 && 'text-profit',
                    profile.stats.net_agorot < 0 && 'text-loss',
                    profile.stats.net_agorot === 0 && 'text-ink',
                  )}
                >
                  <Num>
                    {profile.stats.net_agorot === 0
                      ? formatMoney(0)
                      : formatSignedMoney(profile.stats.net_agorot)}
                  </Num>
                </p>
                <p className="mt-0.5 text-xs text-ink-faint">מאזן ממשחקים שהסתיימו</p>
              </div>

              <dl className="grid grid-cols-2 gap-2">
                <Cell label="משחקים" value={String(profile.stats.games_played)} />
                <Cell
                  label="ממוצע למשחק"
                  value={formatSignedMoney(profile.stats.average_agorot)}
                  tone={profile.stats.average_agorot >= 0 ? 'profit' : 'loss'}
                />
                <Cell label="סך הכניסות" value={String(profile.stats.total_buy_ins)} />
                <Cell label="סך ההשקעה" value={formatMoney(profile.stats.total_invested_agorot)} />
                <Cell
                  label="התוצאה הטובה ביותר"
                  value={formatSignedMoney(profile.stats.best_result_agorot)}
                  tone="profit"
                />
                <Cell
                  label="משחקים ברווח"
                  value={`${
                    profile.stats.games_played > 0
                      ? Math.round((profile.stats.winning_games / profile.stats.games_played) * 100)
                      : 0
                  }%`}
                />
              </dl>
            </>
          ) : (
            <p className="rounded-xl bg-surface-2 px-4 py-3 text-center text-sm text-ink-muted">
              השחקן בחר לא לשתף את הנתונים שלו.
            </p>
          )}

          {profile.history_visible && profile.recent_games.length > 0 ? (
            <section>
              <h3 className="mb-2 text-sm font-bold text-ink">משחקים אחרונים</h3>
              <ul className="grid gap-1.5">
                {profile.recent_games.map((game, index) => (
                  <li
                    key={`${game.table_name}-${index}`}
                    className="flex items-center justify-between gap-3 rounded-xl bg-surface-2 px-3 py-2.5"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-ink">
                        {game.table_name}
                      </span>
                      <span className="block text-[0.65rem] text-ink-faint">
                        <Num>{formatDate(game.completed_at)}</Num> ·{' '}
                        {buyInsWord(game.buy_in_count)}
                      </span>
                    </span>
                    <span
                      className={cn(
                        'shrink-0 text-sm font-black',
                        game.profit_loss_agorot >= 0 ? 'text-profit' : 'text-loss',
                      )}
                    >
                      <Num>{formatSignedMoney(game.profit_loss_agorot)}</Num>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      ) : null}
    </Modal>
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
    <div className="rounded-xl bg-surface-2 px-3 py-2.5">
      <dt className="text-[0.65rem] text-ink-faint">{label}</dt>
      <dd
        className={cn(
          'mt-0.5 text-base font-bold',
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
