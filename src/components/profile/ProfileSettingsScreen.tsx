'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';
import { AppBar, BackChevron, backControlClass } from '@/components/layout/AppBar';
import { BottomNav } from '@/components/layout/BottomNav';
import { PageShell } from '@/components/layout/PageShell';
import { NotificationSettings } from '@/components/notifications/NotificationSettings';
import { AppearanceControl } from '@/components/theme/AppearanceControl';
import { AvatarUploader } from '@/components/profile/AvatarUploader';
import { Button } from '@/components/ui/Button';
import { Card, SectionTitle } from '@/components/ui/Card';
import { Field, Switch, TextInput } from '@/components/ui/Field';
import { ConfirmDialog } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { signOutAction } from '@/lib/actions/auth';
import { updateDisplayNameAction, updatePrivacyAction } from '@/lib/actions/profile';
import { updateNotificationSettingsAction } from '@/lib/actions/notifications';
import {
  draftNameError,
  hasPendingChanges,
  normalisedName,
  pendingChanges,
  type SettingsDraft,
} from '@/lib/domain/settings-draft';
import type { ProfilePrivacyRow } from '@/types/database';

/**
 * The profile settings screen.
 *
 * One page, one save button, in the order a player reads it: who they are,
 * then what the app is allowed to do to their phone, then how it looks, then
 * who may see them — and only then the two buttons that end the visit.
 *
 * Most of the screen is a draft. Typing a name or flipping a privacy switch
 * changes nothing until "שמור שינויים" is pressed, which is the point: a form
 * that saves behind your back gives you no way to change your mind, and one
 * that saves each field separately makes six trips for one visit.
 *
 * Three things still apply the moment they are touched, and each has a reason
 * that a save button cannot work around:
 *
 *   · **Appearance** is stored on the device, not on the account. There is
 *     nothing on the server to save, and the control *is* the preview — a
 *     theme picker that only takes effect later would show you a screen you
 *     did not choose.
 *   · **Notifications** need the browser's permission prompt, which browsers
 *     only grant while the tap that asked for it is still fresh. Behind a save
 *     button — after a round trip or two — Safari refuses it outright, so
 *     iPhone players would end up with a switch that says "on" and a phone
 *     that never buzzes.
 *   · **The profile photo** is uploaded straight to storage from the browser,
 *     with its own progress and its own failure modes. Holding a photo in
 *     memory to replay on save would only add a way to lose it.
 *
 * Everything else — display name, sounds, all three privacy settings — is
 * saved by the button, and the button says so.
 */

function draftOf(displayName: string, privacy: ProfilePrivacyRow): SettingsDraft {
  return {
    displayName,
    soundsEnabled: privacy.game_sounds_enabled,
    shareStats: privacy.share_stats_with_table_members,
    shareHistory: privacy.share_detailed_history,
    onLeaderboard: privacy.show_on_leaderboard,
  };
}

const UNSAVED_MESSAGE = 'יש שינויים שלא נשמרו.';

