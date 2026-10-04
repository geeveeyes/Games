// Generated ambience and sound effects (Web Audio, no audio files). Each mood is a small
// synth scene that fades in over the last one. Everything is quiet by default so the
// narrator stays on top; `duck` lowers the music while someone is speaking.

export type Mood = "off" | "night" | "day" | "tense" | "win" | "lose";
export type Sting = "gong" | "bell" | "death" | "reveal";

type Scene = { out: GainNode; stop: () => void };

const rand = (a: number, b: number) => a + Math.random() * (b - a);

export class Ambience {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private music!: GainNode;
  private current: { mood: Mood; scene: Scene } | null = null;
  private volume = 0.6;
  private ducked = false;
  private noise!: AudioBuffer;

  /** Must be called from a click or tap, because browsers block audio until then. */
  async start() {
    if (!this.ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.music = this.ctx.createGain();
      this.music.connect(this.master);
      // A short feedback delay gives the sounds some room, like a stone hall.
      const delay = this.ctx.createDelay(1);
      delay.delayTime.value = 0.32;
      const fb = this.ctx.createGain();
      fb.gain.value = 0.38;
      const wet = this.ctx.createGain();
      wet.gain.value = 0.35;
      const damp = this.ctx.createBiquadFilter();
      damp.type = "lowpass";
      damp.frequency.value = 1600;
      this.master.connect(this.ctx.destination);
      this.master.connect(delay);
      delay.connect(damp).connect(fb).connect(delay);
      damp.connect(wet).connect(this.ctx.destination);
      const len = this.ctx.sampleRate * 3;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      let last = 0;
      for (let i = 0; i < len; i++) {
        last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; // brown noise: soft wind, not hiss
        d[i] = last * 3.5;
      }
      this.applyGain();
    }
    if (this.ctx.state === "suspended") await this.ctx.resume();
  }

  get ready() {
    return this.ctx !== null;
  }

  setVolume(v: number) {
    this.volume = v;
    this.applyGain();
  }
  duck(on: boolean) {
    this.ducked = on;
    this.applyGain();
  }
  private applyGain() {
    if (!this.ctx) return;
    const target = this.volume * (this.ducked ? 0.35 : 1);
    this.music.gain.setTargetAtTime(target, this.ctx.currentTime, 0.4);
  }

  setMood(mood: Mood) {
    if (!this.ctx || this.current?.mood === mood) return;
    const ctx = this.ctx;
    const old = this.current;
    if (old) {
      old.scene.out.gain.setTargetAtTime(0, ctx.currentTime, 1.2);
      setTimeout(() => old.scene.stop(), 6000);
    }
    this.current = null;
    if (mood === "off") return;
    const scene = this.build(mood);
    scene.out.gain.value = 0;
    scene.out.gain.setTargetAtTime(1, ctx.currentTime, 1.5);
    scene.out.connect(this.music);
    this.current = { mood, scene };
  }

  stop() {
    this.setMood("off");
  }

