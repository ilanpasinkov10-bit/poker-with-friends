'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { AppError } from '@/lib/errors';
import { guard, ok, type ActionResult } from '@/lib/action-result';
import { createClient } from '@/lib/supabase/server';

const emailSchema = z.string().trim().email();
const passwordSchema = z.string().min(8, 'הסיסמה קצרה מדי — לפחות 8 תווים');
const nameSchema = z.string().trim().min(1).max(40);

export async function signUpAction(input: {
  email: string;
  password: string;
  displayName: string;
}): Promise<ActionResult<{ needsConfirmation: boolean }>> {
  return guard(async () => {
    const email = emailSchema.parse(input.email);
    const password = passwordSchema.parse(input.password);
    const displayName = nameSchema.parse(input.displayName);

    const supabase = await createClient();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { display_name: displayName } },
    });
    if (error) throw error;

    revalidatePath('/', 'layout');
    return ok({ needsConfirmation: !data.session });
  });
}

export async function signInAction(input: {
  email: string;
  password: string;
}): Promise<ActionResult> {
  return guard(async () => {
    const email = emailSchema.parse(input.email);
    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password: input.password });
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
    const email = emailSchema.parse(input.email);
    const password = passwordSchema.parse(input.password);
    const displayName = nameSchema.parse(input.displayName);

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
    const email = emailSchema.parse(input.email);
    const supabase = await createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: input.redirectTo,
    });
    if (error) throw error;
    return ok();
  });
}
