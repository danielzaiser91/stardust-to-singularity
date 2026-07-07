import { Decimal } from './decimal';
import * as C from './constants';
import type { GameState } from './state';
import { computeMults, tierMult, maxTier, plasmaGain, shardGain, dmGain, genMaxAfford, genCost, clickAmount, autoIgniteUnlocked, autoCoalesceUnlocked, type Mults } from './formulas';
import { buyGenerator, buyCompressionMax, buyReactor, buyReactorsMax, buyPlasmaUpgrade, feedSplit } from './actions';
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

  // — "Je erreicht"-Merker für Auto-Toggles (UI: sichtbar bleiben, auch wenn ein späterer
  // Reset die Freischaltbedingung wieder unterschreitet) —
  if (autoIgniteUnlocked(s)) s.stats.autoIgniteSeen = true;
  if (m.autoNovaUnlocked) s.stats.autoNovaSeen = true;

  // — Statistiken (Realzeit — Balance-Ziele messen echte Zeit) —
  s.stats.played += dt;
  s.stats.runTime += dt;
  s.stats.novaTime += dt;
  s.stats.galaxyTime += dt;
  s.stats.singTime += dt;

  // — Realzeit-Timer: Komet, Pulsar —
  if (s.dust.comet.active) {
    s.dust.comet.ttl -= dt;
    if (s.dust.comet.ttl <= 0) s.dust.comet.active = false;
  } else if (s.nova.challenge !== 4) {  // Challenge 5: No Comets
    const r = rngNext(s.rngState);
    s.rngState = r.next;
    if (r.value < m.cometChance * dt) { s.dust.comet.active = true; s.dust.comet.ttl = C.COMET_TTL; }
  }
  if (s.dust.comet.boost > 0) s.dust.comet.boost = Math.max(0, s.dust.comet.boost - dt);
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
    s.dust.amount = s.dust.amount.add(feedSplit(s, C.FEED_WEIGHT_DUST, gained));
    s.dust.total = s.dust.total.add(gained);
    s.stats.totalDustEver = s.stats.totalDustEver.add(gained);
  }

  // — Sonnensegel (Upgrade 13): passiver Staub in Klick-Kraft-Höhe —
  if (s.star.upgrades[12]) {
    const passive = clickAmount(s, m).mul(C.SOLAR_SAIL_CLICKS * gdt);
    s.dust.amount = s.dust.amount.add(feedSplit(s, C.FEED_WEIGHT_DUST, passive));
    s.dust.total = s.dust.total.add(passive);
    s.stats.totalDustEver = s.stats.totalDustEver.add(passive);
  }

  // — Challenge 7: Entropy Leak (Dust zerfällt) —
  if (s.nova.challenge === 6) {
    s.dust.amount = s.dust.amount.mul(Math.pow(1 - C.CH7_DECAY, gdt));
  }

  // — Autobuyer: vier getrennte Automationen (je eigenes Plasma-Upgrade) —
  if (s.star.upgrades[4]) for (let t = 0; t < Math.min(4, top); t++) autoBuyGen(s, m, t);
  if (s.star.upgrades[8]) for (let t = 4; t < Math.min(8, top); t++) autoBuyGen(s, m, t);
  if (s.star.upgrades[13]) buyCompressionMax(s, C.AUTOBUY_BUDGET_FRAC);
  if (s.star.upgrades[14]) {
    for (let r = 0; r < C.FUSION_STEPS; r++) {
      if (s.star.reactors[r] === 0) buyReactor(s, r);
      buyReactorsMax(s, r, C.AUTOBUY_BUDGET_FRAC);
    }
  }
  // Auto-Plasma-Upgrades (ab 2. Kollaps): kauft jedes noch fehlende, bezahlbare Plasma-Upgrade —
  // eigener Toggle, kein gekauftes Upgrade wie die anderen vier Automationen.
  if (s.stats.collapses >= C.MS_COLLAPSE[1] && s.star.autoUpgrades) {
    for (let u = 0; u < C.PLASMA_UPGRADE_COSTS.length; u++) buyPlasmaUpgrade(s, u);
  }
  // Auto-Zündung: kontinuierlicher Trickle des aktuellen Zündungs-Gewinns, pro Tick berechnet,
  // OHNE Dust-Reset (kein Flackern). Rate = ln(20)/19 ≈ 15,8 %/s = kontinuierliches Äquivalent
  // EINER vollen Zündung pro Sekunde am ×20-Clamp → so stark wie optimaler manueller Spam.
  // Bei 100 % Akkumulation zählt eine Zündung für die Meilenstein-Zähler.
  if (s.nova.autoIgnite.on && autoIgniteUnlocked(s) && s.nova.challenge === -1) {
    const gain = plasmaGain(s, m);
    if (gain.gt(0)) {
      const frac = C.AUTO_IGNITE_RATE * gdt;
      const pay = gain.mul(frac);
      s.star.plasma = s.star.plasma.add(feedSplit(s, C.FEED_WEIGHT_PLASMA, pay));
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
  // Auto-Supernova: gleicher Trickle wie Auto-Zündung — OHNE Star-Reset (kein Flackern, Fe/
  // Elemente/Plasma bleiben unangetastet). Bei 100 % Akkumulation zählt nur der GEWÄHLTE
  // Remnant-Typ (s.ui.nextRemnant — vorher fälschlich eine Heuristik, die den zuletzt HÄUFIGSTEN
  // Typ wiederholte, unabhängig von der Spieler-Auswahl) + Meilenstein-Zähler hoch, ohne echten
  // Reset. Der alte harte Reset wischte bei schnellem Trickle ständig Fe/Elemente — sah aus wie
  // „Scherben-Gewinn springt vor dem Deckel auf 0". Manuelles Auslösen bleibt ein echter Reset.
  if (s.galaxy.autoNova.on && m.autoNovaUnlocked && s.nova.challenge === -1) {
    const gain = shardGain(s, m);
    if (gain.gt(0)) {
      const frac = C.AUTO_NOVA_RATE * gdt;
      const pay = gain.mul(frac);
      s.nova.unlocked = true;
      s.nova.shards = s.nova.shards.add(feedSplit(s, C.FEED_WEIGHT_SHARDS, pay));
      s.nova.totalShards = s.nova.totalShards.add(pay);
      s.stats.lifetimeShards = s.stats.lifetimeShards.add(pay);
      s.galaxy.autoNova.acc += frac;
      if (s.galaxy.autoNova.acc >= 1) {
        s.galaxy.autoNova.acc -= 1;
        s.stats.supernovae++;
        s.stats.novaMs++;
        s.nova.remnants[s.ui.nextRemnant]++;
      }
    }
  }
  // Auto-Verschmelzen: gleicher Trickle wie Auto-Supernova — OHNE Galaxie-Reset. Bei 100 %
  // Akkumulation zählt nur der GEWÄHLTE Galaxientyp (s.ui.nextGtype) + Meilenstein-Zähler hoch.
  if (s.galaxy.autoCoalesce.on && autoCoalesceUnlocked(s) && s.nova.challenge === -1) {
    const gain = dmGain(s, m);
    if (gain.gt(0)) {
      const frac = C.AUTO_COALESCE_RATE * gdt;
      const pay = gain.mul(frac);
      s.galaxy.unlocked = true;
      s.galaxy.dm = s.galaxy.dm.add(feedSplit(s, C.FEED_WEIGHT_DM, pay));
      s.galaxy.totalDM = s.galaxy.totalDM.add(pay);
      s.stats.lifetimeDM = s.stats.lifetimeDM.add(pay);
      s.galaxy.autoCoalesce.acc += frac;
      if (s.galaxy.autoCoalesce.acc >= 1) {
        s.galaxy.autoCoalesce.acc -= 1;
        s.stats.coalescences++;
        s.stats.gtypePicks[s.ui.nextGtype]++;
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
  // Budget gedeckelt (statt gesamten Staub): sonst frisst Stufe 0 im selben Tick alles weg,
  // bevor teurere Stufen drankommen — sichtbarer Staub bliebe dauerhaft bei 0.
  const n = genMaxAfford(s, m, tier, C.AUTOBUY_BUDGET_FRAC);
  if (n > 0 && s.dust.amount.gte(genCost(s, m, tier, n))) buyGenerator(s, m, tier, n);
}
