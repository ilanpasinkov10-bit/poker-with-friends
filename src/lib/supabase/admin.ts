import 'server-only';

import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { publicEnv, secretKey } from '@/lib/env';
import type { Database } from '@/types/database';

/**
 * Service-role client. Bypasses RLS entirely, so it is used only for
 * maintenance work that has no user identity (e.g. orphaned avatar cleanup).
 * The key is read from a server-only variable and must never be imported into
 * a client component.
 */
export function createAdminClient() {
  const env = publicEnv();
  return createSupabaseClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, secretKey(), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
