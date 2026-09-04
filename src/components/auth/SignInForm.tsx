'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/Button';
import { Field, TextInput } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';
import { signInAction } from '@/lib/actions/auth';

export function SignInForm({ next }: { next: string }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="grid gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        startTransition(async () => {
          const result = await signInAction({ email, password });
          if (!result.ok) {
            setError(result.message);
            return;
          }
          toast.success('התחברת בהצלחה');
          router.replace(next);
          router.refresh();
        });
      }}
    >
      <Field label="אימייל" htmlFor="email">
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
          onChange={(e) => setEmail(e.target.value)}
        />
      </Field>

      <Field label="סיסמה" htmlFor="password">
        <TextInput
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          ltr
          placeholder="••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </Field>

      {/* Form-level, like the sign-up form: "האימייל או הסיסמה שגויים" is
          about the pair, not about the password box it used to sit under. */}
      {error ? (
        <p
          role="alert"
          className="rounded-xl border border-loss/30 bg-loss-soft px-3 py-2 text-sm text-loss"
        >
          {error}
        </p>
      ) : null}

      <Button type="submit" size="lg" block loading={pending}>
        התחברות
      </Button>
    </form>
  );
}
