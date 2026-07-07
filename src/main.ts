import './style.css';
import { initialState, type GameState } from './core/state';
import { tick } from './core/tick';
import { computeMults, type Mults } from './core/formulas';
import * as A from './core/actions';
import { simulateOfflineGen } from './core/offline';
import { loadGame, saveGame, replaceSave } from './storage';
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
import { spawnFloaty } from './ui/floaty';
import { fmt } from './ui/format';

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

// Canvas-Klick: Komet fangen oder Staub anziehen (mit fliegender Zahl)
engine.onCanvasClick = (hitComet, x, y) => {
  const m = computeMults(state);
  if (hitComet && A.clickComet(state, m)) emit('comet-caught');
  else if (state.ui.scene === 0) {
    const gain = A.click(state, m);
    emit('click');
    spawnFloaty(x, y, `+${fmt(gain, state.settings.sciNotation)}`);
  }
};

// ── UI ───────────────────────────────────────────────────────────────────────
// Panels erzeugen ihre Texte beim Aufbau — Sprachwechsel baut sie deshalb in-place
// neu auf (KEIN Reload: Spiel-Loop und Musik laufen ununterbrochen weiter).
const hud = new Hud(st);
function buildTabs(): void {
  hud.clearTabs();
  const settingsPanel = new SettingsPanel(st, hud);
  settingsPanel.onLangChange = () => {
    saveGame(state);
    buildTabs();
    hud.selectTab('settings');
  };
  settingsPanel.onImport = imported => {
    replaceSave(imported);
    location.reload();  // Import ersetzt den kompletten State — hier ist Reload korrekt
  };
  hud.addTab('dust', new DustPanel(st, hud), () => true, 0);
  hud.addTab('star', new StarPanel(st, hud), s => s.star.unlocked, 1);
  hud.addTab('nova', new NovaPanel(st, hud), s => s.nova.unlocked, 2);
  hud.addTab('galaxy', new GalaxyPanel(st, hud), s => s.galaxy.unlocked, 3);
  hud.addTab('sing', new SingPanel(st, hud), s => s.sing.unlocked, 4);
  hud.addTab('ach', new AchPanel(), () => true);
  hud.addTab('journal', new JournalPanel(), s => s.loreSeen.some(Boolean));
  hud.addTab('settings', settingsPanel, () => true);
}
buildTabs();
hud.selectTab('dust');

// ── Audio ────────────────────────────────────────────────────────────────────
const audio = new AudioEngine(st);

// ── Update-Banner: informiert über neue Deploys, Klick = Save + Version-Bust ──
import { startVersionCheck, showBanner } from './ui/updateBanner';
startVersionCheck(() => saveGame(state));

// ── Offline-Progress: läuft als Generator in Chunks, damit der Tab bei langer Abwesenheit
//    nicht einfriert. `offlineBusy` pausiert die normale Spiellogik in frame(), lässt die
//    Szene aber weiter rendern — der Fortschrittsdialog läuft über diesem "Vorschau"-Hintergrund
//    statt über einem eingefrorenen/blanken Bildschirm.
let offlineBusy = false;
async function runOfflineCatchup(realSeconds: number, dialogThreshold: number): Promise<void> {
  offlineBusy = true;
  hud.showOfflineProgress();
  const gen = simulateOfflineGen(state, realSeconds);
  let step = gen.next();
  let budgetStart = performance.now();
  while (!step.done) {
    hud.updateOfflineProgress(step.value.done / step.value.total);
    // Chunks laufen in ~12-ms-Häppchen, dann kurz zurück ans Event-Loop — hält den Tab
    // reaktionsfähig. setTimeout statt rAF: rAF pausiert komplett in Hintergrund-/Minimiert-
    // Tabs (z. B. Spiel wird in neuem Tab geöffnet, ohne ihn zu fokussieren), setTimeout läuft
    // weiter (ggf. gedrosselt auf ~1/s), sodass der Fortschritt nie ganz einfriert.
    if (performance.now() - budgetStart > 12) {
      await new Promise<void>(r => setTimeout(r, 0));
      budgetStart = performance.now();
    }
    step = gen.next();
  }
  hud.hideOfflineProgress();
  const sum = step.value;
  if (sum.realSeconds > dialogThreshold) hud.offlineDialog(sum, state.settings.sciNotation);
  last = performance.now();  // Sim-Dauer nicht als neues dt werten (sonst Spirale)
  offlineBusy = false;
}

