'use client';

import { Field, OptionGroup, Switch, TextInput } from '@/components/ui/Field';
import { Num } from '@/components/ui/Num';
import { cn } from '@/lib/cn';
import {
  DEFAULT_MINUTES,
  MAX_LEVELS,
  PRESET_LABEL,
  defaultSmallBlind,
  describeLevel,
  matchPreset,
  presetLevels,
  structureProblems,
  type BlindLevel,
  type PresetId,
} from '@/lib/domain/blinds';

/**
 * Building the ladder before the game starts.
 *
 * A preset fills the list in and nothing more: every level stays editable
 * afterwards, and the chosen preset simply reads as מותאם אישית once the
 * numbers stop matching it. Nothing here is generated from a formula the
 * manager cannot overrule — a manager who wants 5/10 followed by 10/25
 * followed by 25/50 types exactly that.
 *
 * Every change made here is reported as a customisation, so the form knows
 * never to regenerate over it when another table setting changes.
 */
export function BlindLevelsEditor({
  enabled,
  onEnabledChange,
  levels,
  onLevelsChange,
  startingChips,
  onPresetChange,
}: {
  enabled: boolean;
  onEnabledChange: (next: boolean) => void;
  levels: BlindLevel[];
  /** Edited by hand: the caller must stop regenerating defaults over it. */
  onLevelsChange: (next: BlindLevel[]) => void;
  /** Chips each player is given, which is what the opening blinds come from. */
  startingChips: number;
  /** A fresh generated ladder — not a customisation. */
  onPresetChange: (preset: Exclude<PresetId, 'CUSTOM'>) => void;
}) {
  const preset = matchPreset(levels, startingChips);
  const problems = enabled ? structureProblems(levels) : [];

  const setLevel = (index: number, next: BlindLevel) =>
    onLevelsChange(levels.map((level, i) => (i === index ? next : level)));

  const move = (index: number, by: -1 | 1) => {
    const target = index + by;
    if (target < 0 || target >= levels.length) return;
    const next = [...levels];
    [next[index], next[target]] = [next[target]!, next[index]!];
    onLevelsChange(next);
  };

  const lastBlinds = [...levels].reverse().find((level) => level.kind === 'BLINDS');
  const addBlinds = () =>
    onLevelsChange([
      ...levels,
      {
        kind: 'BLINDS',
        // A sensible next rung, still fully editable.
        smallBlind: lastBlinds ? lastBlinds.bigBlind : defaultSmallBlind(startingChips),
        bigBlind: lastBlinds ? lastBlinds.bigBlind * 2 : defaultSmallBlind(startingChips) * 2,
        minutes: levels.at(-1)?.minutes ?? DEFAULT_MINUTES,
      },
    ]);

  return (
    <div className="grid gap-3">
      <Switch
        checked={enabled}
        onChange={(next) => onEnabledChange(next)}
        label="העלאת בליינדים"
        description="טיימר משותף שמעלה את הבליינדים לפי שלבים. מתחיל כשמתחילים את המשחק."
      />

      {enabled ? (
        <div className="grid gap-3 rounded-2xl border border-line-soft bg-surface-2/60 p-3">
          <Field label="קצב">
            <OptionGroup<PresetId>
              name="blindPreset"
              value={preset}
              onChange={(next) => {
                if (next !== 'CUSTOM') onPresetChange(next);
              }}
              options={(['RELAXED', 'STANDARD', 'TURBO', 'CUSTOM'] as const).map((id) => ({
                value: id,
                label: PRESET_LABEL[id],
              }))}
            />
          </Field>

          <ul className="grid gap-2">
            {levels.map((level, index) => (
              <li key={index} className="rounded-xl border border-line bg-surface p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-ink-muted">
                    {level.kind === 'BREAK' ? 'הפסקה' : `שלב ${index + 1}`}
                  </span>
                  <span className="flex shrink-0 items-center gap-1">
                    <IconButton label="העבר למעלה" onClick={() => move(index, -1)} disabled={index === 0}>
                      ↑
                    </IconButton>
                    <IconButton
                      label="העבר למטה"
                      onClick={() => move(index, 1)}
                      disabled={index === levels.length - 1}
                    >
                      ↓
                    </IconButton>
                    <IconButton
                      label="מחק שלב"
                      onClick={() => onLevelsChange(levels.filter((_, i) => i !== index))}
                    >
                      ✕
                    </IconButton>
                  </span>
                </div>

                <div className="mt-2 grid grid-cols-3 gap-2">
                  {level.kind === 'BLINDS' ? (
                    <>
                      <NumberBox
                        label="קטן"
                        value={level.smallBlind}
                        onChange={(smallBlind) => setLevel(index, { ...level, smallBlind })}
                      />
                      <NumberBox
                        label="גדול"
                        value={level.bigBlind}
                        onChange={(bigBlind) => setLevel(index, { ...level, bigBlind })}
                      />
                    </>
                  ) : (
                    <div className="col-span-2 self-end pb-2 text-sm text-ink-faint">
                      אין בליינדים בהפסקה
                    </div>
                  )}
                  <NumberBox
                    label="דקות"
                    value={level.minutes}
                    onChange={(minutes) => setLevel(index, { ...level, minutes })}
                  />
                </div>
              </li>
            ))}
          </ul>

          <div className="grid grid-cols-2 gap-2">
            <AddButton onClick={addBlinds} disabled={levels.length >= MAX_LEVELS}>
              הוסף שלב
            </AddButton>
            <AddButton
              onClick={() => onLevelsChange([...levels, { kind: 'BREAK', minutes: 10 }])}
              disabled={levels.length >= MAX_LEVELS}
            >
              הוסף הפסקה
            </AddButton>
          </div>

          {levels.length > 0 ? (
            <p className="text-xs text-ink-faint">
              מתחילים ב־<Num>{describeLevel(levels[0]!)}</Num> · {levels.length} שלבים ·{' '}
              <Num>{totalMinutes(levels)}</Num> דקות בסך הכול
            </p>
          ) : null}

          {problems.length > 0 ? (
            <ul className="grid gap-1 rounded-xl border border-warn/30 bg-warn-soft p-3">
              {problems.slice(0, 4).map((problem) => (
                <li key={problem} className="text-xs font-semibold text-warn">
                  {problem}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function totalMinutes(levels: BlindLevel[]): number {
  return levels.reduce((sum, level) => sum + (Number.isFinite(level.minutes) ? level.minutes : 0), 0);
}

function NumberBox({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (next: number) => void;
}) {
  return (
    <label className="grid gap-1">
      <span className="text-[0.7rem] text-ink-faint">{label}</span>
      <TextInput
        type="number"
        inputMode="numeric"
        min={1}
        step={1}
        ltr
        value={Number.isFinite(value) ? String(value) : ''}
        onChange={(event) => {
          const next = Number(event.target.value);
          onChange(Number.isFinite(next) ? Math.trunc(next) : 0);
        }}
      />
    </label>
  );
}

function IconButton({
  children,
  label,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'grid size-8 shrink-0 place-items-center rounded-lg border border-line',
        'bg-surface-2 text-sm text-ink-muted disabled:opacity-30',
      )}
    >
      {children}
    </button>
  );
}

function AddButton({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="h-11 rounded-xl border border-dashed border-line bg-surface px-3 text-sm font-semibold text-ink-muted disabled:opacity-40"
    >
      {children}
    </button>
  );
}
