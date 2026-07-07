import * as C from '../core/constants';
import type { GameState, NebulaCell } from '../core/state';
import { tick } from '../core/tick';
import {
  computeMults, plasmaGain, shardGain, dmGain, entropyGain, canIgnite,
  genMaxAfford, nodeAvailable, nodeCost, perkCost,
  nebulaCellCost, maxTier, autoIgniteUnlocked, HEX_NEIGHBORS, type Mults,
} from '../core/formulas';
import * as A from '../core/actions';

export type Profile = 'active' | 'idle';

import type { Decimal } from '../core/decimal';
/** Plasma-Stand beim letzten Challenge-Versuch (Backoff-Heuristik des Bots) */
const challengeAttempts = new WeakMap<GameState, Decimal[]>();

export interface Milestone { name: string; at: number; }  // at = gespielte Sekunden

/**
 * Greedy-Bot: spielt das komplette Spiel mit einfachen, menschenähnlichen Heuristiken.
 * Wird 1×/Sim-Sekunde aufgerufen (nach tick). Misst die Balance-Referenz — ein
 * echter Spieler mit Guide ist etwas schneller, ein Casual etwas langsamer.
 */
export function botStep(s: GameState, profile: Profile, mults: Mults): void {
  // mults kommt von tick() (derselbe Zustand, gerade erst berechnet) — spart einen kompletten,
  // teuren computeMults()-Durchlauf (45 Node- + 19 Zellen-Effekte) pro simulierter Sekunde.
  let m = mults;

  // — Aktiv-Profil: 4 Klicks/s + Kometen sofort einsammeln —
  if (profile === 'active') {
    if (s.dust.comet.active) A.clickComet(s, m);
    for (let i = 0; i < 4; i++) A.click(s, m);
  }

  // — Singularity: Hawking (geometrischer Motor) zuerst, dann Rest —
  if (s.sing.unlocked) {
    for (const p of [1, 0, 2, 3, 4, 5, 6, 7]) {
      while (s.sing.entropy.gte(perkCost(s, p))) A.buyPerk(s, p);
    }
  }

  // — Collapse: lohnender Gain ODER lange genug gewartet —
  if (s.galaxy.unlocked || s.sing.unlocked) {
    const eg = entropyGain(s, m);
    // aufs Clamp-Optimum warten (×4); erster Kollaps sofort bei Gain 1 (Warten auf 3 kostet ~1 Woche)
    const worth = eg.gte(s.sing.totalEntropy.mul(3).max(1));
    if (worth) {
      A.doCollapse(s);
      m = computeMults(s);
    }
  }

  // — Galaxy: Nodes kaufen (rundum billigster verfügbarer) —
  if (s.galaxy.unlocked) {
    let bought = true;
    while (bought) {
      bought = false;
      let best = -1;
      for (let i = 0; i < C.CONSTELLATION_NODES; i++) {
        if (nodeAvailable(s, i) && s.galaxy.dm.gte(nodeCost(i))) {
          if (best === -1 || nodeCost(i).lt(nodeCost(best))) best = i;
        }
      }
      if (best >= 0) bought = A.buyNode(s, best);
    }
  }

  // — Coalescence: möglichst nah ans Clamp-Optimum (×4), Sicherheits-Fallback nach 12 h —
  if (s.nova.unlocked) {
    const dg = dmGain(s, m);
    if (dg.gte(s.galaxy.totalDM.mul(3).max(1))
      || (s.stats.galaxyTime > 24 * 3600 && dg.gte(s.galaxy.totalDM.mul(0.5).max(1)))) {
      // Galaxientyp: aktiv → irregulär, idle → elliptisch, sonst spiral
      A.doCoalesce(s, profile === 'active' ? 2 : 1);
      m = computeMults(s);
    }
  }

  // — Nebula bauen: Dark in die Mitte (Index mit meisten Nachbarn), sonst Emission/Reflection 3:1 —
  if (s.nova.unlocked && s.nova.shards.gte(nebulaCellCost(s).mul(4))) {
    const empty = s.nova.cells.map((c, i) => (c === 0 ? i : -1)).filter(i => i >= 0);
    if (empty.length > 0) {
      const target = empty.sort((a, b) => HEX_NEIGHBORS[b].length - HEX_NEIGHBORS[a].length)[0];
      const placed = s.nova.cellsBought;
      const type: NebulaCell = placed % 4 === 1 ? 3 : placed % 4 === 3 ? 2 : 1;
      A.placeNebula(s, target, type);
    }
  }

  // — Challenges: der Reihe nach; nach Fehlversuch erst wieder bei ×100 Plasma (Backoff) —
  if (s.nova.unlocked && s.nova.challenge === -1) {
    const next = s.nova.completedTier.findIndex(t => t < 1);
    if (next >= 0 && s.stats.runTime < 2 && s.star.plasma.gte(100)) {
      const attempts = challengeAttempts.get(s) ?? [];
      const last = attempts[next];
      if (!last || s.star.plasma.gte(last.mul(100))) {
        attempts[next] = s.star.plasma;
        challengeAttempts.set(s, attempts);
        A.enterChallenge(s, next);
      }
    }
  }
  // Challenge abbrechen, wenn hoffnungslos (>30 min drin ohne Abschluss)
  if (s.nova.challenge !== -1 && s.stats.runTime > 1800) A.exitChallenge(s);

  // — Supernova: lohnender Gain ODER Run dauert schon zu lang —
  if (s.star.unlocked && s.nova.challenge === -1) {
    const sg = shardGain(s, m);
    const worth = sg.gte(s.nova.totalShards.mul(0.15).max(1)) || (sg.gte(1) && s.stats.novaTime > 3600);
    if (worth) {
      A.doSupernova(s, pickRemnant(s));
      m = computeMults(s);
    }
  }

  // — Star: Upgrades billigst zuerst, Reaktoren der Reihe nach —
  if (s.star.unlocked) {
    for (let u = 0; u < C.PLASMA_UPGRADE_COSTS.length; u++) A.buyPlasmaUpgrade(s, u);
    for (let r = 0; r < C.FUSION_STEPS; r++) {
      if (s.star.reactors[r] === 0) A.buyReactor(s, r);
      A.buyReactorsMax(s, r, 0.3);  // bis 30 % des Plasmas, O(1)
    }
  }

  // — Ignition (manuell, solange kein Auto): lohnender Gain ODER Run zu lang —
  if (!(s.nova.autoIgnite.on && autoIgniteUnlocked(s))) {
    const pg = plasmaGain(s, m);
    const worth = s.star.totalPlasma.eq(0) ? pg.gte(1)
      : pg.gte(s.star.plasma.mul(0.15).max(1)) || (pg.gte(1) && s.stats.runTime > 600);
    if (canIgnite(s) && worth) {
      // Klasse: idle → rot (mehr Gain), aktiv → blau ab 5 Ignitions (Tempo), sonst gelb
      const cls = profile === 'idle' ? 0 : s.stats.ignitions >= 5 ? 2 : 1;
      A.doIgnite(s, cls as 0 | 1 | 2);
      m = computeMults(s);
    }
  }
  // Trickle-Autos sind Idle-Komfort (1 %/s) — aktives Optimalspiel zündet/novat manuell weiter
  if (profile === 'idle') {
    s.galaxy.autoNova.on = m.autoNovaUnlocked;
    s.nova.autoIgnite.on = autoIgniteUnlocked(s);
  }

  // — Dust: Generatoren von oben nach unten max kaufen, dann Compression —
  const top = maxTier(s);
  for (let t = top - 1; t >= 0; t--) {
    const n = genMaxAfford(s, m, t);
    // höhere Stufen bevorzugen; Stufe t kaufen, aber Budget für höhere nicht verbrennen:
    // Heuristik: kaufe max von oben herab — einfach und robust
    if (n > 0) A.buyGenerator(s, m, t, n);
  }
  A.buyCompressionMax(s);
}

