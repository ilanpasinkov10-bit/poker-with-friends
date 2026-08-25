/**
 * Working out what just happened at a table by comparing two renders.
 *
 * The app already re-renders from the server on every realtime change, so the
 * difference between the previous view and the current one *is* the event
 * feed. Deriving the cues this way means no second channel to keep in step
 * with the data, and no risk of a sound firing for something the screen does
 * not show.
 *
 * Pure, so the rules below can be tested without a browser or an audio device.
 */

import type { SoundName } from '@/lib/sound/engine';

export interface TableSnapshot {
  status: string;
  /** Seats still playing. */
  seatedIds: readonly string[];
  /** Seats that have completed a cash-out. */
  leftIds: readonly string[];
  /** Entries across everyone whose money is in the game. */
  buyInCount: number;
}

/**
 * The cues owed for a change, in the order they should be heard.
 *
 * Two rules are worth stating outright:
 *
 * A player leaving moves their id from `seatedIds` to `leftIds`. Only the
 * arrival in `leftIds` is a departure — treating the disappearance from
 * `seatedIds` as one too would sound it twice.
 *
 * Joining a table creates the seat *and* its opening entry in one
 * transaction, so the entry count rises by one per new player without anyone
 * buying back in. Only the rise beyond that is a genuine additional entry;
 * otherwise every join would also rattle chips.
 */
export function soundsForChange(before: TableSnapshot, after: TableSnapshot): SoundName[] {
  const sounds: SoundName[] = [];

  if (before.status !== 'ACTIVE' && after.status === 'ACTIVE') {
    sounds.push('GAME_STARTED');
  }

  const wasSeated = new Set(before.seatedIds);
  const wasGone = new Set(before.leftIds);
  const knownBefore = new Set([...before.seatedIds, ...before.leftIds]);

  const joined = after.seatedIds.filter((id) => !knownBefore.has(id));
  if (joined.length > 0) sounds.push('PLAYER_JOINED');

  const left = after.leftIds.filter((id) => !wasGone.has(id) && wasSeated.has(id));
  if (left.length > 0) sounds.push('PLAYER_LEFT');

  const extraEntries = after.buyInCount - before.buyInCount - joined.length;
  if (extraEntries > 0) sounds.push('BUY_IN');

  return sounds;
}
