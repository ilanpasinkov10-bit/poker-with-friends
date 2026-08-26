import { ProfileSettingsScreen } from '@/components/profile/ProfileSettingsScreen';
import { requireRegisteredUser } from '@/lib/auth';
import { loadPrivacySettings } from '@/lib/data/profile';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'הגדרות פרופיל' };

export default async function ProfileSettingsPage() {
  const user = await requireRegisteredUser('/profile/settings');
  const privacy = await loadPrivacySettings(user.id);

  return (
    <ProfileSettingsScreen
      displayName={user.profile?.display_name ?? ''}
      avatarUrl={user.profile?.avatar_url ?? null}
      privacy={privacy}
    />
  );
}
