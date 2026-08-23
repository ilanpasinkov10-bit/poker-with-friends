'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/Button';
import { Field, TextInput } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';
import { joinTableAction } from '@/lib/actions/players';

export function JoinTableForm({
  code,
  tableId,
  needsApproval,
  defaultName,
  isSignedIn,
}: {
  code: string;
  tableId: string;
  needsApproval: boolean;
  defaultName: string;
  isSignedIn: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState(defaultName);
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="grid gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        startTransition(async () => {
          const result = await joinTableAction({ code, displayName: name });
          if (!result.ok) {
            setError(result.message);
            return;
          }
          toast.success(
            result.data.status === 'PENDING'
              ? 'הבקשה נשלחה למנהל השולחן'
              : 'הצטרפת לשולחן, בהצלחה!',
          );
          router.replace(`/table/${result.data.tableId}`);
          router.refresh();
        });
      }}
    >
      <Field
        label="שם השחקן"
        htmlFor="playerName"
        error={error}
        hint={
          needsApproval
            ? 'מנהל השולחן יאשר את ההצטרפות שלכם'
            : 'זה השם שיראו שאר השחקנים בשולחן'
        }
      >
        <TextInput
          id="playerName"
          name="playerName"
          required
          maxLength={40}
          autoComplete="name"
          placeholder="איך קוראים לכם?"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </Field>

      <Button type="submit" size="lg" block loading={pending}>
        הצטרף לשולחן
      </Button>

      {!isSignedIn ? (
        <p className="text-center text-xs text-ink-faint">
          נכנסים כאורח — בסוף המשחק אפשר יהיה לשמור את הפרופיל ואת התוצאה.
        </p>
      ) : null}
      <input type="hidden" name="tableId" value={tableId} />
    </form>
  );
}
