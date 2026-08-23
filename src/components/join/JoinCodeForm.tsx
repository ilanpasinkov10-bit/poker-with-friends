'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { lookupTableAction } from '@/lib/actions/players';

export function JoinCodeForm({ initialCode = '' }: { initialCode?: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [code, setCode] = useState(initialCode);
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="grid gap-5"
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        const normalised = code.trim().toUpperCase();
        if (!/^[A-Z0-9]{5}$/.test(normalised)) {
          setError('קוד השולחן מורכב מ‑5 תווים');
          return;
        }
        startTransition(async () => {
          const result = await lookupTableAction(normalised);
          if (!result.ok) {
            setError(result.message);
            return;
          }
          router.push(`/join/${normalised}`);
        });
      }}
    >
      <Field label="קוד שולחן" htmlFor="code" error={error} hint="לדוגמה: A7K92">
        {/* Join codes stay LTR and uppercase regardless of the RTL layout. */}
        <input
          id="code"
          name="code"
          dir="ltr"
          inputMode="text"
          autoCapitalize="characters"
          autoComplete="off"
          maxLength={5}
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
          placeholder="A7K92"
          className="ltr-num w-full rounded-2xl border border-line bg-surface-2 px-4 py-4 text-center text-3xl font-black tracking-[0.35em] text-ink placeholder:text-ink-faint focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30"
        />
      </Field>

      <Button type="submit" size="lg" block loading={pending}>
        חיפוש שולחן
      </Button>
    </form>
  );
}
