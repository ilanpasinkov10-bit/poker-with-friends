import { AvatarUploader } from '@/components/profile/AvatarUploader';
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

      <ProfileSettingsForm
        displayName={user.profile?.display_name ?? ''}
        privacy={privacy}
      />
    </div>
  );
}
