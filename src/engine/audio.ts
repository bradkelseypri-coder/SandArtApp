/**
 * The hush of sand being moved: filtered noise whose loudness follows how fast
 * the marble or the rake is travelling. Starts on the first touch, because
 * browsers only allow sound after the person interacts.
 */
export class SandSound {
  enabled = true;
  private ctx: AudioContext | null = null;
  private gain: GainNode | null = null;
  private filter: BiquadFilterNode | null = null;

  /** Call from a pointer or click handler. */
  unlock() {
    if (this.ctx || !this.enabled) {
      if (this.ctx && this.ctx.state === "suspended") this.ctx.resume().catch(() => {});
      return;
    }
    try {
      const AC: typeof AudioContext = window.AudioContext || (window as any).webkitAudioContext;
      if (!AC) return;
      const ctx = new AC();
      const len = ctx.sampleRate * 2;
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      let last = 0;
      for (let i = 0; i < len; i++) {
        // slightly softened white noise
        last = last * 0.35 + (Math.random() * 2 - 1) * 0.65;
        data[i] = last;
      }
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const filter = ctx.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.value = 2200;
      filter.Q.value = 0.5;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      src.connect(filter).connect(gain).connect(ctx.destination);
      src.start();
      this.ctx = ctx;
      this.gain = gain;
      this.filter = filter;
    } catch {
      this.ctx = null;
    }
  }

  /** level 0..1: how much sand is moving right now */
  setLevel(level: number) {
    if (!this.ctx || !this.gain || !this.filter) return;
    const v = this.enabled ? Math.min(1, Math.max(0, level)) : 0;
    const t = this.ctx.currentTime;
    this.gain.gain.setTargetAtTime(v * 0.16, t, 0.08);
    this.filter.frequency.setTargetAtTime(1500 + v * 1800, t, 0.1);
  }
}
