import { AvatarUploader } from '@/components/profile/AvatarUploader';
import { AppearanceControl } from '@/components/theme/AppearanceControl';
import { ProfileSettingsForm } from '@/components/profile/ProfileSettingsForm';
import { Card, SectionTitle } from '@/components/ui/Card';
import { requireRegisteredUser } from '@/lib/auth';
import { loadPrivacySettings } from '@/lib/data/profile';

export const dynamic = 'force-dynamic';

export default async function ProfileSettingsPage() {
  const user = await requireRegisteredUser('/profile/settings');
  const privacy = await loadPrivacySettings(user.id);

  return (
    <div className="grid gap-6">
      <section>
        <SectionTitle>תמונת פרופיל</SectionTitle>
        <Card>
          <AvatarUploader
            name={user.profile?.display_name ?? 'שחקן'}
            avatarUrl={user.profile?.avatar_url ?? null}
          />
        </Card>
      </section>

      <section>
        <SectionTitle>מראה</SectionTitle>
        <Card className="grid gap-2">
          <AppearanceControl />
          <p className="text-xs text-ink-faint">
            הבחירה נשמרת במכשיר הזה ונשמרת גם אחרי רענון או סגירת הדפדפן.
          </p>
        </Card>
      </section>

      <ProfileSettingsForm
        displayName={user.profile?.display_name ?? ''}
        privacy={privacy}
      />
    </div>
  );
}
