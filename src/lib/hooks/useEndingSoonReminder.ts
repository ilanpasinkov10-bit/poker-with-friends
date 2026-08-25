'use client';

import { useEffect } from 'react';
import { checkEndingSoonAction } from '@/lib/actions/notifications';
import { CHECK_INTERVAL_MS, shouldWatchForReminder } from '@/lib/domain/ending-soon';

/**
 * Delivers the "one hour to go" reminder without a scheduler.
 *
 * A table in its final stretch is, by definition, a game in progress — and a
 * game in progress has someone's app open, if only the admin approving
 * rebuys. So the open app is the trigger: while the finish is close enough to
 * matter, it asks the server every couple of minutes whether the reminder is
 * due. The server claims the table atomically, so however many phones happen
 * to be watching, exactly one reminder goes out.
 *
 * Outside that stretch the hook does nothing at all — no timer, no requests.
 * A table with six hours left costs precisely what it did before.
 *
 * Deliberately separate from the realtime poll, which runs every thirty
 * seconds for the whole game; this needs to run rarely, and only near the end.
 */
export function useEndingSoonReminder(table: {
  id: string;
  status: string;
  plannedEndAt: string;
  endingSoonNotifiedAt: string | null;
}) {
  const { id, status, plannedEndAt, endingSoonNotifiedAt } = table;

  useEffect(() => {
    const state = { status, plannedEndAt, endingSoonNotifiedAt };
    if (!shouldWatchForReminder(state)) return;

    let cancelled = false;

    const ask = () => {
      // Re-checked on every tick because the window also closes: a phone left
      // face-up overnight should stop asking rather than poll till the battery dies.
      if (cancelled || !shouldWatchForReminder(state)) return;
      // The reply carries nothing. The server decides whether to send, and a
      // failure there is not something the player needs to hear about.
      void checkEndingSoonAction(id);
    };

    ask();
    const timer = setInterval(ask, CHECK_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [id, status, plannedEndAt, endingSoonNotifiedAt]);
}
