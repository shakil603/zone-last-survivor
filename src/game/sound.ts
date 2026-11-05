// Procedural sound effects synthesized with the Web Audio API.
// No external assets required. Created lazily on first user gesture.

export class SoundFX {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  muted = false;

  init() {
    if (this.ctx) return;
    try {
      const Ctx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      this.ctx = new Ctx();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.6;
      this.master.connect(this.ctx.destination);
      this.noiseBuffer = this.makeNoise(this.ctx);
    } catch {
      this.ctx = null;
    }
  }

  resume() {
    this.ctx?.resume().catch(() => {});
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.master && this.ctx) {
      this.master.gain.setValueAtTime(m ? 0 : 0.6, this.ctx.currentTime);
    }
  }

  private makeNoise(ctx: AudioContext): AudioBuffer {
    const len = ctx.sampleRate * 1.0;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  private now() {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  private env(
    node: AudioNode,
    gain: GainNode,
    peak: number,
    attack: number,
    decay: number,
    start = 0
  ) {
    if (!this.ctx) return;
    const t = this.now() + start;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(peak, t + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    node.connect(gain);
  }

  shoot() {
    if (!this.ctx || !this.master || this.muted) return;
    const t = this.now();
    // sharp noise crack
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const bp = this.ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 1800;
    bp.Q.value = 0.7;
    const g = this.ctx.createGain();
    this.env(src, g, 0.7, 0.001, 0.12);
    src.connect(bp);
    bp.connect(g);
    g.connect(this.master);
    src.start(t);
    src.stop(t + 0.2);

    // low thump
    const osc = this.ctx.createOscillator();
    osc.type = "square";
    osc.frequency.setValueAtTime(180, t);
    osc.frequency.exponentialRampToValueAtTime(60, t + 0.1);
    const g2 = this.ctx.createGain();
    this.env(osc, g2, 0.4, 0.001, 0.1);
    osc.connect(g2);
    g2.connect(this.master);
    osc.start(t);
    osc.stop(t + 0.16);
  }

  enemyShoot() {
    if (!this.ctx || !this.master || this.muted) return;
    const t = this.now();
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const lp = this.ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 900;
    const g = this.ctx.createGain();
    this.env(src, g, 0.18, 0.001, 0.1);
    src.connect(lp);
    lp.connect(g);
    g.connect(this.master);
    src.start(t);
    src.stop(t + 0.16);
  }

  hit() {
    if (!this.ctx || !this.master || this.muted) return;
    const t = this.now();
    const osc = this.ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(1400, t);
    osc.frequency.exponentialRampToValueAtTime(900, t + 0.05);
    const g = this.ctx.createGain();
    this.env(osc, g, 0.32, 0.001, 0.07);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t);
    osc.stop(t + 0.1);
  }

  headshot() {
    if (!this.ctx || !this.master || this.muted) return;
    const t = this.now();
    [1600, 2200].forEach((f, i) => {
      const osc = this.ctx!.createOscillator();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(f, t + i * 0.04);
      const g = this.ctx!.createGain();
      this.env(osc, g, 0.3, 0.001, 0.08, i * 0.04);
      osc.connect(g);
      g.connect(this.master!);
      osc.start(t + i * 0.04);
      osc.stop(t + i * 0.04 + 0.12);
    });
  }

  death() {
    if (!this.ctx || !this.master || this.muted) return;
    const t = this.now();
    const osc = this.ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(300, t);
    osc.frequency.exponentialRampToValueAtTime(50, t + 0.35);
    const g = this.ctx.createGain();
    this.env(osc, g, 0.3, 0.001, 0.4);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t);
    osc.stop(t + 0.5);
  }

  hurt() {
    if (!this.ctx || !this.master || this.muted) return;
    const t = this.now();
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const lp = this.ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 500;
    const g = this.ctx.createGain();
    this.env(src, g, 0.4, 0.002, 0.18);
    src.connect(lp);
    lp.connect(g);
    g.connect(this.master);
    src.start(t);
    src.stop(t + 0.25);
  }

  reload() {
    if (!this.ctx || !this.master || this.muted) return;
    const t = this.now();
    [0, 0.18, 0.42].forEach((s, i) => {
      const src = this.ctx!.createBufferSource();
      src.buffer = this.noiseBuffer;
      const bp = this.ctx!.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = 2500 + i * 400;
      const g = this.ctx!.createGain();
      this.env(src, g, 0.25, 0.001, 0.05, s);
      src.connect(bp);
      bp.connect(g);
      g.connect(this.master!);
      src.start(t + s);
      src.stop(t + s + 0.08);
    });
  }

  empty() {
    if (!this.ctx || !this.master || this.muted) return;
    const t = this.now();
    const osc = this.ctx.createOscillator();
    osc.type = "square";
    osc.frequency.value = 2200;
    const g = this.ctx.createGain();
    this.env(osc, g, 0.12, 0.001, 0.03);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t);
    osc.stop(t + 0.05);
  }

  click() {
    if (!this.ctx || !this.master || this.muted) return;
    const t = this.now();
    const osc = this.ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(660, t);
    osc.frequency.exponentialRampToValueAtTime(990, t + 0.05);
    const g = this.ctx.createGain();
    this.env(osc, g, 0.22, 0.001, 0.08);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t);
    osc.stop(t + 0.1);
  }

  victory() {
    if (!this.ctx || !this.master || this.muted) return;
    const t = this.now();
    [523, 659, 784, 1046].forEach((f, i) => {
      const osc = this.ctx!.createOscillator();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(f, t + i * 0.12);
      const g = this.ctx!.createGain();
      this.env(osc, g, 0.3, 0.005, 0.3, i * 0.12);
      osc.connect(g);
      g.connect(this.master!);
      osc.start(t + i * 0.12);
      osc.stop(t + i * 0.12 + 0.4);
    });
  }

  zoneAlarm() {
    if (!this.ctx || !this.master || this.muted) return;
    const t = this.now();
    const osc = this.ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(440, t);
    osc.frequency.linearRampToValueAtTime(660, t + 0.25);
    const g = this.ctx.createGain();
    this.env(osc, g, 0.12, 0.01, 0.4);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t);
    osc.stop(t + 0.5);
  }
}

export const sfx = new SoundFX();
