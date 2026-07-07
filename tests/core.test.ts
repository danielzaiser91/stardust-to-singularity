import { describe, it, expect } from 'vitest';
import { D, affordGeometric, addCounter, MAX_COUNTER, costGeometric } from '../src/core/decimal';
import { initialState } from '../src/core/state';
import { serialize, deserialize } from '../src/core/save';
import { tick } from '../src/core/tick';
import { computeMults, genCost, plasmaGain, HEX_COORDS, HEX_NEIGHBORS, NODE_EFFECTS } from '../src/core/formulas';
import * as F from '../src/core/formulas';
import { buyGenerator, click, doIgnite, doSupernova } from '../src/core/actions';
import * as actionsAll from '../src/core/actions';
import { simulateOffline } from '../src/core/offline';
import { ACHIEVEMENT_CHECKS, checkAchievements } from '../src/core/achievements';
import { LORE_TRIGGERS } from '../src/core/lore';
import * as C from '../src/core/constants';

describe('decimal & formulas', () => {
  it('generator costs grow geometrically', () => {
    const s = initialState(1);
    const m = computeMults(s);
    const c1 = genCost(s, m, 0, 1);
    expect(c1.toNumber()).toBeCloseTo(10);
    s.dust.gens[0].bought = 10;
    expect(genCost(s, m, 0, 1).toNumber()).toBeCloseTo(10 * Math.pow(C.GEN_GROWTH[0], 10), 3);
  });

  it('plasma gain is 1 at exactly the ignition requirement', () => {
    const s = initialState(1);
    s.dust.total = D(C.IGNITION_REQ);
    const m = computeMults(s);
    expect(plasmaGain(s, m).toNumber()).toBe(1);
  });

  it('hex grid has 19 cells, center has 6 neighbors', () => {
    expect(HEX_COORDS.length).toBe(19);
    const center = HEX_COORDS.findIndex(([q, r]) => q === 0 && r === 0);
    expect(HEX_NEIGHBORS[center].length).toBe(6);
  });

  it('constellation tree has 45 node effects', () => {
    expect(NODE_EFFECTS.length).toBe(C.CONSTELLATION_NODES);
  });

  it('achievement and lore lists match state array sizes', () => {
    const s = initialState(1);
    expect(ACHIEVEMENT_CHECKS.length).toBe(s.achievements.length);
    expect(LORE_TRIGGERS.length).toBe(s.loreSeen.length);
  });

  it('affordGeometric never returns NaN, even at extreme scale (production bug)', () => {
    // Regression: at very high `bought` counts, budget.mul(g-1).div(first).log(g).toNumber()
    // could return NaN inside break_eternity. That NaN then landed in dust.compression/
    // gens[].bought — plain numbers, not Decimals — permanently poisoning every future tick
    // (compression survives Ignitions past MS_IGNITION[2]) until the whole save read "NaN".
    const budget = D('1e1000000');
    const n = affordGeometric(budget, D(10), 2.0, 1e17);
    expect(Number.isFinite(n)).toBe(true);
    expect(Number.isNaN(n)).toBe(false);
  });

  it('affordGeometric finds the exact affordable boundary at moderate scale', () => {
    // Sanity check for the binary search itself: returned n must be affordable, and one more
    // unit must not be — independent of the extreme-scale bug covered below.
    const base = D(10);
    const n = affordGeometric(D(1000), base, 2.0, 0);
    expect(costGeometric(n, base, 2.0, 0).lte(D(1000))).toBe(true);
    expect(costGeometric(n + 1, base, 2.0, 0).gt(D(1000))).toBe(true);
  });

  it('affordGeometric caps at MAX_COUNTER instead of silently buying nothing (production bug)', () => {
    // Regression: real save had 1e8488739272450767 dust, affording roughly 1.2e16 of a tier-7
    // generator (base 1e26, growth 5) — beyond Number.MAX_SAFE_INTEGER. The log()/toNumber()
    // estimate for n was off by ~100 units at that scale, so costGeometric(estimate) landed just
    // above budget and "Max" silently bought nothing, even though "Buy 1" worked fine. A naive
    // binary search using that (too-high) estimate as its upper bound also failed to converge,
    // because JS doubles can't represent every integer once the search range exceeds 2^53.
    // Fix: cap the search at MAX_COUNTER — buying more is pointless anyway, since addCounter()
    // clamps bought/compression there regardless.
    const budget = D('1e8488739272450767');
    const base = D('1e26');
    const n = affordGeometric(budget, base, 5.0, 0);
    expect(n).toBe(MAX_COUNTER);
    expect(costGeometric(n, base, 5.0, 0).lte(budget)).toBe(true);
  });

  it('addCounter never overflows a plain-number counter to Infinity (production bug)', () => {
    // Regression: dust.compression/gens[].bought are plain JS numbers used as Decimal.pow()
    // exponents. Reported live: at ~1.8e308 dust, compression overflowed via normal += past
    // Number.MAX_VALUE to Infinity, then Decimal.pow(effect, Infinity) poisoned production
    // (UI literally rendered "Infinity" since that field is interpolated without fmt()).
    expect(addCounter(Number.MAX_VALUE, Number.MAX_VALUE)).toBe(MAX_COUNTER);
    expect(Number.isFinite(addCounter(Number.MAX_VALUE, 1))).toBe(true);
    expect(addCounter(5, 3)).toBe(8);
    expect(addCounter(MAX_COUNTER, 1)).toBe(MAX_COUNTER);
  });
});

