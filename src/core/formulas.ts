import { Decimal, D, ZERO, ONE, affordGeometric, costGeometric, softpow, capAffordCount } from './decimal';
import * as C from './constants';
import type { GameState } from './state';

// computeMults() läuft potenziell Millionen Mal (Sim/lange Sessions) und baut mit D(10)/D(2)
// & Co. jedes Mal denselben kleinen Decimal neu — als Konstante gecacht spart das die
// wiederholte Allokation im heißesten Pfad des Spiels (siehe BALANCE.md „Sim-Performance").
const TEN = D(10);
const TWO = D(2);
const ACH_MULT_D = D(C.ACH_MULT);
const PERK_HAWKING_H_D = D(C.PERK_HAWKING_H);

// ── Hex-Grid (19 Zellen, Radius 2, axiale Koordinaten) ──────────────────────
export const HEX_COORDS: [number, number][] = (() => {
  const out: [number, number][] = [];
  for (let q = -2; q <= 2; q++)
    for (let r = -2; r <= 2; r++)
      if (Math.abs(q + r) <= 2) out.push([q, r]);
  return out;
})();
export const HEX_NEIGHBORS: number[][] = HEX_COORDS.map(([q, r]) =>
  HEX_COORDS.reduce<number[]>((acc, [q2, r2], j) => {
    const dq = q2 - q, dr = r2 - r;
    if ([[1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1]].some(([a, b]) => a === dq && b === dr)) acc.push(j);
    return acc;
  }, []));

// ── Konstellations-Skilltree: 3 Äste à 15 Nodes ──────────────────────────────
// Effekt-Typen: Werte werden in computeMults angewandt. branch 0=Gravity 1=Time 2=Light
export type NodeEffect =
  | { t: 'dust'; v: number } | { t: 'genCost'; v: number } | { t: 'allGens'; v: number }
  | { t: 'plasmaGain'; v: number } | { t: 'shardGain'; v: number } | { t: 'dustExp'; v: number }
  | { t: 'speed'; v: number } | { t: 'offline'; v: number } | { t: 'fusion'; v: number }
  | { t: 'cometDur'; v: number } | { t: 'pulsarPeriod'; v: number }
  | { t: 'click'; v: number } | { t: 'cometChance'; v: number } | { t: 'cometBoost'; v: number }
  | { t: 'nebula'; v: number } | { t: 'all'; v: number };

export const NODE_EFFECTS: NodeEffect[] = [
  // Gravity (0–14)
  { t: 'dust', v: 4 }, { t: 'genCost', v: 4 }, { t: 'dust', v: 8 }, { t: 'allGens', v: 2 },
  { t: 'plasmaGain', v: 2 }, { t: 'dust', v: 16 }, { t: 'genCost', v: 8 }, { t: 'shardGain', v: 2 },
  { t: 'dust', v: 64 }, { t: 'allGens', v: 3 }, { t: 'plasmaGain', v: 4 }, { t: 'dust', v: 256 },
  { t: 'shardGain', v: 4 }, { t: 'genCost', v: 64 }, { t: 'dustExp', v: 0.03 },
  // Time (15–29)
  { t: 'speed', v: 1.1 }, { t: 'offline', v: 1.25 }, { t: 'fusion', v: 2 }, { t: 'speed', v: 1.15 },
  { t: 'speed', v: 1.25 }, { t: 'cometDur', v: 2 }, { t: 'speed', v: 1.15 }, { t: 'fusion', v: 3 },
  { t: 'offline', v: 1.5 }, { t: 'speed', v: 1.2 }, { t: 'pulsarPeriod', v: 0.8 }, { t: 'fusion', v: 4 },
  { t: 'speed', v: 1.2 }, { t: 'offline', v: 2 }, { t: 'speed', v: 1.5 },
  // Light (30–44)
  { t: 'click', v: 4 }, { t: 'cometChance', v: 1.5 }, { t: 'all', v: 1.1 }, { t: 'click', v: 8 },
  { t: 'cometBoost', v: 1 }, { t: 'nebula', v: 1.25 }, { t: 'click', v: 16 }, { t: 'cometChance', v: 2 },
  { t: 'nebula', v: 1.25 }, { t: 'click', v: 64 }, { t: 'all', v: 1.15 }, { t: 'cometBoost', v: 2 },
  { t: 'click', v: 256 }, { t: 'nebula', v: 1.5 }, { t: 'all', v: 1.25 },
];

