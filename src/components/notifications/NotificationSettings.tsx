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
 * Turning one off says nothing about the other.
 *
 * They also *save* differently, and that asymmetry is deliberate rather than an
 * oversight. Sounds are an ordinary preference, so the draft is handed up to
 * the screen's "שמור שינויים" button with everything else. Notifications are
 * not: switching them on has to raise the browser's permission prompt and
 * register a push subscription, and a browser only allows that prompt while the
 * tap that asked for it is still fresh. Deferring it behind a save button —
 * after a round trip or two — is exactly the case Safari refuses, so the switch
 * does its work there and then and reports the saved value back up.
 *
 * Notifications default on, but "on" here only means the app is *willing* to
 * send. A device receives nothing until the permission prompt is accepted, and
 * that prompt is only raised when the player actively turns the switch on —
 * never on page load, which browsers penalise and players resent.
 */
export function NotificationSettings({
  pushEnabled,
  onPushChange,
  soundsEnabled,
  onSoundsChange,
  savedSoundsEnabled,
}: {
  /** The value already stored for this account. Saved as soon as it changes. */
  pushEnabled: boolean;
  /** Called once the new value is safely stored. */
  onPushChange: (next: boolean) => void;
  /** The draft value on the switch, saved by the screen's save button. */
  soundsEnabled: boolean;
  onSoundsChange: (next: boolean) => void;
  /**
   * The sounds value currently in the database. Both columns are written
   * together, so switching notifications must re-send the *stored* sounds
   * value — never the unsaved draft, which would save half the form early.
   */
  savedSoundsEnabled: boolean;
}) {
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [support, setSupport] = useState<PushSupport | null>(null);
  const [publicKey, setPublicKey] = useState<string | null>(null);

  useEffect(() => {
    setSupport(detectPushSupport());
    void pushPublicKeyAction().then((result) => {
      if (result.ok) setPublicKey(result.data.publicKey);
    });
  }, []);

  const togglePush = (next: boolean) =>
    startTransition(async () => {
      // The browser side runs first when switching push on: if the player
      // dismisses the permission prompt, the switch must not be left claiming
      // it is on. Turning off is the reverse — stop sending, then tidy up.
      if (next) {
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

      const result = await updateNotificationSettingsAction({
        pushNotificationsEnabled: next,
        gameSoundsEnabled: savedSoundsEnabled,
      });
      if (!result.ok) {
        toast.error(result.message);
        return;
      }

      if (!next) await disablePush();

      onPushChange(next);
      toast.success(next ? 'התראות הופעלו' : 'התראות כובו');
    });

  const unavailable = support !== null && support !== 'SUPPORTED';

  return (
    <div className="grid gap-2">
      <Switch
        checked={pushEnabled}
        onChange={togglePush}
        label="התראות על אירועים בשולחן"
        description="הצטרפות, עזיבה, כניסה נוספת, תחילת וסיום משחק"
      />

      {unavailable && pushEnabled ? <PushHint support={support} /> : null}

      <p className="text-[0.7rem] text-ink-faint">
        {pending ? 'שומר…' : 'ההתראות נשמרות מיד — הדפדפן מבקש אישור ברגע ההפעלה.'}
      </p>

      <Switch
        checked={soundsEnabled}
        onChange={onSoundsChange}
        label="צלילי משחק"
        description="צלילים עדינים כשהאפליקציה פתוחה. אינם תלויים בהתראות."
      />
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
