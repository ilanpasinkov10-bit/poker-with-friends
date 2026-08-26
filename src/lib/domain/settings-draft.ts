/**
 * What the settings screen still owes the database.
 *
 * The screen holds two copies of the same shape: `saved`, which is what the
 * database returned, and `draft`, which is what the player has typed and
 * toggled since. Everything the save button does follows from the difference
 * between them — which requests to send, whether the button is enabled at all,
 * and what is still outstanding if one of those requests is refused.
 *
 * It lives here, away from React, because that is the part worth being sure
 * about: a wrong answer either sends a request that was not asked for or
 * quietly drops something the player typed.
 *
 * Note what is *not* here. The appearance preference is stored on the device
 * and never reaches the database; notifications and the profile photo are
 * saved the moment they change, because both need a browser permission or an
 * upload that cannot wait behind a button. None of the three is part of the
 * draft, so none of them can be left unsaved by it.
 */

export interface SettingsDraft {
  displayName: string;
  soundsEnabled: boolean;
  shareStats: boolean;
  shareHistory: boolean;
  onLeaderboard: boolean;
}

/** Which of the three save calls the button actually has to make. */
export interface PendingChanges {
  displayName: boolean;
  sounds: boolean;
  privacy: boolean;
}

/**
 * The name as it will be stored. Surrounding whitespace is not a change worth
 * a round trip, and the server trims it anyway — so " אילן " must not light up
 * the save button when the stored name is already "אילן".
 */
export function normalisedName(draft: Pick<SettingsDraft, 'displayName'>): string {
  return draft.displayName.trim();
}

export function pendingChanges(saved: SettingsDraft, draft: SettingsDraft): PendingChanges {
  return {
    displayName: normalisedName(draft) !== normalisedName(saved),
    sounds: draft.soundsEnabled !== saved.soundsEnabled,
    privacy:
      draft.shareStats !== saved.shareStats ||
      draft.shareHistory !== saved.shareHistory ||
      draft.onLeaderboard !== saved.onLeaderboard,
  };
}

export function hasPendingChanges(saved: SettingsDraft, draft: SettingsDraft): boolean {
  const pending = pendingChanges(saved, draft);
  return pending.displayName || pending.sounds || pending.privacy;
}

/**
 * Whether the draft can be saved at all. An empty name is the only thing the
 * screen refuses outright — the server would refuse it too, and saying so
 * before the round trip is kinder than after it.
 */
export function draftNameError(draft: SettingsDraft): string | null {
  return normalisedName(draft) === '' ? 'צריך להזין שם' : null;
}
