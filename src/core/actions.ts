import { D, ZERO, Decimal, affordGeometric, costGeometric } from './decimal';
import * as C from './constants';
import type { GameState, StarClass, GalaxyType, NebulaCell } from './state';
import {
  computeMults, genCost, genMaxAfford, compressionCost, clickAmount, maxTier,
  plasmaGain, canIgnite, shardGain, canSupernova, dmGain, canCoalesce,
  entropyGain, canCollapse, reactorCost, nebulaCellCost, nodeCost, nodeAvailable,
  perkCost, feedMass, type Mults,
} from './formulas';

/** Alle Spieler-Aktionen. Geben true zurück, wenn etwas passiert ist. */

export function buyGenerator(s: GameState, m: Mults, tier: number, n: number): boolean {
  if (tier >= maxTier(s) || n < 1) return false;
  const cost = genCost(s, m, tier, n);
  if (s.dust.amount.lt(cost)) return false;
  s.dust.amount = s.dust.amount.sub(cost);
  const g = s.dust.gens[tier];
  g.amount = g.amount.add(n);
  g.bought += n;
  return true;
}
export function buyGeneratorMax(s: GameState, m: Mults, tier: number): boolean {
  return buyGenerator(s, m, tier, genMaxAfford(s, m, tier));
}
export function buyCompression(s: GameState): boolean {
  if (s.nova.challenge === 0) return false;  // Challenge 1: Cold Void
  const cost = compressionCost(s);
  if (s.dust.amount.lt(cost)) return false;
  s.dust.amount = s.dust.amount.sub(cost);
  s.dust.compression++;
  return true;
}
/** Bulk-Kauf per geschlossener Formel — O(1) auch bei Layer-2-Dust (Bot & Autobuyer) */
export function buyCompressionMax(s: GameState): boolean {
  if (s.nova.challenge === 0) return false;
  const base = D(C.COMPRESSION_BASE);
  const n = affordGeometric(s.dust.amount, base, C.COMPRESSION_GROWTH, s.dust.compression);
  if (n < 1) return false;
  const cost = costGeometric(n, base, C.COMPRESSION_GROWTH, s.dust.compression);
  if (s.dust.amount.lt(cost)) return false;
  s.dust.amount = s.dust.amount.sub(cost);
  s.dust.compression += n;
  return true;
}
export function click(s: GameState, m: Mults): Decimal {
  const gain = clickAmount(s, m);
  s.dust.amount = s.dust.amount.add(gain);
  s.dust.total = s.dust.total.add(gain);
  s.stats.totalDustEver = s.stats.totalDustEver.add(gain);
  s.stats.clicks++;
  return gain;
}
export function clickComet(s: GameState, m: Mults): boolean {
  if (!s.dust.comet.active) return false;
  s.dust.comet.active = false;
  s.dust.comet.boost = m.cometDur;
  s.stats.comets++;
  return true;
}

// ── Ebene 1: Ignition ────────────────────────────────────────────────────────
function resetDustLayer(s: GameState): void {
  s.dust.amount = D(10);
  s.dust.total = D(10);
  for (const g of s.dust.gens) { g.amount = ZERO; g.bought = 0; }
  // Meilenstein 25 Zündungen (dieser Galaxie): Kompression bleibt; sonst Upgrade 10: bis zu 10
  if (s.stats.ignMs < C.MS_IGNITION[2]) {
    if (!s.star.upgrades[9]) s.dust.compression = 0;
    else s.dust.compression = Math.min(s.dust.compression, 10);
  }
  // Komet bleibt: Realzeit-Event (TTL ≤ 12 s, Boost ≤ 30 s) — ein Reset soll ihn nicht schlucken
  if (s.star.upgrades[0]) { s.dust.amount = D(1000); s.dust.total = D(1000); }  // Head Start
}

export function doIgnite(s: GameState, cls: StarClass): boolean {
  if (!canIgnite(s)) return false;
  const m = computeMults(s);
  const gain = plasmaGain(s, m);
  if (gain.lte(0)) return false;   // kein Reset für +0
  // Challenge im Lauf? → abgeschlossen (Stufe des Versuchs merken, Hard schluckt Normal nicht wieder runter)
  if (s.nova.challenge >= 0) {
    s.nova.completedTier[s.nova.challenge] = Math.max(s.nova.completedTier[s.nova.challenge], s.nova.challengeTier);
    s.nova.challenge = -1;
  }
  s.star.unlocked = true;
  s.star.plasma = s.star.plasma.add(gain);
  s.star.totalPlasma = s.star.totalPlasma.add(gain);
  if (s.star.plasma.gt(s.stats.bestPlasma)) s.stats.bestPlasma = s.star.plasma;
  s.star.cls = cls;
  s.stats.classPicks[cls]++;
  s.stats.ignitions++;
  s.stats.ignMs++;
  s.stats.runTime = 0;
  resetDustLayer(s);
  return true;
}

