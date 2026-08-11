/**
 * 接龍 — Web Audio 合成音效（無第三方取樣）。
 */
export class SolitaireAudio {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.master = 0.22;
  }

  ensure() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) this.ctx = new AC();
    }
  }

  async unlock() {
    this.ensure();
    if (this.ctx?.state === "suspended") await this.ctx.resume();
  }

  setEnabled(on) {
    this.enabled = on;
  }

  tone(freq, dur, type = "sine", gain = 0.12, when = 0) {
    if (!this.enabled) return;
    this.ensure();
    const ctx = this.ctx;
    if (!ctx) return;
    if (ctx.state === "suspended") void ctx.resume();
    const t0 = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain * this.master, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + Math.max(0.04, dur));
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.03);
  }

  noise(dur, gain = 0.3, when = 0) {
    if (!this.enabled) return;
    this.ensure();
    const ctx = this.ctx;
    if (!ctx) return;
    const t0 = ctx.currentTime + when;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain * this.master, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(g);
    g.connect(ctx.destination);
    src.start(t0);
  }

  select() {
    this.tone(260, 0.05, "triangle", 0.1);
  }

  draw() {
    this.noise(0.06, 0.14);
    this.tone(440, 0.05, "triangle", 0.08);
  }

  flip() {
    this.noise(0.04, 0.12);
    this.tone(520, 0.05, "square", 0.07);
  }

  place() {
    this.tone(330, 0.07, "sine", 0.12);
    this.noise(0.03, 0.1);
  }

  foundation() {
    this.tone(660, 0.08, "sine", 0.14);
    this.tone(880, 0.1, "sine", 0.12, 0.05);
  }

  invalid() {
    this.tone(170, 0.1, "square", 0.08);
  }

  win() {
    const seq = [523, 659, 784, 1047, 1319, 1568];
    seq.forEach((f, i) => this.tone(f, 0.16, "sine", 0.14, i * 0.11));
  }
}
