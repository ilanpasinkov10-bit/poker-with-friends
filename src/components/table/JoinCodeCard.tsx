'use client';

import { useState } from 'react';
import { Num } from '@/components/ui/Num';
import { useToast } from '@/components/ui/Toast';

/** Share panel: copy the code, copy the link, or use the native share sheet. */
export function JoinCodeCard({ joinCode, tableName }: { joinCode: string; tableName: string }) {
  const toast = useToast();
  const [shareUrl] = useState(() =>
    typeof window === 'undefined' ? '' : `${window.location.origin}/join/${joinCode}`,
  );

  const copy = async (value: string, message: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(message);
    } catch {
      toast.error('לא הצלחנו להעתיק, נסו ידנית');
    }
  };

  const share = async () => {
    const url = shareUrl || `/join/${joinCode}`;
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({
          title: tableName,
          text: `מצטרפים לשולחן "${tableName}" עם הקוד ${joinCode}`,
          url,
        });
        return;
      } catch {
        // The user dismissed the share sheet — nothing to report.
        return;
      }
    }
    await copy(url, 'הקישור הועתק');
  };

  return (
    <section className="rounded-2xl border border-line-soft bg-surface p-4">
      <p className="text-xs font-medium text-ink-faint">קוד שולחן</p>
      <p className="ltr-num mt-1 text-4xl font-black tracking-[0.3em] text-brand-ink">{joinCode}</p>

      <div className="mt-4 grid grid-cols-3 gap-2">
        <ShareButton onClick={() => copy(joinCode, 'הקוד הועתק')}>העתק קוד</ShareButton>
        <ShareButton onClick={() => copy(shareUrl || `/join/${joinCode}`, 'הקישור הועתק')}>
          העתק קישור
        </ShareButton>
        <ShareButton onClick={share} primary>
          שתף
        </ShareButton>
      </div>

      <p className="mt-3 text-[0.7rem] text-ink-faint">
        הקוד מאפשר להצטרף כשחקן בלבד — הרשאות ניהול נשארות אצלכם.{' '}
        <Num>{`/join/${joinCode}`}</Num>
      </p>
    </section>
  );
}

function ShareButton({
  children,
  onClick,
  primary,
}: {
  children: React.ReactNode;
  onClick: () => void;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        'h-11 rounded-xl text-sm font-semibold transition-colors ' +
        (primary
          ? 'bg-brand text-white hover:bg-brand/90'
          : 'border border-line bg-surface-2 text-ink hover:bg-surface-3')
      }
    >
      {children}
    </button>
  );
}
