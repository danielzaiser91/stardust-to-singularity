import { describe, it, expect } from 'vitest';
import { D } from '../src/core/decimal';
import { initialState } from '../src/core/state';
import { serialize, deserialize } from '../src/core/save';
import { tick } from '../src/core/tick';
import { computeMults, genCost, plasmaGain, HEX_COORDS, HEX_NEIGHBORS, NODE_EFFECTS } from '../src/core/formulas';
import { buyGenerator, click, doIgnite, doSupernova } from '../src/core/actions';
import * as actionsAll from '../src/core/actions';
import { simulateOffline } from '../src/core/offline';
import { ACHIEVEMENT_CHECKS } from '../src/core/achievements';
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
    s.stats.supernovae = 5;      // wird durch die Supernova 6: ≥4 hält Upgrade 4, <8 hält 13 NICHT
    expect(doSupernova(s, 0)).toBe(true);
    expect(s.star.upgrades[4]).toBe(true);
    expect(s.star.upgrades[13]).toBe(false);
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

  it('auto-ignition at cap harvests plasma WITHOUT resetting the dust layer', () => {
    const s = initialState(1);
    s.star.unlocked = true;
    s.nova.unlocked = true;
    s.nova.autoIgnite.on = true;
    s.stats.supernovae = 2;      // Auto-Zündung freigeschaltet
    s.dust.total = D('1e120');   // Gain sicher am Cap
    s.dust.gens[0].bought = 33;
    s.dust.gens[0].amount = D(33);
    s.stats.runTime = 5;
    const ignBefore = s.stats.ignitions;
    tick(s, 1);
    expect(s.stats.ignitions).toBeGreaterThan(ignBefore);   // Gewinn kassiert
    expect(s.dust.gens[0].bought).toBe(33);                 // KEIN Reset → kein Flackern
    expect(s.star.plasma.gt(0)).toBe(true);
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
  });

  it('stellar memory perk protects upgrades/reactors across supernova', () => {
    const s = initialState(1);
    s.star.unlocked = true;
    s.star.elements[5] = D(1e6);
    s.star.upgrades[4] = true;
    s.star.reactors[0] = 7;
    s.sing.perks[8] = 2;   // L2: Upgrades + Reaktoren bleiben
    expect(doSupernova(s, 0)).toBe(true);
    expect(s.star.upgrades[4]).toBe(true);
    expect(s.star.reactors[0]).toBe(7);
    // ohne Perk: alles weg
    const s2 = initialState(1);
    s2.star.unlocked = true;
    s2.star.elements[5] = D(1e6);
    s2.star.upgrades[4] = true;
    s2.star.reactors[0] = 7;
    expect(doSupernova(s2, 0)).toBe(true);
    expect(s2.star.upgrades[4]).toBe(false);
    expect(s2.star.reactors[0]).toBe(0);
  });

  it('ignition resets dust layer and grants plasma', () => {
    const s = initialState(1);
    s.dust.total = D(C.IGNITION_REQ).mul(100);
    s.dust.amount = D(C.IGNITION_REQ).mul(100);
    s.dust.gens[0].bought = 25;
    expect(doIgnite(s, 1)).toBe(true);
    expect(s.star.plasma.gte(1)).toBe(true);
    expect(s.star.unlocked).toBe(true);
    expect(s.dust.gens[0].bought).toBe(0);
    expect(s.dust.amount.lte(1000)).toBe(true);
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
