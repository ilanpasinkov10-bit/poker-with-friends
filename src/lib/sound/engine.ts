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
 * Audio is gated by the browser: a context created before the player has
 * interacted with the page starts suspended. The context is therefore created
 * lazily on the first cue and resumed if suspended, and every failure is
 * swallowed — a missing sound is never worth an error.
 */

export type SoundName = Extract<
  TableEventKind,
  'PLAYER_JOINED' | 'PLAYER_LEFT' | 'BUY_IN' | 'GAME_STARTED'
>;

type Ctx = AudioContext & { __pwfMaster?: GainNode };

let context: Ctx | null = null;

/** Overall level. Low: these are ambient confirmations, not alerts. */
const MASTER_GAIN = 0.16;

function audio(): Ctx | null {
  if (typeof window === 'undefined') return null;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;

  if (!context) {
    try {
      context = new Ctor() as Ctx;
      const master = context.createGain();
      master.gain.value = MASTER_GAIN;
      master.connect(context.destination);
      context.__pwfMaster = master;
    } catch {
      return null;
    }
  }
  if (context.state === 'suspended') void context.resume().catch(() => undefined);
  return context;
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
};

/** Plays a cue. Silent — never throwing — if audio is unavailable or blocked. */
export function playSound(name: SoundName): void {
  try {
    const ctx = audio();
    if (!ctx) return;
    // A hair in the future: scheduling exactly at currentTime can drop the
    // attack on some devices.
    CUES[name](ctx, ctx.currentTime + 0.02);
  } catch {
    // Nothing to do. A sound that did not play is not a problem worth raising.
  }
}