/** Gecachte Multiplikatoren — einmal pro Tick berechnet, überall gelesen (auch UI). */
export interface Mults {
  speed: number;              // globaler Zeitfaktor (Perks, Time-Ast, Dilation, NICHT auf Realzeit-Timer)
  dustMult: Decimal;          // × auf Dust-Output (Stufe 1 → Dust)
  allGenMult: Decimal;        // × auf jede Generator-Stufe
  genCostDiv: Decimal;        // Kostenteiler
  genCostExp: number;         // Kosten-Exponent (Challenge 4)
  compressionEffect: number;  // pro Compression-Stufe
  clickMult: Decimal;
  cometChance: number;
  cometBoostMult: number;
  cometDur: number;
  hRate: Decimal;
  fusionMult: number;
  plasmaGainMult: Decimal;
  plasmaGainExp: number;
  shardGainMult: Decimal;
  dmGainMult: Decimal;
  entropyGainMult: Decimal;
  pulsarBurst: number;        // aktueller Burst-Faktor (1 wenn inaktiv)
  pulsarPeriod: number;
  offlineMult: number;
  nebulaDustMult: Decimal;    // aus Emission-Zellen
  nebulaPlasmaMult: Decimal;  // aus Reflexions-Zellen
  feNebulaMult: Decimal;      // Galaxie-Meilenstein 2: Reflexionsnebel boosten auch Fe-Output
  nebulaNodeMult: number;     // Konstellations-Verstärkung der Zell-Multiplikatoren
  autoNovaUnlocked: boolean;
}

const log10p1 = (d: Decimal) => Decimal.max(d, 0).add(1).log10();

/** Akkretions-Bonus aus "Füttere die Leere": global mult = (1+log10(1+fed))^exp. */
export function accretionMult(s: GameState): Decimal {
  return s.sing.fed.gt(0) ? log10p1(s.sing.fed).add(1).pow(C.FEED_ACCRETION_EXP) : ONE;
}
/** Zeitdilation: dauerhafter Speed-Bonus als Bruchteil des Akkretions-Bonus — kein Button,
 *  kein Timer/Cooldown mehr. Ohne Fütterung (accretion=1) kein Bonus. `.toNumber()` ist hier
 *  sicher: log10(fed) müsste ~1e154 erreichen, bevor das Quadrat einen Double überläuft. */
export function dilationMult(s: GameState): number {
  const excess = accretionMult(s).sub(1).toNumber();
  const raw = Number.isFinite(excess) ? 1 + C.DILATION_ACCRETION_FRAC * excess : 1;
  return Math.min(raw, C.DILATION_MAX_MULT);
}

/**
 * Effektiver Multiplikator einer Nebula-Zelle: Basis (×3 Emission / ×2 Reflection),
 * jeder dunkle Nachbar VERDOPPELT ihn (×2, wie im Spieltext versprochen). Sicher,
 * weil hart durch die Hex-Geometrie gedeckelt (max. 6 Nachbarn ⇒ max. ×64) und
 * nur der lineare Multiplikator skaliert — nie ein Exponent.
 */
export function nebulaCellMult(s: GameState, i: number, nebulaNodeMult: number): number {
  const t = s.nova.cells[i];
  if (t === 0 || t === 3) return 1;
  let darks = 0;
  for (const n of HEX_NEIGHBORS[i]) if (s.nova.cells[n] === 3) darks++;
  const base = t === 1 ? C.NEBULA_EMISSION_MULT : C.NEBULA_REFLECTION_MULT;
  return (1 + (base - 1) * nebulaNodeMult) * Math.pow(C.NEBULA_DARK_BONUS, darks);
}

