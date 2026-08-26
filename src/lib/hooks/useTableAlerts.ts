'use client';

import { useEffect, useRef } from 'react';
import { useToast } from '@/components/ui/Toast';
import { EVENT_SOUND, eventToast } from '@/lib/domain/events';
import { alertsForChange, type AlertSnapshot } from '@/lib/domain/table-alerts';
import { playSound } from '@/lib/sound/engine';
import { useAudioUnlock } from './useAudioUnlock';
import type { TableViewModel } from '@/lib/data/table';

/**
 * Announces table events to the player who has the app open.
 *
 * One pipeline drives both the toast and the sound, because they answer the
 * same question — what just happened — and two pipelines would eventually
 * disagree about it. It is entirely local: no permission is asked for, nothing
 * is stored, and it works whether or not Web Push was ever granted. Push is
 * for the phone in a pocket; this is for the phone on the table.
 *
 * The two settings stay independent. Sounds follow the player's own switch;
 * toasts do not, because a silent visual note is not the thing anyone turns
 * off when they turn sounds off.
 *
 * Sound also needs the browser's permission, which is only ever given during a
 * real interaction — see `useAudioUnlock`. That is armed here rather than at
 * the app root so that a player with sounds switched off never has an audio
 * context created for them at all.
 */
export function useTableAlerts(model: TableViewModel, soundsEnabled: boolean) {
  const toast = useToast();
  const previous = useRef<AlertSnapshot | null>(null);
  // Read through a ref so a change of setting never re-runs the effect and
  // re-announces what has already been announced.
  const wantsSound = useRef(soundsEnabled);
  wantsSound.current = soundsEnabled;

  useAudioUnlock(soundsEnabled);

  const { status } = model.table;
  const { recentActivity, viewer } = model;

  useEffect(() => {
    const current: AlertSnapshot = { status, events: recentActivity };
    const before = previous.current;
    previous.current = current;

    for (const event of alertsForChange(before, current, viewer.userId)) {
      toast.info(eventToast(event));
      const sound = EVENT_SOUND[event.kind];
      if (sound && wantsSound.current) playSound(sound);
    }
  }, [status, recentActivity, viewer.userId, toast]);
}
