'use client';

import { createBrowserClient } from '@supabase/ssr';
import { publicEnv } from '@/lib/env';
import type { Database } from '@/types/database';

let cached: ReturnType<typeof createBrowserClient<Database>> | null = null;

/** Browser client. Only ever uses the anon key and is fully subject to RLS. */
export function createClient() {
  if (cached) return cached;
  const env = publicEnv();
  cached = createBrowserClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.publishableKey,
  );
  return cached;
}
