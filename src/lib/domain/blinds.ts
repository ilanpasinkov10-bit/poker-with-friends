/**
 * Blind levels, and the timer that walks through them.
 *
 * The database stores a *structure* and an *anchor*: which level the game is
 * on, when that level began, and whether it is paused. It does not store a
 * countdown, and nothing writes to it as time passes. Everything a screen
 * shows — the current level, the next one, the seconds remaining, whether the
 * game has already run past several levels while nobody was watching — is
 * computed here from those few values and the current time.
 *
 * That is what makes the timer survive a locked phone, a closed app, a lost
 * connection and a cold page load: there is no ticking state to lose. A client
 * that has been asleep for eight minutes computes the same answer as one that
 * watched every second, because both are reading the same anchor.
 *
 * It is also why automatic advancement needs no cron job, no background worker
 * and nobody's browser left open. A level that has expired is not a level
 * waiting to be advanced by someone; it is simply not the level `at()` returns
 * any more. The row only changes when a person does something to it.
 *
 * Pure: no React, no Supabase, no clock of its own. Every rule below is
 * testable directly.
 */

export type BlindTimerStatus = 'DISABLED' | 'READY' | 'RUNNING' | 'PAUSED' | 'STOPPED';

/** A round of play at fixed blinds, or a break between them. */
export type BlindLevel =
  | { kind: 'BLINDS'; smallBlind: number; bigBlind: number; minutes: number }
  | { kind: 'BREAK'; minutes: number };

export interface BlindTimerState {
  status: BlindTimerStatus;
  levels: BlindLevel[];
  /** The level the anchor refers to — not necessarily the level in play now. */
  levelIndex: number;
  levelStartedAt: string | null;
  /** Set only while paused; the instant the clock was frozen. */
  pausedAt: string | null;
}

/** What a screen needs to draw the timer. */
export interface BlindTimerView {
  index: number;
  level: BlindLevel;
  /** The next level, or null on the last one. */
  next: BlindLevel | null;
  remainingMs: number;
  /** True once there is nothing left to advance to. */
  isFinal: boolean;
  paused: boolean;
}

export const MIN_LEVELS = 2;
export const MAX_LEVELS = 30;
const MAX_BLIND = 100_000_000;
const MAX_MINUTES = 600;

export const DURATION_CHOICES = [10, 15, 20, 30] as const;
export const DEFAULT_MINUTES = 20;

const minutesToMs = (minutes: number) => minutes * 60_000;

/**
 * Which level is actually in play, and how much of it is left.
 *
 * Returns null when there is nothing to show: the timer was never configured,
 * has been stopped, or the game is not in progress. The game's own status is
 * the outer gate — a timer cannot be running in a game that is not — so the
 * timer needs no separate stopping when a game is finished or cancelled.
 */
export function at(
  state: BlindTimerState,
  tableStatus: string,
  nowMs: number,
): BlindTimerView | null {
  if (tableStatus !== 'ACTIVE') return null;
  if (state.status !== 'RUNNING' && state.status !== 'PAUSED') return null;
  if (state.levels.length === 0 || !state.levelStartedAt) return null;

  // While paused the clock reads the moment it was frozen, so time passing
  // changes nothing at all — which is exactly what pause has to mean.
  const paused = state.status === 'PAUSED';
  const base = paused ? Date.parse(state.pausedAt ?? state.levelStartedAt) : nowMs;
  const startedAt = Date.parse(state.levelStartedAt);
  if (Number.isNaN(base) || Number.isNaN(startedAt)) return null;

  let index = clampIndex(state.levelIndex, state.levels.length);
  let elapsed = Math.max(0, base - startedAt);

  // Walk forward through however many levels have gone by. Ten seconds or ten
  // hours of absence take the same path.
  for (;;) {
    const level = state.levels[index]!;
    const duration = minutesToMs(level.minutes);
    const isLast = index === state.levels.length - 1;

    if (elapsed < duration || isLast) {
      return {
        index,
        level,
        next: isLast ? null : state.levels[index + 1]!,
        // The last level does not advance, so it stops counting at zero rather
        // than going negative.
        remainingMs: Math.max(0, duration - elapsed),
        isFinal: isLast,
        paused,
      };
    }

    elapsed -= duration;
    index += 1;
  }
}

