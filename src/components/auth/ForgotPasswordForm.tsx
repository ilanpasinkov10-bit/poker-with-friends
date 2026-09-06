'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/Button';
import { Field, TextInput } from '@/components/ui/Field';
import { requestPasswordResetAction } from '@/lib/actions/auth';

/**
 * "שכחתי סיסמה" — asking for a reset link.
 *
 * The confirmation says a link has been sent *if* there is an account, and says
 * exactly that whether or not there is one. Anything more definite would turn
 * this form into a way of finding out who has an account here, one address at a
 * time.
 */
export function ForgotPasswordForm({ defaultEmail = '' }: { defaultEmail?: string }) {
  const [email, setEmail] = useState(defaultEmail);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [pending, startTransition] = useTransition();

  if (sent) {
    return (
      <div className="rounded-2xl border border-profit/30 bg-profit-soft p-5 text-center">
        <p className="text-lg font-bold text-profit">בדקו את המייל</p>
        <p className="mt-2 text-sm text-ink-muted">
          אם קיים חשבון עם הכתובת הזו, שלחנו אליה קישור לאיפוס הסיסמה. הקישור תקף לזמן מוגבל.
        </p>
        <p className="mt-2 text-xs text-ink-faint">
          לא הגיע כלום? בדקו גם בתיקיית הספאם.
        </p>
      </div>
    );
  }

  return (
    <form
      className="grid gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        startTransition(async () => {
          const result = await requestPasswordResetAction({ email });
          if (!result.ok) {
            setError(result.message);
            return;
          }
          setSent(true);
        });
      }}
    >
      <Field label="אימייל" htmlFor="email" hint="נשלח אליכם קישור לבחירת סיסמה חדשה">
        <TextInput
          id="email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          required
          ltr
          placeholder="you@example.com"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
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

      <Button type="submit" size="lg" block loading={pending}>
        שלחו לי קישור
      </Button>
    </form>
  );
}
