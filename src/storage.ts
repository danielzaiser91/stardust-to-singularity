import { serialize, deserialize } from './core/save';
import type { GameState } from './core/state';

const KEY = 'stardust-to-singularity';

export function saveGame(s: GameState): void {
  s.savedAt = Date.now();
  try { localStorage.setItem(KEY, serialize(s)); } catch { /* Speicher voll/Privatmodus */ }
}

export function loadGame(): GameState | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? deserialize(raw) : null;
  } catch (e) {
    console.error('save corrupted, starting fresh', e);
    return null;
  }
}

export function exportSave(s: GameState): string {
  s.savedAt = Date.now();
  return btoa(unescape(encodeURIComponent(serialize(s))));
}

export function importSave(b64: string): GameState | null {
  try { return deserialize(decodeURIComponent(escape(atob(b64.trim())))); }
  catch { return null; }
}

export function hardReset(): void {
  localStorage.removeItem(KEY);
  location.reload();
}
