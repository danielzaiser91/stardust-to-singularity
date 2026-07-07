import { Decimal } from './decimal';
import { OFFLINE_MAX_SECONDS, OFFLINE_CHUNKS } from './constants';
import type { GameState } from './state';
import { tick } from './tick';
import { computeMults } from './formulas';

export interface OfflineSummary {
  seconds: number;          // simulierte Sekunden (nach Offline-Mult)
  realSeconds: number;
  dust: Decimal;
  plasma: Decimal;
  shards: Decimal;
  dm: Decimal;
  ignitions: number;
  supernovae: number;
}

/** Offline-Progress = derselbe tick() in Chunks. Kein zweiter Codepfad.
 *  Generator, damit ein Aufrufer (UI) zwischen Chunks an den Browser zurückgeben kann (Progress-
 *  Anzeige, kein eingefrorener Tab) — `simulateOffline` unten treibt ihn synchron bis zum Ende
 *  durch, für Tests/Sim, denen die Zwischenschritte egal sind. */
export function* simulateOfflineGen(
  s: GameState, realSeconds: number,
): Generator<{ done: number; total: number }, OfflineSummary, void> {
  const m = computeMults(s);
  const capped = Math.min(realSeconds, OFFLINE_MAX_SECONDS);
  const seconds = capped * m.offlineMult;
  const before = {
    dust: s.dust.amount, plasma: s.star.plasma, shards: s.nova.shards, dm: s.galaxy.dm,
    ignitions: s.stats.ignitions, supernovae: s.stats.supernovae,
  };
  const chunk = Math.max(1, seconds / OFFLINE_CHUNKS);
  let left = seconds;
  while (left > 0) {
    const dt = Math.min(chunk, left);
    tick(s, dt);
    left -= dt;
    yield { done: seconds - left, total: seconds };
  }
  return {
    seconds, realSeconds,
    dust: s.dust.amount.sub(before.dust).max(0),
    plasma: s.star.plasma.sub(before.plasma).max(0),
    shards: s.nova.shards.sub(before.shards).max(0),
    dm: s.galaxy.dm.sub(before.dm).max(0),
    ignitions: s.stats.ignitions - before.ignitions,
    supernovae: s.stats.supernovae - before.supernovae,
  };
}

/** Treibt `simulateOfflineGen` synchron bis zum Ende durch — für Tests und Aufrufer ohne UI. */
export function simulateOffline(s: GameState, realSeconds: number): OfflineSummary {
  const gen = simulateOfflineGen(s, realSeconds);
  let step = gen.next();
  while (!step.done) step = gen.next();
  return step.value;
}
