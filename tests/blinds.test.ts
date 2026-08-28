import { describe, expect, it } from 'vitest';
import {
  at,
  defaultSmallBlind,
  describeLevel,
  formatClock,
  matchPreset,
  parseLevels,
  pausedAnchor,
  presetLevels,
  resumedAnchor,
  serialiseLevels,
  steppedIndex,
  structureProblems,
  type BlindLevel,
  type BlindTimerState,
} from '@/lib/domain/blinds';

const MIN = 60_000;
const T0 = Date.parse('2026-09-01T20:25:00.000Z');
const iso = (ms: number) => new Date(ms).toISOString();

const LEVELS: BlindLevel[] = [
  { kind: 'BLINDS', smallBlind: 5, bigBlind: 10, minutes: 20 },
  { kind: 'BLINDS', smallBlind: 10, bigBlind: 25, minutes: 20 },
  { kind: 'BREAK', minutes: 10 },
  { kind: 'BLINDS', smallBlind: 25, bigBlind: 50, minutes: 20 },
];

const running = (over: Partial<BlindTimerState> = {}): BlindTimerState => ({
  status: 'RUNNING',
  levels: LEVELS,
  levelIndex: 0,
  levelStartedAt: iso(T0),
  pausedAt: null,
  ...over,
});

describe('a game with no blind timer', () => {
  it('shows nothing at all', () => {
    const off: BlindTimerState = {
      status: 'DISABLED', levels: [], levelIndex: 0, levelStartedAt: null, pausedAt: null,
    };
    expect(at(off, 'ACTIVE', T0)).toBeNull();
  });

  it('shows nothing while it is only configured and the game has not begun', () => {
    // The countdown starts when the manager starts the game, not when the
    // table is created — a table made at 20:00 and started at 20:25 puts level
    // one at 20:25.
    const ready = running({ status: 'READY', levelStartedAt: null });
    expect(at(ready, 'WAITING', T0)).toBeNull();
    expect(at(ready, 'ACTIVE', T0)).toBeNull();
  });
});

describe('the level in play', () => {
  it('is level one the moment the game starts', () => {
    const view = at(running(), 'ACTIVE', T0)!;
    expect(view.index).toBe(0);
    expect(describeLevel(view.level)).toBe('5 / 10');
    expect(describeLevel(view.next!)).toBe('10 / 25');
    expect(view.remainingMs).toBe(20 * MIN);
    expect(view.isFinal).toBe(false);
  });

  it('counts down as time passes', () => {
    expect(at(running(), 'ACTIVE', T0 + 18 * MIN)!.remainingMs).toBe(2 * MIN);
  });

  it('advances by itself when a level runs out, with nobody watching', () => {
    // Nothing was written to the database in between: the second level is
    // simply what the same anchor means once twenty minutes have passed.
    const view = at(running(), 'ACTIVE', T0 + 20 * MIN)!;
    expect(view.index).toBe(1);
    expect(describeLevel(view.level)).toBe('10 / 25');
    expect(view.remainingMs).toBe(20 * MIN);
  });

  it('walks through several levels at once after a long absence', () => {
    // Phone locked during level 1, opened again 45 minutes later: level 3,
    // which is the break, five minutes in.
    const view = at(running(), 'ACTIVE', T0 + 45 * MIN)!;
    expect(view.index).toBe(2);
    expect(view.level.kind).toBe('BREAK');
    expect(view.remainingMs).toBe(5 * MIN);
    expect(describeLevel(view.next!)).toBe('25 / 50');
  });

  it('resumes play automatically when the break is over', () => {
    const view = at(running(), 'ACTIVE', T0 + 55 * MIN)!;
    expect(describeLevel(view.level)).toBe('25 / 50');
  });
});