  // ---------- scenes ----------
  private osc(type: OscillatorType, freq: number, gain: number, dest: AudioNode, detune = 0) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    o.detune.value = detune;
    const g = ctx.createGain();
    g.gain.value = gain;
    o.connect(g).connect(dest);
    o.start();
    return o;
  }

  private lfo(target: AudioParam, rate: number, depth: number) {
    const ctx = this.ctx!;
    const l = ctx.createOscillator();
    l.frequency.value = rate;
    const g = ctx.createGain();
    g.gain.value = depth;
    l.connect(g).connect(target);
    l.start();
    return l;
  }

  private wind(dest: AudioNode, level: number, freq: number) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = freq;
    bp.Q.value = 0.7;
    const g = ctx.createGain();
    g.gain.value = level;
    src.connect(bp).connect(g).connect(dest);
    src.start();
    const l1 = this.lfo(g.gain, 0.09, level * 0.6);
    const l2 = this.lfo(bp.frequency, 0.05, freq * 0.4);
    return [src, l1, l2];
  }

  private build(mood: Exclude<Mood, "off">): Scene {
    const ctx = this.ctx!;
    const out = ctx.createGain();
    const nodes: (OscillatorNode | AudioBufferSourceNode)[] = [];
    const timers: ReturnType<typeof setTimeout>[] = [];
    const later = (fn: () => void, ms: number) => {
      timers.push(setTimeout(fn, ms));
    };

    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.connect(out);

    if (mood === "night" || mood === "tense" || mood === "lose") {
      lp.frequency.value = mood === "tense" ? 260 : 340;
      lp.Q.value = 1.2;
      const root = mood === "lose" ? 46 : 55;
      nodes.push(
        this.osc("sawtooth", root, 0.09, lp),
        this.osc("sawtooth", root * 1.004, 0.07, lp, 6),
        this.osc("sine", root * 1.5, 0.12, lp),
        this.osc("sine", root * 2, 0.06, lp),
        this.osc("triangle", root * (mood === "lose" ? 1.189 : 1.5) * 2, 0.025, lp),
        this.lfo(lp.frequency, 0.06, 90),
        ...this.wind(out, mood === "tense" ? 0.05 : 0.12, 500),
      );
      if (mood === "tense") {
        const beat = () => {
          const t = ctx.currentTime;
          for (const [off, g] of [[0, 0.9], [0.22, 0.6]] as const) {
            const o = ctx.createOscillator();
            const e = ctx.createGain();
            o.frequency.setValueAtTime(70, t + off);
            o.frequency.exponentialRampToValueAtTime(38, t + off + 0.18);
            e.gain.setValueAtTime(0.0001, t + off);
            e.gain.exponentialRampToValueAtTime(g, t + off + 0.015);
            e.gain.exponentialRampToValueAtTime(0.0001, t + off + 0.28);
            o.connect(e).connect(out);
            o.start(t + off);
            o.stop(t + off + 0.35);
          }
          later(beat, 900);
        };
        beat();
      } else {
        // Distant howl or low cello note now and then.
        const event = () => {
          if (Math.random() < 0.45 && mood === "night") this.howl(out);
          else this.cello(out, mood === "lose" ? [98, 87.3, 77.8] : [110, 98, 82.4]);
          later(event, rand(11000, 24000));
        };
        later(event, rand(4000, 9000));
      }
    } else if (mood === "day") {
      lp.frequency.value = 1400;
      const chord = [220, 277.2, 329.6, 440];
      for (const f of chord) nodes.push(this.osc("triangle", f, 0.035, lp), this.osc("sine", f * 1.002, 0.03, lp, 4));
      nodes.push(this.osc("sine", 110, 0.06, lp), this.lfo(lp.frequency, 0.08, 300), ...this.wind(out, 0.03, 1800));
      const scale = [440, 493.9, 554.4, 659.3, 740, 880];
      const chime = () => {
        this.tone(out, scale[Math.floor(Math.random() * scale.length)], 0.05, 3.2);
        later(chime, rand(2200, 5200));
      };
      later(chime, 1200);
    } else {
      // win
      lp.frequency.value = 2000;
      for (const f of [196, 246.9, 293.7, 392, 493.9]) nodes.push(this.osc("triangle", f, 0.045, lp), this.osc("sine", f, 0.03, lp, 5));
      nodes.push(this.lfo(lp.frequency, 0.1, 400));
      const chime = () => {
        this.tone(out, [587.3, 659.3, 784, 988][Math.floor(Math.random() * 4)], 0.05, 3);
        later(chime, rand(1500, 3200));
      };
      later(chime, 600);
    }

    return {
      out,
      stop: () => {
        timers.forEach(clearTimeout);
        nodes.forEach((n) => {
          try {
            n.stop();
          } catch {
            /* already stopped */
          }
        });
        out.disconnect();
      },
    };
  }

  // ---------- one-shot sounds ----------
  private tone(dest: AudioNode, freq: number, level: number, decay: number, type: OscillatorType = "sine") {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const e = ctx.createGain();
    e.gain.setValueAtTime(0.0001, t);
    e.gain.exponentialRampToValueAtTime(level, t + 0.02);
    e.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    o.connect(e).connect(dest);
    o.start(t);
    o.stop(t + decay + 0.1);
  }

  private cello(dest: AudioNode, notes: number[]) {
    const ctx = this.ctx!;
    const f = notes[Math.floor(Math.random() * notes.length)];
    const t = ctx.currentTime;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 700;
    const e = ctx.createGain();
    e.gain.setValueAtTime(0.0001, t);
    e.gain.exponentialRampToValueAtTime(0.16, t + 2.2);
    e.gain.exponentialRampToValueAtTime(0.0001, t + 6);
    lp.connect(e).connect(dest);
    for (const d of [-5, 5]) {
      const o = ctx.createOscillator();
      o.type = "sawtooth";
      o.frequency.value = f;
      o.detune.value = d;
      const v = ctx.createOscillator();
      v.frequency.value = 5;
      const vg = ctx.createGain();
      vg.gain.value = 3;
      v.connect(vg).connect(o.detune);
      v.start(t);
      o.connect(lp);
      o.start(t);
      o.stop(t + 6.2);
      v.stop(t + 6.2);
    }
  }

  private howl(dest: AudioNode) {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = "sawtooth";
    const base = rand(300, 360);
    o.frequency.setValueAtTime(base, t);
    o.frequency.exponentialRampToValueAtTime(base * 1.7, t + 1.4);
    o.frequency.exponentialRampToValueAtTime(base * 1.45, t + 3.4);
    o.frequency.exponentialRampToValueAtTime(base * 0.8, t + 4.6);
    const vib = ctx.createOscillator();
    vib.frequency.value = 5.5;
    const vg = ctx.createGain();
    vg.gain.value = 9;
    vib.connect(vg).connect(o.detune);
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 700;
    bp.Q.value = 2;
    const e = ctx.createGain();
    e.gain.setValueAtTime(0.0001, t);
    e.gain.exponentialRampToValueAtTime(0.05, t + 1.2);
    e.gain.exponentialRampToValueAtTime(0.0001, t + 4.8);
    o.connect(bp).connect(e).connect(dest);
    o.start(t);
    vib.start(t);
    o.stop(t + 5);
    vib.stop(t + 5);
  }

  /** Short effects that mark story beats. Played at full level, not ducked. */
  sting(kind: Sting) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const d = this.master;
    if (kind === "gong") {
      for (const [r, g] of [[1, 0.3], [2.01, 0.18], [2.76, 0.12], [4.2, 0.07]] as const) this.tone(d, 82 * r, g, 5);
    } else if (kind === "bell") {
      for (const [r, g] of [[1, 0.18], [2.76, 0.1], [5.4, 0.05], [8.9, 0.03]] as const) this.tone(d, 523 * r * 0.5, g, 3.5);
    } else if (kind === "death") {
      const t = ctx.currentTime;
      const o = ctx.createOscillator();
      o.frequency.setValueAtTime(110, t);
      o.frequency.exponentialRampToValueAtTime(34, t + 0.6);
      const e = ctx.createGain();
      e.gain.setValueAtTime(0.0001, t);
      e.gain.exponentialRampToValueAtTime(0.7, t + 0.02);
      e.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);
      o.connect(e).connect(d);
      o.start(t);
      o.stop(t + 1.5);
      for (const f of [233, 247, 311]) this.tone(d, f, 0.07, 3, "sawtooth");
    } else {
      for (const f of [392, 523, 659]) this.tone(d, f, 0.1, 2.4, "triangle");
    }
  }
}
