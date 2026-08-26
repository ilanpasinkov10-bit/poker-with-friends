import { describe, expect, it } from 'vitest';
import {
  draftNameError,
  hasPendingChanges,
  normalisedName,
  pendingChanges,
  type SettingsDraft,
} from '@/lib/domain/settings-draft';

const SAVED: SettingsDraft = {
  displayName: 'אילן',
  soundsEnabled: true,
  shareStats: true,
  shareHistory: false,
  onLeaderboard: false,
};

const edit = (patch: Partial<SettingsDraft>): SettingsDraft => ({ ...SAVED, ...patch });

describe('what the settings screen still owes the database', () => {
  it('has nothing to save when nothing was touched', () => {
    expect(pendingChanges(SAVED, SAVED)).toEqual({
      displayName: false,
      sounds: false,
      privacy: false,
    });
    expect(hasPendingChanges(SAVED, SAVED)).toBe(false);
  });

  it('does not treat surrounding whitespace as a change', () => {
    const draft = edit({ displayName: '  אילן  ' });
    expect(hasPendingChanges(SAVED, draft)).toBe(false);
    expect(normalisedName(draft)).toBe('אילן');
  });

  it('saves a renamed player without touching anything else', () => {
    expect(pendingChanges(SAVED, edit({ displayName: 'אילן פסינקוב' }))).toEqual({
      displayName: true,
      sounds: false,
      privacy: false,
    });
  });

  it('treats game sounds as part of the draft', () => {
    expect(pendingChanges(SAVED, edit({ soundsEnabled: false }))).toEqual({
      displayName: false,
      sounds: true,
      privacy: false,
    });
  });

  it.each([
    ['shareStats', edit({ shareStats: false })],
    ['shareHistory', edit({ shareHistory: true })],
    ['onLeaderboard', edit({ onLeaderboard: true })],
  ])('sends the privacy settings when %s changes', (_label, draft) => {
    expect(pendingChanges(SAVED, draft)).toEqual({
      displayName: false,
      sounds: false,
      privacy: true,
    });
  });

  it('sends one privacy request for several privacy changes at once', () => {
    const draft = edit({ shareStats: false, shareHistory: true, onLeaderboard: true });
    expect(pendingChanges(SAVED, draft).privacy).toBe(true);
  });

  it('reports every kind of change together', () => {
    const draft = edit({ displayName: 'שי', soundsEnabled: false, onLeaderboard: true });
    expect(pendingChanges(SAVED, draft)).toEqual({
      displayName: true,
      sounds: true,
      privacy: true,
    });
  });

  /**
   * The half-saved case. A request is refused after an earlier one succeeded,
   * so the screen commits only what went through — and what is still owed must
   * survive as owed, not vanish because the save "ran".
   */
  it('keeps the outstanding change outstanding when an earlier step succeeded', () => {
    const draft = edit({ displayName: 'שי', onLeaderboard: true });
    const afterNameSaved: SettingsDraft = { ...SAVED, displayName: 'שי' };

    expect(pendingChanges(afterNameSaved, draft)).toEqual({
      displayName: false,
      sounds: false,
      privacy: true,
    });
    expect(hasPendingChanges(afterNameSaved, draft)).toBe(true);
  });

  it('refuses an empty name before the round trip', () => {
    expect(draftNameError(edit({ displayName: '   ' }))).toBe('צריך להזין שם');
    expect(draftNameError(SAVED)).toBeNull();
  });
});