function clampIndex(index: number, length: number): number {
  if (!Number.isInteger(index) || index < 0) return 0;
  return Math.min(index, length - 1);
}

/**
 * The anchor to write when the clock is frozen or moved.
 *
 * Pausing has to record *where in the current level* the game had got to, not
 * merely that it stopped — otherwise resuming would either restart the level
 * or credit the pause as play. Storing the start as "now minus what had
 * elapsed" keeps the remaining time exact through any number of pauses, and
 * needs no separate "remaining" column that could drift out of step with it.
 */
export function pausedAnchor(
  state: BlindTimerState,
  tableStatus: string,
  nowMs: number,
): { levelIndex: number; levelStartedAt: number; pausedAt: number } | null {
  const view = at(state, tableStatus, nowMs);
  if (!view || view.paused) return null;
  const elapsedInLevel = minutesToMs(view.level.minutes) - view.remainingMs;
  return { levelIndex: view.index, levelStartedAt: nowMs - elapsedInLevel, pausedAt: nowMs };
}

/** Where the anchor moves to when the clock starts again. */
export function resumedAnchor(
  state: BlindTimerState,
  nowMs: number,
): { levelStartedAt: number } | null {
  if (state.status !== 'PAUSED' || !state.levelStartedAt || !state.pausedAt) return null;
  const frozenElapsed = Date.parse(state.pausedAt) - Date.parse(state.levelStartedAt);
  if (Number.isNaN(frozenElapsed)) return null;
  return { levelStartedAt: nowMs - Math.max(0, frozenElapsed) };
}

/** Where a manual step lands. Null when there is nowhere to go. */
export function steppedIndex(
  state: BlindTimerState,
  tableStatus: string,
  nowMs: number,
  direction: 1 | -1,
): number | null {
  const view = at(state, tableStatus, nowMs);
  if (!view) return null;
  const next = view.index + direction;
  if (next < 0 || next >= state.levels.length) return null;
  return next;
}

// ---------------------------------------------------------------------------
// Validation — the same rules the database enforces, so the form can say what
// is wrong before anything is sent.
// ---------------------------------------------------------------------------

export function levelProblems(level: BlindLevel, position: number): string[] {
  const problems: string[] = [];
  const at_ = `שלב ${position}`;

  if (!Number.isInteger(level.minutes) || level.minutes < 1 || level.minutes > MAX_MINUTES) {
    problems.push(`${at_}: משך השלב חייב להיות מספר דקות שלם וגדול מאפס`);
  }
  if (level.kind === 'BLINDS') {
    const { smallBlind: sb, bigBlind: bb } = level;
    if (!Number.isInteger(sb) || sb < 1 || sb > MAX_BLIND) {
      problems.push(`${at_}: הבליינד הקטן חייב להיות מספר שלם וגדול מאפס`);
    }
    if (!Number.isInteger(bb) || bb < 1 || bb > MAX_BLIND) {
      problems.push(`${at_}: הבליינד הגדול חייב להיות מספר שלם וגדול מאפס`);
    } else if (Number.isInteger(sb) && bb <= sb) {
      problems.push(`${at_}: הבליינד הגדול חייב להיות גדול מהקטן`);
    }
  }
  return problems;
}

export function structureProblems(levels: BlindLevel[]): string[] {
  const problems: string[] = [];
  if (levels.length < MIN_LEVELS) problems.push(`צריך לפחות ${MIN_LEVELS} שלבי בליינדים`);
  if (levels.length > MAX_LEVELS) problems.push(`אפשר להגדיר עד ${MAX_LEVELS} שלבים`);
  // A structure of nothing but breaks is not a blind structure.
  if (levels.length > 0 && levels.every((level) => level.kind === 'BREAK')) {
    problems.push('צריך לפחות שלב בליינדים אחד');
  }
  levels.forEach((level, i) => problems.push(...levelProblems(level, i + 1)));
  return problems;
}

