'use client';

import { useState } from 'react';
import { Num } from '@/components/ui/Num';
import { useToast } from '@/components/ui/Toast';
import { InviteFriendsButton } from '@/components/friends/InviteFriendsButton';
import { joinPath, joinUrl } from '@/lib/domain/join-link';
import { QrJoinModal } from './QrJoinModal';

/** Share panel: copy the code, copy the link, or use the native share sheet. */
export function JoinCodeCard({
  tableId,
  joinCode,
  tableName,
  seatedUserIds,
}: {
  tableId: string;
  joinCode: string;
  tableName: string;
  /** Registered players already at the table, for the invite sheet's labels. */
  seatedUserIds: string[];
}) {
  const toast = useToast();
  const [qrOpen, setQrOpen] = useState(false);
  // Resolved once on the client, where the origin is known. Every share
  // action below — link, sheet and QR — uses this single value.
  const [shareUrl] = useState(() =>
    joinUrl(typeof window === 'undefined' ? null : window.location.origin, joinCode),
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
    const url = shareUrl;
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

      {/* Two rows rather than four columns: four 11px labels on a 320px phone
          truncate to nothing. */}
      <div className="mt-4 grid grid-cols-2 gap-2">
        <ShareButton onClick={() => copy(joinCode, 'הקוד הועתק')}>העתק קוד</ShareButton>
        <ShareButton onClick={() => copy(shareUrl, 'הקישור הועתק')}>
          העתק קישור
        </ShareButton>
        <ShareButton onClick={() => setQrOpen(true)}>קוד QR</ShareButton>
        <ShareButton onClick={share} primary>
          שתף
        </ShareButton>
      </div>

      {/* Inviting a friend inside the app, with the link above still offered
          inside the sheet for everybody who is not on it. */}
      <div className="mt-2">
        <InviteFriendsButton
          tableId={tableId}
          tableName={tableName}
          joinCode={joinCode}
          seatedUserIds={seatedUserIds}
        />
      </div>

      <QrJoinModal
        open={qrOpen}
        onClose={() => setQrOpen(false)}
        tableName={tableName}
        joinCode={joinCode}
        joinUrl={shareUrl}
      />

      <p className="mt-3 text-[0.7rem] text-ink-faint">
        הקוד מאפשר להצטרף כשחקן בלבד — הרשאות ניהול נשארות אצלכם.{' '}
        <Num>{joinPath(joinCode)}</Num>
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
          ? 'bg-brand text-on-brand hover:bg-brand/90'
          : 'border border-line bg-surface-2 text-ink hover:bg-surface-3')
      }
    >
      {children}
    </button>
  );
}
