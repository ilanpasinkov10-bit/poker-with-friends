'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/Button';
import { Field, TextInput } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';
import { signUpAction, upgradeGuestAction } from '@/lib/actions/auth';

export function SignUpForm({
  next,
  upgradeGuest = false,
  defaultName = '',
}: {
  next: string;
  upgradeGuest?: boolean;
  defaultName?: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [displayName, setDisplayName] = useState(defaultName);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  if (sent) {
    return (
      <div className="rounded-2xl border border-profit/30 bg-profit-soft p-5 text-center">
        <p className="text-lg font-bold text-profit">כמעט סיימנו</p>
        <p className="mt-2 text-sm text-ink-muted">
          שלחנו לכם מייל אימות. אחרי האישור תוכלו להתחבר.
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
          const result = upgradeGuest
            ? await upgradeGuestAction({ email, password, displayName })
            : await signUpAction({ email, password, displayName });

          if (!result.ok) {
            setError(result.message);
            return;
          }
          if (result.data.needsConfirmation) {
            setSent(true);
            return;
          }
          toast.success(upgradeGuest ? 'הפרופיל נשמר' : 'החשבון נוצר בהצלחה');
          router.replace(next);
          router.refresh();
        });
      }}
    >
      <Field label="שם התצוגה" htmlFor="displayName" hint="השם שיופיע לשאר השחקנים בשולחן">
        <TextInput
          id="displayName"
          name="displayName"
          required
          maxLength={40}
          autoComplete="name"
          placeholder="אילן"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
        />
      </Field>

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

      <Field label="סיסמה" htmlFor="password" hint="לפחות 8 תווים">
        <TextInput
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          ltr
          placeholder="••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </Field>

      {/* The refusal belongs to the form, not to the password box: most of
          them — an address already registered, a mistyped address, too many
          attempts — are nothing to do with the password, and hanging them off
          that field pointed people at the wrong line. */}
      {error ? (
        <p
          role="alert"
          className="rounded-xl border border-loss/30 bg-loss-soft px-3 py-2 text-sm text-loss"
        >
          {error}
        </p>
      ) : null}

      <Button type="submit" size="lg" block loading={pending}>
        {upgradeGuest ? 'שמור את הפרופיל שלי' : 'יצירת חשבון'}
      </Button>
    </form>
  );
}