export function ProfileSettingsScreen({
  displayName,
  avatarUrl,
  privacy,
}: {
  displayName: string;
  avatarUrl: string | null;
  privacy: ProfilePrivacyRow;
}) {
  const router = useRouter();
  const toast = useToast();
  const [saving, startSave] = useTransition();
  const [signingOut, startSignOut] = useTransition();

  // `saved` is what the database holds; `draft` is what the screen shows. The
  // gap between them is the entire state of this form.
  const [saved, setSaved] = useState<SettingsDraft>(() => draftOf(displayName, privacy));
  const [draft, setDraft] = useState<SettingsDraft>(() => draftOf(displayName, privacy));
  const [pushEnabled, setPushEnabled] = useState(privacy.push_notifications_enabled);
  const [leaving, setLeaving] = useState(false);

  const set = <K extends keyof SettingsDraft>(key: K, value: SettingsDraft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));

  const dirty = hasPendingChanges(saved, draft);

  // Covers the exits the app does not control: reload, closing the tab,
  // swiping the installed app away. In-app navigation is caught by the back
  // control below, which can ask properly instead of showing a browser dialog.
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  /**
   * Saves whatever actually changed, and stops at the first refusal.
   *
   * Each step that succeeds is folded into `saved` even when a later one
   * fails, so a retry re-sends only what is still outstanding and nothing the
   * player typed is quietly dropped. The transition guards a second press.
   */
  const save = () => {
    if (saving || !dirty) return;
    const nameError = draftNameError(draft);
    if (nameError) {
      toast.error(nameError);
      return;
    }

    const name = normalisedName(draft);
    const pending = pendingChanges(saved, draft);

    startSave(async () => {
      let committed = saved;
      const commit = (patch: Partial<SettingsDraft>) => {
        committed = { ...committed, ...patch };
        setSaved(committed);
      };

      if (pending.displayName) {
        const result = await updateDisplayNameAction(name);
        if (!result.ok) {
          toast.error(result.message);
          return;
        }
        setDraft((current) => ({ ...current, displayName: name }));
        commit({ displayName: name });
      }

      if (pending.sounds) {
        const result = await updateNotificationSettingsAction({
          pushNotificationsEnabled: pushEnabled,
          gameSoundsEnabled: draft.soundsEnabled,
        });
        if (!result.ok) {
          toast.error(result.message);
          return;
        }
        commit({ soundsEnabled: draft.soundsEnabled });
      }

      if (pending.privacy) {
        const result = await updatePrivacyAction({
          shareStatsWithTableMembers: draft.shareStats,
          shareDetailedHistory: draft.shareHistory,
          showOnLeaderboard: draft.onLeaderboard,
        });
        if (!result.ok) {
          toast.error(result.message);
          return;
        }
        commit({
          shareStats: draft.shareStats,
          shareHistory: draft.shareHistory,
          onLeaderboard: draft.onLeaderboard,
        });
      }

      toast.success('השינויים נשמרו');
      router.refresh();
    });
  };

  const goBack = () => router.push('/profile');

  return (
    <>
      <AppBar
        title="הגדרות פרופיל"
        subtitle="שם, התראות, מראה ופרטיות"
        back={
          <button
            type="button"
            aria-label="חזרה לפרופיל"
            onClick={() => (dirty ? setLeaving(true) : goBack())}
            className={backControlClass}
          >
            <BackChevron />
          </button>
        }
      />

      <PageShell belowAppBar withNav>
        <div className="grid gap-6">
          <section>
            <SectionTitle>פרטים אישיים</SectionTitle>
            <Card className="grid gap-4">
              <AvatarUploader name={draft.displayName || 'שחקן'} avatarUrl={avatarUrl} />
              <Field
                label="שם התצוגה"
                htmlFor="displayName"
                hint="כך יראו אתכם שאר השחקנים בשולחן."
              >
                <TextInput
                  id="displayName"
                  maxLength={40}
                  value={draft.displayName}
                  onChange={(event) => set('displayName', event.target.value)}
                />
              </Field>
            </Card>
          </section>

          <section>
            <SectionTitle>התראות וצלילים</SectionTitle>
            <NotificationSettings
              pushEnabled={pushEnabled}
              onPushChange={setPushEnabled}
              soundsEnabled={draft.soundsEnabled}
              onSoundsChange={(value) => set('soundsEnabled', value)}
              savedSoundsEnabled={saved.soundsEnabled}
            />
          </section>

          <section>
            <SectionTitle>מראה</SectionTitle>
            <Card className="grid gap-2">
              <AppearanceControl />
              <p className="text-xs text-ink-faint">
                הבחירה חלה מיד ונשמרת במכשיר הזה — גם אחרי רענון או סגירת הדפדפן.
              </p>
            </Card>
          </section>

          <section>
            <SectionTitle>פרטיות</SectionTitle>
            <div className="grid gap-2">
              <Switch
                checked={draft.shareStats}
                onChange={(value) => set('shareStats', value)}
                label="שיתוף סטטיסטיקות עם שחקנים בשולחן"
                description="שחקנים ששיחקו איתכם יוכלו לראות מספר משחקים ומאזן כללי"
              />
              <Switch
                checked={draft.onLeaderboard}
                onChange={(value) => set('onLeaderboard', value)}
                label="הצג אותי בלוח ההישגים"
                description="כבוי כברירת מחדל. בהפעלה, השם, התמונה והמאזן המצטבר שלכם יוצגו לכל משתמש רשום"
              />
              <Switch
                checked={draft.shareHistory}
                onChange={(value) => set('shareHistory', value)}
                label="שיתוף היסטוריה מפורטת"
                description="חשיפת פירוט המשחקים והתנועות הכספיות. כבוי כברירת מחדל."
              />
            </div>
            <p className="mt-3 text-[0.7rem] text-ink-faint">
              תוצאות של שולחן משותף גלויות תמיד לכל מי שישב באותו שולחן — זה חלק מההתחשבנות.
            </p>
          </section>

          <section className="grid gap-2">
            <Button block size="lg" loading={saving} disabled={!dirty} onClick={save}>
              שמור שינויים
            </Button>
            <p aria-live="polite" className="text-center text-xs text-ink-faint">
              {saving
                ? 'שומר…'
                : dirty
                  ? `${UNSAVED_MESSAGE} השם, הצלילים והפרטיות יישמרו בלחיצה.`
                  : 'הכול שמור. תמונת הפרופיל, ההתראות והמראה נשמרים מיד בשינוי.'}
            </p>
          </section>

          <section className="border-t border-line-soft pt-6">
            <Button
              variant="danger"
              block
              size="lg"
              loading={signingOut}
              onClick={() =>
                startSignOut(async () => {
                  await signOutAction();
                  router.replace('/');
                  router.refresh();
                })
              }
            >
              התנתקות
            </Button>
            <p className="mt-2 text-center text-xs text-ink-faint">
              תנותקו מהמכשיר הזה. הנתונים והמשחקים שלכם נשמרים.
            </p>
          </section>
        </div>
      </PageShell>

      <BottomNav />

      <ConfirmDialog
        open={leaving}
        title="לצאת בלי לשמור?"
        message={`${UNSAVED_MESSAGE} אם תצאו עכשיו הם יאבדו.`}
        confirmLabel="צא בלי לשמור"
        cancelLabel="הישארו כאן"
        tone="danger"
        onConfirm={() => {
          setLeaving(false);
          goBack();
        }}
        onCancel={() => setLeaving(false)}
      />
    </>
  );
}
