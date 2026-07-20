import { AmbientSound } from '../types';

/** The built-in soundscapes, synthesized live — no audio files to ship. */
export const AMBIENT_SOUNDS: { id: AmbientSound; label: string }[] = [
  { id: 'rain', label: 'Rain' },
  { id: 'wind', label: 'Wind' },
  { id: 'fire', label: 'Fireplace' },
  { id: 'waves', label: 'Ocean waves' },
  { id: 'drone', label: 'Deep drone' },
];

/**
 * Plays an ambient bed while reading. A spec is either `builtin:<sound>`
 * (Web Audio, synthesized) or a plain audio URL (looped <audio>). One
 * controller is kept for the app's lifetime; `play` swaps beds, `stop`
 * silences. Browsers block audio until a user gesture, so `resume` is
 * wired to the first interaction.
 */
/** Bed crossfade duration (seconds) when the scene changes the soundscape. */
const FADE = 0.6;

export class AmbientController {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  /** Envelope gain for crossfading between beds — independent of user/tension volume on master. */
  private fade: GainNode | null = null;
  private active: AudioScheduledSourceNode[] = [];
  private timers: number[] = [];
  private swapTimer: number | null = null;
  private audioEl: HTMLAudioElement | null = null;
  private current = '';
  private volume = 0.35;

  private ensureCtx(): AudioContext {
    if (!this.ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.ctx.destination);
      this.fade = this.ctx.createGain();
      this.fade.gain.value = 1;
      this.fade.connect(this.master);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  setVolume(v: number) {
    this.volume = v;
    if (this.ctx && this.master) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.2);
    if (this.audioEl) this.audioEl.volume = v;
  }