describe('coming back to the app later', () => {
  it('shows the time that actually remains, not the time it showed when it left', () => {
    // Eight minutes away from a twenty-minute level.
    expect(formatClock(at(running(), 'ACTIVE', T0)!.remainingMs)).toBe('20:00');
    expect(formatClock(at(running(), 'ACTIVE', T0 + 8 * MIN)!.remainingMs)).toBe('12:00');
  });

  it('gives every client the same answer for the same instant', () => {
    const state = running();
    const now = T0 + 3 * MIN + 17_000;
    const a = at(state, 'ACTIVE', now)!;
    const b = at({ ...state, levels: [...state.levels] }, 'ACTIVE', now)!;
    expect(a).toEqual(b);
  });
});

describe('pausing and resuming', () => {
  it('freezes the remaining time exactly', () => {
    const state = running();
    const pauseAt = T0 + 12 * MIN + 28_000;         // 07:32 left
    const anchor = pausedAnchor(state, 'ACTIVE', pauseAt)!;
    const paused: BlindTimerState = {
      ...state, status: 'PAUSED',
      levelIndex: anchor.levelIndex,
      levelStartedAt: iso(anchor.levelStartedAt),
      pausedAt: iso(anchor.pausedAt),
    };
    expect(formatClock(at(paused, 'ACTIVE', pauseAt)!.remainingMs)).toBe('07:32');

    // Ten minutes of real time pass. A paused clock does not move, and a
    // refresh in the middle of them reads the same.
    expect(formatClock(at(paused, 'ACTIVE', pauseAt + 10 * MIN)!.remainingMs)).toBe('07:32');
    expect(at(paused, 'ACTIVE', pauseAt + 10 * MIN)!.paused).toBe(true);
  });

  it('resumes from where it stopped, not from where it started', () => {
    const state = running();
    const pauseAt = T0 + 12 * MIN + 28_000;
    const a = pausedAnchor(state, 'ACTIVE', pauseAt)!;
    const paused: BlindTimerState = {
      ...state, status: 'PAUSED', levelIndex: a.levelIndex,
      levelStartedAt: iso(a.levelStartedAt), pausedAt: iso(a.pausedAt),
    };

    const resumeAt = pauseAt + 10 * MIN;
    const r = resumedAnchor(paused, resumeAt)!;
    const resumed: BlindTimerState = {
      ...paused, status: 'RUNNING', levelStartedAt: iso(r.levelStartedAt), pausedAt: null,
    };
    expect(formatClock(at(resumed, 'ACTIVE', resumeAt)!.remainingMs)).toBe('07:32');
    expect(formatClock(at(resumed, 'ACTIVE', resumeAt + 2 * MIN)!.remainingMs)).toBe('05:32');
  });

  it('survives a pause that spans a level boundary', () => {
    // Paused 25 minutes in, which is five minutes into level two.
    const anchor = pausedAnchor(running(), 'ACTIVE', T0 + 25 * MIN)!;
    expect(anchor.levelIndex).toBe(1);
    const paused: BlindTimerState = {
      ...running(), status: 'PAUSED', levelIndex: anchor.levelIndex,
      levelStartedAt: iso(anchor.levelStartedAt), pausedAt: iso(anchor.pausedAt),
    };
    const view = at(paused, 'ACTIVE', T0 + 90 * MIN)!;
    expect(view.index).toBe(1);
    expect(formatClock(view.remainingMs)).toBe('15:00');
  });

  it('refuses to pause what is not running', () => {
    expect(pausedAnchor(running({ status: 'STOPPED' }), 'ACTIVE', T0)).toBeNull();
    expect(resumedAnchor(running(), T0)).toBeNull();
  });
});

describe('the manager stepping through levels', () => {
  it('goes to the next level', () => {
    expect(steppedIndex(running(), 'ACTIVE', T0, 1)).toBe(1);
  });

  it('goes back a level', () => {
    expect(steppedIndex(running(), 'ACTIVE', T0 + 25 * MIN, -1)).toBe(0);
  });

  it('has nowhere to go back to on level one', () => {
    expect(steppedIndex(running(), 'ACTIVE', T0, -1)).toBeNull();
  });

  it('has nowhere to go forward from the last level', () => {
    expect(steppedIndex(running(), 'ACTIVE', T0 + 70 * MIN, 1)).toBeNull();
  });
});

