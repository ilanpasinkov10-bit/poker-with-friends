'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

const TABLES = [
  'poker_tables',
  'table_players',
  'buyin_transactions',
  'rebuy_requests',
  'chip_count_submissions',
  'game_results',
  'settlements',
] as const;

/**
 * Keeps the screen live. Postgres changes for this table trigger a debounced
 * router.refresh(), so the server components re-render with authoritative data
 * instead of the client trying to mirror the query logic. Realtime is delivered
 * through RLS, so a player is only ever woken by rows they may read.
 *
 * A slow poll covers the rare case of a dropped socket.
 */
export function useTableRealtime(tableId: string): { connected: boolean } {
  const router = useRouter();
  const [connected, setConnected] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const supabase = createClient();

    const scheduleRefresh = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => router.refresh(), 180);
    };

    const filter = `table_id=eq.${tableId}`;
    let channel = supabase.channel(`table:${tableId}`);

    for (const table of TABLES) {
      channel = channel.on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table,
          filter: table === 'poker_tables' ? `id=eq.${tableId}` : filter,
        },
        scheduleRefresh,
      );
    }

    channel.subscribe((status) => setConnected(status === 'SUBSCRIBED'));

    const poll = setInterval(() => {
      if (document.visibilityState === 'visible') router.refresh();
    }, 30_000);

    const onVisible = () => {
      if (document.visibilityState === 'visible') router.refresh();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      if (timer.current) clearTimeout(timer.current);
      clearInterval(poll);
      document.removeEventListener('visibilitychange', onVisible);
      void supabase.removeChannel(channel);
    };
  }, [tableId, router]);

  return { connected };
}
