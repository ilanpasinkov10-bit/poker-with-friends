'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { AppError, toHebrewError } from '@/lib/errors';
import { guard, ok, type ActionResult } from '@/lib/action-result';
import { requestOrigin } from '@/lib/site-origin';
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
        // arrives signed out. `/auth/callback` is the route that exchanges it,
        // and it signs them in, so confirming is the last step and not the
        // second-to-last.
        //
        // Built from the deployment actually serving this request rather than
        // from an environment variable, so production sends production links
        // and a preview sends its own — see `requestOrigin`, which will not
        // believe a Host header naming somewhere else.
        //
        // The address must also be listed under Authentication → URL
        // Configuration → Redirect URLs, or Supabase substitutes Site URL back.
        emailRedirectTo: `${await requestOrigin()}/auth/callback`,
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

/**
 * Sends a password-reset email — and says the same thing either way.
 *
 * The answer to "is there an account for this address" is not something a form
 * should hand out, so this one reports success for an address that does not
 * exist, for one that does, and for a malformed one alike. Supabase behaves the
 * same way at its end; what matters here is that no *error* path leaks the
 * difference back to the screen.
 *
 * Two failures are still surfaced, because neither says anything about the
 * address: the project refusing on a rate limit, and the auth service being
 * unreachable. Both are things the person can act on — wait, or try again —
 * and staying silent about them would leave somebody waiting for mail that was
 * never sent.
 *
 * `redirectTo` used to be a parameter. It is not the caller's to choose: a
 * value from the browser is a link in an email going to a real inbox.
 */
export async function requestPasswordResetAction(input: { email: string }): Promise<ActionResult> {
  return guard(async () => {
    const parsed = emailSchema.safeParse(input.email);
    // Not an error the person sees. A malformed address cannot have an account,
    // and saying so would answer the question this action refuses to answer.
    if (!parsed.success) return ok();

    const supabase = await createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(parsed.data, {
      redirectTo: `${await requestOrigin()}/auth/callback/recovery`,
    });

    if (error) {
      const { code } = toHebrewError(error);
      console.error('[auth] password reset failed', code, '|', error.message);
      // Rate limiting and an unreachable service are about us, not about them.
      if (code === 'TOO_MANY_ATTEMPTS' || code === 'NETWORK_ERROR') throw error;
      // Anything else — including "user not found" in whatever wording a future
      // version of the auth service uses — is swallowed, and the screen says
      // the same sentence it says on success.
    }

    return ok();
  });
}

/**
 * Sets a new password for whoever is signed in.
 *
 * Reached from a recovery link, which signs the person in on a recovery session
 * first — that session is the proof they own the address, and it is why no old
 * password is asked for. Anyone who is already signed in can also use it to
 * change their password.
 *
 * A guest is refused: an anonymous account has no address to have proved
 * anything with, and giving one a password here would be a way to make an
 * account nobody can ever sign in to. `upgradeGuestAction` is that path.
 */
export async function updatePasswordAction(input: {
  password: string;
  confirmPassword: string;
}): Promise<ActionResult> {
  return guard(async () => {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new AppError('RESET_LINK_EXPIRED');
    if ((user as { is_anonymous?: boolean }).is_anonymous) throw new AppError('NOT_AUTHORIZED');

    // The same rule signing up uses, so a password accepted at one end of the
    // app is accepted at the other.
    const password = passwordSchema.safeParse(input.password);
    if (!password.success) throw new AppError('SHORT_PASSWORD');
    if (input.password !== input.confirmPassword) throw new AppError('PASSWORDS_DO_NOT_MATCH');

    const { error } = await supabase.auth.updateUser({ password: password.data });
    if (error) throw error;

    revalidatePath('/', 'layout');
    return ok();
  });
}
