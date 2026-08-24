'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/Button';
import { Field, OptionGroup, TextInput } from '@/components/ui/Field';
import { ConfirmDialog, Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import {
  extendGameAction,
  setTableStatusAction,
  updateTableSettingsAction,
} from '@/lib/actions/tables';
import {
  COUNTING_MODE_DESCRIPTION,
  COUNTING_MODE_LABEL,
  JOIN_MODE_DESCRIPTION,
  JOIN_MODE_LABEL,
  VISIBILITY_DESCRIPTION,
  VISIBILITY_LABEL,
} from '@/lib/labels';
import type { CountingMode, JoinMode, PlayerVisibility, PokerTableRow } from '@/types/database';

const EXTENSIONS = [15, 30, 60] as const;

export function GameControls({ table }: { table: PokerTableRow }) {
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [extendOpen, setExtendOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [confirmCounting, setConfirmCounting] = useState(false);

  const setStatus = (status: 'ACTIVE' | 'COUNTING' | 'CANCELLED', message: string) =>
    startTransition(async () => {
      const result = await setTableStatusAction(table.id, status);
      if (!result.ok) toast.error(result.message);
      else toast.success(message);
      setConfirmCounting(false);
    });

  return (
    <>
      <div className="grid gap-2">
        {table.status === 'WAITING' ? (
          <Button size="lg" block loading={pending} onClick={() => setStatus('ACTIVE', 'המשחק התחיל')}>
            התחל משחק
          </Button>
        ) : null}

        {table.status === 'ACTIVE' ? (
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" size="lg" onClick={() => setExtendOpen(true)}>
              הארך משחק
            </Button>
            <Button variant="warn" size="lg" onClick={() => setConfirmCounting(true)}>
              סיים משחק
            </Button>
          </div>
        ) : null}

        {table.status === 'COUNTING' ? (
          <Button
            variant="ghost"
            size="md"
            block
            loading={pending}
            onClick={() => setStatus('ACTIVE', 'חזרנו למשחק')}
          >
            חזרה למשחק פעיל
          </Button>
        ) : null}

        {table.status !== 'COMPLETED' && table.status !== 'CANCELLED' ? (
          <Button variant="ghost" size="sm" block onClick={() => setSettingsOpen(true)}>
            הגדרות שולחן
          </Button>
        ) : null}
      </div>

      <ExtendDialog
        open={extendOpen}
        tableId={table.id}
        onClose={() => setExtendOpen(false)}
      />

      <SettingsDialog
        open={settingsOpen}
        table={table}
        onClose={() => setSettingsOpen(false)}
      />

      <ConfirmDialog
        open={confirmCounting}
        title="לסיים את המשחק?"
        message="נעבור לשלב ספירת הז׳יטונים. לא ניתן יהיה להוסיף כניסות חדשות."
        confirmLabel="עוברים לספירה"
        tone="danger"
        loading={pending}
        onConfirm={() => setStatus('COUNTING', 'עוברים לספירת ז׳יטונים')}
        onCancel={() => setConfirmCounting(false)}
      />
    </>
  );
}

function ExtendDialog({
  open,
  tableId,
  onClose,
}: {
  open: boolean;
  tableId: string;
  onClose: () => void;
}) {
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [customDate, setCustomDate] = useState('');
  const [customTime, setCustomTime] = useState('');

  const extend = (minutes?: number) =>
    startTransition(async () => {
      const result = await extendGameAction(
        tableId,
        minutes
          ? { minutes }
          : { newEnd: { date: customDate, time: customTime } },
      );
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success('שעת הסיום עודכנה');
      onClose();
    });

  return (
    <Modal open={open} onClose={onClose} title="הארכת המשחק">
      <div className="grid gap-2">
        {EXTENSIONS.map((minutes) => (
          <button
            key={minutes}
            type="button"
            disabled={pending}
            onClick={() => extend(minutes)}
            className="h-12 rounded-xl border border-line bg-surface-2 text-base font-bold text-ink disabled:opacity-50"
          >
            עוד {minutes} דקות
          </button>
        ))}
      </div>

      <div className="mt-5 border-t border-line-soft pt-4">
        <p className="mb-3 text-sm font-semibold text-ink-muted">או שעת סיום חדשה</p>
        <div className="grid grid-cols-2 gap-2">
          <Field label="תאריך" htmlFor="extendDate">
            <TextInput
              id="extendDate"
              type="date"
              ltr
              value={customDate}
              onChange={(e) => setCustomDate(e.target.value)}
            />
          </Field>
          <Field label="שעה" htmlFor="extendTime">
            <TextInput
              id="extendTime"
              type="time"
              ltr
              value={customTime}
              onChange={(e) => setCustomTime(e.target.value)}
            />
          </Field>
        </div>
        <Button
          className="mt-3"
          block
          loading={pending}
          disabled={!customDate || !customTime}
          onClick={() => extend()}
        >
          עדכן שעת סיום
        </Button>
      </div>
    </Modal>
  );
}

function SettingsDialog({
  open,
  table,
  onClose,
}: {
  open: boolean;
  table: PokerTableRow;
  onClose: () => void;
}) {
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState(table.name);
  const [maxBuyIns, setMaxBuyIns] = useState(String(table.max_buy_ins));
  const [joinMode, setJoinMode] = useState<JoinMode>(table.join_mode);
  const [visibility, setVisibility] = useState<PlayerVisibility>(table.player_visibility);
  const [countingMode, setCountingMode] = useState<CountingMode>(table.counting_mode);

  const save = () =>
    startTransition(async () => {
      const result = await updateTableSettingsAction(table.id, {
        name,
        maxBuyIns: Number(maxBuyIns),
        joinMode,
        playerVisibility: visibility,
        countingMode,
      });
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success('ההגדרות נשמרו');
      onClose();
    });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="הגדרות שולחן"
      size="lg"
      footer={
        <Button block loading={pending} onClick={save}>
          שמירה
        </Button>
      }
    >
      <div className="grid gap-4">
        <Field label="שם השולחן" htmlFor="tableName">
          <TextInput
            id="tableName"
            value={name}
            maxLength={60}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>

        <Field label="מקסימום כניסות לשחקן" htmlFor="tableMax">
          <TextInput
            id="tableMax"
            type="number"
            min={1}
            max={50}
            ltr
            value={maxBuyIns}
            onChange={(e) => setMaxBuyIns(e.target.value)}
          />
        </Field>

        <Field label="אופן ההצטרפות">
          <OptionGroup
            name="settingsJoinMode"
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
            name="settingsVisibility"
            value={visibility}
            onChange={setVisibility}
            options={(['OPEN', 'PRIVATE'] as const).map((value) => ({
              value,
              label: VISIBILITY_LABEL[value],
              description: VISIBILITY_DESCRIPTION[value],
            }))}
          />
        </Field>

        <Field label="ספירת ז׳יטונים">
          <OptionGroup
            name="settingsCounting"
            value={countingMode}
            onChange={setCountingMode}
            options={(['ADMIN_COUNT', 'SELF_COUNT'] as const).map((value) => ({
              value,
              label: COUNTING_MODE_LABEL[value],
              description: COUNTING_MODE_DESCRIPTION[value],
            }))}
          />
        </Field>
      </div>
    </Modal>
  );
}
