'use client';

import type { ReactNode } from 'react';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { Num } from '@/components/ui/Num';
import { cn } from '@/lib/cn';
import { formatChips, formatMoney, formatSignedMoney } from '@/lib/format';
import { buyInsWord } from '@/lib/labels';
import type { PlayerView } from '@/lib/data/table';

export function PlayerCard({
  player,
  showMoney,
  isMe,
  maxBuyIns,
  actions,
  footer,
  onOpenProfile,
}: {
  player: PlayerView;
  showMoney: boolean;
  isMe: boolean;
  maxBuyIns: number;
  actions?: React.ReactNode;
  footer?: React.ReactNode;
  onOpenProfile?: (userId: string) => void;
}) {
  const maxedOut = player.buyInCount >= maxBuyIns;

  return (
    <li
      className={cn(
        'rounded-2xl border bg-surface p-3.5',
        isMe ? 'border-brand/40 bg-brand-soft/20' : 'border-line-soft',
      )}
    >
      <div className="flex items-center gap-3">
        <Avatar name={player.displayName} src={player.avatarUrl} ring={isMe} />

        <ProfileTrigger player={player} onOpenProfile={onOpenProfile}>
          <p className="font-bold break-words text-ink">
            {player.displayName}
            {isMe ? (
              <span className="ms-1 whitespace-nowrap text-xs font-semibold text-brand-ink">
                (אני)
              </span>
            ) : null}
          </p>

          {player.isGuest || player.isAdmin ? (
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              {player.isGuest ? <RoleBadge tone="neutral">אורח</RoleBadge> : null}
              {player.isAdmin ? <RoleBadge tone="brand">מנהל שולחן</RoleBadge> : null}
            </div>
          ) : null}

          {showMoney ? (
            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-ink-faint">
              <span>
                {buyInsWord(player.buyInCount)}
              </span>
              <span aria-hidden>·</span>
              <span>
                <Num>{formatMoney(player.totalPaidAgorot)}</Num> השקעה
              </span>
              <span aria-hidden>·</span>
              <span>
                <Num>{formatChips(player.chipsIssued)}</Num> ז׳יטונים
              </span>
            </p>
          ) : (
            <p className="mt-0.5 text-xs text-ink-faint">הנתונים הכספיים מוצגים למנהל השולחן בלבד</p>
          )}

          {showMoney && player.cashOut ? <CashOutLines cashOut={player.cashOut} /> : null}

          {showMoney && maxedOut && !player.cashOut ? (
            <p className="mt-1 text-[0.7rem] font-semibold text-warn">הגיע למקסימום הכניסות</p>
          ) : null}
        </ProfileTrigger>

        {actions ? <div className="flex shrink-0 items-center gap-1.5">{actions}</div> : null}
      </div>

      {footer ? <div className="mt-3 border-t border-line-soft pt-3">{footer}</div> : null}
    </li>
  );
}

/**
 * A player's role, on a line of its own beneath their name.
 *
 * It used to sit beside the name on a single row, which quietly made the badge
 * more important than the person: the row could not wrap, so the badge kept its
 * full width and the name was truncated to fit around it — "אילן פסינ…" next to
 * a perfectly legible "מנהל שולחן". On a 320px phone with the admin's two
 * action buttons in the same row there was barely a hundred pixels left to
 * truncate into.
 *
 * Moving the role below the name inverts that. The name now gets the full width
 * of its column and wraps if it needs to, so a long Hebrew name is shown in
 * full rather than cut off, and the badges wrap among themselves underneath.
 * `whitespace-nowrap` keeps a badge on one line — the wrapping happens between
 * badges, not inside "מנהל שולחן".
 */
function RoleBadge({ tone, children }: { tone: 'neutral' | 'brand'; children: ReactNode }) {
  return (
    <Badge tone={tone} className="whitespace-nowrap px-2 py-0.5 text-[0.65rem]">
      {children}
    </Badge>
  );
}

/**
 * What a player took off the table when they left.
 *
 * Every number here was persisted by the leave transaction and converted by the
 * same domain function the settlement uses; this component only formats them.
 */
function CashOutLines({ cashOut }: { cashOut: NonNullable<PlayerView['cashOut']> }) {
  const profit = cashOut.profitLossAgorot >= 0;
  return (
    <>
      <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-ink-muted">
        <span>
          עזב עם <Num className="font-semibold text-ink">{formatChips(cashOut.finalChips)}</Num>{' '}
          ז׳יטונים
        </span>
        <span aria-hidden>·</span>
        <span>
          שווי <Num className="font-semibold text-ink">{formatMoney(cashOut.finalValueAgorot)}</Num>
        </span>
      </p>
      <p className="mt-0.5 text-xs text-ink-muted">
        תוצאה:{' '}
        <Num className={cn('font-bold', profit ? 'text-profit' : 'text-loss')}>
          {formatSignedMoney(cashOut.profitLossAgorot)}
        </Num>
      </p>
    </>
  );
}

/**
 * The name block opens the player's profile when a handler is supplied and the
 * player has an identity to look up. Falls back to plain markup otherwise, so
 * the card never renders a button that would do nothing.
 */
function ProfileTrigger({
  player,
  onOpenProfile,
  children,
}: {
  player: PlayerView;
  onOpenProfile?: (userId: string) => void;
  children: React.ReactNode;
}) {
  if (!onOpenProfile || !player.userId) {
    return <div className="min-w-0 flex-1">{children}</div>;
  }
  return (
    <button
      type="button"
      onClick={() => onOpenProfile(player.userId!)}
      aria-label={`הצג את הפרופיל של ${player.displayName}`}
      className="min-w-0 flex-1 rounded-lg text-start focus-visible:outline-2 focus-visible:outline-brand"
    >
      {children}
    </button>
  );
}
