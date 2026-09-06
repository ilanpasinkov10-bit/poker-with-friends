'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Card, SectionTitle } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Num } from '@/components/ui/Num';
import { cn } from '@/lib/cn';
import { formatChips, formatDate, formatMoney } from '@/lib/format';
import { useTableRealtime } from '@/lib/hooks/useTableRealtime';
import { useEndingSoonReminder } from '@/lib/hooks/useEndingSoonReminder';
import { useTableAlerts } from '@/lib/hooks/useTableAlerts';
import { TABLE_STATUS_LABEL, TABLE_STATUS_TONE, playersWord } from '@/lib/labels';
import type { TableViewModel } from '@/lib/data/table';
import { AdminPlayerActions } from './AdminPlayerActions';
import { BlindTimer } from './BlindTimer';
import { LivePot } from './LivePot';
import { Countdown } from './Countdown';
import { CountingPanel } from './CountingPanel';
import { GameControls } from './GameControls';
import { AddManualPlayerButton } from './AddManualPlayerButton';
import { JoinCodeCard } from './JoinCodeCard';
import { MyPlayerPanel } from './MyPlayerPanel';
import { PendingJoinRequests, PendingRebuyRequests } from './PendingList';
import { PlayerCard } from './PlayerCard';
import { PublicProfileSheet } from '@/components/profile/PublicProfileSheet';
import { ResultsPanel } from './ResultsPanel';

export function TableScreen({ model }: { model: TableViewModel }) {
  const { connected } = useTableRealtime(model.table.id);
  useTableAlerts(model, viewerWantsSound(model));
  // Replaces a frequent scheduler: see useEndingSoonReminder.
  useEndingSoonReminder({
    id: model.table.id,
    status: model.table.status,
    plannedEndAt: model.table.planned_end_at,
    endingSoonNotifiedAt: model.table.ending_soon_notified_at,
  });
  const { table, viewer } = model;

  const live = table.status === 'WAITING' || table.status === 'ACTIVE';

  return (
    <div className="grid gap-6">
      <TableHeader model={model} connected={connected} />

      {live ? <LiveSection model={model} /> : null}
      {table.status === 'COUNTING' ? (
        <>
          <CountingPanel model={model} />
          {viewer.isAdmin ? <GameControls table={table} /> : null}
        </>
      ) : null}
      {table.status === 'COMPLETED' ? <ResultsPanel model={model} /> : null}
      {table.status === 'CANCELLED' ? <CancelledPanel isAdmin={viewer.isAdmin} /> : null}
    </div>
  );
}

