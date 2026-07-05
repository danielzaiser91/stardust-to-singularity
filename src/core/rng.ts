/** mulberry32 — deterministischer PRNG; Zustand lebt im GameState (Determinismus für Sim & Tests) */
export function rngNext(state: number): { value: number; next: number } {
  let t = (state + 0x6d2b79f5) | 0;
  let x = t;
  x = Math.imul(x ^ (x >>> 15), x | 1);
  x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
  return { value: ((x ^ (x >>> 14)) >>> 0) / 4294967296, next: t };
}
