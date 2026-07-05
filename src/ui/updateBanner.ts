import { t } from '../i18n';

/**
 * Update-Banner (Pattern aus „incremental adventure"):
 * pollt version.json (cache-busted) und zeigt bei neuer Version einen klickbaren
 * Banner. Klick → Save + kompletter Version-Bust (Service Worker deregistrieren,
 * Caches leeren, Reload mit ?v=Timestamp gegen Browser-Caching).
 */

const INITIAL_MS = 60 * 1000;
const INTERVAL_MS = 3 * 60 * 1000;

let shown = false;

export function startVersionCheck(saveNow: () => void): void {
  if (import.meta.env.DEV) return;   // im Dev-Server sinnlos (Version = "dev")
  setTimeout(() => void poll(saveNow), INITIAL_MS);
}

async function poll(saveNow: () => void): Promise<void> {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}version.json?_=${Date.now()}`, { cache: 'no-store' });
    if (res.ok) {
      const data = (await res.json()) as { version?: string };
      if (data.version && data.version !== __APP_VERSION__) {
        showBanner(saveNow);
        return;   // gefunden → Polling beenden
      }
    }
  } catch { /* offline o. ä. — beim nächsten Intervall erneut */ }
  setTimeout(() => void poll(saveNow), INTERVAL_MS);
}

export function showBanner(saveNow: () => void): void {
  if (shown) return;
  shown = true;
  const banner = document.createElement('div');
  banner.id = 'update-banner';
  banner.textContent = t('update.banner');
  banner.addEventListener('click', () => {
    banner.textContent = t('update.reloading');
    void bustAndReload(saveNow);
  });
  document.getElementById('ui')?.append(banner);
}

async function bustAndReload(saveNow: () => void): Promise<void> {
  saveNow();
  try {
    // Version-Bust: SW weg, Caches weg — sonst serviert die PWA die alte Version weiter
    const regs = await navigator.serviceWorker?.getRegistrations?.() ?? [];
    await Promise.all(regs.map(r => r.unregister()));
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k)));
    }
  } catch { /* best effort — der URL-Buster unten wirkt trotzdem */ }
  window.location.href = window.location.pathname + '?v=' + Date.now();
}
