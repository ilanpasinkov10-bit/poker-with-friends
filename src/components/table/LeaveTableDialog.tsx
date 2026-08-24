'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { Num } from '@/components/ui/Num';
import { useToast } from '@/components/ui/Toast';
import { formatChips, formatMoney } from '@/lib/format';
import { leaveTableAction } from '@/lib/actions/players';

/**
 * Cashing out of a game in progress. The player declares the chips in front of
 * them; the server records that as their final count and stamps them as left.
 */
export function LeaveTableDialog({
  open,
  onClose,
  tableId,
  tablePlayerId,
  chipsIssued,
  totalPaidAgorot,
  buyInAgorot,
  chipsPerBuyIn,
}: {
  open: boolean;
  onClose: () => void;
  tableId: string;
  tablePlayerId: string;
  chipsIssued: number;
  totalPaidAgorot: number;
  buyInAgorot: number;
  chipsPerBuyIn: number;
}) {
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);

  const chips = Number(value);
  const valid = value !== '' && Number.isInteger(chips) && chips >= 0;
  // Same conversion the settlement uses, shown so nobody leaves by surprise.
  const cashOut = valid ? Math.round((chips * buyInAgorot) / chipsPerBuyIn) : null;

  const confirm = () =>
    startTransition(async () => {
      setError(null);
      const result = await leaveTableAction(tableId, tablePlayerId, chips);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      toast.success('עזבת את השולחן. התוצאה שלך נשמרה.');
      onClose();
    });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="עזיבת שולחן"
      footer={
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onClose}
            className="h-12 rounded-xl border border-line bg-surface-3 font-semibold text-ink"
          >
            ביטול
          </button>
          <Button variant="warn" disabled={!valid} loading={pending} onClick={confirm}>
            אישור ועזיבה
          </Button>
        </div>
      }
    >
      <p className="text-base font-bold text-ink">כמה ג׳יטונים נשארו לך?</p>
      <p className="mt-1 text-sm text-ink-muted">
        יש להזין את מספר הג׳יטונים הנוכחי לפני העזיבה.
      </p>

      <div className="mt-4">
        <Field label="ספירת ג׳יטונים" htmlFor="leaveChips" error={error}>
          <input
            id="leaveChips"
            type="number"
            inputMode="numeric"
            min={0}
            step={1}
            dir="ltr"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder="0"
            className="ltr-num h-14 w-full rounded-xl border border-line bg-surface-2 px-4 text-center text-2xl font-black text-ink"
          />
        </Field>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-2 text-center">
        <div className="rounded-xl bg-surface-2 px-3 py-2.5">
          <dt className="text-[0.65rem] text-ink-faint">קיבלת</dt>
          <dd className="mt-0.5 text-sm font-bold text-ink">
            <Num>{formatChips(chipsIssued)}</Num>
          </dd>
        </div>
        <div className="rounded-xl bg-surface-2 px-3 py-2.5">
          <dt className="text-[0.65rem] text-ink-faint">השקעת</dt>
          <dd className="mt-0.5 text-sm font-bold text-ink">
            <Num>{formatMoney(totalPaidAgorot)}</Num>
          </dd>
        </div>
      </dl>

      {cashOut !== null ? (
        <p className="mt-3 text-center text-sm text-ink-muted">
          שווי הפדיון: <Num className="font-bold text-ink">{formatMoney(cashOut)}</Num> · תוצאה{' '}
          <Num
            className={
              cashOut - totalPaidAgorot >= 0 ? 'font-bold text-profit' : 'font-bold text-loss'
            }
          >
            {formatMoney(cashOut - totalPaidAgorot)}
          </Num>
        </p>
      ) : null}

      <p className="mt-3 text-center text-[0.7rem] text-ink-faint">
        הכניסות שלך נשמרות והתוצאה תיכלל בהתחשבנות הסופית.
      </p>
    </Modal>
  );
}