export function computeMults(s: GameState): Mults {
  const ch = s.nova.challenge;
  const tier = s.nova.completedTier;   // 0 = offen, 1 = Normal, 2 = Hard — Hard-Boni stapeln auf Normal
  const nodes = s.galaxy.nodes;
  // Galaxientyp-Boni stapeln wie Remnants: jede Wahl zählt, alle drei wirken gleichzeitig
  const gp = s.stats.gtypePicks;
  const gtAll = Math.pow(C.GALAXY_TYPE_ALL, gp[0]);
  const gtOffline = Math.pow(C.GALAXY_TYPE_OFFLINE, gp[1]);
  const gtActive = Math.pow(C.GALAXY_TYPE_ACTIVE, gp[2]);
  const perks = s.sing.perks;

  // — Node-Effekte einsammeln —
  let nSpeed = 1, nOffline = 1, nFusion = 1, nCometDur = 1, nPulsarPeriod = 1, nCometBoost = 0,
    nCometChance = 1, nNebula = 1, nDustExp = 0;
  let nDust = ONE, nGenCost = ONE, nAllGens = ONE, nPlasma = ONE, nShard = ONE, nClick = ONE, nAll = ONE;
  if (s.galaxy.unlocked || s.stats.coalescences > 0) {
    for (let i = 0; i < C.CONSTELLATION_NODES; i++) {
      if (!nodes[i]) continue;
      const e = NODE_EFFECTS[i];
      switch (e.t) {
        case 'dust': nDust = nDust.mul(e.v); break;
        case 'genCost': nGenCost = nGenCost.mul(e.v); break;
        case 'allGens': nAllGens = nAllGens.mul(e.v); break;
        case 'plasmaGain': nPlasma = nPlasma.mul(e.v); break;
        case 'shardGain': nShard = nShard.mul(e.v); break;
        case 'dustExp': nDustExp += e.v; break;
        case 'speed': nSpeed *= e.v; break;
        case 'offline': nOffline *= e.v; break;
        case 'fusion': nFusion *= e.v; break;
        case 'cometDur': nCometDur *= e.v; break;
        case 'pulsarPeriod': nPulsarPeriod *= e.v; break;
        case 'click': nClick = nClick.mul(e.v); break;
        case 'cometChance': nCometChance *= e.v; break;
        case 'cometBoost': nCometBoost += e.v; break;
        case 'nebula': nNebula *= e.v; break;
        case 'all': nAll = nAll.mul(e.v); break;
      }
    }
  }

  // — Achievements —
  const achCount = s.achievements.reduce((a, b) => a + (b ? 1 : 0), 0);
  const achMult = ACH_MULT_D.pow(achCount);

  // — Singularity: Perks, Akkretion, NG+ —
  const accretion = accretionMult(s);
  const perkDust = TEN.pow(perks[0]);                       // Event Horizon
  const prestigeMult = TWO.pow(perks[4]);                   // Ergosphere
  const perkSpeed = 1 + 0.25 * perks[2];                    // Frame Drag
  const perkFusion = 1 + 0.5 * perks[3];                    // Spaghettification
  const perkClick = TEN.pow(perks[5]);                      // Photon Sphere
  const perkDM = D(1 + perks[6]);                           // Deep Gravity
  const perkHawking = perks[1];                             // (in tick verwendet)
  void perkHawking;
  const ngMult = TEN.pow(s.sing.universes);
  const ngPrestige = TWO.pow(s.sing.universes);

  // — Dilation & Pulsar —
  const dilation = dilationMult(s);
  const pulsarPeriod = C.REMNANT_PULSAR_PERIOD * nPulsarPeriod;
  const rp = remnantParams(s);
  const pulsarActive = s.nova.remnants[1] > 0 && s.nova.pulsarPhase < rp.pulsarDur;
  const pulsarBurst = pulsarActive ? C.REMNANT_PULSAR_MULT + rp.pulsarPer * (s.nova.remnants[1] - 1) : 1;

  // — Elemente (He C O Si boosts) —
  const el = s.star.elements;
  const elBoost = (i: number) => log10p1(el[i]).add(1).pow(C.ELEMENT_BOOST_EXP[i]);
  const heBoost = elBoost(1), cBoost = elBoost(2), oBoost = elBoost(3), siBoost = elBoost(4);

  // — Plasma-Effekt auf Dust —
  let plasmaDustExp = C.PLASMA_DUST_EXP + 0.08 * tier[5];
  if (ch === 5) plasmaDustExp *= 0.5;                       // Challenge 6: Dim Star
  const plasmaDust = s.star.plasma.add(1).pow(plasmaDustExp);

  // — Nebula: Produkt der Zell-Multiplikatoren (linear gestapelt, gedeckelt durch 19 Zellen) —
  let nebulaDustMult = ONE, nebulaPlasmaMult = ONE;
  for (let i = 0; i < C.NEBULA_CELLS; i++) {
    const t = s.nova.cells[i];
    if (t === 1) nebulaDustMult = nebulaDustMult.mul(nebulaCellMult(s, i, nNebula));
    else if (t === 2) nebulaPlasmaMult = nebulaPlasmaMult.mul(nebulaCellMult(s, i, nNebula));
  }

  // — Kometen-Boost —
  const cometBoostMult = C.COMET_BOOST_MULT + 2 * tier[4] + nCometBoost;
  const cometActive = s.dust.comet.boost > 0 ? cometBoostMult : 1;

  // — Kaskaden-Passiveffekte höherer Ebenen (Lifetime-Basen, resetten nie) —
  const shardDust = s.stats.lifetimeShards.add(1).pow(C.SHARD_DUST_EXP);
  const dmAll = s.stats.lifetimeDM.add(1).pow(C.DM_ALL_EXP);
  const entropyAll = s.sing.totalEntropy.add(1).pow(C.ENTROPY_ALL_EXP);

  // — Global zusammensetzen —
  const globalMult = achMult.mul(accretion).mul(nAll).mul(ngMult).mul(gtAll).mul(pulsarBurst)
    .mul(dmAll).mul(entropyAll);

  let dustMult = plasmaDust.mul(heBoost).mul(nebulaDustMult).mul(nDust).mul(perkDust).mul(globalMult)
    .mul(cometActive).mul(shardDust);
  if (tier[6] > 0) dustMult = dustMult.mul(Decimal.pow(1.25, tier[6]));  // Challenge-7-Belohnung (Hard: nochmal ×1,25)
  if (nDustExp + 0.01 * perks[7] > 0) dustMult = dustMult.pow(1 + nDustExp + 0.01 * perks[7]);

  let allGenMult = nAllGens.mul(globalMult);
  if (tier[1] > 0) allGenMult = allGenMult.mul(Decimal.pow(2, tier[1]));  // Challenge-2-Belohnung (Hard: ×4 statt ×2)

  const speed = nSpeed * perkSpeed * dilation;

  const compressionEffect = C.COMPRESSION_EFFECT
    + 0.10 * tier[0]
    + (s.star.upgrades[3] ? 0.05 : 0)
    + siBoost.sub(1).toNumber() * 0.02;                     // Si verstärkt Compression leicht

  let clickMult = oBoost.mul(nClick).mul(perkClick).mul(cometActive).mul(gtActive);
  if (s.star.upgrades[7]) clickMult = clickMult.mul(5);

  const hRate = s.star.unlocked
    ? s.star.totalPlasma.add(1).pow(C.H_RATE_EXP).mul(C.STAR_CLASSES[s.star.cls].speed)
        .mul(s.star.upgrades[6] ? 3 : 1)
        .mul(s.stats.lifetimeShards.add(1).pow(C.SHARD_H_EXP))
        .mul(dmAll).mul(entropyAll)
        // Hawking-Strahlung: GEOMETRISCHER Motor der Singularitäts-Phase — jeder Kollaps
        // finanziert Level, die den nächsten Kollaps tragen (sonst polynomieller Kriechgang)
        .mul(PERK_HAWKING_H_D.pow(perks[1]))
    : ZERO;

  let fusionMult = nFusion * perkFusion
    * Math.pow(rp.neutronBase, s.nova.remnants[0])
    * Math.pow(2, tier[2])   // Challenge-3-Belohnung (Hard: ×4 statt ×2)
    * (s.star.upgrades[10] ? 2 : 1);
  if (ch === 2) fusionMult *= 0.1;                          // Challenge 3: Slow Burn

  const plasmaGainMult = nebulaPlasmaMult.mul(nPlasma).mul(prestigeMult).mul(ngPrestige)
    .mul(C.STAR_CLASSES[s.star.cls].plasmaGain).mul(D(1 + s.sing.perks[1]));
  const plasmaGainExp = C.PLASMA_EXP + (s.star.upgrades[11] ? 0.05 : 0);

  const shardGainMult = nShard.mul(prestigeMult).mul(ngPrestige)
    .mul(D(1 + s.sing.perks[1]));

  const dmGainMult = perkDM.mul(prestigeMult).mul(ngPrestige);
  const entropyGainMult = prestigeMult.mul(ngPrestige);

  let genCostDiv = cBoost.mul(nGenCost);
  if (tier[3] > 0) genCostDiv = genCostDiv.mul(Decimal.pow(2, tier[3]));  // Challenge-4-Belohnung (Hard: ÷4 statt ÷2)
  if (s.star.upgrades[2]) {
    const discovered = s.star.elements.filter(e => e.gt(0)).length;
    genCostDiv = genCostDiv.mul(Math.pow(1.1, discovered));
  }

  return {
    speed,
    dustMult, allGenMult, genCostDiv,
    genCostExp: ch === 3 ? C.CH4_COST_EXP : 1,
    compressionEffect,
    clickMult,
    cometChance: C.COMET_CHANCE_PER_SEC * nCometChance,
    cometBoostMult,
    cometDur: C.COMET_BOOST_TIME * (s.star.upgrades[5] ? 2 : 1) * nCometDur,
    hRate,
    fusionMult,
    plasmaGainMult, plasmaGainExp,
    shardGainMult, dmGainMult, entropyGainMult,
    pulsarBurst, pulsarPeriod,
    offlineMult: nOffline * gtOffline,
    nebulaDustMult,
    nebulaPlasmaMult,
    feNebulaMult: effectiveCoalescences(s) >= C.MS_GALAXY[1] ? nebulaPlasmaMult : ONE,
    nebulaNodeMult: nNebula,
    autoNovaUnlocked: effectiveCoalescences(s) >= C.MS_GALAXY[6],  // 10. (effektive) Verschmelzung
  };
}