function pickRemnant(s: GameState): 0 | 1 | 2 {
  // erst 1 Pulsar (Bursts), dann BHs für Shards, Neutronensterne auffüllen
  if (s.nova.remnants[1] === 0) return 1;
  if (s.nova.remnants[2] <= s.nova.remnants[0]) return 2;
  return 0;
}

export interface SimResult {
  milestones: Milestone[];
  days: number;
  state: GameState;
}

const MILESTONE_DEFS: { name: string; hit: (s: GameState) => boolean }[] = [
  { name: 'gen8_bought', hit: s => s.dust.gens[7].bought > 0 },
  { name: 'ignition_1', hit: s => s.stats.ignitions >= 1 },
  { name: 'ignition_10', hit: s => s.stats.ignitions >= 10 },
  { name: 'supernova_1', hit: s => s.stats.supernovae >= 1 },
  { name: 'supernova_5', hit: s => s.stats.supernovae >= 5 },
  { name: 'challenge_all', hit: s => s.nova.completedTier.every(t => t >= 1) },
  { name: 'galaxy_1', hit: s => s.stats.coalescences >= 1 },
  { name: 'keystones_all', hit: s => s.galaxy.nodes[14] && s.galaxy.nodes[29] && s.galaxy.nodes[44] },
  { name: 'singularity_1', hit: s => s.stats.collapses >= 1 },
  { name: 'endgame', hit: s => s.sing.totalEntropy.gte(C.ENDGAME_ENTROPY) },
];

/** Simuliert bis Meilenstein `until` erreicht oder maxDays um. dt=1s. */
export function simulate(s: GameState, profile: Profile, until: string, maxDays: number): SimResult {
  const milestones: Milestone[] = [];
  const seen = new Set<string>();
  const maxSec = maxDays * 86400;
  const untilDef = MILESTONE_DEFS.find(d => d.name === until);
  if (!untilDef) throw new Error(`unknown milestone: ${until}`);

  let nextLog = 4320;  // erst fein (0,05 d), ab Tag 1 täglich
  while (s.stats.played < maxSec) {
    const m = tick(s, 1);
    botStep(s, profile, m);
    if (s.stats.played >= nextLog) {
      nextLog += s.stats.played < 86400 ? 4320 : 86400;
      // eslint-disable-next-line no-console
      console.log(`  d${(s.stats.played / 86400).toFixed(0)}: ign=${s.stats.ignitions} nova=${s.stats.supernovae}` +
        ` gal=${s.stats.coalescences} col=${s.stats.collapses} shards=${s.nova.totalShards.toExponential(1)}` +
        ` dm=${s.galaxy.totalDM.toExponential(1)} ent=${s.sing.totalEntropy.toExponential(1)}`);
    }
    for (const d of MILESTONE_DEFS) {
      if (!seen.has(d.name) && d.hit(s)) {
        seen.add(d.name);
        milestones.push({ name: d.name, at: s.stats.played });
      }
    }
    s.pending.lore.length = 0;  // Queues nicht wachsen lassen
    s.pending.ach.length = 0;
    if (seen.has(until)) break;
  }
  return { milestones, days: s.stats.played / 86400, state: s };
}