describe('the last level', () => {
  it('stays there and stops counting rather than inventing another', () => {
    const view = at(running(), 'ACTIVE', T0 + 10 * 60 * MIN)!;
    expect(view.index).toBe(LEVELS.length - 1);
    expect(view.isFinal).toBe(true);
    expect(view.next).toBeNull();
    expect(view.remainingMs).toBe(0);
  });
});

describe('the game ending', () => {
  it('stops the timer when counting begins', () => {
    expect(at(running(), 'COUNTING', T0 + 5 * MIN)).toBeNull();
  });

  it('stops the timer when the game is finished', () => {
    expect(at(running(), 'COMPLETED', T0 + 5 * MIN)).toBeNull();
  });

  it('stops the timer when the game is cancelled', () => {
    expect(at(running(), 'CANCELLED', T0 + 5 * MIN)).toBeNull();
  });

  it('stops the timer when the manager stops it', () => {
    expect(at(running({ status: 'STOPPED' }), 'ACTIVE', T0)).toBeNull();
  });
});

describe('validating a structure', () => {
  const ok: BlindLevel[] = [
    { kind: 'BLINDS', smallBlind: 5, bigBlind: 10, minutes: 20 },
    { kind: 'BLINDS', smallBlind: 10, bigBlind: 25, minutes: 20 },
  ];

  it('accepts a sensible one', () => {
    expect(structureProblems(ok)).toEqual([]);
  });

  it('wants at least two levels', () => {
    expect(structureProblems([ok[0]!]).join()).toMatch(/לפחות 2/);
  });

  it('wants the big blind above the small one', () => {
    const bad = [{ kind: 'BLINDS' as const, smallBlind: 50, bigBlind: 10, minutes: 20 }, ok[1]!];
    expect(structureProblems(bad).join()).toMatch(/גדול מהקטן/);
  });

  it('rejects zero, negative and fractional values', () => {
    for (const level of [
      { kind: 'BLINDS' as const, smallBlind: 0, bigBlind: 10, minutes: 20 },
      { kind: 'BLINDS' as const, smallBlind: 5, bigBlind: 0, minutes: 20 },
      { kind: 'BLINDS' as const, smallBlind: 5, bigBlind: 10, minutes: 0 },
      { kind: 'BLINDS' as const, smallBlind: 2.5, bigBlind: 10, minutes: 20 },
      { kind: 'BLINDS' as const, smallBlind: -5, bigBlind: 10, minutes: 20 },
    ]) {
      expect(structureProblems([level, ok[1]!]).length).toBeGreaterThan(0);
    }
  });

  it('rejects a structure that is nothing but breaks', () => {
    const breaks: BlindLevel[] = [{ kind: 'BREAK', minutes: 10 }, { kind: 'BREAK', minutes: 10 }];
    expect(structureProblems(breaks).join()).toMatch(/שלב בליינדים אחד/);
  });
});

describe('presets', () => {
  it('fill in a structure at the pace they promise', () => {
    expect(presetLevels('TURBO', 500).every((l) => l.minutes === 10)).toBe(true);
    expect(presetLevels('STANDARD', 500).every((l) => l.minutes === 20)).toBe(true);
    expect(presetLevels('RELAXED', 500).every((l) => l.minutes === 30)).toBe(true);
    expect(structureProblems(presetLevels('STANDARD', 500))).toEqual([]);
  });

  it('are recognised again, and a touched structure reads as custom', () => {
    expect(matchPreset(presetLevels('TURBO', 500), 500)).toBe('TURBO');
    const edited = presetLevels('TURBO', 500);
    edited[0] = { kind: 'BLINDS', smallBlind: 1, bigBlind: 2, minutes: 10 };
    expect(matchPreset(edited, 500)).toBe('CUSTOM');
  });

  it('are recognised against the stack they were generated for', () => {
    // The same ladder is "רגיל" for one stack and something else for another,
    // so the stack has to be part of the question.
    expect(matchPreset(presetLevels('STANDARD', 5000), 5000)).toBe('STANDARD');
    expect(matchPreset(presetLevels('STANDARD', 5000), 500)).toBe('CUSTOM');
  });
});