describe('tick & actions', () => {
  it('generators produce dust', () => {
    const s = initialState(1);
    const m = computeMults(s);
    expect(buyGenerator(s, m, 0, 1)).toBe(true);
    tick(s, 10);
    expect(s.dust.amount.gt(0)).toBe(true);
  });

  it('clicking gives dust', () => {
    const s = initialState(1);
    const before = s.dust.amount;
    click(s, computeMults(s));
    expect(s.dust.amount.gt(before)).toBe(true);
    expect(s.stats.clicks).toBe(1);
  });

  it('auto-compression upgrade buys compression (parity with balance sim)', () => {
    const s = initialState(1);
    s.star.unlocked = true;
    s.star.upgrades[13] = true;
    s.dust.amount = D(1e6);
    tick(s, 1);
    expect(s.dust.compression).toBeGreaterThan(0);
  });

  it('auto-reactors upgrade buys fusion reactors', () => {
    const s = initialState(1);
    s.star.unlocked = true;
    s.star.upgrades[14] = true;
    s.star.plasma = D(100);
    tick(s, 1);
    expect(s.star.reactors[0]).toBeGreaterThan(0);
  });

  it('automation milestones keep their upgrade through supernova', () => {
    const s = initialState(1);
    s.star.unlocked = true;
    s.star.elements[5] = D(1e6);
    s.star.upgrades[4] = true;   // Auto-Gen 1–4
    s.star.upgrades[13] = true;  // Auto-Kompression
    s.stats.novaMs = 5;          // wird durch die Supernova 6: ≥4 hält Upgrade 4, <8 hält 13 NICHT
    s.stats.ignMs = 40;
    s.stats.classPicks = [0, 40, 0];
    s.dust.compression = 500;
    s.stats.novaTime = C.NOVA_MIN_TIME;   // volle Ladung → Gewinn > 0
    expect(doSupernova(s, 0)).toBe(true);
    expect(s.star.upgrades[4]).toBe(true);
    expect(s.star.upgrades[13]).toBe(false);
    // Supernova resettet die komplette Dust-Ebene inkl. Zündungs-Meilensteinen
    expect(s.stats.ignMs).toBe(0);
    expect(s.stats.classPicks).toEqual([0, 0, 0]);
    expect(s.dust.compression).toBe(0);
  });

  it('galaxy milestone 4 makes ignition milestones survive supernovae', () => {
    const s = initialState(1);
    s.star.unlocked = true;
    s.star.elements[5] = D(1e6);
    s.stats.coalescences = 6;    // MS_GALAXY[4]
    s.stats.ignMs = 40;
    s.stats.classPicks = [0, 40, 0];
    s.stats.novaTime = C.NOVA_MIN_TIME;
    expect(doSupernova(s, 0)).toBe(true);
    expect(s.stats.ignMs).toBe(40);
    expect(s.stats.classPicks).toEqual([0, 40, 0]);
  });

  it('solar sail upgrade grants passive dust equal to 4 clicks/s', () => {
    const s = initialState(1);
    s.star.unlocked = true;
    s.star.upgrades[12] = true;
    const before = s.dust.amount;
    tick(s, 10);
    // ohne Generatoren: nur das Sonnensegel produziert (Klick-Basis 1 × 4/s × 10 s = 40)
    expect(s.dust.amount.sub(before).toNumber()).toBeGreaterThanOrEqual(40);
  });

  it('auto-ignition trickles the gain per tick without resetting, event on accumulation', () => {
    const s = initialState(1);
    s.star.unlocked = true;
    s.nova.unlocked = true;
    s.nova.autoIgnite.on = true;
    s.stats.novaMs = 2;          // Auto-Zündung freigeschaltet (Meilenstein dieser Galaxie)
    s.dust.total = D('1e120');
    s.dust.gens[0].bought = 33;
    s.dust.gens[0].amount = D(33);
    const ignBefore = s.stats.ignitions;
    tick(s, 1);
    expect(s.star.plasma.gt(0)).toBe(true);                 // Trickle zahlt sofort anteilig
    expect(s.stats.ignitions).toBe(ignBefore);              // aber noch kein Zündungs-Event nach 1 s
    expect(s.dust.gens[0].bought).toBe(33);                 // KEIN Reset → kein Flackern
    // Rate ≈ ln(20)/19 ≈ 15,8 %/s → ein Zündungs-Event nach ~7 s Akkumulation
    const ticksToEvent = Math.ceil(1 / C.AUTO_IGNITE_RATE);
    for (let i = 0; i < ticksToEvent; i++) tick(s, 1);
    expect(s.stats.ignitions).toBeGreaterThan(ignBefore);   // Event bei 100 % Akkumulation
    expect(s.stats.classPicks[s.star.cls]).toBeGreaterThan(0);
  });

  it('auto-ignition matches one full manual ignition per second (parity, not slower)', () => {
    // Kernbeweis für den Fix: der Trickle über 1 s hebt totalPlasma um ~×20 (Clamp+1) —
    // exakt so viel wie eine volle manuelle Zündung am Deckel. Kein Zünd-Spam nötig.
    const mk = () => {
      const s = initialState(1);
      s.star.unlocked = true; s.nova.unlocked = true; s.stats.novaMs = 2;
      s.dust.total = D('1e120');                 // Gain sicher am ×19-Clamp
      s.star.plasma = D('1e6'); s.star.totalPlasma = D('1e6');
      return s;
    };
    const auto = mk(); auto.nova.autoIgnite.on = true;
    const t0 = auto.star.totalPlasma;
    for (let i = 0; i < 100; i++) tick(auto, 0.01);  // 1 s, feinkörnig → nahe am kont. Ideal
    const growth = auto.star.totalPlasma.div(t0).toNumber();
    // Kont. Äquivalent von ×20/s: e^(rate*19) = e^ln(20) = 20; diskret leicht darunter (~19),
    // aber weit über dem alten 1-%-Trickle (×1,19/s). Obergrenze = das ×20-Ideal.
    expect(growth).toBeGreaterThan(17);
    expect(growth).toBeLessThan(C.PLASMA_CLAMP_MULT + 1);
  });

  it('auto-supernova (10th coalescence) trickles shards WITHOUT resetting the star layer, counts the selected remnant', () => {
    const s = initialState(1);
    s.star.unlocked = true;
    s.nova.unlocked = true;
    s.galaxy.unlocked = true;
    s.stats.coalescences = 10;   // Meilenstein-Freischaltung (ohne Konstellations-Node)
    s.galaxy.autoNova.on = true;
    s.ui.nextRemnant = 1;        // Spieler hat Pulsar gewählt — Auto-Trickle muss DAS zählen
    s.star.elements[5] = D(1e12);
    s.stats.novaTime = C.NOVA_MIN_TIME;   // voll aufgeladen
    const before = s.stats.supernovae;
    tick(s, 1);
    expect(s.nova.shards.gt(0)).toBe(true);            // Trickle zahlt sofort anteilig
    expect(s.stats.supernovae).toBe(before);           // noch kein Meilenstein-Event
    for (let i = 0; i < 100; i++) tick(s, 1);
    expect(s.stats.supernovae).toBe(before + 1);       // Meilenstein bei 100 % — aber KEIN Reset
    expect(s.star.elements[5].gt(0)).toBe(true);       // Fe bleibt erhalten (kein Star-Layer-Reset)
    expect(s.nova.remnants[1]).toBe(1);                // zählt den GEWÄHLTEN Remnant-Typ, nicht die Heuristik
    expect(s.nova.remnants[0]).toBe(0);
    expect(s.nova.remnants[2]).toBe(0);
    expect(s.nova.count).toBe(0);                      // kein echter Reset → keine Fe-Leiter-Eskalation
  });

  it('auto-coalesce (4th collapse) trickles dark matter WITHOUT resetting the galaxy layer, counts the selected galaxy type', () => {
    const s = initialState(1);
    s.nova.unlocked = true;
    s.galaxy.unlocked = true;
    s.stats.collapses = C.MS_COLLAPSE[3];   // Meilenstein-Freischaltung (4. Kollaps)
    s.galaxy.autoCoalesce.on = true;
    s.ui.nextGtype = 2;          // Spieler hat Irregulär gewählt — Auto-Trickle muss DAS zählen
    s.nova.totalShards = D('1e9');
    s.stats.galaxyTime = C.GALAXY_MIN_TIME;   // voll aufgeladen
    const before = s.stats.coalescences;
    tick(s, 1);
    expect(s.galaxy.dm.gt(0)).toBe(true);               // Trickle zahlt sofort anteilig
    expect(s.stats.coalescences).toBe(before);          // noch kein Meilenstein-Event
    for (let i = 0; i < 100; i++) tick(s, 1);
    expect(s.stats.coalescences).toBe(before + 1);      // Meilenstein bei 100 % — aber KEIN Reset
    expect(s.nova.totalShards.gt(0)).toBe(true);         // Scherben bleiben erhalten (kein Nova-Layer-Reset)
    expect(s.stats.gtypePicks[2]).toBe(1);               // zählt den GEWÄHLTEN Galaxientyp
    expect(s.stats.gtypePicks[0]).toBe(0);
    expect(s.stats.gtypePicks[1]).toBe(0);
    expect(s.galaxy.count).toBe(0);                      // kein echter Reset → keine Shard-Leiter-Eskalation
  });

  it('the 3rd-collapse safety net guarantees the nebula garden survives coalescence even right after a fresh reset', () => {
    const s = initialState(1);
    s.stats.coalescences = 0;   // frisch resettet (z. B. direkt nach einem Collapse)
    s.stats.collapses = 0;
    expect(F.effectiveCoalescences(s)).toBeLessThan(C.MS_GALAXY[7]);   // ohne Sockel: unter dem Nebelgarten-Meilenstein
    s.stats.collapses = C.MS_COLLAPSE[2];   // 3. Kollaps
    expect(F.effectiveCoalescences(s)).toBeGreaterThanOrEqual(C.MS_GALAXY[7]);   // mit Sockel: garantiert erreicht
  });

  it('nebula tokens: replace is free, respec keeps tokens, cap at 19', () => {
    const s = initialState(1);
    s.nova.unlocked = true;
    s.nova.shards = D(1000);
    const { placeNebula, respecNebula } = actionsAll;
    expect(placeNebula(s, 0, 1)).toBe(true);        // kauft Token 1 (Kosten 1)
    expect(s.nova.cellsBought).toBe(1);
    const shardsAfterBuy = s.nova.shards.toNumber();
    expect(placeNebula(s, 0, 2)).toBe(true);        // Ersetzen: GRATIS
    expect(s.nova.shards.toNumber()).toBe(shardsAfterBuy);
    expect(s.nova.cellsBought).toBe(1);
    expect(respecNebula(s)).toBe(true);             // Respec: Zellen leer, Token bleibt
    expect(s.nova.cells.every(c => c === 0)).toBe(true);
    expect(s.nova.cellsBought).toBe(1);
    expect(placeNebula(s, 5, 3)).toBe(true);        // freier Token wird genutzt, kein Kauf
    expect(s.nova.cellsBought).toBe(1);
    expect(actionsAll.buyNebulaToken(s)).toBe(true);  // direkter Token-Kauf (Kosten 2)
    expect(s.nova.cellsBought).toBe(2);
    s.nova.cellsBought = C.NEBULA_CELLS;
    expect(actionsAll.buyNebulaToken(s)).toBe(false); // Cap erreicht
    // Radierer: entfernt einzelne Nebel, Token bleibt frei nutzbar
    expect(actionsAll.removeNebula(s, 5)).toBe(true);
    expect(s.nova.cells[5]).toBe(0);
    expect(actionsAll.removeNebula(s, 5)).toBe(false); // leer → nichts zu entfernen
    expect(placeNebula(s, 7, 1)).toBe(true);           // freier Token wird wiederverwendet
  });

  it('dark nebulae double neighboring cell multipliers (×2 each, as described)', () => {
    const s = initialState(1);
    s.nova.unlocked = true;
    s.nova.cells[9] = 1;                       // Emission im Zentrum: Basis ×3
    expect(F.nebulaCellMult(s, 9, 1)).toBe(3);
    const nb = F.HEX_NEIGHBORS[9];
    s.nova.cells[nb[0]] = 3;                   // 1 dunkler Nachbar → ×6
    expect(F.nebulaCellMult(s, 9, 1)).toBe(6);
    s.nova.cells[nb[1]] = 3;                   // 2 dunkle Nachbarn → ×12 (multiplikativ)
    expect(F.nebulaCellMult(s, 9, 1)).toBe(12);
  });

  it('galaxy milestone 2: reflection nebulae boost iron output', () => {
    const feAfterTick = (coal: number) => {
      const s = initialState(1);
      s.star.unlocked = true;
      s.nova.unlocked = true;
      s.stats.coalescences = coal;
      s.nova.cells[0] = 2;           // eine Reflexionszelle ohne dunkle Nachbarn → ×2
      s.star.reactors[4] = 1;
      s.star.elements[4] = D(1e6);   // Si-Vorrat für den Fe-Schritt
      tick(s, 1);
      return s.star.elements[5];
    };
    const ratio = feAfterTick(2).div(feAfterTick(0)).toNumber();
    expect(ratio).toBeCloseTo(2, 1);
  });

  it('special milestones: remnant tiers (2 collapses) & generator steps (3 collapses)', () => {
    const mk = (collapses: number) => {
      const s = initialState(1);
      s.star.unlocked = true;
      s.stats.collapses = collapses;
      s.nova.remnants = [10, 0, 10];   // keine Pulsare: deren Burst würde allGenMult mitskalieren
      s.dust.gens[0].bought = 200;
      return s;
    };
    const off = mk(0), on = mk(3);
    // Remnant-Stufe 1: Fusions-Basis 1,6 statt 1,5 → Fusion stärker
    expect(computeMults(on).fusionMult).toBeGreaterThan(computeMults(off).fusionMult);
    expect(F.remnantTier(on, 0)).toBe(1);
    expect(F.remnantTier(off, 0)).toBe(0);   // vor 2 Kollapsen wirkungslos
    // Generator-Spezial: 200 Käufe → ×3² auf Stufe 1
    const ratio = F.tierMult(on, computeMults(on), 0).div(F.tierMult(off, computeMults(off), 0)).toNumber();
    expect(ratio).toBeCloseTo(Math.pow(C.SPECIAL_GEN_MULT, 2), 1);
  });

  it('pulsar special tiers extend burst duration; permanent at 50 pulsars', () => {
    const s = initialState(1);
    s.nova.unlocked = true;
    s.stats.collapses = 2;
    s.nova.remnants = [0, 50, 0];        // Stufe 5 → Dauer 60 s = voller Zyklus
    s.nova.pulsarPhase = 45;             // tief im Zyklus, weit nach der Basis-Dauer
    expect(F.remnantParams(s).pulsarDur).toBe(60);
    expect(computeMults(s).pulsarBurst).toBeGreaterThan(1);   // permanent aktiv
    s.nova.remnants = [0, 10, 0];        // Stufe 1 → 20 s Dauer
    expect(F.remnantParams(s).pulsarDur).toBe(20);
    expect(computeMults(s).pulsarBurst).toBe(1);              // Phase 45 > 20 → inaktiv
    s.nova.remnants = [0, 100, 0];       // Stufe 10 → rohe Formel gäbe 110 s, weit über dem Zyklus
    expect(F.remnantParams(s).pulsarDur).toBe(60);             // an C.REMNANT_PULSAR_PERIOD gedeckelt
  });

  it('resets are blocked when the gain would floor to +0 (e.g. charge at 0)', () => {
    const s = initialState(1);
    s.star.unlocked = true;
    s.star.elements[5] = D(C.SUPERNOVA_REQ);   // genau an der Fe-Anforderung
    s.stats.novaTime = 0;                        // Ladung 0 → Gewinn floored auf 0
    expect(F.canSupernova(s)).toBe(true);        // Anforderung erfüllt …
    expect(F.shardGain(s, computeMults(s)).lte(0)).toBe(true);  // … aber Gewinn 0
    const before = s.stats.supernovae;
    expect(doSupernova(s, 0)).toBe(false);       // kein Reset für +0
    expect(s.stats.supernovae).toBe(before);
  });

  it('final-milestone achievements unlock at the last threshold of each track', () => {
    const s = initialState(1);
    s.galaxy.nodes = s.galaxy.nodes.map((_, i) => i < 15);   // genau 15 Nodes
    s.stats.ignMs = C.MS_IGNITION[C.MS_IGNITION.length - 1];
    s.stats.novaMs = C.MS_NOVA[C.MS_NOVA.length - 1];
    s.stats.coalescences = C.MS_GALAXY[C.MS_GALAXY.length - 1];
    s.stats.collapses = C.MS_COLLAPSE[C.MS_COLLAPSE.length - 1];
    checkAchievements(s, computeMults(s));
    // Indizes 61 (15 Nodes) + 63–66 (finale Meilensteine) gesetzt, 62 (30 Nodes) NICHT
    expect(s.achievements[61]).toBe(true);
    expect(s.achievements[62]).toBe(false);
    expect(s.achievements.slice(63, 67).every(Boolean)).toBe(true);
  });

  it('currencyForCap: reaching the target currency lifts the gain to the cap', () => {
    // Coalescence (der gemeldete Fall): Deckel = totalDM*3+10
    const s = initialState(1);
    s.galaxy.unlocked = true;
    s.nova.totalShards = D('1e5');
    s.galaxy.totalDM = D('12');                 // Deckel = 46
    s.stats.galaxyTime = C.GALAXY_MIN_TIME;     // voll aufgeladen
    const m = computeMults(s);
    const cap = F.gainCapBound(s.galaxy.totalDM);
    expect(F.dmGain(s, m).lt(cap)).toBe(true);  // vorher unter dem Deckel
    const need = F.currencyForCap(s, m, 'coalesce');
    expect(need).not.toBeNull();
    expect(need!.target.gt(need!.current)).toBe(true);
    s.nova.totalShards = need!.target;
    expect(F.dmGain(s, computeMults(s)).gte(cap.sub(2))).toBe(true);  // an der Zielwährung: am Deckel

    // Ignition (Softpow-Pfad): bei genug Staub ist der Gewinn geclampt → kein Ziel mehr
    const s2 = initialState(1);
    s2.dust.total = D('1e300');
    s2.star.totalPlasma = D('10');
    expect(F.currencyForCap(s2, computeMults(s2), 'ignite')).toBeNull();
  });

  it('galaxy type bonuses stack exponentially with pick count (no single "active" type)', () => {
    const mk = (picks: [number, number, number]) => {
      const s = initialState(1);
      s.galaxy.unlocked = true;
      s.stats.gtypePicks = picks;
      return s;
    };
    const base = computeMults(mk([0, 0, 0]));
    const oneSpiral = computeMults(mk([1, 0, 0]));
    const twoSpiral = computeMults(mk([2, 0, 0]));
    expect(oneSpiral.dustMult.div(base.dustMult).toNumber()).toBeCloseTo(C.GALAXY_TYPE_ALL, 5);
    expect(twoSpiral.dustMult.div(base.dustMult).toNumber()).toBeCloseTo(C.GALAXY_TYPE_ALL ** 2, 5);
    // beide anderen Typen wirken GLEICHZEITIG, nicht exklusiv
    const mixed = computeMults(mk([1, 1, 1]));
    expect(mixed.offlineMult).toBeCloseTo(base.offlineMult * C.GALAXY_TYPE_OFFLINE, 5);
    expect(mixed.clickMult.div(base.clickMult).toNumber()).toBeCloseTo(C.GALAXY_TYPE_ACTIVE, 5);
    expect(mixed.dustMult.div(base.dustMult).toNumber()).toBeCloseTo(C.GALAXY_TYPE_ALL, 5);
  });

  it('coalescence resets challenges & lower milestones until galaxy milestones keep them', () => {
    const mk = (coalescences: number) => {
      const s = initialState(1);
      s.nova.unlocked = true;
      s.nova.totalShards = D('1e9');
      s.stats.coalescences = coalescences;
      s.stats.ignMs = 30;
      s.stats.novaMs = 20;
      s.stats.classPicks = [5, 20, 5];
      s.nova.autoIgnite.on = true;
      s.nova.completedTier = s.nova.completedTier.map(() => 1);
      s.nova.cells[0] = 1;
      s.nova.cellsBought = 3;
      s.stats.galaxyTime = C.GALAXY_MIN_TIME;   // volle Ladung → DM-Gewinn > 0
      return s;
    };
    const s1 = mk(0);   // 1. Coalescence: nichts davon erreicht → alles resettet
    expect(actionsAll.doCoalesce(s1, 0)).toBe(true);
    expect(s1.nova.completedTier.every(t => t === 0)).toBe(true);
    expect(s1.stats.ignMs).toBe(0);
    expect(s1.stats.novaMs).toBe(0);
    expect(s1.stats.classPicks).toEqual([0, 0, 0]);
    expect(s1.nova.autoIgnite.on).toBe(false);   // Meilenstein weg → Auto-Zündung aus
    expect(s1.nova.cellsBought).toBe(0);
    // Sicherheitsnetz: selbst mit on=true darf der Tick ohne Meilenstein nicht ernten
    s1.nova.autoIgnite.on = true;
    s1.dust.total = D('1e120');
    s1.stats.runTime = 5;
    const ign = s1.stats.ignitions;
    tick(s1, 1);
    expect(s1.stats.ignitions).toBe(ign);
    const s2 = mk(11);  // 12. Coalescence: M2–M5 erreicht → alles bleibt
    expect(actionsAll.doCoalesce(s2, 0)).toBe(true);
    expect(s2.nova.completedTier.every(t => t >= 1)).toBe(true);
    expect(s2.stats.ignMs).toBe(30);
    expect(s2.stats.novaMs).toBe(20);
    expect(s2.stats.classPicks).toEqual([5, 20, 5]);
    expect(s2.nova.autoIgnite.on).toBe(true);    // M4 erreicht → bleibt aktiv
    expect(s2.nova.cells[0]).toBe(1);
    expect(s2.nova.cellsBought).toBe(3);
  });

  it('remnants survive coalescence via EITHER 50 effective coalescences OR 4 collapses', () => {
    const mk = (coalescences: number, collapses: number) => {
      const s = initialState(1);
      s.nova.unlocked = true;
      s.nova.totalShards = D('1e9');
      s.nova.remnants = [3, 2, 1];
      s.stats.coalescences = coalescences;
      s.stats.collapses = collapses;
      s.stats.galaxyTime = C.GALAXY_MIN_TIME;
      return s;
    };
    const s1 = mk(10, 0);   // weder 50 Verschmelzungen noch 4 Kollapse → resettet
    expect(actionsAll.doCoalesce(s1, 0)).toBe(true);
    expect(s1.nova.remnants).toEqual([0, 0, 0]);
    const s2 = mk(C.MS_GALAXY[8], 0);   // 50 effektive Verschmelzungen (dieser Run) → bleibt
    expect(actionsAll.doCoalesce(s2, 0)).toBe(true);
    expect(s2.nova.remnants).toEqual([3, 2, 1]);
    const s3 = mk(10, C.MS_COLLAPSE[3]);   // 4 Kollapse (permanent) → bleibt, obwohl Run frisch
    expect(actionsAll.doCoalesce(s3, 0)).toBe(true);
    expect(s3.nova.remnants).toEqual([3, 2, 1]);
  });

  it('the 50-coalescence remnant path protects a normal coalescence but NOT a collapse', () => {
    // Ein Kollaps setzt stats.coalescences im selben Zug auf 0 — der 50er-Meilenstein "gilt"
    // danach nicht mehr und darf nicht rückwirkend vor GENAU DIESEM Kollaps schützen. Nur
    // Meilenstein 4 Kollapse (hängt an stats.collapses, nicht an der Leiter) darf das.
    const mk = (collapses: number) => {
      const s = initialState(1);
      s.nova.unlocked = true;
      s.galaxy.unlocked = true;
      s.nova.remnants = [3, 2, 1];
      s.stats.coalescences = C.MS_GALAXY[8];   // 50 effektive Verschmelzungen (dieser Run)
      s.stats.collapses = collapses;
      s.galaxy.totalDM = D(C.COLLAPSE_REQ).mul(100);
      s.stats.singTime = C.COLLAPSE_MIN_TIME;
      return s;
    };
    const s1 = mk(0);   // 50 Verschmelzungen, aber 0 Kollapse → Remnants NICHT geschützt
    expect(actionsAll.doCollapse(s1)).toBe(true);
    expect(s1.nova.remnants).toEqual([0, 0, 0]);
    const s2 = mk(C.MS_COLLAPSE[3]);   // zusätzlich 4 Kollapse → bleibt
    expect(actionsAll.doCollapse(s2)).toBe(true);
    expect(s2.nova.remnants).toEqual([3, 2, 1]);
  });

  it('newUniverse requires banked (not lifetime) entropy, and the cost escalates per universe', () => {
    const s = initialState(1);
    s.sing.unlocked = true;
    s.sing.totalEntropy = D(C.ENDGAME_ENTROPY).mul(1000);   // hoch, aber irrelevant für die Gate
    s.sing.entropy = D(0);
    expect(actionsAll.newUniverse(s)).toBe(false);            // 0 gebankte Entropie → kein Spam möglich

    s.sing.entropy = F.newUniverseReq(s);
    expect(actionsAll.newUniverse(s)).toBe(true);
    expect(s.sing.universes).toBe(1);
    expect(s.sing.entropy.toNumber()).toBe(0);                // Entropie wird beim Aufstieg verbraucht

    const reqAfterFirst = F.newUniverseReq(s);
    expect(reqAfterFirst.gt(D(C.ENDGAME_ENTROPY))).toBe(true); // 2. Universum kostet mehr als das 1.
    expect(actionsAll.newUniverse(s)).toBe(false);             // erneut 0 Entropie → kein sofortiger Re-Spam
  });

  it('save migration v1→v2 seeds milestone counters from legacy stats', () => {
    const s = initialState(1);
    s.stats.ignitions = 42;
    s.nova.count = 7;
    const raw = JSON.parse(serialize(s));
    raw.version = 1;
    delete raw.stats.ignMs;
    delete raw.stats.novaMs;
    const restored = deserialize(JSON.stringify(raw));
    expect(restored.stats.ignMs).toBe(42);
    expect(restored.stats.novaMs).toBe(7);
  });

  it('save migration v2→v3 rescales pick counters to per-run sums', () => {
    const s = initialState(1);
    s.stats.ignMs = 100;
    s.galaxy.count = 1;
    const raw = JSON.parse(serialize(s));
    raw.version = 2;
    raw.stats.classPicks = [0, 32428, 6];     // Lifetime-Werte aus v2
    raw.stats.remnantPicks = [6, 8, 7];       // entfällt in v3
    raw.stats.gtypePicks = [1, 0, 0];         // Summe == galaxy.count → unverändert
    const restored = deserialize(JSON.stringify(raw));
    expect(restored.stats.classPicks.reduce((a, b) => a + b, 0)).toBe(100);
    expect(restored.stats.classPicks[1]).toBeGreaterThan(90);  // proportional, Rest zum größten
    expect(restored.stats.gtypePicks).toEqual([1, 0, 0]);
    expect((restored.stats as Record<string, unknown>).remnantPicks).toBeUndefined();
  });

  it('stellar memory perk protects reactors + retains fusion material across supernova', () => {
    const s = initialState(1);
    s.star.unlocked = true;
    s.star.elements[5] = D(1e6);
    s.star.elements[1] = D(1000);  // He
    s.star.reactors[0] = 7;
    s.sing.perks[8] = 1;   // L1: Reaktoren bleiben, noch kein Material-Retain
    s.stats.novaTime = C.NOVA_MIN_TIME;
    expect(doSupernova(s, 0)).toBe(true);
    expect(s.star.reactors[0]).toBe(7);
    expect(s.star.elements[1].eq(0)).toBe(true);

    const s2 = initialState(1);
    s2.star.unlocked = true;
    s2.star.elements[5] = D(1e6);
    s2.star.elements[1] = D(1000);
    s2.star.reactors[0] = 7;
    s2.sing.perks[8] = 2;   // L2: 10 % Fusionsmaterial bleibt
    s2.stats.novaTime = C.NOVA_MIN_TIME;
    expect(doSupernova(s2, 0)).toBe(true);
    expect(s2.star.reactors[0]).toBe(7);
    expect(s2.star.elements[1].eq(100)).toBe(true);

    // ohne Perk: alles weg
    const s3 = initialState(1);
    s3.star.unlocked = true;
    s3.star.elements[5] = D(1e6);
    s3.star.elements[1] = D(1000);
    s3.star.reactors[0] = 7;
    s3.stats.novaTime = C.NOVA_MIN_TIME;
    expect(doSupernova(s3, 0)).toBe(true);
    expect(s3.star.reactors[0]).toBe(0);
    expect(s3.star.elements[1].eq(0)).toBe(true);
  });

  it('ignition resets dust layer and grants plasma', () => {
    const s = initialState(1);
    s.dust.total = D(C.IGNITION_REQ).mul(100);
    s.dust.amount = D(C.IGNITION_REQ).mul(100);
    s.dust.gens[0].bought = 25;
    s.dust.comet = { active: true, ttl: 8, boost: 20 };
    expect(doIgnite(s, 1)).toBe(true);
    // Komet & Boost überleben die Zündung (Realzeit-Event)
    expect(s.dust.comet.active).toBe(true);
    expect(s.dust.comet.boost).toBe(20);
    expect(s.star.plasma.gte(1)).toBe(true);
    expect(s.star.unlocked).toBe(true);
    expect(s.dust.gens[0].bought).toBe(0);
    expect(s.dust.amount.lte(1000)).toBe(true);
  });

  it('challenge hard tier: gated behind unlock + normal completion, goal escalates, reward stacks', () => {
    const s = initialState(1);
    s.nova.unlocked = true;
    s.stats.supernovae = 20;   // alle Challenges freigeschaltet
    // Hard vor Freischaltung/Normal-Abschluss verweigert
    expect(actionsAll.enterChallenge(s, 1, 2)).toBe(false);
    s.nova.completedTier[1] = 1;                     // Normal geschafft
    expect(actionsAll.enterChallenge(s, 1, 2)).toBe(false);  // Coalescences noch zu niedrig
    s.stats.coalescences = C.MS_GALAXY[3];
    expect(actionsAll.enterChallenge(s, 1, 2)).toBe(true);
    expect(s.nova.challenge).toBe(1);
    expect(s.nova.challengeTier).toBe(2);
    expect(F.igniteReq(s).eq(D(C.IGNITION_REQ).mul(C.CH_GOAL_MULT_TIER2[1]))).toBe(true);
    // Abschluss merkt sich Stufe 2, ohne die Stufe-1-Info zu verlieren
    s.dust.total = F.igniteReq(s);
    expect(doIgnite(s, 1)).toBe(true);
    expect(s.nova.completedTier[1]).toBe(2);
    // Belohnung stapelt: Alle-Generatoren-Bonus ×4 (Hard) statt ×2 (Normal)
    const s2 = initialState(1);
    s2.nova.completedTier[1] = 1;
    const s3 = initialState(1);
    s3.nova.completedTier[1] = 2;
    expect(computeMults(s3).allGenMult.div(computeMults(s2).allGenMult).toNumber()).toBeCloseTo(2, 5);
  });

  it('save migration v3→v4 converts nova.completed booleans to completedTier', () => {
    const s = initialState(1);
    s.nova.completedTier = [1, 0, 1, 0, 0, 0, 0, 0];
    const raw = JSON.parse(serialize(s));
    raw.version = 3;
    raw.nova.completed = [true, false, true, false, false, false, false, false];
    delete raw.nova.completedTier;
    const restored = deserialize(JSON.stringify(raw));
    expect(restored.nova.completedTier).toEqual([1, 0, 1, 0, 0, 0, 0, 0]);
  });

  it('feedSplit credits a nonzero amount even at tetrational (layer ≥ 2) magnitudes', () => {
    // Realer Bug (2026-07-07): gain.sub(gain.mul(0.5)) löscht sich bei „eeX"-Zahlen komplett
    // aus (gain und gain*0,5 sind an dieser Größenordnung intern ununterscheidbar) → 0 zurück,
    // dust.amount fror für immer auf 0 ein. feedSplit muss stattdessen direkt multiplizieren.
    const s = initialState(1);
    s.sing.unlocked = true;
    const hugeGain = D('ee16.7396548473526960');
    const credited = actionsAll.feedSplit(s, C.FEED_WEIGHT_DUST, hugeGain);
    expect(credited.gt(0)).toBe(true);
    expect(credited.eq(0)).toBe(false);
    // normale Größenordnung: weiterhin ein echter ~50/50-Split
    const s2 = initialState(1);
    s2.sing.unlocked = true;
    const normalGain = D(2e10);
    const credited2 = actionsAll.feedSplit(s2, C.FEED_WEIGHT_DUST, normalGain);
    expect(credited2.eq(1e10)).toBe(true);
  });
});

