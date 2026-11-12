import { useSyncExternalStore } from 'react';

/**
 * Small sounds made on the fly with WebAudio, so there are no files to load.
 * Off switch is kept per device. Phones also get a short buzz on your turn.
 */

const KEY = 'colonizers.sound';
const listeners = new Set<() => void>();

function read(): boolean {
  try {
    return localStorage.getItem(KEY) !== 'off';
  } catch {
    return true;
  }
}

let on = read();

export function setSound(next: boolean): void {
  on = next;
  try {
    localStorage.setItem(KEY, next ? 'on' : 'off');
  } catch {
    // Keep it for this visit only.
  }
  for (const l of listeners) l();
}

export function useSound(): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => on,
  );
}

let audio: AudioContext | null = null;

function context(): AudioContext | null {
  if (typeof window === 'undefined' || !('AudioContext' in window)) return null;
  audio ??= new AudioContext();
  if (audio.state === 'suspended') void audio.resume().catch(() => undefined);
  return audio;
}

function tone(freq: number, start: number, length: number, type: OscillatorType, gain = 0.15) {
  const ctx = context();
  if (!ctx) return;
  const t = ctx.currentTime + start;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + length);
  osc.connect(g).connect(ctx.destination);
  osc.start(t);
  osc.stop(t + length + 0.02);
}

function rattle() {
  const ctx = context();
  if (!ctx) return;
  for (let i = 0; i < 5; i++) {
    const t = ctx.currentTime + i * 0.05 + Math.random() * 0.02;
    const len = 0.04;
    const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * len), ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let j = 0; j < data.length; j++) data[j] = (Math.random() * 2 - 1) * (1 - j / data.length);
    const src = ctx.createBufferSource();
    const g = ctx.createGain();
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 1800 + Math.random() * 1200;
    g.gain.value = 0.25;
    src.buffer = buf;
    src.connect(f).connect(g).connect(ctx.destination);
    src.start(t);
  }
}

export type Sound = 'dice' | 'build' | 'turn' | 'robber' | 'win' | 'trade';

export function play(sound: Sound): void {
  if (!on) return;
  try {
    switch (sound) {
      case 'dice':
        rattle();
        break;
      case 'build':
        tone(220, 0, 0.12, 'triangle', 0.2);
        tone(330, 0.05, 0.1, 'triangle', 0.12);
        break;
      case 'turn':
        tone(660, 0, 0.18, 'sine');
        tone(880, 0.12, 0.25, 'sine');
        if (typeof navigator !== 'undefined') navigator.vibrate?.(40);
        break;
      case 'robber':
        tone(140, 0, 0.3, 'sawtooth', 0.08);
        break;
      case 'trade':
        tone(520, 0, 0.1, 'sine', 0.1);
        break;
      case 'win':
        [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.12, 0.3, 'triangle', 0.15));
        break;
    }
  } catch {
    // Sound is a nicety; never let it break the game.
  }
}

/** The sound for a log event, if any. `me` is the seat holding this device. */
export function soundFor(
  event: { type: string; player?: unknown },
  me: number | null,
): Sound | null {
  switch (event.type) {
    case 'rolled':
      return 'dice';
    case 'built':
      return 'build';
    case 'turnStarted':
      return event.player === me ? 'turn' : null;
    case 'robberMoved':
    case 'stole':
      return 'robber';
    case 'traded':
    case 'bankTrade':
      return 'trade';
    case 'gameOver':
      return 'win';
    default:
      return null;
  }
}
