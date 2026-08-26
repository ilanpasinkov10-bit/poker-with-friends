import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  audioUnlocked,
  playSound,
  resetAudioForTests,
  unlockAudio,
} from '@/lib/sound/engine';

/**
 * A stand-in for iOS Safari's Web Audio, which is the strict case.
 *
 * The rules it enforces are the ones a real device does: a context is born
 * suspended, its clock does not advance while it is, and `resume()` only takes
 * effect when something is currently treating the page as user-activated.
 * That is the whole reason the app has an unlock at all, so it is the thing
 * worth testing.
 */
let userActivated = false;
let contextsCreated = 0;

class FakeParam {
  value = 0;
  setValueAtTime() { return this; }
  exponentialRampToValueAtTime() { return this; }
}

class FakeNode {
  connect(next: unknown) { return next; }
  disconnect() {}
}

class FakeGain extends FakeNode { gain = new FakeParam(); }
class FakeFilter extends FakeNode { type = ''; frequency = new FakeParam(); Q = new FakeParam(); }

class FakeSource extends FakeNode {
  buffer: unknown = null;
  static started: number[] = [];
  start(at: number) { FakeSource.started.push(at); }
  stop() {}
}

class FakeOscillator extends FakeNode {
  type = 'sine';
  frequency = new FakeParam();
  static started = 0;
  start() { FakeOscillator.started += 1; }
  stop() {}
}

class FakeAudioContext {
  state: 'suspended' | 'running' = 'suspended';
  sampleRate = 48_000;
  destination = new FakeNode();
  constructor() { contextsCreated += 1; }
  get currentTime() { return this.state === 'running' ? 1.5 : 0; }
  async resume() {
    // The rule that matters: only a user gesture can start the clock.
    if (userActivated) this.state = 'running';
  }
  createGain() { return new FakeGain(); }
  createBiquadFilter() { return new FakeFilter(); }
  createOscillator() { return new FakeOscillator(); }
  createBufferSource() { return new FakeSource(); }
  createBuffer(_c: number, frames: number) {
    return { getChannelData: () => new Float32Array(frames) };
  }
}

/**
 * Audible things the engine scheduled since the last reset.
 *
 * The unlock's own silent primer is started at time 0 and deliberately not
 * counted — it exists to satisfy WebKit, not to be heard.
 */
const scheduled = () =>
  FakeSource.started.filter((at) => at > 0).length + FakeOscillator.started;

beforeEach(() => {
  userActivated = false;
  contextsCreated = 0;
  FakeSource.started = [];
  FakeOscillator.started = 0;
  resetAudioForTests();
  vi.stubGlobal('window', { AudioContext: FakeAudioContext });
});

afterEach(() => {
  vi.unstubAllGlobals();
  resetAudioForTests();
});

/** `unlockAudio` resumes asynchronously, so let the microtask queue drain. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('game sounds and the browser gate', () => {
  it('makes no sound before any user interaction', async () => {
    playSound('PLAYER_JOINED');
    playSound('BUY_IN');
    await settle();

    expect(audioUnlocked()).toBe(false);
    expect(scheduled()).toBe(0);
  });

  it('makes no sound when the unlock is attempted outside a gesture', async () => {
    unlockAudio(); // e.g. on mount, with no activation yet
    await settle();

    expect(audioUnlocked()).toBe(false);
    playSound('PLAYER_JOINED');
    expect(scheduled()).toBe(0);
  });

  it('plays once the unlock runs inside a user gesture', async () => {
    userActivated = true;
    unlockAudio();
    await settle();

    expect(audioUnlocked()).toBe(true);
    playSound('PLAYER_JOINED');
    expect(scheduled()).toBeGreaterThan(0);
  });

  /** The iOS case the hook keeps retrying for: refused, then allowed. */
  it('recovers when a first attempt is refused and a later tap is allowed', async () => {
    unlockAudio();
    await settle();
    expect(audioUnlocked()).toBe(false);

    userActivated = true;
    unlockAudio();
    await settle();

    expect(audioUnlocked()).toBe(true);
    expect(contextsCreated).toBe(1); // retrying must not pile up contexts
  });

  it('never queues a cue that arrived while blocked', async () => {
    playSound('BUY_IN');
    playSound('BUY_IN');
    playSound('PLAYER_LEFT');
    await settle();

    userActivated = true;
    unlockAudio();
    await settle();

    // Unlocking must not release a backlog: only cues from here on play.
    expect(scheduled()).toBe(0);
    playSound('BUY_IN');
    expect(scheduled()).toBeGreaterThan(0);
  });

  it('reuses one context however often the unlock is retried', async () => {
    for (let i = 0; i < 10; i += 1) unlockAudio();
    userActivated = true;
    for (let i = 0; i < 10; i += 1) unlockAudio();
    await settle();

    expect(contextsCreated).toBe(1);
  });

  it('plays every mapped cue without throwing', async () => {
    userActivated = true;
    unlockAudio();
    await settle();

    for (const name of ['PLAYER_JOINED', 'PLAYER_LEFT', 'BUY_IN', 'GAME_STARTED'] as const) {
      expect(() => playSound(name)).not.toThrow();
    }
    expect(scheduled()).toBeGreaterThan(0);
  });

  it('stays silent and does not throw where Web Audio is absent', async () => {
    vi.stubGlobal('window', {});
    resetAudioForTests();

    expect(() => unlockAudio()).not.toThrow();
    expect(() => playSound('BUY_IN')).not.toThrow();
    expect(audioUnlocked()).toBe(false);
  });
});
