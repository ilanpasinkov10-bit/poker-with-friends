'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/Button';
import { Field, TextInput } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';
import { updatePasswordAction } from '@/lib/actions/auth';

/** The same minimum the sign-up form states, so one rule is visible in both. */
const MIN_LENGTH = 8;

/**
 * Choosing a new password, having arrived from a reset link.
 *
 * The recovery link already signed them in, which is what stands in for the old
 * password. Setting a new one leaves them signed in and on the home screen —
 * there is nothing left to log into.
 */
export function ResetPasswordForm() {
  const router = useRouter();
  const toast = useToast();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const tooShort = password.length > 0 && password.length < MIN_LENGTH;
  const mismatch = confirmPassword.length > 0 && password !== confirmPassword;
  const ready = password.length >= MIN_LENGTH && password === confirmPassword;

  return (
    <form
      className="grid gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        startTransition(async () => {
          const result = await updatePasswordAction({ password, confirmPassword });
          if (!result.ok) {
            setError(result.message);
            return;
          }
          toast.success('הסיסמה עודכנה');
          router.replace('/');
          router.refresh();
        });
      }}
    >
      <Field
        label="סיסמה חדשה"
        htmlFor="password"
        hint={`לפחות ${MIN_LENGTH} תווים`}
        error={tooShort ? 'הסיסמה קצרה מדי — לפחות 8 תווים' : null}
      >
        <TextInput
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={MIN_LENGTH}
          ltr
          placeholder="••••••••"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </Field>

      <Field
        label="אימות סיסמה"
        htmlFor="confirmPassword"
        error={mismatch ? 'הסיסמאות אינן זהות' : null}
      >
        <TextInput
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          required
          minLength={MIN_LENGTH}
          ltr
          placeholder="••••••••"
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
        />
      </Field>

      {error ? (
        <p
          role="alert"
          className="rounded-xl border border-loss/30 bg-loss-soft px-3 py-2 text-sm text-loss"
        >
          {error}
        </p>
      ) : null}

      <Button type="submit" size="lg" block loading={pending} disabled={!ready}>
        שמירת הסיסמה
      </Button>
    </form>
  );
}
