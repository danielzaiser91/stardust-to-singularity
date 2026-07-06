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

/**
 * Repariert NaN/Infinity, die durch einen (behobenen) Bug in extremen Größenordnungen ins
 * Save gerutscht sind — sonst bleibt der Fehler über jeden Reload hinweg bestehen, weil z. B.
 * `dust.compression` Ignitionen überlebt und jeden Tick erneut NaN in die Produktion einspeist.
 * Setzt betroffene Felder auf 0 zurück statt das ganze Save wegzuwerfen.
 */
function sanitize(v: unknown): unknown {
  if (v instanceof Decimal) return v.isNan() || !v.isFinite() ? D(0) : v;
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  if (Array.isArray(v)) return v.map(sanitize);
  if (v !== null && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v)) out[k] = sanitize((v as Record<string, unknown>)[k]);
    return out;
  }
  return v;
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
  // v1→v2: Meilenstein-Zähler ignMs/novaMs eingeführt (resetten bei Coalescence).
  // Seed aus Bestandsdaten: novaMs = Supernovae seit letzter Coalescence (nova.count),
  // ignMs = Lifetime-Zündungen, sofern noch nie coalesced (dann identisch), sonst 0.
  1: raw => {
    const stats = raw.stats as Record<string, unknown> | undefined;
    const nova = raw.nova as Record<string, unknown> | undefined;
    if (!stats || stats.ignMs !== undefined) return;
    const coal = typeof stats.coalescences === 'number' ? stats.coalescences : 0;
    stats.ignMs = coal === 0 && typeof stats.ignitions === 'number' ? stats.ignitions : 0;
    stats.novaMs = typeof nova?.count === 'number' ? nova.count : 0;
  },
  // v2→v3: Wahl-Zähler von Lifetime auf „seit Eltern-Reset" umgestellt.
  // classPicks proportional auf Summe == ignMs stutzen, gtypePicks auf galaxy.count;
  // remnantPicks entfällt (identisch mit nova.remnants).
  2: raw => {
    const stats = raw.stats as Record<string, unknown> | undefined;
    if (!stats) return;
    const rescale = (arr: unknown, target: unknown): void => {
      if (!Array.isArray(arr) || typeof target !== 'number') return;
      const sum = arr.reduce((a: number, x) => a + (typeof x === 'number' ? x : 0), 0);
      if (sum <= target || sum === 0) return;
      let acc = 0;
      for (let i = 0; i < arr.length; i++) { arr[i] = Math.floor((arr[i] as number) * target / sum); acc += arr[i] as number; }
      arr[arr.indexOf(Math.max(...(arr as number[])))] += target - acc;  // Rundungsrest zum größten Eintrag
    };
    rescale(stats.classPicks, stats.ignMs);
    rescale(stats.gtypePicks, (raw.galaxy as Record<string, unknown> | undefined)?.count);
    delete stats.remnantPicks;
  },
  // v3→v4: Challenges bekommen eine Hard-Stufe. `nova.completed: boolean[]` →
  // `nova.completedTier: number[]` (true→1, false→0); alte Läufe hatten nie Stufe 2.
  3: raw => {
    const nova = raw.nova as Record<string, unknown> | undefined;
    if (!nova || !Array.isArray(nova.completed)) return;
    nova.completedTier = (nova.completed as unknown[]).map(v => (v ? 1 : 0));
    delete nova.completed;
  },
};

export function deserialize(json: string): GameState {
  const raw = JSON.parse(json) as Record<string, unknown>;
  let v = typeof raw.version === 'number' ? raw.version : 1;
  while (v < SAVE_VERSION) {
    migrations[v]?.(raw);
    v++;
  }
  raw.version = SAVE_VERSION;
  const state = sanitize(revive(initialState(0), raw)) as GameState;
  state.pending = { lore: [], ach: [] };  // transiente Queues nie aus Save übernehmen
  return state;
}
