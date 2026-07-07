import { on } from '../events';
import type { GameState } from '../core/state';

/**
 * Audio: echte Ambient-Musik (royalty-free) + prozedurale UI-Soundeffekte.
 * AudioContext/Playback starten erst nach erster User-Geste (Browser-Policy).
 *
 * Musik: Kevin MacLeod (incompetech.com), Lizenz CC BY 4.0 — Credits in README & Settings.
 *  - Dust/Star:          "Floating Cities" (ruhig, warm)
 *  - Supernova:          "Deep Haze" (dunkel, gespannt)
 *  - Galaxy/Singularity: "Frozen Star" (weiter Raum)
 * Szenenwechsel blendet über (~3 s Crossfade), Tracks loopen.
 */

const SCENE_TRACK = ['floating-cities', 'floating-cities', 'deep-haze', 'frozen-star', 'frozen-star'];
const CROSSFADE_S = 3;

interface MusicSlot {
  el: HTMLAudioElement;
  gain: GainNode;
  track: string;
}

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private musicBus!: GainNode;
  private sfxBus!: GainNode;
  private slots: MusicSlot[] = [];
  private currentTrack = '';

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

    // Musik läuft über <audio loop> + AudioContext — rAF pausiert im Hintergrund-Tab komplett,
    // aber Web Audio NICHT (spielt bewusst über Tab-Wechsel hinweg weiter) → laufende Musik ist
    // die Hauptquelle der gemeldeten Hintergrund-CPU-Last. Bei ausgeblendetem Tab explizit
    // pausieren/suspendieren, sonst dekodiert/mischt der Audio-Thread ungehört weiter.
    document.addEventListener('visibilitychange', () => {
      if (!this.ctx) return;
      if (document.hidden) {
        void this.ctx.suspend();
        for (const slot of this.slots) if (slot.track) slot.el.pause();
      } else {
        void this.ctx.resume();
        for (const slot of this.slots) if (slot.track) void slot.el.play().catch(() => {});
      }
    });
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

    // Zwei Player-Slots für Crossfades
    for (let i = 0; i < 2; i++) {
      const el = new Audio();
      el.loop = true;
      el.preload = 'none';
      el.crossOrigin = 'anonymous';
      const gain = this.ctx.createGain();
      gain.gain.value = 0;
      this.ctx.createMediaElementSource(el).connect(gain);
      gain.connect(this.musicBus);
      this.slots.push({ el, gain, track: '' });
    }
  }

  update(dt: number): void {
    void dt;
    if (!this.ctx) return;
    const s = this.st();
    this.sfxBus.gain.value = s.settings.sfx;
    this.musicBus.gain.value = s.settings.music;

    // Musik ganz aus → Player pausieren (spart Netz/CPU)
    if (s.settings.music <= 0) {
      if (this.currentTrack) {
        this.currentTrack = '';
        for (const slot of this.slots) { slot.el.pause(); slot.track = ''; }
      }
      return;
    }

    const want = SCENE_TRACK[Math.min(4, s.ui.scene)];
    if (want !== this.currentTrack) {
      this.currentTrack = want;
      this.crossfadeTo(want);
    }
  }

  private crossfadeTo(track: string): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const from = this.slots.find(sl => sl.track && sl.track !== track);
    let to = this.slots.find(sl => sl.track === track);
    if (!to) {
      to = this.slots.find(sl => sl !== from)!;
      to.track = track;
      to.el.src = `${import.meta.env.BASE_URL}music/${track}.mp3`;
    }
    void to.el.play().catch(() => { /* Autoplay-Block o. Netzfehler — nächster Versuch beim Szenenwechsel */ });
    to.gain.gain.cancelScheduledValues(now);
    to.gain.gain.setValueAtTime(to.gain.gain.value, now);
    to.gain.gain.linearRampToValueAtTime(1, now + CROSSFADE_S);
    if (from) {
      from.gain.gain.cancelScheduledValues(now);
      from.gain.gain.setValueAtTime(from.gain.gain.value, now);
      from.gain.gain.linearRampToValueAtTime(0, now + CROSSFADE_S);
      const old = from;
      setTimeout(() => {
        if (old.track !== this.currentTrack) { old.el.pause(); old.track = ''; }
      }, CROSSFADE_S * 1000 + 200);
    }
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
