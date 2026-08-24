'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/Button';
import { Card, SectionTitle } from '@/components/ui/Card';
import { Field, Switch, TextInput } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';
import { signOutAction } from '@/lib/actions/auth';
import { updateDisplayNameAction, updatePrivacyAction } from '@/lib/actions/profile';
import type { ProfilePrivacyRow } from '@/types/database';

export function ProfileSettingsForm({
  displayName,
  privacy,
}: {
  displayName: string;
  privacy: ProfilePrivacyRow;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState(displayName);
  const [shareStats, setShareStats] = useState(privacy.share_stats_with_table_members);
  const [shareHistory, setShareHistory] = useState(privacy.share_detailed_history);
  const [onLeaderboard, setOnLeaderboard] = useState(privacy.show_on_leaderboard);

  const savePrivacy = (next: { stats?: boolean; history?: boolean; leaderboard?: boolean }) =>
    startTransition(async () => {
      const payload = {
        shareStatsWithTableMembers: next.stats ?? shareStats,
        shareDetailedHistory: next.history ?? shareHistory,
        showOnLeaderboard: next.leaderboard ?? onLeaderboard,
      };
      const result = await updatePrivacyAction(payload);
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      setShareStats(payload.shareStatsWithTableMembers);
      setShareHistory(payload.shareDetailedHistory);
      setOnLeaderboard(payload.showOnLeaderboard);
      toast.success('הגדרות הפרטיות נשמרו');
    });

  return (
    <div className="grid gap-6">
      <section>
        <SectionTitle>פרטים אישיים</SectionTitle>
        <Card className="grid gap-3">
          <Field label="שם התצוגה" htmlFor="displayName">
            <TextInput
              id="displayName"
              maxLength={40}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
          <Button
            loading={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await updateDisplayNameAction(name);
                if (!result.ok) toast.error(result.message);
                else {
                  toast.success('השם עודכן');
                  router.refresh();
                }
              })
            }
          >
            שמירה
          </Button>
        </Card>
      </section>

      <section>
        <SectionTitle>פרטיות</SectionTitle>
        <div className="grid gap-2">
          <Switch
            checked={shareStats}
            onChange={(value) => savePrivacy({ stats: value })}
            label="שיתוף סטטיסטיקות עם שחקנים בשולחן"
            description="שחקנים ששיחקו איתכם יוכלו לראות מספר משחקים ומאזן כללי"
          />
          <Switch
            checked={onLeaderboard}
            onChange={(value) => savePrivacy({ leaderboard: value })}
            label="הצג אותי בלוח ההישגים"
            description="כבוי כברירת מחדל. בהפעלה, השם, התמונה והמאזן המצטבר שלכם יוצגו לכל משתמש רשום"
          />
          <Switch
            checked={shareHistory}
            onChange={(value) => savePrivacy({ history: value })}
            label="שיתוף היסטוריה מפורטת"
            description="חשיפת פירוט המשחקים והתנועות הכספיות. כבוי כברירת מחדל."
          />
        </div>
        <p className="mt-3 text-[0.7rem] text-ink-faint">
          תוצאות של שולחן משותף גלויות תמיד לכל מי שישב באותו שולחן — זה חלק מההתחשבנות.
        </p>
      </section>

      <section>
        <Button
          variant="danger"
          block
          size="lg"
          onClick={() =>
            startTransition(async () => {
              await signOutAction();
              router.replace('/');
              router.refresh();
            })
          }
        >
          התנתקות
        </Button>
      </section>
    </div>
  );
}
