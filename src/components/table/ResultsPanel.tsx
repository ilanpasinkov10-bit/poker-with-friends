'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { Card, SectionTitle } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Num } from '@/components/ui/Num';
import { useToast } from '@/components/ui/Toast';
import { cn } from '@/lib/cn';
import { formatChips, formatMoney, formatSignedMoney } from '@/lib/format';
import { buyInsWord } from '@/lib/labels';
import { markSettlementPaidAction } from '@/lib/actions/counting';
import type { TableViewModel } from '@/lib/data/table';
import { CorrectResultsDialog } from './CorrectResultsDialog';

/** Final results + who transfers money to whom. */
export function ResultsPanel({ model }: { model: TableViewModel }) {
  const { table, results, settlements, players, viewer } = model;
  const [correcting, setCorrecting] = useState(false);

  const nameByPlayerId = new Map(players.map((p) => [p.id, p.displayName] as const));
  for (const result of results) nameByPlayerId.set(result.table_player_id, result.display_name);

  const avatarByPlayerId = new Map(players.map((p) => [p.id, p.avatarUrl] as const));
  const sorted = [...results].sort((a, b) => b.profit_loss_agorot - a.profit_loss_agorot);
  const myResult = viewer.player
    ? results.find((r) => r.table_player_id === viewer.player!.id)
    : undefined;

  const pot = results.reduce((sum, r) => sum + r.total_paid_agorot, 0);

  return (
    <div className="grid gap-6">
      {myResult ? (
        <Card className="card-grad text-center">
          <p className="text-xs text-ink-faint">התוצאה שלך</p>
          <p
            className={cn(
              'mt-1 text-4xl font-black',
              myResult.profit_loss_agorot >= 0 ? 'text-profit' : 'text-loss',
            )}
          >
            <Num>{formatSignedMoney(myResult.profit_loss_agorot)}</Num>
          </p>
          <p className="mt-2 text-xs text-ink-muted">
            {buyInsWord(myResult.buy_in_count)} ·{' '}
            <Num>{formatMoney(myResult.total_paid_agorot)}</Num> השקעה ·{' '}
            <Num>{formatChips(myResult.final_chips)}</Num> ז׳יטונים בסוף
          </p>
        </Card>
      ) : null}

      <section>
        <SectionTitle>תוצאות המשחק</SectionTitle>
        <ul className="grid gap-2">
          {sorted.map((result, index) => (
            <li
              key={result.id}
              className={cn(
                'flex items-center gap-3 rounded-2xl border bg-surface p-3.5',
                viewer.player?.id === result.table_player_id
                  ? 'border-brand/40'
                  : 'border-line-soft',
              )}
            >
              <span className="w-5 shrink-0 text-center text-sm font-bold text-ink-faint">
                <Num>{index + 1}</Num>
              </span>
              <Avatar
                name={result.display_name}
                src={avatarByPlayerId.get(result.table_player_id) ?? null}
                size="sm"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold text-ink">{result.display_name}</p>
                <p className="text-[0.7rem] text-ink-faint">
                  <Num>{formatMoney(result.total_paid_agorot)}</Num> →{' '}
                  <Num>{formatMoney(result.final_value_agorot)}</Num> ·{' '}
                  <Num>{formatChips(result.final_chips)}</Num> ז׳יטונים
                </p>
              </div>
              <span
                className={cn(
                  'shrink-0 text-base font-black',
                  result.profit_loss_agorot >= 0 ? 'text-profit' : 'text-loss',
                )}
              >
                <Num>{formatSignedMoney(result.profit_loss_agorot)}</Num>
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-center text-xs text-ink-faint">
          סך הקופה: <Num>{formatMoney(pot)}</Num>
        </p>
      </section>

      <SettlementList
        tableId={table.id}
        settlements={settlements}
        nameByPlayerId={nameByPlayerId}
        isAdmin={viewer.isAdmin}
      />

      <div className="grid gap-2">
        <Link
          href={`/table/${table.id}/leaderboard`}
          className="flex h-12 items-center justify-center rounded-xl border border-line bg-surface-2 font-semibold text-ink"
        >
          דירוג השולחן
        </Link>
        {viewer.isAdmin ? (
          <button
            type="button"
            onClick={() => setCorrecting(true)}
            className="h-11 rounded-xl border border-warn/30 bg-warn/10 text-sm font-semibold text-warn"
          >
            תיקון תוצאות
          </button>
        ) : null}
      </div>

      {viewer.isAdmin ? (
        <CorrectResultsDialog
          open={correcting}
          tableId={table.id}
          results={results}
          onClose={() => setCorrecting(false)}
        />
      ) : null}

      {viewer.isAnonymous ? (
        <Card className="border-brand/40 text-center">
          <p className="font-bold text-ink">רוצים לשמור את התוצאה?</p>
          <p className="mt-1 text-sm text-ink-muted">
            פתחו חשבון ונשמור לכם את המשחק הזה בהיסטוריה ובסטטיסטיקות.
          </p>
          <Link
            href={`/auth/sign-up?next=${encodeURIComponent(`/table/${table.id}`)}`}
            className="mt-4 inline-flex h-12 items-center justify-center rounded-xl bg-brand px-6 font-bold text-white"
          >
            שמור את הפרופיל שלי
          </Link>
        </Card>
      ) : null}
    </div>
  );
}

function SettlementList({
  tableId,
  settlements,
  nameByPlayerId,
  isAdmin,
}: {
  tableId: string;
  settlements: TableViewModel['settlements'];
  nameByPlayerId: Map<string, string>;
  isAdmin: boolean;
}) {
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  const togglePaid = (id: string, next: boolean) =>
    startTransition(async () => {
      const result = await markSettlementPaidAction(tableId, id, next);
      if (!result.ok) toast.error(result.message);
    });

  if (settlements.length === 0) {
    return (
      <section>
        <SectionTitle>התחשבנות</SectionTitle>
        <EmptyState
          emoji="🤝"
          title="אין העברות"
          description="כולם סיימו בדיוק עם מה שנכנסו — אין מה להעביר."
        />
      </section>
    );
  }

  return (
    <section>
      <SectionTitle>התחשבנות</SectionTitle>
      <ul className="grid gap-2">
        {settlements.map((settlement) => {
          const from = nameByPlayerId.get(settlement.from_table_player_id) ?? 'שחקן';
          const to = nameByPlayerId.get(settlement.to_table_player_id) ?? 'שחקן';
          return (
            <li
              key={settlement.id}
              className={cn(
                'flex items-center gap-3 rounded-2xl border p-4',
                settlement.is_paid
                  ? 'border-profit/30 bg-profit-soft/40'
                  : 'border-line-soft bg-surface',
              )}
            >
              <p className="min-w-0 flex-1 text-sm font-semibold text-ink">
                <span className="font-bold">{from}</span> מעביר ל<span className="font-bold">{to}</span>{' '}
                <Num className="text-base font-black text-brand-ink">
                  {formatMoney(settlement.amount_agorot)}
                </Num>
              </p>
              {isAdmin ? (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => togglePaid(settlement.id, !settlement.is_paid)}
                  className={cn(
                    'h-9 shrink-0 rounded-lg px-3 text-xs font-bold disabled:opacity-50',
                    settlement.is_paid
                      ? 'bg-profit/20 text-profit'
                      : 'border border-line bg-surface-2 text-ink-muted',
                  )}
                >
                  {settlement.is_paid ? 'שולם ✓' : 'סמן כשולם'}
                </button>
              ) : settlement.is_paid ? (
                <Badge tone="profit">שולם</Badge>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
