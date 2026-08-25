'use client';

import { useEffect, useRef } from 'react';
import { soundsForChange, type TableSnapshot } from '@/lib/domain/table-diff';
import { playSound } from '@/lib/sound/engine';
import type { TableViewModel } from '@/lib/data/table';

/**
 * Plays a cue when the table changes under the player's eyes.
 *
 * Realtime already re-renders the screen from the server on every change, so
 * the events are the difference between one render and the next. Comparing
 * snapshots means there is no second event channel to keep in step, and a
 * sound can never fire for something the screen is not also showing.
 *
 * The first render only records a baseline. Without that, opening a table that
 * already has six players and twenty entries would fire every cue at once.
 */
export function useTableSounds(model: TableViewModel, enabled: boolean) {
  const previous = useRef<TableSnapshot | null>(null);

  useEffect(() => {
    const current = snapshot(model);
    const before = previous.current;
    previous.current = current;

    // Still play nothing while disabled, but keep the baseline moving: turning
    // sounds back on mid-game must not then replay everything that was missed.
    if (!before || !enabled) return;

    for (const sound of soundsForChange(before, current)) playSound(sound);
  }, [model, enabled]);
}

function snapshot(model: TableViewModel): TableSnapshot {
  return {
    status: model.table.status,
    seatedIds: model.players.map((p) => p.id),
    leftIds: model.leftPlayers.map((p) => p.id),
    buyInCount: model.totals.buyInCount,
  };
}
