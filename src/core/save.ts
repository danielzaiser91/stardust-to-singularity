import { Decimal, D } from './decimal';
import { SAVE_VERSION } from './constants';
import { initialState, type GameState } from './state';

/**
 * Serialisierung: Decimal → String (roundtrip-sicher via break_eternity).
 * Deserialisierung: template-basiert — initialState() dient als Schema. Fehlende Felder
 * bekommen Defaults (vorwärtskompatibel), Decimal-Felder werden anhand des Templates erkannt.
 */

export function serialize(s: GameState): string {
  return JSON.stringify(s, (_k, v) => (v instanceof Decimal ? { $d: v.toString() } : v));
}

function revive(template: unknown, data: unknown): unknown {
  if (template instanceof Decimal) {
    if (data && typeof data === 'object' && '$d' in (data as Record<string, unknown>)) {
      return D(String((data as Record<string, unknown>).$d));
    }
    return typeof data === 'string' || typeof data === 'number' ? D(data) : template;
  }
  if (Array.isArray(template)) {
    const src = Array.isArray(data) ? data : [];
    // Template-Länge gewinnt (feste Arrays wie gens/elements); längere Daten-Arrays bleiben (z. B. pending)
    const len = Math.max(template.length, template.length === 0 ? src.length : template.length);
    const out: unknown[] = [];
    for (let i = 0; i < len; i++) {
      const t = i < template.length ? template[i] : template[0];
      out.push(i < src.length ? revive(t, src[i]) : structuredCloneSafe(t));
    }
    return out;
  }
  if (template !== null && typeof template === 'object') {
    const out: Record<string, unknown> = {};
    const src = (data ?? {}) as Record<string, unknown>;
    for (const key of Object.keys(template as Record<string, unknown>)) {
      out[key] = revive((template as Record<string, unknown>)[key], src[key]);
    }
    return out;
  }
  return data !== undefined && data !== null ? data : template;
}

function structuredCloneSafe(v: unknown): unknown {
  if (v instanceof Decimal) return D(v);
  if (Array.isArray(v)) return v.map(structuredCloneSafe);
  if (v !== null && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v)) out[k] = structuredCloneSafe((v as Record<string, unknown>)[k]);
    return out;
  }
  return v;
}

/** Migrationskette: migrations[n] hebt Version n auf n+1. Rohdaten-Ebene (vor revive). */
const migrations: Record<number, (raw: Record<string, unknown>) => void> = {
  // Beispiel künftig: 1: raw => { raw.neuesFeld = ... }
};

export function deserialize(json: string): GameState {
  const raw = JSON.parse(json) as Record<string, unknown>;
  let v = typeof raw.version === 'number' ? raw.version : 1;
  while (v < SAVE_VERSION) {
    migrations[v]?.(raw);
    v++;
  }
  raw.version = SAVE_VERSION;
  const state = revive(initialState(0), raw) as GameState;
  state.pending = { lore: [], ach: [] };  // transiente Queues nie aus Save übernehmen
  return state;
}
