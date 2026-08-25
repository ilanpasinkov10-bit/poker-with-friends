'use client';

import { useState } from 'react';
import { Num } from '@/components/ui/Num';
import { cn } from '@/lib/cn';
import { ACTIVITY_PREVIEW_COUNT } from '@/lib/domain/activity';
import { EVENT_ICON, eventSentence, type TableEvent } from '@/lib/domain/events';
import { formatChips, formatMoney, formatTime } from '@/lib/format';
import { buyInsWord, playersWord } from '@/lib/labels';
import type { TableViewModel } from '@/lib/data/table';
import { ActivityHistorySheet } from './ActivityHistorySheet';

/**
 * The live pot — the one number everyone at the table looks up to check.
 *
 * The hero figure is the money still being played for, not the total that ever
 * entered: once a player cashes out, their stack has left the table and the
 * amount in front of everyone else is smaller. Both figures are shown, because
 * "how much is in play" and "how much has gone through this game" are different
 * questions and the pair only reads as consistent when you can see both.
 *
 * Every number comes from the same `computePotTotals` the settlement is built
 * on, so this panel cannot drift from the player cards or the final result.
 * There is no second pot calculation anywhere.
 */
export function LivePot({ model }: { model: TableViewModel }) {
  const { totals, recentActivity } = model;
  const hasLeavers = totals.cashedOutAgorot > 0;

  return (
    <section
      className="card-grad rounded-2xl border border-brand/25 bg-surface p-4"
      aria-labelledby="live-pot-heading"
    >
      <div className="text-center">
        <h2 id="live-pot-heading" className="text-sm font-semibold text-ink-muted">
          קופה חיה
        </h2>
        {/* Scales with the viewport so a five-figure pot still fits a 320px
            phone without the digits wrapping mid-number. */}
        <p className="mt-1 text-[clamp(2.25rem,14vw,3.5rem)] font-black leading-none text-brand-ink">
          <Num>{formatMoney(totals.activePotAgorot)}</Num>
        </p>
        <p className="mt-1.5 flex items-center justify-center gap-1.5 text-[0.7rem] text-ink-faint">
          <span className="size-1.5 animate-live rounded-full bg-profit" aria-hidden />
          מתעדכן בזמן אמת
        </p>
      </div>

      {/* Two columns at every width: three would leave 90px per tile on a
          narrow phone, which truncates the money. */}
      <dl className="mt-4 grid grid-cols-2 gap-2">
        <PotStat label="סך הכניסות" value={formatMoney(totals.potAgorot)} />
        <PotStat
          label="נפדה על ידי עוזבים"
          value={formatMoney(totals.cashedOutAgorot)}
          tone={hasLeavers ? 'loss' : undefined}
        />
        <PotStat label="ז׳יטונים בשולחן" value={formatChips(totals.activeChips)} />
        <PotStat
          label="שחקנים פעילים"
          value={String(totals.playerCount)}
          hint={playersWord(totals.playerCount)}
        />
        <PotStat
          label="סך הכניסות שנרכשו"
          value={String(totals.buyInCount)}
          hint={buyInsWord(totals.buyInCount)}
          className="col-span-2"
        />
      </dl>

      {recentActivity.length > 0 ? <RecentActivity events={recentActivity} /> : null}
    </section>
  );
}

function PotStat({
  label,
  value,
  hint,
  tone,
  className,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: 'loss';
  className?: string;
}) {
  return (
    <div className={cn('min-w-0 rounded-xl bg-surface-2 px-3 py-2.5', className)}>
      <dt className="truncate text-[0.65rem] text-ink-faint">{label}</dt>
      <dd
        className={cn(
          'mt-0.5 truncate text-base font-bold',
          tone === 'loss' ? 'text-loss' : 'text-ink',
        )}
      >
        <Num>{value}</Num>
      </dd>
      {hint ? <dd className="truncate text-[0.65rem] text-ink-faint">{hint}</dd> : null}
    </div>
  );
}

/**
 * What just happened, newest first.
 *
 * Only the last few lines live on the card. A busy table generates an event
 * every couple of minutes, and an inline list of all of them pushed the pot —
 * the number people actually open this screen for — off the top. The rest is
 * one tap away rather than gone.
 *
 * Derived from the seats and the ledger rather than recorded separately, so it
 * can never disagree with the numbers above it.
 */
function RecentActivity({ events }: { events: readonly TableEvent[] }) {
  const [historyOpen, setHistoryOpen] = useState(false);
  const preview = events.slice(0, ACTIVITY_PREVIEW_COUNT);

  return (
    <div className="mt-4 border-t border-line-soft pt-3">
      <h3 className="mb-2 text-xs font-semibold text-ink-muted">פעילות אחרונה</h3>
      <ul className="grid gap-1.5">
        {preview.map((event) => (
          <li key={event.id} className="flex items-start gap-2 text-xs">
            <span aria-hidden className="shrink-0 leading-5">
              {EVENT_ICON[event.kind]}
            </span>
            <span className="min-w-0 flex-1 text-ink-muted">{eventSentence(event)}</span>
            <span className="ltr-num shrink-0 text-[0.65rem] text-ink-faint">
              {formatTime(event.at)}
            </span>
          </li>
        ))}
      </ul>

      {events.length > preview.length ? (
        <button
          type="button"
          onClick={() => setHistoryOpen(true)}
          className="mt-2 min-h-11 w-full rounded-xl border border-line bg-surface-2 text-xs font-semibold text-ink-muted transition-colors hover:bg-surface-3 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          ראה עוד פעילות
        </button>
      ) : null}

      <ActivityHistorySheet
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        events={events}
      />
    </div>
  );
}