// ---------------------------------------------------------------------------
// Presets. A starting point, never a lock: the editor works the same way
// afterwards, and the moment a level is touched the choice reads as מותאם אישית.
// ---------------------------------------------------------------------------

export const PRESET_IDS = ['RELAXED', 'STANDARD', 'TURBO', 'CUSTOM'] as const;
export type PresetId = (typeof PRESET_IDS)[number];

export const PRESET_LABEL: Record<PresetId, string> = {
  RELAXED: 'רגוע',
  STANDARD: 'רגיל',
  TURBO: 'טורבו',
  CUSTOM: 'מותאם אישית',
};

export const PRESET_MINUTES: Record<Exclude<PresetId, 'CUSTOM'>, number> = {
  RELAXED: 30,
  STANDARD: 20,
  TURBO: 10,
};

const LADDER: ReadonlyArray<readonly [number, number]> = [
  [5, 10], [10, 25], [25, 50], [50, 100], [100, 200], [200, 400], [300, 600], [500, 1000],
];

/** The structure a preset fills the editor with. */
export function presetLevels(preset: Exclude<PresetId, 'CUSTOM'>): BlindLevel[] {
  const minutes = PRESET_MINUTES[preset];
  return LADDER.map(([smallBlind, bigBlind]) => ({
    kind: 'BLINDS' as const,
    smallBlind,
    bigBlind,
    minutes,
  }));
}

/** Which preset a structure looks like, for showing the choice back. */
export function matchPreset(levels: BlindLevel[]): PresetId {
  for (const id of ['RELAXED', 'STANDARD', 'TURBO'] as const) {
    const preset = presetLevels(id);
    if (preset.length !== levels.length) continue;
    if (preset.every((level, i) => sameLevel(level, levels[i]!))) return id;
  }
  return 'CUSTOM';
}

function sameLevel(a: BlindLevel, b: BlindLevel): boolean {
  if (a.kind !== b.kind || a.minutes !== b.minutes) return false;
  if (a.kind === 'BLINDS' && b.kind === 'BLINDS') {
    return a.smallBlind === b.smallBlind && a.bigBlind === b.bigBlind;
  }
  return true;
}

// ---------------------------------------------------------------------------
// The stored shape. Kept apart from the in-memory one so a row written by an
// older version, or by hand, cannot crash a screen.
// ---------------------------------------------------------------------------

export function parseLevels(value: unknown): BlindLevel[] {
  if (!Array.isArray(value)) return [];
  const levels: BlindLevel[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') continue;
    const row = entry as Record<string, unknown>;
    const minutes = Number(row.minutes);
    if (!Number.isInteger(minutes) || minutes < 1) continue;
    if (row.kind === 'BREAK') {
      levels.push({ kind: 'BREAK', minutes });
      continue;
    }
    const smallBlind = Number(row.small_blind ?? row.smallBlind);
    const bigBlind = Number(row.big_blind ?? row.bigBlind);
    if (!Number.isInteger(smallBlind) || !Number.isInteger(bigBlind)) continue;
    levels.push({ kind: 'BLINDS', smallBlind, bigBlind, minutes });
  }
  return levels;
}

/** The JSON the database column holds — snake_case, like every other column. */
export function serialiseLevels(levels: BlindLevel[]): unknown[] {
  return levels.map((level) =>
    level.kind === 'BREAK'
      ? { kind: 'BREAK', minutes: level.minutes }
      : {
          kind: 'BLINDS',
          small_blind: level.smallBlind,
          big_blind: level.bigBlind,
          minutes: level.minutes,
        },
  );
}

/** `5 / 10`, or the word for a break. */
export function describeLevel(level: BlindLevel): string {
  return level.kind === 'BREAK' ? 'הפסקה' : `${level.smallBlind} / ${level.bigBlind}`;
}

/** `mm:ss`, counting a part-second up so the last second is shown as 00:01. */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}
