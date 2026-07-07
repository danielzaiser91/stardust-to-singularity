import type { GameState } from './state';
import { effectiveCoalescences, effectiveIgnMs, effectiveNovaMs, type Mults } from './formulas';
import { D } from './decimal';
import * as C from './constants';

const last = <T>(a: T[]): T => a[a.length - 1];

/** 60 Achievements — Reihenfolge ist stabil (Index = i18n-Key ach.N). Je +2 % globale Produktion. */
type Check = (s: GameState, m: Mults) => boolean;

const dustAt = (e: number): Check => s => s.stats.totalDustEver.gte(D(10).pow(e));

export const ACHIEVEMENT_CHECKS: Check[] = [
  // 0–10: Dust-Meilensteine
  dustAt(2), dustAt(4), dustAt(6), dustAt(9), dustAt(12), dustAt(15), dustAt(18), dustAt(21), dustAt(24), dustAt(27), dustAt(30),
  // 11–18: erste Einheit jeder Generator-Stufe
  ...Array.from({ length: 8 }, (_, t): Check => s => s.dust.gens[t].bought > 0),
  // 19–21: Compression
  s => s.dust.compression >= 1, s => s.dust.compression >= 10, s => s.dust.compression >= 25,
  // 22–24: Klicks
  s => s.stats.clicks >= 1, s => s.stats.clicks >= 100, s => s.stats.clicks >= 1000,
  // 25–27: Kometen
  s => s.stats.comets >= 1, s => s.stats.comets >= 10, s => s.stats.comets >= 50,
  // 28–31: Ignitions
  s => s.stats.ignitions >= 1, s => s.stats.ignitions >= 5, s => s.stats.ignitions >= 25, s => s.stats.ignitions >= 100,
  // 32–34: Plasma
  s => s.star.totalPlasma.gte(10), s => s.star.totalPlasma.gte(1000), s => s.star.totalPlasma.gte(1e5),
  // 35–40: Elemente entdeckt
  ...Array.from({ length: 6 }, (_, e): Check => s => s.star.elements[e].gt(0)),
  // 41–43: Supernovae
  s => s.stats.supernovae >= 1, s => s.stats.supernovae >= 5, s => s.stats.supernovae >= 25,
  // 44–45: Shards
  s => s.nova.totalShards.gte(100), s => s.nova.totalShards.gte(1e4),
  // 46–48: Nebel-Zellen
  s => s.nova.cellsBought >= 1, s => s.nova.cells.filter(c => c !== 0).length >= 7,
  s => s.nova.cells.every(c => c !== 0),
  // 49–51: Challenges
  s => s.nova.completedTier.filter(t => t >= 1).length >= 1,
  s => s.nova.completedTier.filter(t => t >= 1).length >= 4,
  s => s.nova.completedTier.every(t => t >= 1),
  // 52–53: Coalescences (effektiv — Galaxie-Reset-Bonus zählt mit)
  s => effectiveCoalescences(s) >= 1, s => effectiveCoalescences(s) >= 3,
  // 54–56: Konstellations-Nodes
  s => s.galaxy.nodes.filter(Boolean).length >= 5,
  s => [14, 29, 44].some(k => s.galaxy.nodes[k]),
  s => s.galaxy.nodes.every(Boolean),
  // 57: Collapse, 58: Entropy, 59: Neues Universum
  s => s.stats.collapses >= 1,
  s => s.sing.totalEntropy.gte(100),
  s => s.sing.universes >= 1,
  // 60: Overflow — 1e308 Plasma (die Grenze normaler Floats)
  s => s.stats.bestPlasma.gte(D('1e308')),
  // 61–62: weitere Konstellations-Stufen (angehängt → Save-Indizes bleiben stabil)
  s => s.galaxy.nodes.filter(Boolean).length >= 15,
  s => s.galaxy.nodes.filter(Boolean).length >= 30,
  // 63–66: die jeweils LETZTE Meilenstein-Stufe jeder Ebene
  s => effectiveIgnMs(s) >= last(C.MS_IGNITION),
  s => effectiveNovaMs(s) >= last(C.MS_NOVA),
  s => effectiveCoalescences(s) >= last(C.MS_GALAXY),
  s => s.stats.collapses >= last(C.MS_COLLAPSE),
];

export const ACH_COUNT = ACHIEVEMENT_CHECKS.length;

/** Anzeige-Metadaten je Achievement: i18n-Template 'achd.<k>' mit Wert v */
export const ACHIEVEMENT_META: { k: string; v: string }[] = [
  ...[2, 4, 6, 9, 12, 15, 18, 21, 24, 27, 30].map(e => ({ k: 'dust', v: `1e${e}` })),
  ...Array.from({ length: 8 }, (_, t) => ({ k: 'gen', v: String(t) })),
  { k: 'compression', v: '1' }, { k: 'compression', v: '10' }, { k: 'compression', v: '25' },
  { k: 'clicks', v: '1' }, { k: 'clicks', v: '100' }, { k: 'clicks', v: '1000' },
  { k: 'comets', v: '1' }, { k: 'comets', v: '10' }, { k: 'comets', v: '50' },
  { k: 'ignitions', v: '1' }, { k: 'ignitions', v: '5' }, { k: 'ignitions', v: '25' }, { k: 'ignitions', v: '100' },
  { k: 'plasma', v: '10' }, { k: 'plasma', v: '1000' }, { k: 'plasma', v: '1e5' },
  ...Array.from({ length: 6 }, (_, e) => ({ k: 'el', v: String(e) })),
  { k: 'supernovae', v: '1' }, { k: 'supernovae', v: '5' }, { k: 'supernovae', v: '25' },
  { k: 'shards', v: '100' }, { k: 'shards', v: '1e4' },
  { k: 'cells', v: '1' }, { k: 'cells', v: '7' }, { k: 'cells', v: '19' },
  { k: 'challenges', v: '1' }, { k: 'challenges', v: '4' }, { k: 'challenges', v: '8' },
  { k: 'coalescences', v: '1' }, { k: 'coalescences', v: '3' },
  { k: 'nodes', v: '5' }, { k: 'keystone', v: '' }, { k: 'nodes', v: '45' },
  { k: 'collapse', v: '' }, { k: 'entropy', v: '' }, { k: 'universe', v: '' },
  { k: 'plasma', v: '1e308' },
  { k: 'nodes', v: '15' }, { k: 'nodes', v: '30' },
  { k: 'msIgnAll', v: '' }, { k: 'msNovaAll', v: '' }, { k: 'msGalAll', v: '' }, { k: 'msColAll', v: '' },
];

export function checkAchievements(s: GameState, m: Mults): void {
  for (let i = 0; i < ACHIEVEMENT_CHECKS.length; i++) {
    if (!s.achievements[i] && ACHIEVEMENT_CHECKS[i](s, m)) {
      s.achievements[i] = true;
      s.pending.ach.push(i);
    }
  }
}
