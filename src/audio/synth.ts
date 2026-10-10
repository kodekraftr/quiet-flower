/**
 * Synthesised placeholder audio (Web Audio). The final game swaps these for
 * recorded hum + kalimba samples; the call sites stay the same.
 *
 * Browsers only allow audio after a user gesture, so call `unlock()` from a
 * click (the Enter button does this).
 */

import { noteFrequency, type Notation } from '../game/notes.js';

class Synth {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;

  unlock(): void {
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.7;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
    void this.ctx.resume();
  }

  private ready(): { ctx: AudioContext; out: GainNode } | null {
    if (!this.ctx || !this.master) return null;
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return { ctx: this.ctx, out: this.master };
  }

  /** One sung note: a soft hum plus a kalimba-like pluck an octave up. */
  note(line: number, notation: Notation, delay = 0, duration = 0.5): void {
    const a = this.ready();
    if (!a) return;
    const { ctx, out } = a;
    const f = noteFrequency(line, notation);
    const t = ctx.currentTime + delay;
    const end = t + Math.max(0.2, duration);

    const hum = ctx.createGain();
    hum.gain.setValueAtTime(0, t);
    hum.gain.linearRampToValueAtTime(0.16, t + 0.06);
    hum.gain.setValueAtTime(0.16, end - 0.08);
    hum.gain.linearRampToValueAtTime(0, end + 0.25);
    hum.connect(out);
    for (const [mult, level] of [[1, 1], [2, 0.18], [3, 0.06]] as const) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f * mult;
      const g = ctx.createGain();
      g.gain.value = level;
      o.connect(g).connect(hum);
      o.start(t);
      o.stop(end + 0.3);
    }

    const pluck = ctx.createGain();
    pluck.gain.setValueAtTime(0, t);
    pluck.gain.linearRampToValueAtTime(0.12, t + 0.005);
    pluck.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
    pluck.connect(out);
    const k = ctx.createOscillator();
    k.type = 'triangle';
    k.frequency.value = f * 2;
    k.connect(pluck);
    k.start(t);
    k.stop(t + 0.75);
  }

  /** Plays a melody with its rhythm. Returns its length in seconds. */
  playMelody(lines: readonly number[], rhythm: readonly number[], notation: Notation, beatSeconds = 0.38): number {
    let t = 0.05;
    lines.forEach((line, i) => {
      const beats = rhythm[i] ?? 1;
      this.note(line, notation, t, beats * beatSeconds * 0.95);
      t += beats * beatSeconds;
    });
    return t;
  }

  tick(): void {
    this.blip(1250, 0.035, 0.07);
  }

  /** Soft "no" when a note is dropped off the staff. */
  thud(): void {
    const a = this.ready();
    if (!a) return;
    const { ctx, out } = a;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(170, t);
    o.frequency.exponentialRampToValueAtTime(80, t + 0.14);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.18, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + 0.18);
  }

  /** Breathy whoosh: rising when the staff opens, falling when it closes. */
  whoosh(opening = true): void {
    const a = this.ready();
    if (!a || !this.noise) return;
    const { ctx, out } = a;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 1.2;
    bp.frequency.setValueAtTime(opening ? 400 : 1600, t);
    bp.frequency.exponentialRampToValueAtTime(opening ? 1800 : 350, t + 0.4);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.35, t + 0.08);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
    src.connect(bp).connect(g).connect(out);
    src.start(t);
    src.stop(t + 0.5);
  }

  /** Spell resolved. */
  chime(): void {
    this.blip(880, 1.1, 0.08, 0.15);
    this.blip(1320, 1.0, 0.06, 0.22);
  }

  private blip(freq: number, length: number, level: number, delay = 0): void {
    const a = this.ready();
    if (!a) return;
    const { ctx, out } = a;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(level, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + length);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + length + 0.02);
  }
}

export const synth = new Synth();
