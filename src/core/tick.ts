import { Decimal } from './decimal';
import * as C from './constants';
import type { GameState } from './state';
import { computeMults, tierMult, maxTier, plasmaGain, shardGain, genMaxAfford, genCost, clickAmount, autoIgniteUnlocked, type Mults } from './formulas';
import { supernovaReset, buyGenerator, buyCompressionMax, buyReactor, buyReactorsMax } from './actions';
import { rngNext } from './rng';
import { checkAchievements } from './achievements';
import { checkLore } from './lore';

/**
 * Der Herzschlag. dt in Realsekunden. Deterministisch (RNG im State).
 * Wird identisch von Spiel, Offline-Progress, Sim und Tests verwendet.
 */
export function tick(s: GameState, dt: number): Mults {
  const m = computeMults(s);
  const gdt = dt * m.speed;   // Spielzeit (Produktion); Realzeit-Timer nutzen dt

  // — Statistiken (Realzeit — Balance-Ziele messen echte Zeit) —
  s.stats.played += dt;
  s.stats.runTime += dt;
  s.stats.novaTime += dt;
  s.stats.galaxyTime += dt;
  s.stats.singTime += dt;

  // — Realzeit-Timer: Komet, Dilation, Pulsar —
  if (s.dust.comet.active) {
    s.dust.comet.ttl -= dt;
    if (s.dust.comet.ttl <= 0) s.dust.comet.active = false;
  } else if (s.nova.challenge !== 4) {  // Challenge 5: No Comets
    const r = rngNext(s.rngState);
    s.rngState = r.next;
    if (r.value < m.cometChance * dt) { s.dust.comet.active = true; s.dust.comet.ttl = C.COMET_TTL; }
  }
  if (s.dust.comet.boost > 0) s.dust.comet.boost = Math.max(0, s.dust.comet.boost - dt);
  if (s.sing.dilation.active) {
    s.sing.dilation.left -= dt;
    if (s.sing.dilation.left <= 0) { s.sing.dilation.active = false; s.sing.dilation.cd = C.DILATION_CD; }
  } else if (s.sing.dilation.cd > 0) {
    s.sing.dilation.cd = Math.max(0, s.sing.dilation.cd - dt);
  }
  if (s.nova.remnants[1] > 0) s.nova.pulsarPhase = (s.nova.pulsarPhase + dt) % m.pulsarPeriod;

  // — Stern: H-Produktion + Fusionskette —
  if (s.star.unlocked) {
    s.star.elements[0] = s.star.elements[0].add(m.hRate.mul(gdt));
    for (let i = 0; i < C.FUSION_STEPS; i++) {
      const lvl = s.star.reactors[i];
      if (lvl === 0) continue;
      const stock = s.star.elements[i];
      if (stock.lte(0)) continue;
      const thr = stock.add(1).sqrt().mul(lvl * C.REACTOR_RATE[i] * m.fusionMult * gdt);
      const moved = Decimal.min(stock, thr);
      s.star.elements[i] = stock.sub(moved);
      const out = moved.div(C.FUSION_RATIO);
      // Galaxie-Meilenstein 2: Reflexionsnebel verstärken den Fe-Output (letzter Schritt)
      s.star.elements[i + 1] = s.star.elements[i + 1].add(
        i === C.FUSION_STEPS - 1 ? out.mul(m.feNebulaMult) : out);
    }
  }

  // — Generator-Kette (von oben nach unten; Stufe i produziert Stufe i-1) —
  const top = maxTier(s);
  for (let i = top - 1; i >= 1; i--) {
    const g = s.dust.gens[i];
    if (g.amount.lte(0)) continue;
    s.dust.gens[i - 1].amount = s.dust.gens[i - 1].amount.add(g.amount.mul(tierMult(s, m, i)).mul(gdt));
  }
  const g0 = s.dust.gens[0];
  if (g0.amount.gt(0)) {
    const gained = g0.amount.mul(tierMult(s, m, 0)).mul(m.dustMult).mul(gdt);
    s.dust.amount = s.dust.amount.add(gained);
    s.dust.total = s.dust.total.add(gained);
    s.stats.totalDustEver = s.stats.totalDustEver.add(gained);
  }

  // — Sonnensegel (Upgrade 13): passiver Staub in Klick-Kraft-Höhe —
  if (s.star.upgrades[12]) {
    const passive = clickAmount(s, m).mul(C.SOLAR_SAIL_CLICKS * gdt);
    s.dust.amount = s.dust.amount.add(passive);
    s.dust.total = s.dust.total.add(passive);
    s.stats.totalDustEver = s.stats.totalDustEver.add(passive);
  }

  // — Challenge 7: Entropy Leak (Dust zerfällt) —
  if (s.nova.challenge === 6) {
    s.dust.amount = s.dust.amount.mul(Math.pow(1 - C.CH7_DECAY, gdt));
  }

  // — Hawking Radiation (Perk 2): passives Plasma/Shards —
  if (s.sing.perks[1] > 0 && s.star.unlocked) {
    const hl = s.sing.perks[1];
    s.star.plasma = s.star.plasma.add(s.stats.bestPlasma.mul(0.001 * hl * gdt));
  }

  // — Autobuyer: vier getrennte Automationen (je eigenes Plasma-Upgrade) —
  if (s.star.upgrades[4]) for (let t = 0; t < Math.min(4, top); t++) autoBuyGen(s, m, t);
  if (s.star.upgrades[8]) for (let t = 4; t < Math.min(8, top); t++) autoBuyGen(s, m, t);
  if (s.star.upgrades[13]) buyCompressionMax(s);
  if (s.star.upgrades[14]) {
    for (let r = 0; r < C.FUSION_STEPS; r++) {
      if (s.star.reactors[r] === 0) buyReactor(s, r);
      buyReactorsMax(s, r, 0.3);
    }
  }
  // Auto-Zündung: kontinuierlicher Trickle — 1 %/s des aktuellen Zündungs-Gewinns,
  // pro Tick berechnet, OHNE Dust-Reset (kein Flackern). Bei 100 % Akkumulation zählt
  // ein Zündungs-Event (Meilenstein-Zähler), die Auszahlung lief bereits kontinuierlich.
  if (s.nova.autoIgnite.on && autoIgniteUnlocked(s) && s.nova.challenge === -1) {
    const gain = plasmaGain(s, m);
    if (gain.gt(0)) {
      const frac = C.AUTO_HARVEST_RATE * gdt;
      const pay = gain.mul(frac);
      s.star.plasma = s.star.plasma.add(pay);
      s.star.totalPlasma = s.star.totalPlasma.add(pay);
      if (s.star.plasma.gt(s.stats.bestPlasma)) s.stats.bestPlasma = s.star.plasma;
      s.nova.autoIgnite.acc += frac;
      if (s.nova.autoIgnite.acc >= 1) {
        s.nova.autoIgnite.acc -= 1;
        s.stats.ignitions++;
        s.stats.ignMs++;
        s.stats.classPicks[s.star.cls]++;  // Trickle zündet mit der aktuellen Klasse
      }
    }
  }
  // Auto-Supernova: gleicher Trickle auf Scherben. Das Reset-Event bei 100 % hält alle
  // Pacing-Mechanismen intakt (Fe-Leiter, Aufladezeit → Gewinn kollabiert und lädt neu).
  if (s.galaxy.autoNova.on && m.autoNovaUnlocked && s.nova.challenge === -1) {
    const gain = shardGain(s, m);
    if (gain.gt(0)) {
      const frac = C.AUTO_HARVEST_RATE * gdt;
      const pay = gain.mul(frac);
      s.nova.unlocked = true;
      s.nova.shards = s.nova.shards.add(pay);
      s.nova.totalShards = s.nova.totalShards.add(pay);
      s.stats.lifetimeShards = s.stats.lifetimeShards.add(pay);
      s.galaxy.autoNova.acc += frac;
      if (s.galaxy.autoNova.acc >= 1) {
        s.galaxy.autoNova.acc = 0;
        supernovaReset(s, lastRemnantChoice(s));
      }
    }
  }

  // — Achievements & Lore (1×/Sekunde; an Spielzeit gekoppelt → deterministisch) —
  if (Math.floor(s.stats.played) !== Math.floor(s.stats.played - dt)) {
    checkAchievements(s, m);
    checkLore(s);
  }
  return m;
}

function autoBuyGen(s: GameState, m: Mults, tier: number): void {
  const n = genMaxAfford(s, m, tier);
  if (n > 0 && s.dust.amount.gte(genCost(s, m, tier, n))) buyGenerator(s, m, tier, n);
}

function lastRemnantChoice(s: GameState): 0 | 1 | 2 {
  const r = s.nova.remnants;
  if (r[2] >= r[0] && r[2] >= r[1]) return 2;
  if (r[1] >= r[0]) return 1;
  return 0;
}
