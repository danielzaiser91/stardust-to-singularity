import './style.css';
import { initialState, type GameState } from './core/state';
import { tick } from './core/tick';
import { computeMults, type Mults } from './core/formulas';
import * as A from './core/actions';
import { simulateOffline } from './core/offline';
import { loadGame, saveGame } from './storage';
import { setLang } from './i18n';
import { Engine } from './render/engine';
import { DustScene } from './render/scenes/dust';
import { StarScene } from './render/scenes/star';
import { SupernovaScene } from './render/scenes/supernova';
import { GalaxyScene } from './render/scenes/galaxy';
import { BlackHoleScene } from './render/scenes/blackhole';
import { Hud } from './ui/hud';
import {
  DustPanel, StarPanel, NovaPanel, GalaxyPanel, SingPanel,
  AchPanel, JournalPanel, SettingsPanel,
} from './ui/panels';
import { AudioEngine } from './audio/engine';
import { emit } from './events';
import { AUTOSAVE_INTERVAL } from './core/constants';
import { D } from './core/decimal';

// ── State laden ──────────────────────────────────────────────────────────────
let state: GameState = loadGame() ?? initialState();
if (state.startedAt === 0) state.startedAt = Date.now();
setLang(state.lang);
const st = () => state;

// ── Engine + Szenen ──────────────────────────────────────────────────────────
const canvas = document.getElementById('gl') as HTMLCanvasElement;
const engine = new Engine(canvas, state);
const dustScene = new DustScene(engine.tier, o => { engine.cometMesh = o; });
engine.addLayer(0, dustScene);
engine.addLayer(1, new StarScene());
engine.addLayer(2, new SupernovaScene());
engine.addLayer(3, new GalaxyScene(engine.tier));
engine.addLayer(4, new BlackHoleScene());

// Canvas-Klick: Komet fangen oder Staub anziehen
engine.onCanvasClick = hitComet => {
  const m = computeMults(state);
  if (hitComet && A.clickComet(state, m)) emit('comet-caught');
  else if (state.ui.scene === 0) { A.click(state, m); emit('click'); }
};

// ── UI ───────────────────────────────────────────────────────────────────────
const hud = new Hud(st);
const settingsPanel = new SettingsPanel(st, hud);
hud.addTab('dust', new DustPanel(st, hud), () => true, 0);
hud.addTab('star', new StarPanel(st, hud), s => s.star.unlocked, 1);
hud.addTab('nova', new NovaPanel(st, hud), s => s.nova.unlocked, 2);
hud.addTab('galaxy', new GalaxyPanel(st, hud), s => s.galaxy.unlocked, 3);
hud.addTab('sing', new SingPanel(st, hud), s => s.sing.unlocked, 4);
hud.addTab('ach', new AchPanel(), () => true);
hud.addTab('journal', new JournalPanel(), s => s.loreSeen.some(Boolean));
hud.addTab('settings', settingsPanel, () => true);
hud.selectTab('dust');

settingsPanel.onImport = imported => {
  saveGame(imported);
  location.reload();  // sauberster Weg, alle Systeme zu resynchronisieren
};

// ── Audio ────────────────────────────────────────────────────────────────────
const audio = new AudioEngine(st);

// ── Offline-Progress beim Start ──────────────────────────────────────────────
if (state.savedAt > 0) {
  const away = (Date.now() - state.savedAt) / 1000;
  if (away > 60) {
    const sum = simulateOffline(state, away);
    if (sum.seconds > 60) hud.offlineDialog(sum, state.settings.sciNotation);
  }
}

// ── Game Loop ────────────────────────────────────────────────────────────────
let last = performance.now();
let saveAcc = 0;
let uiAcc = 0;
let mults: Mults = computeMults(state);

function frame(now: number): void {
  requestAnimationFrame(frame);
  let dt = (now - last) / 1000;
  last = now;
  if (dt <= 0) return;
  if (dt > 2) {
    // längere Lücke (Tab pausiert) → Offline-Pfad statt Riesen-Tick
    const sum = simulateOffline(state, dt);
    if (sum.realSeconds > 300) hud.offlineDialog(sum, state.settings.sciNotation);
    dt = 0.001;
  }
  mults = tick(state, dt);

  // Pending-Events aus dem Core → Toasts/Sounds
  for (const i of state.pending.ach.splice(0)) emit('achievement', i);
  for (const i of state.pending.lore.splice(0)) emit('lore', i);

  engine.applyQuality(state);
  engine.update(state, mults, dt);
  audio.update(dt);

  uiAcc += dt;
  if (uiAcc >= 0.1) {  // UI mit 10 Hz — Zahlen bleiben flüssig, DOM bleibt billig
    uiAcc = 0;
    hud.update(state, mults);
  }

  saveAcc += dt;
  if (saveAcc >= AUTOSAVE_INTERVAL) {
    saveAcc = 0;
    saveGame(state);
  }
}
requestAnimationFrame(frame);

// Mobile: beim Verlassen speichern
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') saveGame(state);
});
window.addEventListener('beforeunload', () => saveGame(state));

// Ladebildschirm ausblenden
const loading = document.getElementById('loading');
if (loading) {
  loading.style.opacity = '0';
  setTimeout(() => loading.remove(), 900);
}

// Dev-Konsole (nur im Dev-Build): dev.grant('dust.amount', '1e30')
if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).dev = {
    state: () => state,
    grant: (what: string, amount: string) => {
      const s = state as unknown as Record<string, Record<string, unknown>>;
      const [layer, field] = what.split('.');
      s[layer][field] = D(amount);
    },
  };
}

// PWA Service Worker
if ('serviceWorker' in navigator && !import.meta.env.DEV) {
  navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => { /* offline-first optional */ });
}