// ── Generatoren ──────────────────────────────────────────────────────────────
export function genCost(s: GameState, m: Mults, tier: number, n = 1): Decimal {
  const base = D(C.GEN_BASE_COST[tier]).div(m.genCostDiv);
  let c = costGeometric(n, base, C.GEN_GROWTH[tier], s.dust.gens[tier].bought);
  if (m.genCostExp !== 1) c = c.pow(m.genCostExp);
  return c;
}
/** budgetFrac < 1: für Autobuyer — verhindert, dass eine Stufe den gesamten Staub verschlingt
 *  und tiefere/teurere Stufen (die im selben Tick danach drankommen) leer ausgehen. Reduziert die
 *  Kaufmenge (nicht das Decimal-Budget, s. capAffordCount) — bleibt auch bei Layer-2-Staub wirksam. */
export function genMaxAfford(s: GameState, m: Mults, tier: number, budgetFrac = 1): number {
  const base = D(C.GEN_BASE_COST[tier]).div(m.genCostDiv);
  let budget = s.dust.amount;
  if (m.genCostExp !== 1) budget = budget.root(m.genCostExp);
  const nFull = affordGeometric(budget, base, C.GEN_GROWTH[tier], s.dust.gens[tier].bought);
  return capAffordCount(nFull, budgetFrac);
}
/** Produktion-Multiplikator einer Stufe (ohne dt), inkl. Basisrate der Stufe */
export function tierMult(s: GameState, m: Mults, tier: number): Decimal {
  let mult = D(C.GEN_MULT_PER_10).pow(Math.floor(s.dust.gens[tier].bought / 10))
    .mul(Decimal.pow(m.compressionEffect, s.dust.compression))  // Decimal: Number-Overflow ab ~5000 Stufen
    .mul(m.allGenMult)
    .mul(C.GEN_RATE[tier]);
  // Challenge-8-Belohnung: Normal ×8, Hard ×16
  if (tier === 0 && s.nova.completedTier[7] > 0) mult = mult.mul(s.nova.completedTier[7] >= 2 ? 16 : 8);
  // Spezial-Meilenstein (ab 3 Kollapsen): je 100 Käufe dieser Stufe im Run → Output ×3
  if (s.stats.collapses >= C.MS_COLLAPSE[2]) {
    const steps = Math.floor(s.dust.gens[tier].bought / C.SPECIAL_GEN_STEP);
    if (steps > 0) mult = mult.mul(Decimal.pow(C.SPECIAL_GEN_MULT, steps));
  }
  return mult;
}
/** Dust/s in Echtzeit (für UI & Klick) — tierMult/dustMult sind Pro-Spielsekunde-Raten,
 *  `m.speed` skaliert Spielzeit zu Echtzeit (s. gdt in tick.ts); ohne diesen Faktor würde der
 *  Time-Ast (Spielgeschwindigkeit-Nodes) hier unsichtbar bleiben, obwohl er real wirkt. */