  /**
   * A one-shot "sting" for a dramatic beat — a soft low thump under a quick
   * bell, synthesized on the spot. Transient nodes stop themselves; routed
   * through master so the user's volume applies. No-op until audio is armed.
   */
  sting() {
    const ctx = this.ensureCtx();
    if (ctx.state !== 'running' || !this.master) return;
    const t = ctx.currentTime;
    const out = this.master;

    // Low thump — a short pitch-dropping sine.
    const thump = ctx.createOscillator();
    thump.type = 'sine';
    thump.frequency.setValueAtTime(150, t);
    thump.frequency.exponentialRampToValueAtTime(58, t + 0.25);
    const tg = ctx.createGain();
    tg.gain.setValueAtTime(0.0001, t);
    tg.gain.exponentialRampToValueAtTime(0.5, t + 0.012);
    tg.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
    thump.connect(tg).connect(out);
    thump.start(t); thump.stop(t + 0.5);

    // Bell shimmer — two detuned sines with a longer decay.
    [784, 1176].forEach((f, i) => {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(i === 0 ? 0.22 : 0.1, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
      o.connect(g).connect(out);
      o.start(t); o.stop(t + 1.2);
    });
  }

  /** Re-arm audio after a user gesture (autoplay policy). */
  resume() {
    if (this.ctx && this.ctx.state === 'suspended') void this.ctx.resume();
    if (this.audioEl && this.audioEl.paused && this.current) void this.audioEl.play().catch(() => {});
  }

  play(spec: string) {
    if (spec === this.current) {
      if (spec) this.resume();
      return;
    }
    const prev = this.current;
    this.current = spec;
    if (this.swapTimer) { clearTimeout(this.swapTimer); this.swapTimer = null; }

    const startNew = () => {
      this.stopSources();
      if (!spec) return;
      if (spec.startsWith('builtin:')) this.playBuiltin(spec.slice(8) as AmbientSound);
      else this.playUrl(spec);
      // Fade the new synthesized bed up (URL beds start at their own volume).
      if (this.ctx && this.fade) {
        const t = this.ctx.currentTime;
        this.fade.gain.cancelScheduledValues(t);
        this.fade.gain.setValueAtTime(0.0001, t);
        this.fade.gain.linearRampToValueAtTime(1, t + FADE);
      }
    };

    // Crossfade out of a synthesized bed before swapping; hard-swap otherwise.
    if (prev.startsWith('builtin:') && this.ctx && this.fade) {
      const t = this.ctx.currentTime;
      this.fade.gain.cancelScheduledValues(t);
      this.fade.gain.setValueAtTime(this.fade.gain.value, t);
      this.fade.gain.linearRampToValueAtTime(0.0001, t + FADE);
      this.swapTimer = window.setTimeout(() => { this.swapTimer = null; startNew(); }, FADE * 1000 + 20);
    } else {
      startNew();
    }
  }

  /** Tear down the current sources without touching the graph or intended spec. */
  private stopSources() {
    this.timers.forEach(t => clearInterval(t));
    this.timers = [];
    this.active.forEach(n => { try { n.stop(); } catch { /* already stopped */ } });
    this.active = [];
    if (this.audioEl) { this.audioEl.pause(); this.audioEl.src = ''; this.audioEl = null; }
  }

  stop() {
    if (this.swapTimer) { clearTimeout(this.swapTimer); this.swapTimer = null; }
    this.stopSources();
    this.current = '';
  }

  dispose() {
    this.stop();
    if (this.ctx) { void this.ctx.close(); this.ctx = null; this.master = null; this.fade = null; }
  }

  private playUrl(url: string) {
    const el = new Audio(url);
    el.loop = true;
    el.volume = this.volume;
    el.crossOrigin = 'anonymous';
    void el.play().catch(() => { /* awaits resume() on gesture */ });
    this.audioEl = el;
  }

  private noiseSource(ctx: AudioContext): AudioBufferSourceNode {
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    return src;
  }

  /** Low-frequency oscillator modulating an AudioParam around `base`. */
  private lfo(ctx: AudioContext, freq: number, depth: number, target: AudioParam, base: number) {
    const osc = ctx.createOscillator();
    osc.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.value = depth;
    target.value = base;
    osc.connect(g).connect(target);
    osc.start();
    this.active.push(osc);
  }

  private playBuiltin(kind: AmbientSound) {
    const ctx = this.ensureCtx();
    const out = this.fade!;
    if (kind === 'rain') {
      const src = this.noiseSource(ctx);
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 800;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 9000;
      const g = ctx.createGain(); g.gain.value = 0.5;
      src.connect(hp).connect(lp).connect(g).connect(out);
      this.lfo(ctx, 0.15, 0.12, g.gain, 0.5);
      src.start(); this.active.push(src);
    } else if (kind === 'wind') {
      const src = this.noiseSource(ctx);
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 500;
      const g = ctx.createGain(); g.gain.value = 0.6;
      src.connect(lp).connect(g).connect(out);
      this.lfo(ctx, 0.08, 350, lp.frequency, 500);
      this.lfo(ctx, 0.05, 0.25, g.gain, 0.6);
      src.start(); this.active.push(src);
    } else if (kind === 'waves') {
      const src = this.noiseSource(ctx);
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 700;
      const g = ctx.createGain(); g.gain.value = 0.5;
      src.connect(lp).connect(g).connect(out);
      this.lfo(ctx, 0.1, 0.4, g.gain, 0.5); // slow swell
      src.start(); this.active.push(src);
    } else if (kind === 'drone') {
      [55, 82.5, 110].forEach((f, i) => {
        const osc = ctx.createOscillator();
        osc.type = i === 2 ? 'triangle' : 'sine';
        osc.frequency.value = f;
        const g = ctx.createGain(); g.gain.value = 0.12;
        osc.connect(g).connect(out);
        this.lfo(ctx, 0.05 + i * 0.02, 0.05, g.gain, 0.12);
        osc.start(); this.active.push(osc);
      });
    } else if (kind === 'fire') {
      const src = this.noiseSource(ctx);
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1100;
      const g = ctx.createGain(); g.gain.value = 0.18;
      src.connect(lp).connect(g).connect(out);
      src.start(); this.active.push(src);
      // Random crackle pops layered over the bed.
      const pop = () => {
        if (!this.ctx || !this.fade) return;
        const t = this.ctx.currentTime;
        const n = this.noiseSource(this.ctx);
        const bp = this.ctx.createBiquadFilter();
        bp.type = 'bandpass'; bp.frequency.value = 1200 + Math.random() * 1500; bp.Q.value = 2;
        const pg = this.ctx.createGain();
        pg.gain.setValueAtTime(0.0001, t);
        pg.gain.exponentialRampToValueAtTime(0.25 + Math.random() * 0.3, t + 0.005);
        pg.gain.exponentialRampToValueAtTime(0.0001, t + 0.08 + Math.random() * 0.1);
        n.connect(bp).connect(pg).connect(this.fade);
        n.start(t); n.stop(t + 0.3);
      };
      const id = window.setInterval(() => {
        const bursts = 1 + Math.floor(Math.random() * 3);
        for (let i = 0; i < bursts; i++) window.setTimeout(pop, Math.random() * 400);
      }, 500);
      this.timers.push(id);
    }
  }
}
