'use client';

import type { TableEventKind } from '@/lib/domain/events';

/**
 * The live-game sounds, synthesised rather than shipped.
 *
 * There are no audio files here on purpose. Four short cues would be a few
 * hundred kilobytes to download and cache, each one a licensing question, and
 * they would still need a fallback when the fetch fails. The Web Audio API
 * builds all four from oscillators and filtered noise in about a kilobyte of
 * code, with nothing to load and nothing to go stale.
 *
 * Everything is deliberately quiet and short — under half a second. These play
 * while people are at a table talking to each other; a cue that demands
 * attention would be turned off within one evening.
 *
 * ## Why this needs an explicit unlock
 *
 * Every cue in this app is triggered by something *another player* did: a seat
 * taken, an entry approved, a stack cashed out. It arrives over realtime and is
 * played from a React effect — which is exactly the situation browsers refuse
 * to make a sound in. An `AudioContext` built outside a user gesture is born
 * `suspended`; its clock does not run, and anything scheduled on it waits for a
 * resume that a script cannot grant itself. Safari on iOS is the strictest:
 * `resume()` only takes effect when it is called from inside a handler for a
 * real touch.
 *
 * So the context is never created by a cue. It is created and resumed by
 * `unlockAudio()`, which the table screen calls from the player's own taps, and
 * `playSound` refuses to schedule anything until that has succeeded. A cue that
 * arrives before the first tap is dropped rather than queued — a silent cue is
 * a small loss, but a queue that empties itself all at once the moment someone
 * touches the screen is a genuinely bad surprise.
 */

/**
 * The browser pieces this module needs, named so a test can supply its own.
 * Nothing here is Web-Audio-specific beyond what the cues actually use.
 */
type Ctor = new () => AudioContext;

export type SoundName =
  | Extract<TableEventKind, 'PLAYER_JOINED' | 'PLAYER_LEFT' | 'BUY_IN' | 'GAME_STARTED'>
  // Not a table event: nothing is written when a blind level turns over, so
  // there is no row for one to be derived from. See src/lib/domain/blinds.ts.
  | 'BLINDS_UP';

type Ctx = AudioContext & { __pwfMaster?: GainNode };

let context: Ctx | null = null;

/**
 * Overall level.
 *
 * Still well below anything that would carry across a room, but the previous
 * setting multiplied out to a peak amplitude of about 0.02–0.08 — quiet enough
 * on a phone speaker, in a room with six people talking, to be indistinguishable
 * from nothing at all.
 */
const MASTER_GAIN = 0.34;

function audioContextCtor(): Ctor | null {
  if (typeof window === 'undefined') return null;
  const win = window as unknown as { AudioContext?: Ctor; webkitAudioContext?: Ctor };
  return win.AudioContext ?? win.webkitAudioContext ?? null;
}

/**
 * Creates the context and asks the browser to start it.
 *
 * **Call this from inside a user gesture**, and call it as often as you like:
 * it is idempotent, and while the context is still suspended every extra call
 * is another chance for the browser to say yes.
 *
 * The silent one-frame buffer is not decoration. WebKit wants to see audio
 * actually start during the gesture before it will treat the context as
 * unlocked; resuming alone is accepted by Chrome and Firefox but not reliably
 * by Safari.
 */
export function unlockAudio(): void {
  try {
    const Ctor = audioContextCtor();
    if (!Ctor) return;

    if (!context) {
      context = new Ctor() as Ctx;
      const master = context.createGain();
      master.gain.value = MASTER_GAIN;
      master.connect(context.destination);
      context.__pwfMaster = master;
    }

    if (context.state !== 'running') {
      void context.resume().catch(() => undefined);
      const silent = context.createBufferSource();
      silent.buffer = context.createBuffer(1, 1, context.sampleRate);
      silent.connect(context.destination);
      silent.start(0);
    }
  } catch {
    // A device that will not give us audio is not an error worth raising.
  }
}

/** Whether a cue played right now would actually be heard. */
export function audioUnlocked(): boolean {
  return context?.state === 'running';
}

/** Drops the module's context. Tests only. */
export function resetAudioForTests(): void {
  context = null;
}

function master(ctx: Ctx): GainNode {
  return ctx.__pwfMaster ?? ctx.createGain();
}