export function dustPerSecond(s: GameState, m: Mults): Decimal {
  return s.dust.gens[0].amount.mul(tierMult(s, m, 0)).mul(m.dustMult).mul(m.speed);
}
export function compressionCost(s: GameState): Decimal {
  return D(C.COMPRESSION_BASE).mul(Decimal.pow(C.COMPRESSION_GROWTH, s.dust.compression));
}
export function clickAmount(s: GameState, m: Mults): Decimal {
  return D(C.CLICK_BASE).add(dustPerSecond(s, m).mul(C.CLICK_FRACTION)).mul(m.clickMult);
}
/** höchste in diesem Challenge-Modus erlaubte Generator-Stufe (exklusiv) */
export function maxTier(s: GameState): number {
  if (s.nova.challenge === 7) return 1;   // Singular Focus
  if (s.nova.challenge === 1) return 4;   // Sparse Matter
  return C.GEN_COUNT;
}

// ── Prestige-Gains ───────────────────────────────────────────────────────────
/** Zündschwelle: in Challenges eskaliert das Ziel je Challenge-Index */
export function igniteReq(s: GameState): Decimal {
  const ch = s.nova.challenge;
  if (ch < 0) return D(C.IGNITION_REQ);
  const mult = s.nova.challengeTier >= 2 ? C.CH_GOAL_MULT_TIER2[ch] : C.CH_GOAL_MULT[ch];
  return D(C.IGNITION_REQ).mul(mult);
}
export function plasmaGain(s: GameState, m: Mults): Decimal {
  if (s.dust.total.lt(igniteReq(s))) return ZERO;
  const raw = softpow(s.dust.total.div(C.IGNITION_REQ), m.plasmaGainExp, C.GAIN_SOFTCAP, C.GAIN_TAIL_EXP)
    .mul(m.plasmaGainMult);
  // Clamp auch hier (sonst divergiert die Zündschleife bei Layer-2-Dust), aber mit
  // Innenloop-Faktor ×20 — sonst verhungert die Fe-Pipeline darüber
  return clampGain(raw, s.star.totalPlasma, C.PLASMA_CLAMP_MULT);
}
export function canIgnite(s: GameState): boolean { return s.dust.total.gte(igniteReq(s)); }