// ── Game Loop ────────────────────────────────────────────────────────────────
let last = performance.now();
let saveAcc = 0;
let uiAcc = 0;
let mults: Mults = computeMults(state);

function frame(now: number): void {
  requestAnimationFrame(frame);
  if (offlineBusy) {
    // Spiellogik pausiert — Szene bleibt als lebendiger Hintergrund hinter dem Fortschrittsdialog
    const bgDt = Math.min(Math.max((now - last) / 1000, 0), 0.25) || 0.016;
    last = now;
    engine.update(state, mults, bgDt);
    return;
  }
  let dt = (now - last) / 1000;
  last = now;
  if (dt <= 0) return;
  if (dt > 10) {
    // längere Lücke (Tab pausiert) → Offline-Pfad statt Riesen-Tick
    runOfflineCatchup(dt, 300);
    return;
  } else if (dt > 0.25) {
    dt = 0.25;  // Frame-Spikes glätten
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

// Ladebildschirm ausblenden — VOR dem Offline-Fortschritt, damit die Szene als Hintergrund
// hinter dessen Dialog sichtbar ist (statt eines zweiten, undurchsichtigen Screens).
const loading = document.getElementById('loading');
if (loading) {
  loading.style.opacity = '0';
  setTimeout(() => loading.remove(), 900);
}

// ── Offline-Progress beim Start ──────────────────────────────────────────────
if (state.savedAt > 0) {
  const away = (Date.now() - state.savedAt) / 1000;
  if (away > 60) runOfflineCatchup(away, 60);
}

// ── Onboarding-Hints (je einmal pro Session) ─────────────────────────────────
import { canIgnite } from './core/formulas';
import { t } from './i18n';
function hint(id: string, cond: boolean): void {
  // persistent im Save — Tutorial-Hints erscheinen genau einmal, auch über Reloads hinweg
  if (cond && !state.ui.hintsSeen.includes(id)) {
    state.ui.hintsSeen.push(id);
    hud.toast('💡', t(`hint.${id}`));
  }
}
setInterval(() => {
  hint('welcome', state.stats.played < 30 && state.stats.ignitions === 0);
  hint('comet', state.dust.comet.active);
  hint('ignite', canIgnite(state) && state.stats.ignitions === 0);
  hint('fusion', state.star.unlocked && state.star.reactors[0] === 0 && state.stats.ignitions >= 1);
  hint('iron', state.star.elements[5].gt(0) && state.stats.supernovae === 0);
}, 2000);

// Mobile: beim Verlassen speichern
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') saveGame(state);
});
window.addEventListener('beforeunload', () => saveGame(state));

// Dev-Konsole (nur im Dev-Build): dev.grant('dust.amount', '1e30')
if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).dev = {
    state: () => state,
    grant: (what: string, amount: string) => {
      const s = state as unknown as Record<string, Record<string, unknown>>;
      const [layer, field] = what.split('.');
      s[layer][field] = D(amount);
    },
    /** n Sekunden Spielzeit simulieren (unabhängig vom RAF, z. B. für Tests) */
    tick: (seconds: number) => {
      for (let i = 0; i < seconds; i++) mults = tick(state, 1);
      hud.update(state, mults);
    },
    /** Update-Banner manuell anzeigen (Test) */
    fakeUpdate: () => showBanner(() => saveGame(state)),
    /** Offline-Fortschrittsdialog manuell auslösen (Test, ohne echt X Sekunden zu warten) */
    offline: (seconds: number) => runOfflineCatchup(seconds, 0),
  };
}

// PWA Service Worker
if ('serviceWorker' in navigator && !import.meta.env.DEV) {
  navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => { /* offline-first optional */ });
}
