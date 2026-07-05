import { describe, it, expect } from 'vitest';
import { initialState } from '../src/core/state';
import { simulate } from '../src/sim/bot';

/**
 * Balance-Assertions: Der Bot spielt das echte Spiel headless.
 * Diese Bänder schützen die Progression vor Regressionen bei jeder Änderung
 * an constants.ts. Läuft in CI bei jedem Push (Ziel: < 60 s wall).
 * Die Voll-Progression (Galaxy/Singularity/Endgame) läuft via `npm run sim`
 * in der Endabnahme — zu langsam für jeden CI-Lauf.
 */

const min = (m: number) => m * 60;
const hour = (h: number) => h * 3600;
const at = (r: { milestones: { name: string; at: number }[] }, name: string) =>
  r.milestones.find(m => m.name === name)?.at ?? Infinity;

describe('balance: Early Game', () => {
  it('erste Ignition (aktiv) in 15–75 min', () => {
    const r = simulate(initialState(42), 'active', 'ignition_1', 1);
    expect(at(r, 'ignition_1')).toBeGreaterThan(min(15));
    expect(at(r, 'ignition_1')).toBeLessThan(min(75));
  });

  it('erste Ignition (idle) unter 3 h', () => {
    const r = simulate(initialState(42), 'idle', 'ignition_1', 1);
    expect(at(r, 'ignition_1')).toBeLessThan(hour(3));
  });

  it('idle ist langsamer als aktiv, aber nicht abgehängt (< 3×)', () => {
    const a = simulate(initialState(42), 'active', 'ignition_1', 1);
    const i = simulate(initialState(42), 'idle', 'ignition_1', 1);
    expect(at(i, 'ignition_1')).toBeGreaterThan(at(a, 'ignition_1'));
    expect(at(i, 'ignition_1')).toBeLessThan(at(a, 'ignition_1') * 3);
  });
});

describe('balance: Mid Game', () => {
  it('erste Supernova (aktiv) in 1,5–10 h', () => {
    const r = simulate(initialState(42), 'active', 'supernova_1', 2);
    expect(at(r, 'supernova_1')).toBeGreaterThan(hour(1.5));
    expect(at(r, 'supernova_1')).toBeLessThan(hour(10));
  });

  it('kein Layer-Skip: Ignition deutlich vor Supernova', () => {
    const r = simulate(initialState(42), 'active', 'supernova_1', 2);
    expect(at(r, 'ignition_1') * 3).toBeLessThan(at(r, 'supernova_1'));
  });
});
