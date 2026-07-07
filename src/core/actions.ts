import { D, ZERO, Decimal, affordGeometric, costGeometric, capAffordCount, addCounter } from './decimal';
import * as C from './constants';
import type { GameState, StarClass, GalaxyType, NebulaCell } from './state';
import {
  computeMults, genCost, genMaxAfford, compressionCost, clickAmount, maxTier,
  plasmaGain, canIgnite, shardGain, canSupernova, dmGain, canCoalesce,
  entropyGain, canCollapse, reactorCost, nebulaCellCost, nodeCost, nodeAvailable,
  perkCost, feedContribution, effectiveCoalescences, effectiveIgnMs, effectiveNovaMs, type Mults,
} from './formulas';

/** Teilt einen Ressourcen-Gewinn: Hälfte bleibt Spielwährung, Hälfte nährt die Leere
 *  (log-gewichtet nach Ressourcenstufe). Vor dem Singularitäts-Unlock unverändert.
 *  `gain.sub(voidShare)` statt direktem `.mul(1-FRAC)` würde bei tetrationsgroßen Gewinnen
 *  (Layer ≥ 2, „eeX"-Notation) durch Auslöschung exakt 0 ergeben — `gain` und `gain*0,5`
 *  sind an dieser Größenordnung intern ununterscheidbar, die Subtraktion kollabiert komplett.
 *  Realer Bug, 2026-07-07: fror `dust.amount` dauerhaft auf 0 ein. Direkte Multiplikation
 *  ist an jeder Größenordnung sicher (reine Mantissen-Skalierung, keine Auslöschung). */
export function feedSplit(s: GameState, weight: number, gain: Decimal): Decimal {
  if (!s.sing.unlocked || gain.lte(0)) return gain;
  const voidShare = gain.mul(C.FEED_SPLIT_FRAC);
  s.sing.fed = s.sing.fed.add(feedContribution(voidShare, weight));
  return gain.mul(1 - C.FEED_SPLIT_FRAC);
}

/** Alle Spieler-Aktionen. Geben true zurück, wenn etwas passiert ist. */

export function buyGenerator(s: GameState, m: Mults, tier: number, n: number): boolean {
  if (tier >= maxTier(s) || n < 1) return false;
  const cost = genCost(s, m, tier, n);
  if (s.dust.amount.lt(cost)) return false;
  s.dust.amount = s.dust.amount.sub(cost);
  const g = s.dust.gens[tier];
  g.amount = g.amount.add(n);
  g.bought = addCounter(g.bought, n);
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
  s.dust.compression = addCounter(s.dust.compression, 1);
  return true;
}
/** Bulk-Kauf per geschlossener Formel — O(1) auch bei Layer-2-Dust (Bot & Autobuyer).
 *  budgetFrac < 1: für den Autobuyer, s. genMaxAfford/capAffordCount. */