/** Eskalierende Fe-Anforderung — zählt nur Novae SEIT der letzten Coalescence:
 *  frische Galaxie = frische Leiter (verhindert permanente Walls, hält NG+ sauber) */
export function novaReq(s: GameState): Decimal {
  return D(C.SUPERNOVA_REQ).mul(Decimal.pow(C.NOVA_REQ_GROWTH, Math.min(s.nova.count, C.NOVA_LADDER_CAP)));
}
/** Wachstum pro Reset hart gedeckelt — Pacing bleibt Kadenz-getrieben */
function clampGain(raw: Decimal, total: Decimal, mult: number = C.GAIN_CLAMP_MULT): Decimal {
  return Decimal.min(raw, total.mul(mult).add(C.GAIN_CLAMP_FLOOR)).floor();
}

/** Spezial-Meilenstein-Stufe eines Remnant-Typs (ab 2. Kollaps; je 10 Stück eine Stufe) */
export function remnantTier(s: GameState, type: 0 | 1 | 2): number {
  if (s.stats.collapses < C.MS_COLLAPSE[1]) return 0;
  return Math.floor(s.nova.remnants[type] / C.SPECIAL_REMNANT_STEP);
}
/** Effektive Remnant-Parameter inkl. Spezial-Meilensteinen — eine Quelle für Formeln & UI */
export function remnantParams(s: GameState): { neutronBase: number; pulsarPer: number; pulsarDur: number; bhPer: number } {
  return {
    neutronBase: C.REMNANT_NEUTRON_FUSION + C.SPECIAL_NEUTRON_BONUS * remnantTier(s, 0),
    pulsarPer: C.REMNANT_PULSAR_PER + C.SPECIAL_PULSAR_BONUS * remnantTier(s, 1),
    // Dauer wächst mit: Stufe 5 (50 Pulsare) erreicht den 60-s-Zyklus → permanent aktiv
    pulsarDur: C.REMNANT_PULSAR_DURATION + C.SPECIAL_PULSAR_DUR * remnantTier(s, 1),
    bhPer: C.REMNANT_BH_SHARDS + C.SPECIAL_BH_BONUS * remnantTier(s, 2),
  };
}

/** Aktueller Clamp-Deckel eines Layers — fürs UI („mehr als das geht gerade nicht") */
export function gainCapBound(total: Decimal, mult: number = C.GAIN_CLAMP_MULT): Decimal {
  return total.mul(mult).add(C.GAIN_CLAMP_FLOOR).floor();
}

/** Galaxie-Reset-Bonus: jeder Collapse setzt stats.coalescences zurück, hebt aber diesen
 *  Multiplikator dauerhaft um +1 an (×1 vor dem ersten Collapse, ×2 danach, ×3 nach dem
 *  zweiten, ...) — gleicht den Reset für Verschmelzungs-Meilensteine aus. */
