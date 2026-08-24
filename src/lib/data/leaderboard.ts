import 'server-only';

import type {
  LeaderboardEntry,
  LeaderboardPeriod,
  PublicProfile,
} from '@/lib/domain/leaderboard';
import { createClient } from '@/lib/supabase/server';

/**
 * The global ranking. Aggregation happens in the database, over finalised
 * results only — the browser never sees per-game rows, and open games cannot
 * influence a rank.
 */
export async function loadGlobalLeaderboard(
  period: LeaderboardPeriod = 'ALL',
): Promise<LeaderboardEntry[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('get_global_leaderboard', {
    p_period: period,
    p_limit: 100,
  });
  if (error) return [];

  const payload = data as { rows?: LeaderboardEntry[] } | null;
  return payload?.rows ?? [];
}

/**
 * What one player may see about another. The privacy rules live in
 * `get_public_profile`, so a caller cannot ask for more than they are owed.
 * Returns null when the profile is not visible to the viewer at all.
 */
export async function loadPublicProfile(userId: string): Promise<PublicProfile | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('get_public_profile', { p_user: userId });
  if (error || !data) return null;
  return data as PublicProfile;
}