describe('opening blinds from the starting stack', () => {
  it('opens at one and two per cent of what a player is given', () => {
    for (const [chips, small, big] of [
      [500, 5, 10],
      [1000, 10, 20],
      [2500, 25, 50],
      [5000, 50, 100],
      [10_000, 100, 200],
    ] as const) {
      expect(defaultSmallBlind(chips)).toBe(small);
      const first = presetLevels('STANDARD', chips)[0]!;
      expect(first.kind === 'BLINDS' && first.smallBlind).toBe(small);
      expect(first.kind === 'BLINDS' && first.bigBlind).toBe(big);
    }
  });

  it('scales the whole ladder, not only the first level', () => {
    // The shape a 500-chip game has, ten times over.
    const small = presetLevels('STANDARD', 500).map((l) => describeLevel(l));
    const big = presetLevels('STANDARD', 5000).map((l) => describeLevel(l));
    expect(small.slice(0, 5)).toEqual(['5 / 10', '10 / 25', '25 / 50', '50 / 100', '100 / 200']);
    expect(big.slice(0, 5)).toEqual([
      '50 / 100', '100 / 250', '250 / 500', '500 / 1000', '1000 / 2000',
    ]);
  });

  it('stays a valid, rising ladder at awkward stack sizes', () => {
    for (const chips of [1, 7, 60, 333, 750, 1234, 99_999]) {
      const levels = presetLevels('STANDARD', chips);
      expect(structureProblems(levels)).toEqual([]);
      for (const [i, level] of levels.entries()) {
        if (level.kind !== 'BLINDS') continue;
        expect(level.bigBlind).toBeGreaterThan(level.smallBlind);
        const previous = levels[i - 1];
        if (previous?.kind === 'BLINDS') {
          expect(level.smallBlind).toBeGreaterThanOrEqual(previous.smallBlind);
        }
      }
    }
  });

  it('falls back to the familiar 5/10 when the stack is not a usable number', () => {
    // The field is a text input: it is empty, or mid-typing, more often than not.
    for (const chips of [0, -100, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(defaultSmallBlind(chips)).toBe(5);
    }
  });

  it('keeps the pace the manager picked when the stack changes', () => {
    // Regenerating for a new stack must not silently move them off טורבו.
    const turbo = presetLevels('TURBO', 5000);
    expect(turbo.every((l) => l.minutes === 10)).toBe(true);
    expect(matchPreset(turbo, 5000)).toBe('TURBO');
  });
});

describe('reading and writing the stored shape', () => {
  it('round-trips', () => {
    expect(parseLevels(serialiseLevels(LEVELS))).toEqual(LEVELS);
  });

  it('survives nonsense in the column without throwing', () => {
    expect(parseLevels(null)).toEqual([]);
    expect(parseLevels('nope')).toEqual([]);
    expect(parseLevels([{ minutes: 20 }, null, 7, { kind: 'BLINDS', minutes: 20 }])).toEqual([]);
    expect(parseLevels([{ kind: 'BREAK', minutes: 10 }])).toEqual([{ kind: 'BREAK', minutes: 10 }]);
  });
});

describe('the clock', () => {
  it('reads as minutes and seconds', () => {
    expect(formatClock(20 * MIN)).toBe('20:00');
    expect(formatClock(62_000)).toBe('01:02');
    expect(formatClock(0)).toBe('00:00');
    expect(formatClock(-5000)).toBe('00:00');
    // A part-second still has a second on the clock, so it never shows 00:00
    // while there is time left.
    expect(formatClock(1)).toBe('00:01');
  });
});