export function coalescenceBonusMult(s: GameState): number {
  return 1 + s.stats.collapses * C.COALESCENCE_BONUS_PER_COLLAPSE;
}
/** Effektive Verschmelzungszahl — ersetzt den rohen `stats.coalescences` überall im Gating
 *  UND in der Anzeige, da der rohe Zähler pro Collapse auf 0 fällt. */
export function effectiveCoalescences(s: GameState): number {
  return s.stats.coalescences * coalescenceBonusMult(s);
}

/** Scherben-Clamp-Multiplikator: Schwarze Löcher heben den Deckel selbst an (statt nur den
 *  Rohwert vor dem Clamp zu boosten, was oberhalb des Deckels wirkungslos verpufft). */
export function shardClampMult(s: GameState): number {
  const rp = remnantParams(s);
  return C.GAIN_CLAMP_MULT + rp.bhPer * s.nova.remnants[2];
}

/** Aufladefortschritt (0..1) seit dem letzten Reset dieser Ebene — verhindert Reset-Spam:
 *  der Gewinn erreicht sein volles Potential erst nach `*_MIN_TIME` Echtzeit. Ignite hat
 *  keine Aufladezeit (immer voll). Wächst rein mit der Zeit, NICHT mit neuen Ressourcen —
 *  das ist der Grund, warum die Gewinn-Vorschau auch ohne frische Ressourcen langsam steigt. */
export function chargeFrac(s: GameState, layer: 'ignite' | 'nova' | 'coalesce' | 'collapse'): number {
  if (layer === 'ignite') return 1;
  if (layer === 'nova') return Math.min(1, s.stats.novaTime / C.NOVA_MIN_TIME);
  if (layer === 'coalesce') return Math.min(1, s.stats.galaxyTime / C.GALAXY_MIN_TIME);
  return Math.min(1, s.stats.singTime / C.COLLAPSE_MIN_TIME);
}

/**
 * Umkehrung der Gain-Formel fürs UI: Wie viel der zugrunde liegenden Währung nötig ist,
 * damit der (noch ungeclampte) Gewinn den Clamp-Deckel erreicht — dann lohnt der Reset.
 * Rechnet mit der AKTUELLEN Aufladung; gibt null zurück, wenn schon am Deckel oder Gain 0.
 * Nur einmal beim Tooltip-Öffnen aufrufen (keine Live-Schleife).
 */
export function currencyForCap(
  s: GameState, m: Mults, layer: 'ignite' | 'nova' | 'coalesce' | 'collapse',
): { target: Decimal; current: Decimal } | null {
  if (layer === 'ignite') {
    if (s.dust.total.lt(igniteReq(s))) return null;
    const cap = gainCapBound(s.star.totalPlasma, C.PLASMA_CLAMP_MULT);
    const y = cap.div(m.plasmaGainMult);                       // Ziel-Rohwert der Softpow
    const capRatio = Decimal.pow(C.GAIN_SOFTCAP, m.plasmaGainExp);
    const ratio = y.lte(capRatio)
      ? y.pow(1 / m.plasmaGainExp)
      : D(C.GAIN_SOFTCAP).mul(y.div(capRatio).pow(1 / C.GAIN_TAIL_EXP));
    const target = D(C.IGNITION_REQ).mul(ratio);
    return s.dust.total.gte(target) ? null : { target, current: s.dust.total };
  }
  let current: Decimal, req: Decimal, exp: number, mult: Decimal, cap: Decimal;
  if (layer === 'nova') {
    current = s.star.elements[5]; req = novaReq(s); exp = C.SHARD_EXP;
    mult = m.shardGainMult;
    cap = gainCapBound(s.nova.totalShards, shardClampMult(s));
  } else if (layer === 'coalesce') {
    current = s.nova.totalShards; req = coalesceReq(s); exp = C.DM_EXP;
    mult = m.dmGainMult;
    cap = gainCapBound(s.galaxy.totalDM);
  } else {
    current = s.galaxy.totalDM; req = collapseReq(s); exp = C.ENTROPY_EXP;
    mult = m.entropyGainMult;
    cap = gainCapBound(s.sing.totalEntropy);
  }
  const charge = chargeFrac(s, layer);
  if (current.lt(req) || charge <= 0 || mult.lte(0)) return null;
  // (currency/req)^exp * mult * charge = cap → currency = req * (cap/(mult*charge))^(1/exp)
  const target = req.mul(cap.div(mult.mul(charge)).pow(1 / exp));
  return current.gte(target) ? null : { target, current };
}