describe('save system', () => {
  it('roundtrips a fresh state', () => {
    const s = initialState(123);
    tick(s, 5);
    const restored = deserialize(serialize(s));
    expect(restored.dust.amount.toString()).toBe(s.dust.amount.toString());
    expect(restored.rngState).toBe(s.rngState);
    expect(restored.stats.played).toBe(s.stats.played);
  });

  it('fills missing fields with defaults (forward compatibility)', () => {
    const s = initialState(1);
    const raw = JSON.parse(serialize(s));
    delete raw.sing;
    delete raw.settings.quality;
    const restored = deserialize(JSON.stringify(raw));
    expect(restored.sing.entropy.eq(0)).toBe(true);
    expect(restored.settings.quality).toBe(0);
  });

  it('preserves Decimal precision at extreme magnitudes', () => {
    const s = initialState(1);
    s.dust.amount = D('1.234e5678');
    const restored = deserialize(serialize(s));
    expect(restored.dust.amount.eq(D('1.234e5678'))).toBe(true);
  });

  it('heals NaN/Infinity that leaked into a save (production bug recovery)', () => {
    // Real corrupted save: dust.amount/total = "NaN" (Decimal), dust.compression = null
    // (JSON.stringify(NaN) for a plain number), gens wiped to 0 by the ensuing crash.
    const s = initialState(1);
    const raw = JSON.parse(serialize(s));
    raw.dust.amount = 'NaN';
    raw.dust.total = 'NaN';
    raw.dust.compression = null;
    const restored = deserialize(JSON.stringify(raw));
    expect(restored.dust.amount.isNan()).toBe(false);
    expect(restored.dust.amount.eq(0)).toBe(true);
    expect(restored.dust.total.eq(0)).toBe(true);
    expect(Number.isNaN(restored.dust.compression)).toBe(false);
    expect(restored.dust.compression).toBe(0);
    // muss weiterspielbar bleiben, nicht nur "nicht NaN"
    tick(restored, 1);
    expect(restored.dust.amount.isFinite()).toBe(true);
  });
});

describe('determinism', () => {
  it('two runs with the same seed produce identical states', () => {
    const run = () => {
      const s = initialState(777);
      for (let i = 0; i < 500; i++) {
        tick(s, 1);
        if (i % 7 === 0) buyGenerator(s, computeMults(s), 0, 1);
      }
      return serialize(s);
    };
    expect(run()).toBe(run());
  });
});

describe('offline progress', () => {
  it('offline ≈ online for idle production (±5 %)', () => {
    const mk = () => {
      const s = initialState(9);
      s.dust.gens[0].amount = D(100);
      s.dust.gens[0].bought = 100;
      s.dust.gens[1].amount = D(10);
      s.dust.gens[1].bought = 10;
      return s;
    };
    const online = mk();
    for (let i = 0; i < 3600; i++) tick(online, 1);
    const offline = mk();
    simulateOffline(offline, 3600);
    const a = online.dust.amount, b = offline.dust.amount;
    const ratio = a.div(b).toNumber();
    expect(ratio).toBeGreaterThan(0.95);
    expect(ratio).toBeLessThan(1.05);
  });
});
