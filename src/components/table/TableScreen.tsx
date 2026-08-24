'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Card, SectionTitle } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Num } from '@/components/ui/Num';
import { Stat } from '@/components/ui/Stat';
import { cn } from '@/lib/cn';
import { formatChips, formatDate, formatMoney } from '@/lib/format';
import { useTableRealtime } from '@/lib/hooks/useTableRealtime';
import {
  TABLE_STATUS_LABEL,
  TABLE_STATUS_TONE,
  buyInsWord,
  playersWord,
} from '@/lib/labels';
import type { TableViewModel } from '@/lib/data/table';
import { AdminPlayerActions } from './AdminPlayerActions';
import { Countdown } from './Countdown';
import { CountingPanel } from './CountingPanel';
import { GameControls } from './GameControls';
import { JoinCodeCard } from './JoinCodeCard';
import { MyPlayerPanel } from './MyPlayerPanel';
import { PendingJoinRequests, PendingRebuyRequests } from './PendingList';
import { PlayerCard } from './PlayerCard';
import { PublicProfileSheet } from '@/components/profile/PublicProfileSheet';
import { ResultsPanel } from './ResultsPanel';

export function TableScreen({ model }: { model: TableViewModel }) {
  const { connected } = useTableRealtime(model.table.id);
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
      {table.status === 'CANCELLED' ? (
        <EmptyState emoji="🚫" title="המשחק בוטל" description="מנהל השולחן ביטל את המשחק." />
      ) : null}
    </div>
  );
}

function TableHeader({ model, connected }: { model: TableViewModel; connected: boolean }) {
  const { table, viewer } = model;
  return (
    <header>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-black tracking-tight text-ink">{table.name}</h1>
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

function LiveSection({ model }: { model: TableViewModel }) {
  const { table, viewer, players, pendingPlayers, pendingRequests, totals } = model;
  const [profileUserId, setProfileUserId] = useState<string | null>(null);

  return (
    <>
      <Card>
        <Countdown endAt={table.planned_end_at} />
      </Card>

      {viewer.isAdmin ? (
        <>
          <div className="grid grid-cols-2 gap-2">
            <Stat label="שחקנים" value={totals.playerCount} sub={playersWord(totals.playerCount)} />
            <Stat label="כניסות" value={totals.buyInCount} sub={buyInsWord(totals.buyInCount)} />
            <Stat label="בקופה" value={formatMoney(totals.potAgorot)} tone="brand" />
            <Stat label="ז׳יטונים בשולחן" value={formatChips(totals.chipsIssued)} />
          </div>

          <JoinCodeCard joinCode={table.join_code} tableName={table.name} />

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
            <span className="text-xs text-ink-faint">{playersWord(totals.playerCount)}</span>
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
