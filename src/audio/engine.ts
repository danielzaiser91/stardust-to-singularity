import { on } from '../events';
import type { GameState } from '../core/state';

/**
 * Prozeduraler Sound — 0 KB Assets. AudioContext startet erst nach erster User-Geste.
 *
 * Musik = generatives Ambient-System statt statischem Drone:
 *  - 3 Pad-Stimmen wandern durch eine Akkordfolge (sanfte Glides alle ~10–20 s)
 *  - gemeinsamer Tiefpass "atmet" per LFO (hörbare Bewegung statt Tremolo)
 *  - sparse Pentatonik-Glöckchen mit Feedback-Echo und Zufalls-Panning (Eno-Prinzip)
 *  - je Ebene eigene Tonart, Akkordset, Skala und Ereignisdichte
 */

interface SceneMusic {
  root: number;                 // Grundton in Hz
  chords: number[][];           // Halbton-Offsets für die 3 Pad-Stimmen
  scale: number[];              // Glöckchen-Skala (Halbtöne über root×4)
  sparkleEvery: [number, number];  // Sekunden [min, max]
  chordEvery: [number, number];
}

const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T,>(arr: T[], not?: T): T => {
  let v = arr[Math.floor(Math.random() * arr.length)];
  if (arr.length > 1) while (v === not) v = arr[Math.floor(Math.random() * arr.length)];
  return v;
};

const MAJ_PENT = [0, 2, 4, 7, 9, 12, 14, 16, 19, 24];
const MIN_PENT = [0, 3, 5, 7, 10, 12, 15, 17, 19, 24];
// Akkordvokabular (Offsets relativ zum Grundton): Ruhe → Farbe → Sog → Rückkehr
const CHORDS_WARM = [[0, 7, 12], [-4, 3, 12], [-2, 5, 14], [0, 4, 11]];
const CHORDS_DARK = [[0, 7, 12], [-4, 3, 10], [-2, 5, 12], [-7, 0, 8]];

