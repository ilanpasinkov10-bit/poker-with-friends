'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Field, OptionGroup, Switch, TextInput } from '@/components/ui/Field';
import { Num } from '@/components/ui/Num';
import { useToast } from '@/components/ui/Toast';
import { createTableAction } from '@/lib/actions/tables';
import { isUuid } from '@/lib/domain/ids';
import { errorMessage } from '@/lib/errors';
import { formatMoney } from '@/lib/format';
import {
  COUNTING_MODE_DESCRIPTION,
  COUNTING_MODE_LABEL,
  JOIN_MODE_DESCRIPTION,
  JOIN_MODE_LABEL,
  VISIBILITY_DESCRIPTION,
  VISIBILITY_LABEL,
  chipsWord,
} from '@/lib/labels';
import type { CountingMode, JoinMode, PlayerVisibility } from '@/types/database';

const DEFAULT_BUY_IN_SHEKELS = 50;
const DEFAULT_CHIPS = 500;
const DEFAULT_MAX_BUY_INS = 6;

export function CreateTableForm({
  defaultDate,
  defaultStart,
  defaultEnd,
}: {
  defaultDate: string;
  defaultStart: string;
  defaultEnd: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [groupName, setGroupName] = useState('');
  const [gameDate, setGameDate] = useState(defaultDate);
  const [startTime, setStartTime] = useState(defaultStart);
  const [endTime, setEndTime] = useState(defaultEnd);
  const [buyIn, setBuyIn] = useState(String(DEFAULT_BUY_IN_SHEKELS));
  const [chips, setChips] = useState(String(DEFAULT_CHIPS));
  const [maxBuyIns, setMaxBuyIns] = useState(String(DEFAULT_MAX_BUY_INS));
  const [joinMode, setJoinMode] = useState<JoinMode>('AUTO_JOIN');
  const [visibility, setVisibility] = useState<PlayerVisibility>('OPEN');
  const [countingMode, setCountingMode] = useState<CountingMode>('ADMIN_COUNT');
  const [adminPlays, setAdminPlays] = useState(true);

  const buyInNumber = Number(buyIn);
  const chipsNumber = Number(chips);
  const maxNumber = Number(maxBuyIns);
  const maxInvestment =
    Number.isFinite(buyInNumber) && Number.isFinite(maxNumber)
      ? Math.round(buyInNumber * maxNumber * 100)
      : 0;

  return (
    <form
      className="grid gap-5"
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        startTransition(async () => {
          const result = await createTableAction({
            name,
            gameDate,
            startTime,
            endTime,
            buyInShekels: buyInNumber,
            chipsPerBuyIn: chipsNumber,
            maxBuyIns: maxNumber,
            joinMode,
            playerVisibility: visibility,
            countingMode,
            adminPlays,
            groupName: groupName.trim() || undefined,
          });
          if (!result.ok) {
            setError(result.message);
            return;
          }
          // Last line of defence: `/table/undefined` must be unreachable even
          // if the action's contract is ever broken.
          if (!isUuid(result.data.tableId)) {
            setError(errorMessage('RPC_BAD_SHAPE'));
            return;
          }
          toast.success('השולחן נפתח!');
          router.replace(`/table/${result.data.tableId}`);
          router.refresh();
        });
      }}
    >
      <Card className="grid gap-4">
        <Field label="שם השולחן" htmlFor="name">
          <TextInput
            id="name"
            required
            maxLength={60}
            placeholder="פוקר של יום חמישי"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>

        <Field
          label="קבוצה קבועה (לא חובה)"
          htmlFor="groupName"
          hint="שולחנות עם אותו שם קבוצה מצטברים להיסטוריה ולדירוג משותפים"
        >
          <TextInput
            id="groupName"
            maxLength={60}
            placeholder="החבר׳ה מהשכונה"
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
          />
        </Field>

        <Field label="תאריך המשחק" htmlFor="gameDate">
          <TextInput
            id="gameDate"
            type="date"
            required
            ltr
            value={gameDate}
            onChange={(e) => setGameDate(e.target.value)}
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="שעת התחלה" htmlFor="startTime">
            <TextInput
              id="startTime"
              type="time"
              required
              ltr
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
            />
          </Field>
          <Field label="שעת סיום" htmlFor="endTime" hint="אפשר להאריך בהמשך">
            <TextInput
              id="endTime"
              type="time"
              required
              ltr
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
            />
          </Field>
        </div>
      </Card>

      <Card className="grid gap-4">
        <h2 className="text-sm font-bold text-ink">כסף וז׳יטונים</h2>

        <div className="grid grid-cols-2 gap-3">
          <Field label="סכום כניסה (₪)" htmlFor="buyIn">
            <TextInput
              id="buyIn"
              type="number"
              inputMode="numeric"
              min={1}
              step={1}
              required
              ltr
              value={buyIn}
              onChange={(e) => setBuyIn(e.target.value)}
            />
          </Field>
          <Field label="ז׳יטונים לכניסה" htmlFor="chips">
            <TextInput
              id="chips"
              type="number"
              inputMode="numeric"
              min={1}
              step={1}
              required
              ltr
              value={chips}
              onChange={(e) => setChips(e.target.value)}
            />
          </Field>
        </div>

        <Field
          label="מקסימום כניסות לשחקן"
          htmlFor="maxBuyIns"
          hint={
            maxInvestment > 0 ? (
              <>
                השקעה מקסימלית לשחקן: <Num>{formatMoney(maxInvestment)}</Num>
              </>
            ) : undefined
          }
        >
          <TextInput
            id="maxBuyIns"
            type="number"
            inputMode="numeric"
            min={1}
            max={50}
            step={1}
            required
            ltr
            value={maxBuyIns}
            onChange={(e) => setMaxBuyIns(e.target.value)}
          />
        </Field>

        {Number.isFinite(buyInNumber) && Number.isFinite(chipsNumber) && chipsNumber > 0 ? (
          <p className="rounded-xl bg-surface-2 px-3 py-2.5 text-xs text-ink-muted">
            כל כניסה: <Num>{formatMoney(Math.round(buyInNumber * 100))}</Num> ={' '}
            {chipsWord(chipsNumber)}
          </p>
        ) : null}
      </Card>

      <Card className="grid gap-4">
        <h2 className="text-sm font-bold text-ink">הצטרפות ופרטיות</h2>

        <Field label="אופן ההצטרפות">
          <OptionGroup
            name="joinMode"
            value={joinMode}
            onChange={setJoinMode}
            options={(['AUTO_JOIN', 'ADMIN_APPROVAL'] as const).map((value) => ({
              value,
              label: JOIN_MODE_LABEL[value],
              description: JOIN_MODE_DESCRIPTION[value],
            }))}
          />
        </Field>

        <Field label="מה השחקנים רואים">
          <OptionGroup
            name="visibility"
            value={visibility}
            onChange={setVisibility}
            options={(['OPEN', 'PRIVATE'] as const).map((value) => ({
              value,
              label: VISIBILITY_LABEL[value],
              description: VISIBILITY_DESCRIPTION[value],
            }))}
          />
        </Field>

        <Field label="ספירת ז׳יטונים בסוף המשחק">
          <OptionGroup
            name="countingMode"
            value={countingMode}
            onChange={setCountingMode}
            options={(['ADMIN_COUNT', 'SELF_COUNT'] as const).map((value) => ({
              value,
              label: COUNTING_MODE_LABEL[value],
              description: COUNTING_MODE_DESCRIPTION[value],
            }))}
          />
        </Field>

        <Switch
          checked={adminPlays}
          onChange={setAdminPlays}
          label="אני גם משחק"
          description="ניצור לכם כרטיס שחקן בשולחן, בנוסף לניהול"
        />
      </Card>

      {error ? (
        <p className="rounded-xl border border-loss/30 bg-loss-soft px-4 py-3 text-sm font-semibold text-loss">
          {error}
        </p>
      ) : null}

      <Button type="submit" size="lg" block loading={pending}>
        פתח שולחן
      </Button>
    </form>
  );
}