export function buyCompressionMax(s: GameState, budgetFrac = 1): boolean {
  if (s.nova.challenge === 0) return false;
  const base = D(C.COMPRESSION_BASE);
  const nFull = affordGeometric(s.dust.amount, base, C.COMPRESSION_GROWTH, s.dust.compression);
  const n = capAffordCount(nFull, budgetFrac);
  if (n < 1) return false;
  const cost = costGeometric(n, base, C.COMPRESSION_GROWTH, s.dust.compression);
  if (s.dust.amount.lt(cost)) return false;
  s.dust.amount = s.dust.amount.sub(cost);
  s.dust.compression = addCounter(s.dust.compression, n);
  return true;
}
export function click(s: GameState, m: Mults): Decimal {
  const gain = clickAmount(s, m);
  const credited = feedSplit(s, C.FEED_WEIGHT_DUST, gain);
  s.dust.amount = s.dust.amount.add(credited);
  s.dust.total = s.dust.total.add(gain);
  s.stats.totalDustEver = s.stats.totalDustEver.add(gain);
  s.stats.clicks++;
  return credited;
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
  // Meilenstein 25 (effektive) Zündungen: Kompression bleibt; sonst Upgrade 10: bis zu 10
  if (effectiveIgnMs(s) < C.MS_IGNITION[2]) {
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
  const credited = feedSplit(s, C.FEED_WEIGHT_PLASMA, gain);
  s.star.plasma = s.star.plasma.add(credited);
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
  s.star.reactors[step] = addCounter(s.star.reactors[step], 1);
  return true;
}
/** Bulk-Kauf bis Budget-Anteil erschöpft — O(1) auch bei extremem Plasma (Bot) */
export function buyReactorsMax(s: GameState, step: number, budgetFrac: number): boolean {
  if (step < 0 || step >= C.FUSION_STEPS) return false;
  if (step > 0 && s.star.reactors[step - 1] === 0) return false;
  const base = D(C.REACTOR_BASE_COST[step]);
  const nFull = affordGeometric(s.star.plasma, base, C.REACTOR_COST_GROWTH, s.star.reactors[step]);
  const n = capAffordCount(nFull, budgetFrac);
  if (n < 1) return false;
  const cost = costGeometric(n, base, C.REACTOR_COST_GROWTH, s.star.reactors[step]);
  if (s.star.plasma.lt(cost)) return false;
  s.star.plasma = s.star.plasma.sub(cost);
  s.star.reactors[step] = addCounter(s.star.reactors[step], n);
  return true;
}

// ── Ebene 2: Supernova ───────────────────────────────────────────────────────
function resetStarLayer(s: GameState): void {
  s.star.plasma = ZERO;
  s.star.totalPlasma = ZERO;
  // Sternen-Gedächtnis (Singularitäts-Perk 9): L1 schützt Reaktoren (die sonst NIRGENDS anders
  // persistieren), L2/L3 lassen einen Teil des Fusionsmaterials (He/C/O/Si — nicht H, das läuft
  // immer frisch an, nicht Fe, das gehört der Nova) die Supernova überstehen. Bewusst NICHT mehr
  // an den Plasma-Upgrades oder am Nebelgarten — die sind längst über die Meilenstein-Leitern
  // (MS_NOVA_KEEP, MS_GALAXY[7]) erreichbar und machten den Perk redundant.
  const memory = s.sing.perks[8] ?? 0;
  const retain = C.PERK_STELLAR_ELEMENT_RETAIN[Math.min(memory, C.PERK_STELLAR_ELEMENT_RETAIN.length - 1)];
  s.star.elements = s.star.elements.map((e, i) =>
    i >= 1 && i < C.ELEMENT_COUNT - 1 && retain > 0 ? e.mul(retain) : ZERO);
  if (memory < 1) s.star.reactors = s.star.reactors.map(() => 0);
  // Meilenstein-Leiter (pro Galaxie, effektiv): je Schwelle wird ein Upgrade permanent, die
  // letzte alle übrigen
  const novae = effectiveNovaMs(s);
  const keep = new Set<number>();
  for (let k = 0; k < C.MS_NOVA_KEEP.length; k++) {
    if (novae < C.MS_NOVA[k + 2]) break;
    const id = C.MS_NOVA_KEEP[k];
    if (id === -1) s.star.upgrades.forEach((_, u) => keep.add(u));
    else keep.add(id);
  }
  s.star.upgrades = s.star.upgrades.map((u, i) => (keep.has(i) ? u : false));
  // Roguelite: Zündungs-Meilensteine & Klassen-Picks gelten pro Supernova-Run.
  // Galaxie-Meilenstein (6 Coalescences) macht sie permanent. VOR resetDustLayer
  // nullen, damit auch die Kompressions-Persistenz (ignMs ≥ 25) mitfällt.
  if (effectiveCoalescences(s) < C.MS_GALAXY[4]) {
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
  const credited = feedSplit(s, C.FEED_WEIGHT_SHARDS, gain);
  s.nova.shards = s.nova.shards.add(credited);
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
    // Hard: erst ab Galaxie-Meilenstein (5 Verschmelzungen, effektiv) UND erst nachdem Normal bereits geschafft ist
    if (effectiveCoalescences(s) < C.MS_GALAXY[3]) return false;
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
  // Galaxie-Meilensteine bestimmen, was die Coalescence überlebt (effektiv, s. coalescenceBonusMult):
  const coal = effectiveCoalescences(s);
  // M8: Nebelgarten bleibt
  if (coal < C.MS_GALAXY[7]) {
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
  // Remnants überleben die Verschmelzung: entweder M9 (50 effektive Verschmelzungen, DIESEN
  // Run) oder Meilenstein 4 Kollapse (permanent, über jeden künftigen Run hinweg) — sonst kann
  // die Spezial-Meilenstein-Leiter (remnantTier, ab 2 Kollapsen) nie über einen einzelnen
  // Galaxie-Run hinaus wachsen, da sie direkt an s.nova.remnants hängt.
  if (coal < C.MS_GALAXY[8] && s.stats.collapses < C.MS_COLLAPSE[3]) s.nova.remnants = [0, 0, 0];
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
  const credited = feedSplit(s, C.FEED_WEIGHT_DM, gain);
  s.galaxy.dm = s.galaxy.dm.add(credited);
  s.galaxy.totalDM = s.galaxy.totalDM.add(gain);
  s.stats.lifetimeDM = s.stats.lifetimeDM.add(gain);
  s.stats.gtypePicks[gtype]++;   // wirkt permanent & stapelnd (siehe computeMults) — kein „aktiver" Typ mehr
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
  const keepKeystones = s.stats.collapses >= C.MS_COLLAPSE[4];
  s.galaxy.nodes = s.galaxy.nodes.map((owned, i) =>
    keepKeystones && (i === 14 || i === 29 || i === 44) ? owned : false);
  s.galaxy.count = 0;
  s.stats.gtypePicks = [0, 0, 0];  // Invariante: Summe == galaxy.count
  s.galaxy.autoNova = { on: false, at: D(1), acc: 0 };
  resetNovaLayer(s);   // liest effectiveCoalescences() VOR dem Reset — Persistenz-Checks nutzen den alten Stand
  s.stats.coalescences = 0;   // frische Verschmelzungs-Leiter je Galaxie; coalescenceBonusMult() gleicht das aus
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

export function newUniverse(s: GameState): boolean {
  if (s.sing.totalEntropy.lt(C.ENDGAME_ENTROPY)) return false;
  s.sing.universes++;
  s.sing.endgame = true;
  s.sing.entropy = ZERO;
  s.sing.fed = ZERO;
  s.sing.collapsesU = 0;  // NG+ startet die Kollaps-Leiter frisch
  resetGalaxyLayer(s);
  return true;
}