const MUSIC: SceneMusic[] = [
  { root: 110.0, chords: CHORDS_WARM, scale: MAJ_PENT, sparkleEvery: [4, 9], chordEvery: [10, 18] },   // Dust: A, luftig
  { root: 98.0, chords: CHORDS_WARM, scale: MAJ_PENT, sparkleEvery: [5, 10], chordEvery: [12, 20] },   // Star: G, warm
  { root: 73.4, chords: CHORDS_DARK, scale: MIN_PENT, sparkleEvery: [5, 11], chordEvery: [10, 16] },   // Nova: D, gespannt
  { root: 87.3, chords: CHORDS_DARK, scale: MIN_PENT, sparkleEvery: [6, 12], chordEvery: [14, 22] },   // Galaxy: F, weit
  { root: 55.0, chords: CHORDS_DARK, scale: MIN_PENT, sparkleEvery: [8, 16], chordEvery: [16, 26] },   // Singularity: tief, karg
];

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private musicBus!: GainNode;
  private sfxBus!: GainNode;
  private padVoices: { osc: OscillatorNode; gain: GainNode }[] = [];
  private padFilter!: BiquadFilterNode;
  private echo!: DelayNode;
  private currentScene = -1;
  private lastChord: number[] | undefined;
  private chordIn = 0;    // Sekunden bis zum nächsten Akkordwechsel
  private sparkleIn = 2;

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
    on('achievement', () => this.arp([523, 659, 784], 0.5));
    on('lore', () => this.blip(660, 0.3, 0.08, 'sine'));
    on('ignite', () => this.sweep(80, 900, 1.2, 0.5));
    on('supernova', () => this.boom());
    on('coalesce', () => this.arp([262, 330, 392, 494], 1.2));
    on('collapse', () => this.sweep(600, 40, 1.6, 0.5));
    on('universe', () => this.arp([523, 659, 784, 1047], 2));
    on('feed', () => this.sweep(300, 60, 0.6));
    on('nebula-placed', () => this.blip(700, 0.12, 0.12, 'sine'));
    on('node-bought', () => this.arp([587, 740], 0.4));
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

    // — Pad: 3 Stimmen → Sammel-Gain → atmender Tiefpass → Musik-Bus —
    const padMix = this.ctx.createGain();
    padMix.gain.value = 0.9;
    this.padFilter = this.ctx.createBiquadFilter();
    this.padFilter.type = 'lowpass';
    this.padFilter.frequency.value = 420;
    this.padFilter.Q.value = 0.8;
    padMix.connect(this.padFilter);
    this.padFilter.connect(this.musicBus);

    // Filter-LFO: sehr langsames Öffnen/Schließen (0,017 Hz ≈ 1 min Zyklus)
    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = 0.017;
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.value = 260;
    lfo.connect(lfoGain);
    lfoGain.connect(this.padFilter.frequency);
    lfo.start();

    for (let i = 0; i < 3; i++) {
      const osc = this.ctx.createOscillator();
      osc.type = i === 2 ? 'sine' : 'triangle';
      // minimale Verstimmung zwischen den Stimmen → lebendiges Schweben
      osc.detune.value = (i - 1) * 6;
      const gain = this.ctx.createGain();
      gain.gain.value = 0;
      osc.connect(gain);
      gain.connect(padMix);
      osc.start();
      this.padVoices.push({ osc, gain });
    }

    // — Echo für die Glöckchen (Feedback-Delay) —
    this.echo = this.ctx.createDelay(1.5);
    this.echo.delayTime.value = 0.43;
    const feedback = this.ctx.createGain();
    feedback.gain.value = 0.38;
    const echoTone = this.ctx.createBiquadFilter();
    echoTone.type = 'lowpass';
    echoTone.frequency.value = 2400;
    this.echo.connect(echoTone);
    echoTone.connect(feedback);
    feedback.connect(this.echo);
    echoTone.connect(this.musicBus);
  }

  update(dt: number): void {
    if (!this.ctx) return;
    const s = this.st();
    this.sfxBus.gain.value = s.settings.sfx;
    this.musicBus.gain.value = s.settings.music * 0.5;
    if (s.settings.music <= 0) return;   // stumm → auch keine Ereignisse planen

    const scene = Math.min(4, s.ui.scene);
    if (scene !== this.currentScene) {
      this.currentScene = scene;
      this.lastChord = undefined;
      this.changeChord(2.5);             // Szenenwechsel: zügiger Glide in die neue Tonart
      this.chordIn = rnd(...MUSIC[scene].chordEvery);
    }

    this.chordIn -= dt;
    if (this.chordIn <= 0) {
      this.changeChord(4.5);
      this.chordIn = rnd(...MUSIC[this.currentScene].chordEvery);
    }

    this.sparkleIn -= dt;
    if (this.sparkleIn <= 0) {
      this.sparkle();
      this.sparkleIn = rnd(...MUSIC[this.currentScene].sparkleEvery);
    }
  }

  /** Pad gleitet in den nächsten Akkord der Szene */
  private changeChord(glide: number): void {
    if (!this.ctx || this.currentScene < 0) return;
    const cfg = MUSIC[this.currentScene];
    const chord = pick(cfg.chords, this.lastChord);
    this.lastChord = chord;
    const now = this.ctx.currentTime;
    this.padVoices.forEach((v, i) => {
      const freq = cfg.root * Math.pow(2, chord[i] / 12);
      v.osc.frequency.cancelScheduledValues(now);
      v.osc.frequency.setValueAtTime(Math.max(20, v.osc.frequency.value), now);
      v.osc.frequency.exponentialRampToValueAtTime(Math.max(20, freq), now + glide);
      // Stimmen atmen leicht unterschiedlich laut
      v.gain.gain.setTargetAtTime(0.05 - i * 0.011 + rnd(-0.006, 0.006), now, glide * 0.6);
    });
  }

  /** Einzelnes Glöckchen: Pentatonik, Zufalls-Oktave/-Panning, hallt ins Echo */
  private sparkle(): void {
    if (!this.ctx || this.currentScene < 0) return;
    const cfg = MUSIC[this.currentScene];
    const semi = pick(cfg.scale);
    const freq = cfg.root * 4 * Math.pow(2, semi / 12) * (Math.random() < 0.3 ? 2 : 1);
    const t0 = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq;
    const env = this.ctx.createGain();
    const peak = rnd(0.04, 0.08);
    env.gain.setValueAtTime(0, t0);
    env.gain.linearRampToValueAtTime(peak, t0 + 0.02);
    env.gain.exponentialRampToValueAtTime(0.0005, t0 + rnd(1.4, 2.6));
    const pan = this.ctx.createStereoPanner();
    pan.pan.value = rnd(-0.7, 0.7);
    osc.connect(env);
    env.connect(pan);
    pan.connect(this.musicBus);
    pan.connect(this.echo);
    osc.start(t0);
    osc.stop(t0 + 3);
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

  private arp(freqs: number[], dur: number): void {
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
