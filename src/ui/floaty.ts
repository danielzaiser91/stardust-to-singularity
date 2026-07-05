/** Fliegende Zahlen („+123") — steigen vom Klickpunkt auf und verblassen. */

const MAX_CONCURRENT = 40;
let alive = 0;

export function spawnFloaty(x: number, y: number, text: string): void {
  if (alive >= MAX_CONCURRENT) return;
  alive++;
  const el = document.createElement('span');
  el.className = 'floaty';
  el.textContent = text;
  // leichter Jitter + Drift, damit schnelle Serien nicht exakt übereinander liegen
  el.style.left = `${x + (Math.random() - 0.5) * 26}px`;
  el.style.top = `${y - 8}px`;
  el.style.setProperty('--drift', `${(Math.random() - 0.5) * 40}px`);
  document.body.append(el);
  el.addEventListener('animationend', () => { el.remove(); alive--; });
}