/** A short filtered-noise burst — the basis of the wooden and card sounds. */
function noise(ctx: Ctx, at: number, duration: number, opts: {
  type: BiquadFilterType;
  frequency: number;
  q?: number;
  gain: number;
  attack?: number;
}) {
  const frames = Math.max(1, Math.floor(ctx.sampleRate * duration));
  const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < frames; i += 1) data[i] = Math.random() * 2 - 1;

  const source = ctx.createBufferSource();
  source.buffer = buffer;

  const filter = ctx.createBiquadFilter();
  filter.type = opts.type;
  filter.frequency.value = opts.frequency;
  filter.Q.value = opts.q ?? 1;

  const gain = ctx.createGain();
  const attack = opts.attack ?? 0.004;
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(opts.gain, at + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);

  source.connect(filter).connect(gain).connect(master(ctx));
  source.start(at);
  source.stop(at + duration);
}

/** A short pitched blip, for the coin ring and the farewell tone. */
function tone(ctx: Ctx, at: number, opts: {
  from: number;
  to?: number;
  duration: number;
  gain: number;
  type?: OscillatorType;
}) {
  const osc = ctx.createOscillator();
  osc.type = opts.type ?? 'sine';
  osc.frequency.setValueAtTime(opts.from, at);
  if (opts.to !== undefined) {
    osc.frequency.exponentialRampToValueAtTime(opts.to, at + opts.duration);
  }

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(opts.gain, at + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + opts.duration);

  osc.connect(gain).connect(master(ctx));
  osc.start(at);
  osc.stop(at + opts.duration);
}

const CUES: Record<SoundName, (ctx: Ctx, t: number) => void> = {
  // A chair pulled up to the table: a low wooden knock with a short scrape.
  PLAYER_JOINED: (ctx, t) => {
    noise(ctx, t, 0.09, { type: 'lowpass', frequency: 420, q: 1.2, gain: 0.5 });
    tone(ctx, t, { from: 180, to: 90, duration: 0.12, gain: 0.18, type: 'triangle' });
    noise(ctx, t + 0.07, 0.14, { type: 'bandpass', frequency: 900, q: 0.8, gain: 0.12, attack: 0.03 });
  },

  // Chips dropping onto a stack: three quick clicks with a coin ring on top.
  BUY_IN: (ctx, t) => {
    for (let i = 0; i < 3; i += 1) {
      const at = t + i * 0.055;
      noise(ctx, at, 0.05, { type: 'bandpass', frequency: 2200 + i * 260, q: 3, gain: 0.4 });
    }
    tone(ctx, t + 0.03, { from: 2640, to: 1980, duration: 0.22, gain: 0.07 });
  },

  // Leaving: a soft two-note fall. Quieter than the rest — it is a goodbye,
  // not an alarm.
  PLAYER_LEFT: (ctx, t) => {
    tone(ctx, t, { from: 520, duration: 0.13, gain: 0.1, type: 'sine' });
    tone(ctx, t + 0.1, { from: 392, duration: 0.2, gain: 0.09, type: 'sine' });
  },

  // A riffle shuffle: a dense run of card-edge ticks, then the pack squared up.
  GAME_STARTED: (ctx, t) => {
    for (let i = 0; i < 14; i += 1) {
      const at = t + i * 0.018 + Math.random() * 0.006;
      noise(ctx, at, 0.03, { type: 'highpass', frequency: 1800, q: 0.7, gain: 0.22 });
    }
    noise(ctx, t + 0.3, 0.1, { type: 'lowpass', frequency: 700, q: 1, gain: 0.35 });
  },

  // The blinds going up: a rising three-note figure, clear enough to be heard
  // across a table without being an alarm. It says "look up", not "stop".
  BLINDS_UP: (ctx, t) => {
    for (const [i, from] of [523.25, 659.25, 783.99].entries()) {
      tone(ctx, t + i * 0.11, { from, duration: 0.19, gain: 0.11, type: 'triangle' });
    }
    tone(ctx, t + 0.33, { from: 1046.5, duration: 0.3, gain: 0.08, type: 'sine' });
  },
};

/**
 * Plays a cue, if the browser has already let us in.
 *
 * Never throws, and never queues: a cue reaching a suspended context would sit
 * there until something else unlocked it and then fire late, out of order and
 * all at once. Dropping it is the graceful failure.
 */
export function playSound(name: SoundName): void {
  try {
    const ctx = context;
    if (!ctx || ctx.state !== 'running') return;
    // A hair in the future: scheduling exactly at currentTime can drop the
    // attack on some devices.
    CUES[name](ctx, ctx.currentTime + 0.02);
  } catch {
    // Nothing to do. A sound that did not play is not a problem worth raising.
  }
}