export function buyPlasmaUpgrade(s: GameState, i: number): boolean {
  if (i < 0 || i >= C.PLASMA_UPGRADE_COSTS.length || s.star.upgrades[i]) return false;
  const cost = D(C.PLASMA_UPGRADE_COSTS[i]);
  if (s.star.plasma.lt(cost)) return false;
  s.star.plasma = s.star.plasma.sub(cost);
  s.star.upgrades[i] = true;
  return true;
}
export function buyReactor(s: GameState, step: number): boolean {
  if (step < 0 || step >= C.FUSION_STEPS) return false;
  if (step > 0 && s.star.reactors[step - 1] === 0) return false;  // Kette der Reihe nach
  const cost = reactorCost(s, step);
  if (s.star.plasma.lt(cost)) return false;
  s.star.plasma = s.star.plasma.sub(cost);
  s.star.reactors[step]++;
  return true;
}
/** Bulk-Kauf bis Budget-Anteil erschöpft — O(1) auch bei extremem Plasma (Bot) */
export function buyReactorsMax(s: GameState, step: number, budgetFrac: number): boolean {
  if (step < 0 || step >= C.FUSION_STEPS) return false;
  if (step > 0 && s.star.reactors[step - 1] === 0) return false;
  const base = D(C.REACTOR_BASE_COST[step]);
  const budget = s.star.plasma.mul(budgetFrac);
  const n = affordGeometric(budget, base, C.REACTOR_COST_GROWTH, s.star.reactors[step]);
  if (n < 1) return false;
  const cost = costGeometric(n, base, C.REACTOR_COST_GROWTH, s.star.reactors[step]);
  if (s.star.plasma.lt(cost)) return false;
  s.star.plasma = s.star.plasma.sub(cost);
  s.star.reactors[step] += n;
  return true;
}

// ── Ebene 2: Supernova ───────────────────────────────────────────────────────
function resetStarLayer(s: GameState): void {
  s.star.plasma = ZERO;
  s.star.totalPlasma = ZERO;
  s.star.elements = s.star.elements.map(() => ZERO);
  // Sternen-Gedächtnis (Singularitäts-Perk 9): L1 schützt alle Upgrades, L2 auch Reaktoren.
  // Meilenstein 10 Supernovae: Upgrades 1–6 überleben auch ohne Perk.
  const memory = s.sing.perks[8] ?? 0;
  if (memory < 2) s.star.reactors = s.star.reactors.map(() => 0);
  if (memory < 1) {
    // Meilenstein-Leiter (pro Galaxie): je Schwelle wird ein Upgrade permanent, die letzte alle übrigen
    const novae = s.stats.novaMs;
    const keep = new Set<number>();
    for (let k = 0; k < C.MS_NOVA_KEEP.length; k++) {
      if (novae < C.MS_NOVA[k + 2]) break;
      const id = C.MS_NOVA_KEEP[k];
      if (id === -1) s.star.upgrades.forEach((_, u) => keep.add(u));
      else keep.add(id);
    }
    s.star.upgrades = s.star.upgrades.map((u, i) => (keep.has(i) ? u : false));
  }
  // Roguelite: Zündungs-Meilensteine & Klassen-Picks gelten pro Supernova-Run.
  // Galaxie-Meilenstein (6 Coalescences) macht sie permanent. VOR resetDustLayer
  // nullen, damit auch die Kompressions-Persistenz (ignMs ≥ 25) mitfällt.
  if (s.stats.coalescences < C.MS_GALAXY[4]) {
    s.stats.ignMs = 0;
    s.stats.classPicks = [0, 0, 0];
  }
  resetDustLayer(s);
}

/** Supernova-Buchhaltung OHNE Auszahlung: Remnant, Leitern, Charge-Reset, Star-Layer-Reset.
 *  Vom Auto-Trickle genutzt, wenn 100 % Gewinn akkumuliert sind (Auszahlung lief bereits). */
export function supernovaReset(s: GameState, remnant: 0 | 1 | 2): void {
  s.nova.remnants[remnant]++;
  s.nova.count++;
  s.stats.supernovae++;
  s.stats.novaMs++;
  s.stats.novaTime = 0;
  s.stats.runTime = 0;
  resetStarLayer(s);
}

export function doSupernova(s: GameState, remnant: 0 | 1 | 2): boolean {
  if (!canSupernova(s)) return false;
  const m = computeMults(s);
  const gain = shardGain(s, m);
  if (gain.lte(0)) return false;   // kein Reset für +0 (z. B. Ladung noch bei 0)
  s.nova.unlocked = true;
  s.nova.shards = s.nova.shards.add(gain);
  s.nova.totalShards = s.nova.totalShards.add(gain);
  s.stats.lifetimeShards = s.stats.lifetimeShards.add(gain);
  supernovaReset(s, remnant);
  return true;
}

