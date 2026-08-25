'use client';

import { useEffect, useState, useTransition } from 'react';
import { Switch } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';
import {
  pushPublicKeyAction,
  updateNotificationSettingsAction,
} from '@/lib/actions/notifications';
import { detectPushSupport, disablePush, enablePush, type PushSupport } from '@/lib/push/browser';

/**
 * The two switches, and the browser work behind the first one.
 *
 * They are separate on purpose: a sound is a local nuisance during a game, a
 * push notification is a message to a phone that may be in someone's pocket.
 * Turning one off says nothing about the other, so each saves independently.
 *
 * Notifications default on, but "on" here only means the app is *willing* to
 * send. A device receives nothing until the browser's own permission prompt is
 * accepted, and that prompt is only raised when the player actively turns the
 * switch on — never on page load, which browsers penalise and players resent.
 */
export function NotificationSettings({
  pushEnabled: initialPush,
  soundsEnabled: initialSounds,
}: {
  pushEnabled: boolean;
  soundsEnabled: boolean;
}) {
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [pushEnabled, setPushEnabled] = useState(initialPush);
  const [soundsEnabled, setSoundsEnabled] = useState(initialSounds);
  const [support, setSupport] = useState<PushSupport | null>(null);
  const [publicKey, setPublicKey] = useState<string | null>(null);

  useEffect(() => {
    setSupport(detectPushSupport());
    void pushPublicKeyAction().then((result) => {
      if (result.ok) setPublicKey(result.data.publicKey);
    });
  }, []);

  const save = (next: { push?: boolean; sounds?: boolean }) =>
    startTransition(async () => {
      const payload = {
        pushNotificationsEnabled: next.push ?? pushEnabled,
        gameSoundsEnabled: next.sounds ?? soundsEnabled,
      };

      // The browser side runs first when switching push on: if the player
      // dismisses the permission prompt, the switch must not be left claiming
      // it is on. Turning off is the reverse — stop sending, then tidy up.
      if (next.push === true) {
        if (!publicKey) {
          toast.error('התראות אינן זמינות כרגע');
          return;
        }
        const subscribed = await enablePush(publicKey);
        if (!subscribed) {
          toast.error('לא קיבלנו אישור לשליחת התראות בדפדפן');
          return;
        }
      }

      const result = await updateNotificationSettingsAction(payload);
      if (!result.ok) {
        toast.error(result.message);
        return;
      }

      if (next.push === false) await disablePush();

      setPushEnabled(payload.pushNotificationsEnabled);
      setSoundsEnabled(payload.gameSoundsEnabled);
      toast.success('ההגדרות נשמרו');
    });

  const unavailable = support !== null && support !== 'SUPPORTED';

  return (
    <div className="grid gap-2">
      <Switch
        checked={pushEnabled}
        onChange={(value) => save({ push: value })}
        label="התראות על אירועים בשולחן"
        description="הצטרפות, עזיבה, כניסה נוספת, תחילת וסיום משחק"
      />

      {unavailable && pushEnabled ? <PushHint support={support} /> : null}

      <Switch
        checked={soundsEnabled}
        onChange={(value) => save({ sounds: value })}
        label="צלילי משחק"
        description="צלילים עדינים כשהאפליקציה פתוחה. אינם תלויים בהתראות."
      />

      <p className="mt-1 text-[0.7rem] text-ink-faint">
        {pending ? 'שומר…' : 'שתי ההגדרות נפרדות — אפשר לכבות כל אחת בנפרד.'}
      </p>
    </div>
  );
}

/**
 * Why this device will not buzz.
 *
 * Worth saying plainly rather than leaving a switch that looks on and does
 * nothing — especially on iPhone, where Safari only exposes push once the app
 * has been added to the Home Screen, and there is no way to detect that for
 * the player other than telling them.
 */
function PushHint({ support }: { support: PushSupport }) {
  const message =
    support === 'NEEDS_INSTALL'
      ? 'באייפון צריך להוסיף את האפליקציה למסך הבית (שיתוף → הוספה למסך הבית) כדי לקבל התראות.'
      : support === 'DENIED'
        ? 'הדפדפן חוסם התראות עבור האתר. אפשר לשנות זאת בהגדרות הדפדפן.'
        : 'הדפדפן הזה לא תומך בהתראות.';

  return (
    <p className="rounded-xl border border-warn/30 bg-warn-soft px-3 py-2.5 text-xs text-warn">
      {message}
    </p>
  );
}