/** Ist der angezeigte Gain am Clamp-Deckel? (→ UI: „jetzt resetten, mehr geht nicht") */
export function isGainCapped(gain: Decimal, total: Decimal, mult: number = C.GAIN_CLAMP_MULT): boolean {
  return gain.gt(0) && gain.gte(total.mul(mult).add(C.GAIN_CLAMP_FLOOR).floor());
}

export function shardGain(s: GameState, m: Mults): Decimal {
  const fe = s.star.elements[5];
  const req = novaReq(s);
  if (fe.lt(req)) return ZERO;
  const charge = chargeFrac(s, 'nova');
  // kein Softcap nötig: der ×4-Clamp begrenzt hart, Overkill soll sich lohnen
  const raw = fe.div(req).pow(C.SHARD_EXP).mul(m.shardGainMult).mul(charge);
  return clampGain(raw, s.nova.totalShards, shardClampMult(s));
}
export function canSupernova(s: GameState): boolean { return s.star.elements[5].gte(novaReq(s)); }

/** Eskalierende Anforderung — zählt nur Coalescences seit dem letzten Collapse, gecappt */
export function coalesceReq(s: GameState): Decimal {
  return D(C.COALESCE_REQ).mul(Decimal.pow(C.COALESCE_REQ_GROWTH, Math.min(s.galaxy.count, C.GALAXY_LADDER_CAP)));
}
export function dmGain(s: GameState, m: Mults): Decimal {
  const req = coalesceReq(s);
  if (s.nova.totalShards.lt(req)) return ZERO;
  const charge = chargeFrac(s, 'coalesce');
  const raw = s.nova.totalShards.div(req).pow(C.DM_EXP).mul(m.dmGainMult).mul(charge);
  return clampGain(raw, s.galaxy.totalDM);
}
export function canCoalesce(s: GameState): boolean { return s.nova.totalShards.gte(coalesceReq(s)); }

/** Quadratische Leiter: Exponent n(n+1)/2 — jeder Kollaps verachtfacht den Multiplikator selbst.
 *  Nötig, weil der DM-Motor jede geometrische Leiter überholt (empirisch: 4 Kollapse/Tag). */
export function collapseReq(s: GameState): Decimal {
  const n = s.sing.collapsesU;
  return D(C.COLLAPSE_REQ).mul(Decimal.pow(C.COLLAPSE_REQ_GROWTH, (n * (n + 1)) / 2));
}
export function entropyGain(s: GameState, m: Mults): Decimal {
  const req = collapseReq(s);
  if (s.galaxy.totalDM.lt(req)) return ZERO;
  const charge = chargeFrac(s, 'collapse');
  const raw = s.galaxy.totalDM.div(req).pow(C.ENTROPY_EXP).mul(m.entropyGainMult).mul(charge);
  return clampGain(raw, s.sing.totalEntropy);
}
export function canCollapse(s: GameState): boolean { return s.galaxy.totalDM.gte(collapseReq(s)); }

// ── Kosten weiterer Systeme ──────────────────────────────────────────────────
export function reactorCost(s: GameState, step: number): Decimal {
  return D(C.REACTOR_BASE_COST[step]).mul(Decimal.pow(C.REACTOR_COST_GROWTH, s.star.reactors[step]));
}
export function nebulaCellCost(s: GameState): Decimal {
  return D(C.NEBULA_COST_BASE).mul(Decimal.pow(C.NEBULA_COST_GROWTH, s.nova.cellsBought));
}
export function nodeCost(i: number): Decimal { return D(C.NODE_COST(i)); }
/** Node i kaufbar? — Kette innerhalb des Astes */
export function nodeAvailable(s: GameState, i: number): boolean {
  if (s.galaxy.nodes[i]) return false;
  return i % 15 === 0 || s.galaxy.nodes[i - 1];
}
export function perkCost(s: GameState, i: number): Decimal {
  return D(C.PERK_BASE_COST[i]).mul(Decimal.pow(C.PERK_COST_GROWTH[i], s.sing.perks[i]));
}
/** Log-gewichteter Beitrag EINES Gewinn-Events zur Void-Fütterung (dust=1, plasma=10,
 *  shards=100, dm=1000 — höhere Ressourcenstufen nähren die Leere überproportional stärker). */
export function feedContribution(gain: Decimal, weight: number): Decimal {
  return log10p1(gain).mul(weight);
}
export function autoIgniteUnlocked(s: GameState): boolean {
  return s.stats.novaMs >= C.MS_NOVA[1];   // Meilenstein: ab der 2. Supernova (dieser Galaxie)
}