/**
 * Token-Modell: cellsBought = gekaufte Tokens (max 19 = Zellenzahl). Platzieren auf
 * leerer Zelle verbraucht einen freien Token (kauft bei Bedarf automatisch nach);
 * Ersetzen belegter Zellen ist GRATIS. Respec räumt ab, Tokens bleiben.
 */
export function placeNebula(s: GameState, cell: number, type: NebulaCell): boolean {
  if (cell < 0 || cell >= C.NEBULA_CELLS || type === 0) return false;
  if (s.nova.cells[cell] === type) return false;
  s.nova.cellsBought = Math.min(s.nova.cellsBought, C.NEBULA_CELLS);  // Alt-Saves normalisieren
  if (s.nova.cells[cell] === 0) {
    const placed = s.nova.cells.filter(c => c !== 0).length;
    if (placed >= s.nova.cellsBought) {
      if (s.nova.cellsBought >= C.NEBULA_CELLS) return false;
      const cost = nebulaCellCost(s);
      if (s.nova.shards.lt(cost)) return false;
      s.nova.shards = s.nova.shards.sub(cost);
      s.nova.cellsBought++;
    }
  }
  s.nova.cells[cell] = type;
  return true;
}

/** Token direkt kaufen (Platzieren auf leerer Zelle kauft weiterhin automatisch nach) */
export function buyNebulaToken(s: GameState): boolean {
  s.nova.cellsBought = Math.min(s.nova.cellsBought, C.NEBULA_CELLS);
  if (s.nova.cellsBought >= C.NEBULA_CELLS) return false;
  const cost = nebulaCellCost(s);
  if (s.nova.shards.lt(cost)) return false;
  s.nova.shards = s.nova.shards.sub(cost);
  s.nova.cellsBought++;
  return true;
}

/** Einzelnen Nebel entfernen — der Token bleibt und ist wieder frei */
export function removeNebula(s: GameState, cell: number): boolean {
  if (cell < 0 || cell >= C.NEBULA_CELLS || s.nova.cells[cell] === 0) return false;
  s.nova.cells[cell] = 0;
  return true;
}

/** Alle Nebel entfernen — Tokens bleiben erhalten (freies Umplatzieren) */
export function respecNebula(s: GameState): boolean {
  if (!s.nova.cells.some(c => c !== 0)) return false;
  s.nova.cells = s.nova.cells.map(() => 0 as NebulaCell);
  return true;
}

export function enterChallenge(s: GameState, i: number, tier: 1 | 2 = 1): boolean {
  if (!s.nova.unlocked || i < 0 || i >= C.CHALLENGE_COUNT) return false;
  if (s.stats.supernovae < C.CH_UNLOCK_NOVAE(i)) return false;
  if (s.nova.challenge !== -1) return false;
  if (tier === 2) {
    // Hard: erst ab Galaxie-Meilenstein (5 Coalescences) UND erst nachdem Normal bereits geschafft ist
    if (s.stats.coalescences < C.MS_GALAXY[3]) return false;
    if (s.nova.completedTier[i] < 1) return false;
  }
  s.nova.challenge = i;
  s.nova.challengeTier = tier;
  resetDustLayer(s);  // nur Dust-Ebene frisch — Plasma/Upgrades bleiben (Challenge = Ignition unter Restriktion)
  return true;
}
export function exitChallenge(s: GameState): boolean {
  if (s.nova.challenge === -1) return false;
  s.nova.challenge = -1;
  s.nova.challengeTier = 1;
  resetDustLayer(s);
  return true;
}

// ── Ebene 3: Coalescence ─────────────────────────────────────────────────────
function resetNovaLayer(s: GameState): void {
  s.nova.shards = ZERO;
  s.nova.totalShards = ZERO;
  // Galaxie-Meilensteine bestimmen, was die Coalescence überlebt:
  const coal = s.stats.coalescences;
  // M8 (oder Sternen-Gedächtnis L3): Nebelgarten bleibt
  if (coal < C.MS_GALAXY[7] && (s.sing.perks[8] ?? 0) < 3) {
    s.nova.cells = s.nova.cells.map(() => 0 as NebulaCell);
    s.nova.cellsBought = 0;
  }
  // M3: Challenge-Abschlüsse (inkl. Hard-Stufe) bleiben
  if (coal < C.MS_GALAXY[2]) s.nova.completedTier = s.nova.completedTier.map(() => 0);
  // M6: Supernova-Meilensteine bleiben. (Zündungs-Meilensteine resetten bereits
  // pro Supernova in resetStarLayer — gleiche M-Bedingung, keine Doppelung nötig.)
  if (coal < C.MS_GALAXY[5]) {
    s.stats.novaMs = 0;
    s.nova.autoIgnite.on = false;  // Meilenstein weg → Schalter aus, bis neu freigespielt
  }
  s.nova.remnants = [0, 0, 0];
  s.nova.count = 0;
  s.nova.pulsarPhase = 0;
  resetStarLayer(s);
}

