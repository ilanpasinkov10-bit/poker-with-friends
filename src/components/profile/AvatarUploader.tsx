'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { removeAvatarAction, setAvatarAction } from '@/lib/actions/profile';
import { createClient } from '@/lib/supabase/client';

const MAX_BYTES = 2 * 1024 * 1024;
const ALLOWED: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

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
  const [uploading, setUploading] = useState(false);
  const [removing, startRemove] = useTransition();

  const upload = async (file: File) => {
    const extension = ALLOWED[file.type];
    if (!extension) {
      toast.error('אפשר להעלות רק תמונות מסוג JPG, PNG, WEBP או GIF');
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error('התמונה גדולה מדי — עד 2MB');
      return;
    }

    setUploading(true);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        toast.error('צריך להתחבר כדי לעדכן תמונה');
        return;
      }

      // Path is `<user-id>/<random>.<ext>`; the storage policy pins the first
      // segment to auth.uid(), so no user can write into another's folder.
      const path = `${user.id}/${crypto.randomUUID()}.${extension}`;
      const { error } = await supabase.storage
        .from('avatars')
        .upload(path, file, { contentType: file.type, upsert: false });
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
      setUploading(false);
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
          accept={Object.keys(ALLOWED).join(',')}
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void upload(file);
          }}
        />
        <Button
          variant="secondary"
          loading={uploading}
          onClick={() => inputRef.current?.click()}
        >
          {avatarUrl ? 'החלפת תמונה' : 'העלאת תמונה'}
        </Button>
        {avatarUrl ? (
          <Button
            variant="ghost"
            size="sm"
            loading={removing}
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
        <p className="text-[0.7rem] text-ink-faint">JPG, PNG, WEBP או GIF · עד 2MB</p>
      </div>
    </div>
  );
}
