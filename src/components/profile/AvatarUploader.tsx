'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { errorMessage } from '@/lib/errors';
import { avatarObjectPath, prepareAvatar } from '@/lib/image/prepare';
import { removeAvatarAction, setAvatarAction } from '@/lib/actions/profile';
import { createClient } from '@/lib/supabase/client';

/**
 * Profile photo upload built for phone cameras.
 *
 * A camera photo is routinely 5–15 MB, so the original is never uploaded:
 * it is decoded, squared, scaled to at most 1200px and re-encoded in the
 * browser first. Storage still enforces its own 2 MB ceiling and its
 * owner-scoped path policy — neither is relaxed.
 */
export function AvatarUploader({
  name,
  avatarUrl,
}: {
  name: string;
  avatarUrl: string | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [stage, setStage] = useState<'idle' | 'processing' | 'uploading'>('idle');
  const [removing, startRemove] = useTransition();

  const busy = stage !== 'idle';

  const handle = async (file: File) => {
    setStage('processing');
    try {
      const prepared = await prepareAvatar(file).catch(() => null);
      if (!prepared) {
        toast.error(errorMessage('IMAGE_PROCESSING_FAILED'));
        return;
      }

      setStage('uploading');
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        toast.error('צריך להתחבר כדי לעדכן תמונה');
        return;
      }

      const path = avatarObjectPath(user.id, prepared.extension);
      const { error } = await supabase.storage
        .from('avatars')
        .upload(path, prepared.blob, { contentType: prepared.contentType, upsert: false });
      if (error) {
        toast.error('העלאת התמונה נכשלה, נסו שוב');
        return;
      }

      const result = await setAvatarAction(path);
      if (!result.ok) {
        toast.error(result.message);
        return;
      }

      toast.success('התמונה עודכנה');
      router.refresh();
    } finally {
      setStage('idle');
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div className="flex items-center gap-4">
      <Avatar name={name} src={avatarUrl} size="xl" ring />
      <div className="grid flex-1 gap-2">
        <input
          ref={inputRef}
          type="file"
          // `image/*` lets the phone offer both the gallery and the camera.
          accept="image/*"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void handle(file);
          }}
        />
        <Button
          variant="secondary"
          loading={busy}
          disabled={busy}
          onClick={() => inputRef.current?.click()}
        >
          {stage === 'processing'
            ? 'מכווץ תמונה…'
            : stage === 'uploading'
              ? 'מעלה…'
              : avatarUrl
                ? 'החלפת תמונה'
                : 'העלאת תמונה'}
        </Button>

        {avatarUrl ? (
          <Button
            variant="ghost"
            size="sm"
            loading={removing}
            disabled={busy}
            onClick={() =>
              startRemove(async () => {
                const result = await removeAvatarAction();
                if (!result.ok) toast.error(result.message);
                else {
                  toast.success('התמונה הוסרה');
                  router.refresh();
                }
              })
            }
          >
            הסרת התמונה
          </Button>
        ) : null}

        <p className="text-[0.7rem] leading-relaxed text-ink-faint">
          אפשר להעלות תמונה מהגלריה או לצלם עכשיו. התמונה תכווץ אוטומטית לפני ההעלאה.
        </p>
      </div>
    </div>
  );
}
