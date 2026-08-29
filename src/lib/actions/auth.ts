'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { AppError } from '@/lib/errors';
import { guard, ok, type ActionResult } from '@/lib/action-result';
import { siteUrl } from '@/lib/env';
import { createClient } from '@/lib/supabase/server';

const emailSchema = z.string().trim().email();
const passwordSchema = z.string().min(8);
const nameSchema = z.string().trim().min(1).max(40);

/**
 * The three fields, each refused in its own words.
 *
 * These were parsed with `.parse()`, which throws a ZodError whose message is a
 * JSON dump of the issues. Nothing downstream recognised that shape, so a
 * mistyped address — `ilan@gmail`, which every browser's `type="email"` accepts
 * and lets through to here — reached the person as "משהו השתבש. נסו שוב בעוד
 * רגע.", indistinguishable from the auth service being down.
 */
function readCredentials(input: { email: string; password: string; displayName: string }) {
  const email = emailSchema.safeParse(input.email);
  if (!email.success) throw new AppError('BAD_EMAIL', undefined, `rejected email: ${input.email}`);

  const password = passwordSchema.safeParse(input.password);
  if (!password.success) throw new AppError('SHORT_PASSWORD');

  const displayName = nameSchema.safeParse(input.displayName);
  if (!displayName.success) throw new AppError('INVALID_NAME');

  return { email: email.data, password: password.data, displayName: displayName.data };
}

export async function signUpAction(input: {
  email: string;
  password: string;
  displayName: string;
}): Promise<ActionResult<{ needsConfirmation: boolean }>> {
  return guard(async () => {
    const { email, password, displayName } = readCredentials(input);

    const supabase = await createClient();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { display_name: displayName },
        // Where the confirmation link lands. Without it Supabase falls back to
        // the project's Site URL, which drops the `?code=` on a page that does
        // not exchange it — the address is confirmed and the person still
        // arrives signed out. `/auth/callback` is the route that exchanges it.
        //
        // The address must also be listed under Authentication → URL
        // Configuration → Redirect URLs, or Supabase substitutes Site URL back.
        emailRedirectTo: `${siteUrl()}/auth/callback`,
      },
    });
    if (error) throw error;

    revalidatePath('/', 'layout');
    // With "Confirm email" on, Supabase answers a *duplicate* address with a
    // user carrying no identities rather than an error, so that a stranger
    // cannot use the form to find out who has an account here. Reporting that
    // as "check your email" is the intended behaviour, not a missed error.
    return ok({ needsConfirmation: !data.session });
  });
}

export async function signInAction(input: {
  email: string;
  password: string;
}): Promise<ActionResult> {
  return guard(async () => {
    const parsed = emailSchema.safeParse(input.email);
    // A sign-in never says which of the two was wrong.
    if (!parsed.success) throw new AppError('BAD_CREDENTIALS', undefined, 'malformed email');
    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email: parsed.data,
      password: input.password,
    });
    if (error) throw error;
    revalidatePath('/', 'layout');
    return ok();
  });
}

export async function signOutAction(): Promise<ActionResult> {
  return guard(async () => {
    const supabase = await createClient();
    await supabase.auth.signOut();
    revalidatePath('/', 'layout');
    return ok();
  });
}

/**
 * Converts the current guest (anonymous) session into a permanent account.
 *
 * Supabase links the new email identity to the *same* auth user, so every
 * table_player row and game_result the guest already owns stays attached —
 * no name matching, no merging heuristics.
 */
export async function upgradeGuestAction(input: {
  email: string;
  password: string;
  displayName: string;
}): Promise<ActionResult<{ needsConfirmation: boolean }>> {
  return guard(async () => {
    const { email, password, displayName } = readCredentials(input);

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new AppError('NOT_AUTHENTICATED');
    if (!(user as { is_anonymous?: boolean }).is_anonymous) {
      throw new AppError('ALREADY_COMPLETED', 'החשבון הזה כבר רשום');
    }

    const { data, error } = await supabase.auth.updateUser({
      email,
      password,
      data: { display_name: displayName },
    });
    if (error) throw error;

    await supabase
      .from('profiles')
      .update({ display_name: displayName })
      .eq('id', user.id);

    revalidatePath('/', 'layout');
    // When email confirmation is on, the address only becomes active after the
    // user clicks the link; the session itself already carries the password.
    return ok({ needsConfirmation: Boolean(data.user?.new_email) });
  });
}

export async function requestPasswordResetAction(input: {
  email: string;
  redirectTo: string;
}): Promise<ActionResult> {
  return guard(async () => {
    const parsed = emailSchema.safeParse(input.email);
    if (!parsed.success) throw new AppError('BAD_EMAIL');
    const supabase = await createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(parsed.data, {
      redirectTo: input.redirectTo,
    });
    if (error) throw error;
    return ok();
  });
}
