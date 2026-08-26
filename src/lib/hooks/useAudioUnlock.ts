'use client';

import { useEffect } from 'react';
import { audioUnlocked, unlockAudio } from '@/lib/sound/engine';

/**
 * Events a browser will accept as "the player did that".
 *
 * Deliberately wide, and `pointerdown` earns its place: on a phone it fires as
 * soon as a finger lands, which means the act of *scrolling* the table unlocks
 * audio. A player who opens a table and reads down the list of seats has
 * already done enough, without ever being asked to tap anything.
 */
const GESTURES = ['pointerdown', 'touchend', 'mousedown', 'keydown', 'click'] as const;

/**
 * Turns the player's own taps into permission to make a sound.
 *
 * Browsers will not start an `AudioContext` from a script — it has to happen
 * inside a handler for a real interaction. Every cue in this app is triggered
 * by another player over realtime, so without this the context would never
 * leave `suspended` and nothing would ever be heard. The nearest genuine
 * gesture is whatever the player does next on the table screen.
 *
 * There is no prompt and no modal, because none is needed: this listens for a
 * tap that was going to happen anyway. It keeps listening until the browser
 * actually reports the context running, which matters on iOS, where the first
 * attempt can be refused and a later one accepted; and it starts listening
 * again when the app comes back to the foreground, because iOS suspends the
 * context while the app is in the background and the next tap has to wake it.
 *
 * Nothing happens at all when the player has sounds switched off — no context
 * is created, no listeners are attached.
 */
export function useAudioUnlock(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;

    let armed = false;

    const disarm = () => {
      if (!armed) return;
      armed = false;
      for (const type of GESTURES) document.removeEventListener(type, attempt, true);
    };

    function attempt() {
      unlockAudio();
      // Resuming is asynchronous, so the state is checked on the next turn
      // rather than immediately after asking.
      setTimeout(() => {
        if (audioUnlocked()) disarm();
      }, 0);
    }

    const arm = () => {
      if (armed || audioUnlocked()) return;
      armed = true;
      // Capture, so a handler that stops propagation cannot swallow the one
      // interaction that would have turned the sound on.
      for (const type of GESTURES) document.addEventListener(type, attempt, true);
    };

    // Arriving here means tapping a table in the list, and Chrome and Android
    // carry that activation across the client-side navigation — so audio can
    // often be unlocked before the player touches anything on this screen.
    // `hasBeenActive` is what makes the attempt worth making: without the
    // check, browsers that would refuse log "The AudioContext was not allowed
    // to start" on every table opened. Safari does not implement it, and does
    // not honour sticky activation for audio either, so it correctly waits for
    // the gesture below.
    if (navigator.userActivation?.hasBeenActive) unlockAudio();
    arm();

    const onVisible = () => {
      if (document.visibilityState === 'visible' && !audioUnlocked()) arm();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      disarm();
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [enabled]);
}
