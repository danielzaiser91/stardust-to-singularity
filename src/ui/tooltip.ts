/**
 * Rich-Tooltips als Ersatz für native title-Attribute: erscheinen nach 150 ms,
 * gestylt (Titelzeile + Detailtext), ans Viewport geclampt. Auf Touch-Geräten
 * (kein Hover) wird der Tooltip beim Tippen 2,5 s eingeblendet.
 */

export interface TipContent {
  title?: string;
  body: string;
}

const SHOW_DELAY_MS = 150;
const TOUCH_SHOW_MS = 2500;

let tip: HTMLElement | null = null;
let titleEl: HTMLElement;
let bodyEl: HTMLElement;
let showTimer: ReturnType<typeof setTimeout> | undefined;
let hideTimer: ReturnType<typeof setTimeout> | undefined;
let currentTarget: HTMLElement | null = null;
let watchdogArmed = false;

/**
 * Watchdog gegen hängende Tooltips: Panels können samt gehovertem Element
 * versteckt werden (z. B. Tab-Wechsel nach Ignition), dann feuert nie ein
 * pointerleave. Prüft deshalb periodisch, ob das Ziel noch sichtbar & gehovert ist.
 */
function armWatchdog(): void {
  if (watchdogArmed) return;
  watchdogArmed = true;
  window.addEventListener('blur', hideTip);
  document.documentElement.addEventListener('pointerleave', hideTip);  // Maus verlässt das Fenster
  setInterval(() => {
    if (!tip?.classList.contains('show') || !currentTarget) return;
    if (!currentTarget.isConnected || currentTarget.offsetParent === null || !currentTarget.matches(':hover')) {
      hideTip();
    }
  }, 500);
}

function ensure(): HTMLElement {
  if (tip) return tip;
  tip = document.createElement('div');
  tip.className = 'tooltip';
  titleEl = document.createElement('div');
  titleEl.className = 'tip-title';
  bodyEl = document.createElement('div');
  bodyEl.className = 'tip-body';
  tip.append(titleEl, bodyEl);
  document.body.append(tip);
  return tip;
}

function show(target: HTMLElement, content: TipContent): void {
  // Ziel kann zwischen Timer-Start und -Ablauf versteckt worden sein (Tab-Wechsel)
  if (!target.isConnected || target.offsetParent === null) return;
  currentTarget = target;
  const el = ensure();
  titleEl.textContent = content.title ?? '';
  titleEl.style.display = content.title ? '' : 'none';
  // innerHTML statt textContent: Body-Strings enthalten gezielt <b class="tip-num">/<span class="tip-res">
  // zur Zahlen-/Ressourcen-Hervorhebung. Sicher, weil ausschließlich intern generiert (i18n-Templates +
  // eigene Zahlenformatierung) — nie Spieler- oder Netzwerk-Eingabe.
  bodyEl.innerHTML = content.body;

  // erst unsichtbar platzieren, dann messen und clampen
  el.classList.remove('show');
  el.style.left = '0px';
  el.style.top = '-9999px';
  const r = target.getBoundingClientRect();
  const w = el.offsetWidth, h = el.offsetHeight;
  const left = Math.min(Math.max(8, r.left + r.width / 2 - w / 2), window.innerWidth - w - 8);
  let top = r.top - h - 10;
  if (top < 8) top = r.bottom + 10;   // kein Platz oben → unter das Element
  el.style.left = `${left}px`;
  el.style.top = `${top}px`;
  requestAnimationFrame(() => el.classList.add('show'));
}

export function hideTip(): void {
  clearTimeout(showTimer);
  currentTarget = null;
  tip?.classList.remove('show');
}

/** content als Getter, damit Texte zur Hover-Zeit entstehen (Sprache, Zustand) */
export function attachTip(target: HTMLElement, content: () => TipContent, opts?: { marker?: boolean }): void {
  if (opts?.marker !== false) target.classList.add('has-tip');  // kleines ?-Eck als Hinweis
  const canHover = window.matchMedia('(hover: hover)').matches;
  if (canHover) {
    armWatchdog();
    target.addEventListener('pointerenter', () => {
      clearTimeout(showTimer);
      showTimer = setTimeout(() => show(target, content()), SHOW_DELAY_MS);
    });
    target.addEventListener('pointerleave', hideTip);
    target.addEventListener('pointerdown', hideTip);
  } else {
    target.addEventListener('pointerup', () => {
      show(target, content());
      clearTimeout(hideTimer);
      hideTimer = setTimeout(hideTip, TOUCH_SHOW_MS);
    });
  }
}
