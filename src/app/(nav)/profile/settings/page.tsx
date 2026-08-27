import { ProfileSettingsScreen } from '@/components/profile/ProfileSettingsScreen';
import { getOwnProfile, requireRegisteredUserId } from '@/lib/auth';
import { loadPrivacySettings } from '@/lib/data/profile';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'הגדרות פרופיל' };

export default async function ProfileSettingsPage() {
  const user = await requireRegisteredUserId('/profile/settings');
  // The name and the privacy switches live in different tables and neither
  // depends on the other, so both are asked for at once.
  const [profile, privacy] = await Promise.all([
    getOwnProfile(user.id),
    loadPrivacySettings(user.id),
  ]);

  return (
    <ProfileSettingsScreen
      displayName={profile?.display_name ?? ''}
      avatarUrl={profile?.avatar_url ?? null}
      privacy={privacy}
    />
  );
}
