import { on } from '../events';
import type { GameState } from '../core/state';

/**
 * Prozeduraler Sound — 0 KB Assets. Ambient-Drone je Ebene (Crossfade) + UI-Synth-Blips.
 * AudioContext startet erst nach erster User-Geste (Browser-Policy).
 */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private musicBus!: GainNode;
  private sfxBus!: GainNode;
  private droneOscs: { osc: OscillatorNode; gain: GainNode }[] = [];
  private currentScene = -1;

  /** Basisfrequenzen je Ebene: Dust luftig, Star warm, Nova dunkel-spannend, Galaxy weit, Singularity subsonisch */
  private static DRONES: number[][] = [
    [110, 165, 220.5],       // Dust: A2 + Quinte + leicht verstimmte Oktave
    [98, 147, 196.6],        // Star: G2
    [73.4, 110.5, 146.8],    // Nova: D2
    [87.3, 131, 174.9],      // Galaxy: F2
    [55, 82.6, 110.3],       // Singularity: A1
  ];

  constructor(private st: () => GameState) {
    const unlock = () => {
      this.init();
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);

    on('click', () => this.blip(880, 0.04, 0.10, 'triangle'));
    on('buy', () => this.blip(520, 0.05, 0.14, 'square'));
    on('comet-caught', () => this.sweep(400, 1600, 0.35));
    on('achievement', () => this.chord([523, 659, 784], 0.5));
    on('lore', () => this.blip(660, 0.3, 0.08, 'sine'));
    on('ignite', () => this.sweep(80, 900, 1.2, 0.5));
    on('supernova', () => this.boom());
    on('coalesce', () => this.chord([262, 330, 392, 494], 1.2));
    on('collapse', () => this.sweep(600, 40, 1.6, 0.5));
    on('universe', () => this.chord([523, 659, 784, 1047], 2));
    on('feed', () => this.sweep(300, 60, 0.6));
    on('nebula-placed', () => this.blip(700, 0.12, 0.12, 'sine'));
    on('node-bought', () => this.chord([587, 740], 0.4));
    on('dilate', () => this.sweep(200, 800, 0.8));
  }

  private init(): void {
    if (this.ctx) return;
    this.ctx = new AudioContext();
    this.master = this.ctx.createGain();
    this.master.connect(this.ctx.destination);
    this.musicBus = this.ctx.createGain();
    this.sfxBus = this.ctx.createGain();
    this.musicBus.connect(this.master);
    this.sfxBus.connect(this.master);

    // 3 Drone-Layer mit langsamem LFO-Atmen
    for (let i = 0; i < 3; i++) {
      const osc = this.ctx.createOscillator();
      osc.type = i === 2 ? 'sine' : 'triangle';
      const gain = this.ctx.createGain();
      gain.gain.value = 0;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 600;
      const lfo = this.ctx.createOscillator();
      lfo.frequency.value = 0.05 + i * 0.03;
      const lfoGain = this.ctx.createGain();
      lfoGain.gain.value = 0.012;
      lfo.connect(lfoGain);
      lfoGain.connect(gain.gain);
      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.musicBus);
      osc.start();
      lfo.start();
      this.droneOscs.push({ osc, gain });
    }
  }

  update(dt: number): void {
    if (!this.ctx) return;
    const s = this.st();
    this.sfxBus.gain.value = s.settings.sfx;
    this.musicBus.gain.value = s.settings.music * 0.5;

    const scene = Math.min(4, s.ui.scene);
    if (scene !== this.currentScene) {
      this.currentScene = scene;
      const freqs = AudioEngine.DRONES[scene];
      const now = this.ctx.currentTime;
      this.droneOscs.forEach((d, i) => {
        d.osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqs[i]), now + 3);
        d.gain.gain.setTargetAtTime(0.05 - i * 0.012, now, 2);
      });
    }
    void dt;
  }

  private blip(freq: number, dur: number, vol: number, type: OscillatorType): void {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    o.connect(g);
    g.connect(this.sfxBus);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  }

  private sweep(from: number, to: number, dur: number, vol = 0.2): void {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(from, t0);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, to), t0 + dur);
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 1200;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    o.connect(f); f.connect(g); g.connect(this.sfxBus);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  }

  private chord(freqs: number[], dur: number): void {
    freqs.forEach((f, i) => setTimeout(() => this.blip(f, dur, 0.12, 'sine'), i * 70));
  }

  /** Supernova: gefiltertes Rauschen + Sub-Impact */
  private boom(): void {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime;
    const len = this.ctx.sampleRate * 2;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.2);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(3000, t0);
    f.frequency.exponentialRampToValueAtTime(80, t0 + 1.8);
    const g = this.ctx.createGain();
    g.gain.value = 0.5;
    src.connect(f); f.connect(g); g.connect(this.sfxBus);
    src.start(t0);
    this.sweep(160, 30, 1.6, 0.4);
  }
}
