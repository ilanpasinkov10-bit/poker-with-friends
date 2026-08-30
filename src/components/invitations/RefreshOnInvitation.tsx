'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

/**
 * Keeps the home screen's invitations current, without a socket.
 *
 * Two cheap signals, no third connection:
 *
 *   · The service worker forwards every push it receives to open tabs. When one
 *     is an invitation, this re-reads the screen — so a person already looking
 *     at the home screen sees the card appear, not just a notification. It is
 *     the *existing* push path doing double duty; nothing new is subscribed to
 *     and nothing new is initialised. A person who has not granted notification
 *     permission simply has no service worker to hear from.
 *
 *   · Coming back to the tab re-reads too, which is what covers the person who
 *     was elsewhere when the invitation arrived.
 *
 * The deliberate non-choice is a realtime channel. One would mean a permanent
 * socket per signed-in person on the app's most-visited screen, plus the
 * Supabase client in its bundle — which the home screen does not carry today —
 * for an event that happens a couple of times a week. The table screen keeps
 * its socket because a game changes every few seconds; this does not.
 */
export function RefreshOnInvitation() {
  const router = useRouter();

  useEffect(() => {
    const refresh = () => router.refresh();

    const onMessage = (event: MessageEvent) => {
      const data = event.data as { source?: string; kind?: string } | null;
      if (data?.source !== 'pwf-push') return;
      if (data.kind && data.kind !== 'TABLE_INVITATION') return;
      refresh();
    };

    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh();
    };

    navigator.serviceWorker?.addEventListener('message', onMessage);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      navigator.serviceWorker?.removeEventListener('message', onMessage);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [router]);

  return null;
}