export function doCoalesce(s: GameState, gtype: GalaxyType): boolean {
  if (!canCoalesce(s)) return false;
  if (s.nova.challenge !== -1) return false;
  const m = computeMults(s);
  const gain = dmGain(s, m);
  if (gain.lte(0)) return false;   // kein Reset für +0
  s.galaxy.unlocked = true;
  s.galaxy.dm = s.galaxy.dm.add(gain);
  s.galaxy.totalDM = s.galaxy.totalDM.add(gain);
  s.stats.lifetimeDM = s.stats.lifetimeDM.add(gain);
  s.galaxy.gtype = gtype;
  s.stats.gtypePicks[gtype]++;
  s.galaxy.count++;
  s.stats.coalescences++;
  s.stats.galaxyTime = 0;
  s.stats.novaTime = 0;
  s.stats.runTime = 0;
  resetNovaLayer(s);
  return true;
}

export function buyNode(s: GameState, i: number): boolean {
  if (!s.galaxy.unlocked || !nodeAvailable(s, i)) return false;
  const cost = nodeCost(i);
  if (s.galaxy.dm.lt(cost)) return false;
  s.galaxy.dm = s.galaxy.dm.sub(cost);
  s.galaxy.nodes[i] = true;
  return true;
}

// ── Ebene 4: Collapse ────────────────────────────────────────────────────────
function resetGalaxyLayer(s: GameState): void {
  s.galaxy.dm = ZERO;
  s.galaxy.totalDM = ZERO;
  // Meilenstein 5 Kollapse: Keystone-Nodes (Astenden) überleben
  const keepKeystones = s.stats.collapses >= C.MS_COLLAPSE[3];
  s.galaxy.nodes = s.galaxy.nodes.map((owned, i) =>
    keepKeystones && (i === 14 || i === 29 || i === 44) ? owned : false);
  s.galaxy.count = 0;
  s.stats.gtypePicks = [0, 0, 0];  // Invariante: Summe == galaxy.count
  s.galaxy.autoNova = { on: false, at: D(1), acc: 0 };
  resetNovaLayer(s);
}

export function doCollapse(s: GameState): boolean {
  if (!canCollapse(s) || s.nova.challenge !== -1) return false;
  const m = computeMults(s);
  const gain = entropyGain(s, m);
  if (gain.lte(0)) return false;   // kein Reset für +0
  s.sing.unlocked = true;
  s.sing.entropy = s.sing.entropy.add(gain);
  s.sing.totalEntropy = s.sing.totalEntropy.add(gain);
  s.stats.collapses++;
  s.sing.collapsesU++;
  s.stats.singTime = 0;
  s.stats.galaxyTime = 0;
  resetGalaxyLayer(s);
  return true;
}

export function buyPerk(s: GameState, i: number): boolean {
  if (!s.sing.unlocked || i < 0 || i >= C.PERK_COUNT) return false;
  if (i === 8 && s.sing.perks[8] >= C.STELLAR_MEMORY_MAX) return false;
  const cost = perkCost(s, i);
  if (s.sing.entropy.lt(cost)) return false;
  s.sing.entropy = s.sing.entropy.sub(cost);
  s.sing.perks[i]++;
  return true;
}

export function feedBlackHole(s: GameState): boolean {
  if (!s.sing.unlocked) return false;
  const mass = feedMass(s);
  if (mass.lte(0)) return false;
  s.sing.fed = s.sing.fed.add(mass);
  s.dust.amount = ZERO;
  s.star.plasma = ZERO;
  s.nova.shards = ZERO;
  s.galaxy.dm = ZERO;
  return true;
}

export function activateDilation(s: GameState): boolean {
  if (!s.sing.unlocked || s.sing.dilation.active || s.sing.dilation.cd > 0) return false;
  s.sing.dilation.active = true;
  s.sing.dilation.left = C.DILATION_TIME;
  return true;
}

export function newUniverse(s: GameState): boolean {
  if (s.sing.totalEntropy.lt(C.ENDGAME_ENTROPY)) return false;
  s.sing.universes++;
  s.sing.endgame = true;
  s.sing.entropy = ZERO;
  s.sing.fed = ZERO;
  s.sing.collapsesU = 0;  // NG+ startet die Kollaps-Leiter frisch
  s.sing.dilation = { active: false, left: 0, cd: 0 };
  resetGalaxyLayer(s);
  return true;
}