function TableHeader({ model, connected }: { model: TableViewModel; connected: boolean }) {
  const { table, viewer } = model;
  return (
    <header>
      {/*
        The status badge and the connection line are the fixed part of this
        row — "ספירת ז׳יטונים" beside "מעודכן בזמן אמת" is about a third of a
        320px screen — so the title is what has to bend. It wraps rather than
        truncates: a table called "פוקר של יום חמישי" was being cut off on the
        narrowest phones, and the name of the table is the one thing on this
        screen nobody should have to guess at.
      */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-black tracking-tight break-words text-ink">{table.name}</h1>
          <p className="mt-0.5 text-xs text-ink-faint">
            <Num>{formatDate(table.game_date)}</Num> · כניסה{' '}
            <Num>{formatMoney(table.buy_in_agorot)}</Num> ={' '}
            <Num>{formatChips(table.chips_per_buy_in)}</Num> ז׳יטונים
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <Badge tone={TABLE_STATUS_TONE[table.status]} dot>
            {TABLE_STATUS_LABEL[table.status]}
          </Badge>
          <span
            className={cn(
              'flex items-center gap-1 text-[0.65rem]',
              connected ? 'text-profit' : 'text-ink-faint',
            )}
          >
            <span
              className={cn('size-1.5 rounded-full', connected ? 'bg-profit' : 'bg-ink-faint')}
            />
            {connected ? 'מעודכן בזמן אמת' : 'מתחבר…'}
          </span>
        </div>
      </div>

      {viewer.isAdmin ? null : (
        <p className="mt-2 text-xs text-ink-faint">
          מנהל השולחן אחראי על אישור כניסות וסיום המשחק.
        </p>
      )}
    </header>
  );
}

/**
 * Everybody with a registered account who already has a seat here — including
 * whoever cashed out, because the database refuses to invite them too. Used
 * only to label the invite sheet; the refusal itself lives in the database.
 */
function seatedUserIds(model: TableViewModel): string[] {
  const ids = [...model.participants, ...model.pendingPlayers]
    .map((player) => player.userId)
    .filter((id): id is string => Boolean(id));
  return [...new Set(ids)];
}

function LiveSection({ model }: { model: TableViewModel }) {
  const { table, viewer, players, leftPlayers, pendingPlayers, pendingRequests, totals } = model;
  const [profileUserId, setProfileUserId] = useState<string | null>(null);

  return (
    <>
      <Card>
        <Countdown endAt={table.planned_end_at} />
      </Card>

      {/* Renders nothing at all for a table with no blind timer configured. */}
      <BlindTimer
        table={table}
        isAdmin={viewer.isAdmin}
        soundsEnabled={viewer.soundsEnabled}
      />

      {model.canSeeEveryonesMoney ? <LivePot model={model} /> : null}

      {viewer.isAdmin ? (
        <>
          <JoinCodeCard
            tableId={table.id}
            joinCode={table.join_code}
            tableName={table.name}
            seatedUserIds={seatedUserIds(model)}
          />

          <PendingJoinRequests tableId={table.id} players={pendingPlayers} />
          <PendingRebuyRequests
            tableId={table.id}
            requests={pendingRequests}
            maxBuyIns={table.max_buy_ins}
          />
        </>
      ) : null}

      {viewer.player ? <MyPlayerPanel model={model} /> : <NotSeated tableId={table.id} />}

      <section>
        <SectionTitle
          action={
            <span className="flex items-center gap-2">
              <span className="text-xs text-ink-faint">{playersWord(totals.playerCount)}</span>
              {/* Next to the list it changes, and only while the game can still
                  take a player — the database refuses one afterwards anyway. */}
              {viewer.isAdmin && (table.status === 'WAITING' || table.status === 'ACTIVE') ? (
                <AddManualPlayerButton tableId={table.id} />
              ) : null}
            </span>
          }
        >
          שחקנים בשולחן
        </SectionTitle>

        {players.length === 0 ? (
          <EmptyState
            emoji="🪑"
            title="עוד אין שחקנים"
            description="שתפו את קוד השולחן כדי שהחברים יצטרפו."
          />
        ) : (
          <ul className="grid gap-2">
            {players.map((player) => (
              <PlayerCard
                key={player.id}
                player={player}
                isMe={player.id === viewer.player?.id}
                maxBuyIns={table.max_buy_ins}
                showMoney={model.canSeeEveryonesMoney || player.id === viewer.player?.id}
                onOpenProfile={setProfileUserId}
                actions={
                  viewer.isAdmin ? (
                    <AdminPlayerActions
                      tableId={table.id}
                      player={player}
                      maxBuyIns={table.max_buy_ins}
                      buyInAgorot={table.buy_in_agorot}
                      chipsPerBuyIn={table.chips_per_buy_in}
                      tableStatus={table.status}
                      adminUserId={viewer.userId}
                    />
                  ) : undefined
                }
              />
            ))}
          </ul>
        )}

        {leftPlayers.length > 0 ? (
          <div className="mt-5">
            <SectionTitle
              action={
                <span className="text-xs text-ink-faint">
                  {model.canSeeEveryonesMoney && totals.cashedOutAgorot > 0
                    ? `נפדו ${formatMoney(totals.cashedOutAgorot)}`
                    : 'הכניסות שלהם נשארות בהתחשבנות'}
                </span>
              }
            >
              עזבו את השולחן
            </SectionTitle>
            <ul className="grid gap-2 opacity-90">
              {leftPlayers.map((player) => (
                <PlayerCard
                  key={player.id}
                  player={player}
                  isMe={player.id === viewer.player?.id}
                  maxBuyIns={table.max_buy_ins}
                  showMoney={model.canSeeEveryonesMoney || player.id === viewer.player?.id}
                  onOpenProfile={setProfileUserId}
                />
              ))}
            </ul>
          </div>
        ) : null}

        {!model.canSeeEveryonesMoney ? (
          <p className="mt-3 text-center text-[0.7rem] text-ink-faint">
            השולחן מוגדר כפרטי — כל שחקן רואה רק את הנתונים שלו.
          </p>
        ) : null}
      </section>

      {viewer.isAdmin ? <GameControls table={table} /> : null}

      <PublicProfileSheet
        userId={profileUserId}
        open={profileUserId !== null}
        onClose={() => setProfileUserId(null)}
      />
    </>
  );
}

/**
 * A cancelled game.
 *
 * Says plainly that no settlement happened, because the difference between
 * "cancelled" and "finished" is the whole point: there is no result, nobody
 * owes anybody, and nothing was calculated. The record is kept — entries and
 * history are all still here — which is worth saying so nobody assumes the
 * evening was erased.
 */
function CancelledPanel({ isAdmin }: { isAdmin: boolean }) {
  return (
    <Card className="text-center">
      <p className="text-3xl" aria-hidden>
        🚫
      </p>
      <p className="mt-2 text-lg font-black text-loss">המשחק בוטל</p>
      <p className="mt-1 text-sm text-ink-muted">
        המשחק בוטל ללא התחשבנות — לא חושבו רווחים או הפסדים לאף שחקן.
      </p>
      <p className="mt-2 text-xs text-ink-faint">
        הכניסות וההיסטוריה של השולחן נשמרו ואפשר לצפות בהן.
      </p>
      {isAdmin ? (
        <Link
          href="/table/new"
          className="mt-4 inline-flex h-11 items-center justify-center rounded-xl bg-brand px-5 text-sm font-bold text-on-brand"
        >
          פתיחת שולחן חדש
        </Link>
      ) : null}
    </Card>
  );
}

function NotSeated({ tableId }: { tableId: string }) {
  return (
    <Card className="text-center">
      <p className="font-semibold text-ink">אתם צופים בשולחן כמנהלים בלבד</p>
      <p className="mt-1 text-sm text-ink-faint">
        לא נוצר לכם כרטיס שחקן בשולחן הזה, ולכן אין לכם כניסות או ז׳יטונים.
      </p>
      <Link href={`/table/${tableId}`} className="sr-only">
        רענון
      </Link>
    </Card>
  );
}

/**
 * Sounds are the player's own setting, and there is nobody to play them for
 * when the viewer is only spectating as an admin without a seat. Toasts are
 * not gated on this: a silent visual note is not what anyone is turning off
 * when they turn sounds off.
 */
function viewerWantsSound(model: TableViewModel): boolean {
  if (!model.viewer.soundsEnabled) return false;
  const live = model.table.status === 'WAITING' || model.table.status === 'ACTIVE';
  return live && (model.viewer.player !== null || model.viewer.isAdmin);
}
