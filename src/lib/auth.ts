import 'server-only';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import type { ProfileRow } from '@/types/database';

export interface SessionUser {
  id: string;
  email: string | null;
  isAnonymous: boolean;
  profile: ProfileRow | null;
}

/** Current viewer, guest or registered. Returns null when nobody is signed in. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle();

  return {
    id: user.id,
    email: user.email ?? null,
    // `is_anonymous` marks a guest session created through signInAnonymously.
    isAnonymous: Boolean((user as { is_anonymous?: boolean }).is_anonymous),
    profile: profile ?? null,
  };
}

/** For pages that only registered accounts may open. */
export async function requireRegisteredUser(redirectTo: string): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user || user.isAnonymous) {
    redirect(`/auth/sign-in?next=${encodeURIComponent(redirectTo)}`);
  }
  return user;
}

export async function requireAnyUser(redirectTo: string): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) {
    redirect(`/auth/sign-in?next=${encodeURIComponent(redirectTo)}`);
  }
  return user;
}
