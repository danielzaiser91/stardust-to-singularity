import { el, btn } from './dom';
import { t } from '../i18n';
import { GITHUB_URL, DISCORD_URL } from '../social';
import type { Hud } from './hud';
import type { Engine } from '../render/engine';

/**
 * Einmaliger Abspann beim ERSTEN "Werde ein neues Universum": UI blendet aus, die Kamera fährt
 * automatisch (erst Schwarzes Loch, dann Galaxie), ein paar Zeilen ziehen vorbei, danach ein
 * kurzer Dank-Dialog mit Community-Links. Wiederholte NG+-Zyklen bekommen das nicht erneut
 * (s. Aufruf in panels.ts) — ein Abspann ist ein einmaliger Moment, kein Ritual.
 */
const LINE_COUNT = 9;
const LINE_HOLD_MS = 7000;
const FINAL_HOLD_MS = 10000;
const FADE_MS = 800;
const GALAXY_SWITCH_LINE = 3;   // ab hier: Schwarzes Loch → Galaxie (synchron zu "wuchs eine Galaxie")

const CONFETTI_COLORS = ['#64d8ff', '#ff9d4d', '#ff64a8', '#a78bfa', '#7dffb0', '#ffe29a'];

function spawnConfetti(host: HTMLElement, count: number): void {
  for (let i = 0; i < count; i++) {
    const p = el('div', 'confetti-piece');
    p.style.left = `${Math.random() * 100}%`;
    p.style.background = CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)];
    p.style.setProperty('--rot', `${(Math.random() * 720 - 360).toFixed(0)}deg`);
    p.style.setProperty('--drift', `${(Math.random() * 160 - 80).toFixed(0)}px`);
    p.style.animationDuration = `${(2.4 + Math.random() * 1.8).toFixed(2)}s`;
    p.style.animationDelay = `${(Math.random() * 0.4).toFixed(2)}s`;
    host.append(p);
    p.addEventListener('animationend', () => p.remove());
  }
}

function linkBtn(label: string, url: string): HTMLAnchorElement {
  const a = el('a', '', label);
  a.href = url;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  return a;
}

export function playEndingSequence(hud: Hud, engine: Engine, onDone: () => void): void {
  hud.setUiVisible(false);
  engine.setCinematic(true, 4);   // Start: Schwarzes Loch — genau dort, wo der Kollaps stattfand

  const overlay = el('div', 'ending-overlay');
  const confettiLayer = el('div', 'confetti-layer');
  const textEl = el('div', 'ending-text');
  const skipBtn = btn('ending-skip', t('end.skip'), () => skipToModal());
  overlay.append(confettiLayer, textEl, skipBtn);
  document.body.append(overlay);
  spawnConfetti(confettiLayer, 140);

  let finished = false;
  const timers: ReturnType<typeof setTimeout>[] = [];
  const schedule = (fn: () => void, ms: number): void => { timers.push(setTimeout(fn, ms)); };
  const clearTimers = (): void => { for (const tm of timers) clearTimeout(tm); timers.length = 0; };

  function showLine(i: number): void {
    if (i >= LINE_COUNT) { showModal(); return; }
    if (i === GALAXY_SWITCH_LINE) engine.setLayer(3);
    textEl.textContent = t(`end.line${i}`);
    requestAnimationFrame(() => textEl.classList.add('show'));
    const hold = i === LINE_COUNT - 1 ? FINAL_HOLD_MS : LINE_HOLD_MS;
    schedule(() => {
      textEl.classList.remove('show');
      schedule(() => showLine(i + 1), FADE_MS);
    }, hold);
  }

  function skipToModal(): void {
    clearTimers();
    textEl.classList.remove('show');
    showModal();
  }

  function showModal(): void {
    skipBtn.remove();
    textEl.remove();
    spawnConfetti(confettiLayer, 80);
    const box = el('div', 'ending-modal');
    box.append(el('h3', '', t('end.title')), el('p', '', t('end.body')));
    const links = el('div', 'ending-links');
    links.append(linkBtn(t('end.github'), GITHUB_URL));
    if (DISCORD_URL) links.append(linkBtn(t('end.discord'), DISCORD_URL));
    box.append(links, btn('primary', t('end.continue'), finish));
    overlay.append(box);
  }

  function finish(): void {
    if (finished) return;
    finished = true;
    clearTimers();
    overlay.remove();
    engine.setCinematic(false);
    hud.setUiVisible(true);
    onDone();
  }

  showLine(0);
}
