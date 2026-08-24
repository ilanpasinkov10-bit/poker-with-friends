'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { guard, ok, type ActionResult } from '@/lib/action-result';
import { AppError } from '@/lib/errors';
import { loadPublicProfile } from '@/lib/data/leaderboard';
import type { PublicProfile } from '@/lib/domain/leaderboard';
import { isUuid } from '@/lib/domain/ids';
import { createClient } from '@/lib/supabase/server';

const nameSchema = z.string().trim().min(1, 'צריך להזין שם').max(40, 'השם ארוך מדי');

export async function updateDisplayNameAction(displayName: string): Promise<ActionResult> {
  return guard(async () => {
    const name = nameSchema.parse(displayName);
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new AppError('NOT_AUTHENTICATED');

    const { error } = await supabase.from('profiles').update({ display_name: name }).eq('id', user.id);
    if (error) throw error;

    revalidatePath('/profile', 'layout');
    revalidatePath('/leaderboard');
    return ok();
  });
}

/**
 * Records a newly uploaded avatar. The file itself is uploaded straight to
 * Supabase Storage from the browser under `<user-id>/…`, which the storage
 * policy pins to auth.uid() — so a user can only ever write their own folder.
 * Here we double-check the path before storing the public URL.
 */
export async function setAvatarAction(objectPath: string): Promise<ActionResult<{ url: string }>> {
  return guard(async () => {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new AppError('NOT_AUTHENTICATED');

    if (!objectPath.startsWith(`${user.id}/`) || objectPath.includes('..')) {
      throw new AppError('NOT_AUTHORIZED');
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from('avatars').getPublicUrl(objectPath);

    const { data: previous } = await supabase
      .from('profiles')
      .select('avatar_url')
      .eq('id', user.id)
      .maybeSingle();

    const { error } = await supabase.from('profiles').update({ avatar_url: publicUrl }).eq('id', user.id);
    if (error) throw error;

    // Replace, don't accumulate: drop the previous file once the new one is live.
    const previousPath = extractAvatarPath(previous?.avatar_url ?? null);
    if (previousPath && previousPath !== objectPath && previousPath.startsWith(`${user.id}/`)) {
      await supabase.storage.from('avatars').remove([previousPath]);
    }

    revalidatePath('/profile', 'layout');
    return ok({ url: publicUrl });
  });
}

export async function removeAvatarAction(): Promise<ActionResult> {
  return guard(async () => {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new AppError('NOT_AUTHENTICATED');

    const { data: profile } = await supabase
      .from('profiles')
      .select('avatar_url')
      .eq('id', user.id)
      .maybeSingle();

    const { error } = await supabase.from('profiles').update({ avatar_url: null }).eq('id', user.id);
    if (error) throw error;

    const path = extractAvatarPath(profile?.avatar_url ?? null);
    if (path && path.startsWith(`${user.id}/`)) {
      await supabase.storage.from('avatars').remove([path]);
    }

    revalidatePath('/profile', 'layout');
    revalidatePath('/leaderboard');
    return ok();
  });
}

function extractAvatarPath(url: string | null): string | null {
  if (!url) return null;
  const marker = '/storage/v1/object/public/avatars/';
  const index = url.indexOf(marker);
  return index === -1 ? null : decodeURIComponent(url.slice(index + marker.length));
}

/**
 * Fetches another player's public profile. All filtering happens inside
 * `get_public_profile`, so this cannot return more than the viewer is allowed.
 */
export async function fetchPublicProfileAction(
  userId: string,
): Promise<ActionResult<PublicProfile | null>> {
  return guard(async () => {
    if (!isUuid(userId)) throw new AppError('NOT_FOUND');
    const profile = await loadPublicProfile(userId);
    if (!profile) throw new AppError('PROFILE_PRIVATE');
    return ok(profile);
  });
}

const privacySchema = z.object({
  shareStatsWithTableMembers: z.boolean(),
  shareDetailedHistory: z.boolean(),
  showOnLeaderboard: z.boolean(),
});

export async function updatePrivacyAction(
  input: z.input<typeof privacySchema>,
): Promise<ActionResult> {
  return guard(async () => {
    const values = privacySchema.parse(input);
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new AppError('NOT_AUTHENTICATED');

    const { error } = await supabase.from('profile_privacy_settings').upsert(
      {
        profile_id: user.id,
        share_stats_with_table_members: values.shareStatsWithTableMembers,
        share_detailed_history: values.shareDetailedHistory,
        show_on_leaderboard: values.showOnLeaderboard,
      },
      { onConflict: 'profile_id' },
    );
    if (error) throw error;

    revalidatePath('/profile', 'layout');
    revalidatePath('/leaderboard');
    return ok();
  });
}
