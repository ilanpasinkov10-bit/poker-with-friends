'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/Button';
import { Field, TextInput } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { addManualPlayerAction } from '@/lib/actions/players';

/**
 * "+ הוסף שחקן" — seating somebody who is in the room but not on the app.
 *
 * One field, because one field is all the game needs: a name to put on the
 * chips. No account is created, no invitation is sent and nothing is looked up
 * — the person exists as a participant of this table and nowhere else.
 *
 * The name is checked here only to keep the button honest while typing. The
 * rule that decides is `add_manual_player`, which refuses an empty name, a name
 * over forty characters and a name already at this table, in the same words a
 * join gets.
 */
export function AddManualPlayerButton({ tableId }: { tableId: string }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const trimmed = name.trim();

  const close = () => {
    setOpen(false);
    setName('');
    setError(null);
  };

  const submit = () => {
    if (!trimmed) {
      setError('צריך להזין שם');
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await addManualPlayerAction(tableId, trimmed);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      toast.success(`${result.data.displayName} נוסף/ה לשולחן`);
      close();
      router.refresh();
    });
  };

  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
        + הוסף שחקן
      </Button>

      <Modal open={open} onClose={close} title="הוספת שחקן">
        <p className="mb-4 text-xs text-ink-faint">
          לשחקן שנמצא איתכם בשולחן אבל לא באפליקציה. הוא ייכנס למשחק עם כניסה אחת, ייספר בקופה
          ובהתחשבנות — ולא ייווצר עבורו חשבון.
        </p>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <Field label="שם השחקן" htmlFor="manualPlayerName" error={error}>
            <TextInput
              id="manualPlayerName"
              name="manualPlayerName"
              required
              maxLength={40}
              autoComplete="off"
              placeholder="דוד"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </Field>

          <div className="mt-5 flex gap-2">
            <Button
              type="submit"
              className="flex-1"
              loading={pending}
              disabled={trimmed.length === 0}
            >
              הוסף לשולחן
            </Button>
            <Button type="button" variant="ghost" className="flex-1" onClick={close}>
              ביטול
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
