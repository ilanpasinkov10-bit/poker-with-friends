'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { Card } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/Modal';
import { Num } from '@/components/ui/Num';
import { useToast } from '@/components/ui/Toast';
import { cn } from '@/lib/cn';
import { blindTimerAction } from '@/lib/actions/tables';
import {
  at,
  describeLevel,
  formatClock,
  parseLevels,
  type BlindTimerState,
} from '@/lib/domain/blinds';
import { vibrate } from '@/lib/haptics';
import { playSound } from '@/lib/sound/engine';
import type { PokerTableRow } from '@/types/database';

/**
 * The blinds, and how long they last.
 *
 * The countdown here is display only. Every second it re-reads the clock and
 * asks `at()` what the persisted anchor means *now* — it never accumulates,
 * never counts down from a number it was given, and never writes anything. So
 * a phone that was locked for eight minutes comes back showing eight minutes
 * less, and a level that turned over while the app was closed has simply
 * already turned over by the time the app is looked at again.
 *
 * It is also the only thing on the table screen that re-renders every second.
 * The tick lives here rather than in `TableScreen` so the seats, the pot and
 * the ledger are not re-rendered sixty times a minute for a clock.
 *
 * Changes to the timer itself — a pause, a manual step — arrive through the
 * realtime subscription the table screen already holds, because the state
 * lives on the `poker_tables` row that subscription already watches. This
 * component adds no subscription, no polling and no refresh of its own.
 */
export function BlindTimer({
  table,
  isAdmin,
  soundsEnabled,
}: {
  table: PokerTableRow;
  isAdmin: boolean;
  soundsEnabled: boolean;
}) {
  // Null until mounted. The server cannot render this card: every value on it
  // is a function of the current instant, so a server render and the hydration
  // that follows it a moment later disagree the moment a second ticks over —
  // which React reports as a hydration failure and recovers from by throwing
  // the tree away. There is nothing to server-render here that would still be
  // true by the time it arrived.
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const state: BlindTimerState = {
    status: table.blind_status,
    levels: parseLevels(table.blind_levels),
    levelIndex: table.blind_level_index,
    levelStartedAt: table.blind_level_started_at,
    pausedAt: table.blind_paused_at,
  };

  const view = now === null ? null : at(state, table.status, now);
  const announced = useRef<number | null>(null);

  useEffect(() => {
    if (!view || now === null) return;
    const previous = announced.current;
    announced.current = view.index;
    // Nothing to announce on the first render, or the app would chirp every
    // time the screen was opened.
    if (previous === null || previous === view.index) return;
    if (soundsEnabled) playSound('BLINDS_UP');
    vibrate([90, 60, 90]);
  }, [view, now, soundsEnabled]);

  if (!view) return null;

  const urgent = !view.paused && !view.isFinal && view.remainingMs <= 60_000;
  const isBreak = view.level.kind === 'BREAK';

  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-ink-faint">{isBreak ? 'הפסקה' : 'בליינדים'}</p>
          <p className="mt-0.5 truncate text-2xl font-black tracking-tight text-ink">
            {isBreak ? 'הפסקה' : <Num>{describeLevel(view.level)}</Num>}
          </p>
        </div>
        <div className="shrink-0 text-end">
          <p className="text-xs text-ink-faint">
            {view.paused
              ? 'מושהה'
              : view.isFinal
                ? 'שלב אחרון'
                : isBreak
                  ? 'המשחק ממשיך בעוד'
                  : `עולים ל-${describeLevel(view.next!)} בעוד`}
          </p>
          <p
            className={cn(
              'mt-0.5 text-3xl font-black tabular-nums tracking-tight transition-colors',
              view.paused ? 'text-ink-faint' : urgent ? 'text-warn' : 'text-ink',
            )}
          >
            {view.isFinal && view.remainingMs === 0 ? (
              <span className="text-ink-faint">—</span>
            ) : (
              <Num>{formatClock(view.remainingMs)}</Num>
            )}
          </p>
        </div>
      </div>

      {isAdmin ? <AdminControls tableId={table.id} paused={view.paused} view={view} /> : null}
    </Card>
  );
}

function AdminControls({
  tableId,
  paused,
  view,
}: {
  tableId: string;
  paused: boolean;
  view: NonNullable<ReturnType<typeof at>>;
}) {
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [confirmCancel, setConfirmCancel] = useState(false);

  const run = (command: 'PAUSE' | 'RESUME' | 'NEXT' | 'PREVIOUS' | 'STOP', done: string) =>
    startTransition(async () => {
      const result = await blindTimerAction(tableId, command);
      if (!result.ok) toast.error(result.message);
      else toast.success(done);
    });

  return (
    <>
      <div className="mt-4 grid grid-cols-2 gap-2 border-t border-line-soft pt-3">
        {paused ? (
          <ControlButton onClick={() => run('RESUME', 'הטיימר ממשיך')} disabled={pending}>
            המשך
          </ControlButton>
        ) : (
          <ControlButton onClick={() => run('PAUSE', 'הטיימר הושהה')} disabled={pending}>
            השהה
          </ControlButton>
        )}
        {/* Ends the blind increases for this game — not a pause, and not
            undoable from here, so it asks first and is coloured like what it
            does. Opening a dialog is also what makes a double tap harmless:
            the second tap lands on the dialog, not on a second cancel. */}
        <ControlButton onClick={() => setConfirmCancel(true)} disabled={pending} tone="danger">
          בטל טיימר
        </ControlButton>
        <ControlButton
          onClick={() => run('PREVIOUS', 'חזרנו שלב אחורה')}
          disabled={pending || view.index === 0}
        >
          שלב קודם
        </ControlButton>
        <ControlButton
          onClick={() => run('NEXT', 'עברנו לשלב הבא')}
          disabled={pending || view.isFinal}
        >
          שלב הבא
        </ControlButton>
      </div>

      <ConfirmDialog
        open={confirmCancel}
        tone="danger"
        title="ביטול טיימר הבליינדים"
        message="האם אתה בטוח שברצונך לבטל את טיימר הבליינדים? פעולה זו תפסיק את מנגנון העלאת הבליינדים למשחק הנוכחי."
        cancelLabel="חזור"
        confirmLabel="כן, בטל טיימר"
        loading={pending}
        onCancel={() => setConfirmCancel(false)}
        onConfirm={() => {
          // The dialog closes on the way out, so a second tap on a stale
          // button has nothing left to confirm.
          setConfirmCancel(false);
          run('STOP', 'טיימר הבליינדים בוטל');
        }}
      />
    </>
  );
}

function ControlButton({
  children,
  onClick,
  disabled,
  tone = 'normal',
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  tone?: 'normal' | 'danger';
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'h-11 rounded-xl border text-sm font-bold transition-colors disabled:opacity-40',
        tone === 'danger'
          ? 'border-loss/40 bg-loss-soft text-loss'
          : 'border-line bg-surface-3 text-ink',
      )}
    >
      {children}
    </button>
  );
}
