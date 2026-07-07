import { Decimal, D, ZERO } from './decimal';
import * as C from './constants';

export type StarClass = 0 | 1 | 2;        // rot, gelb, blau
export type GalaxyType = 0 | 1 | 2;       // spiral, elliptisch, irregulär
export type NebulaCell = 0 | 1 | 2 | 3;   // leer, emission, reflection, dark
export type Lang = 'en' | 'de';

export interface GeneratorState { amount: Decimal; bought: number; }

export interface GameState {
  version: number;
  savedAt: number;      // epoch ms
  startedAt: number;
  rngState: number;
  lang: Lang;
  settings: {
    sfx: number;        // 0..1
    music: number;      // 0..1
    quality: 0 | 1 | 2 | 3;  // auto, low, medium, high
    sciNotation: boolean;
    confirmResets: boolean;
    autoTab: boolean;   // bei Reset automatisch zum neuen Layer-Tab wechseln
  };
  stats: {
    played: number;     // Sekunden gesamt
    clicks: number;
    comets: number;
    ignitions: number;
    supernovae: number;
    coalescences: number;
    collapses: number;
    runTime: number;    // seit letzter Ignition
    novaTime: number;   // seit letzter Supernova
    galaxyTime: number;
    singTime: number;
    totalDustEver: Decimal;
    bestPlasma: Decimal;
    /** Lifetime-Summen — resetten NIE (Basis der Kaskaden-Passiveffekte, kein Prestige-Whiplash) */
    lifetimeShards: Decimal;
    lifetimeDM: Decimal;
    /** Meilenstein-Zähler der unteren Ebenen — resetten bei Coalescence,
     *  außer die jeweiligen Galaxie-Meilensteine machen sie permanent */
    ignMs: number;
    novaMs: number;
    /** Wahl-Zähler, Reset mit der Elternebene (Roguelite-Prinzip, wie ignMs/novaMs):
     *  classPicks = Zündungen je Klasse seit Coalescence · gtypePicks = Typen seit Kollaps.
     *  (Remnant-Wahlen seit Coalescence ≡ nova.remnants — kein eigener Zähler nötig.) */
    classPicks: [number, number, number];
    gtypePicks: [number, number, number];
    /** Einmal wahr, für immer wahr — Auto-Toggles sollen sichtbar bleiben, sobald ihre
     *  Freischaltbedingung je erreicht wurde, auch wenn ein späterer Reset sie wieder sperrt. */
    autoIgniteSeen: boolean;
    autoNovaSeen: boolean;
  };
  dust: {
    amount: Decimal;
    total: Decimal;               // dieses Ignition-Runs (Basis für Plasma-Gain)
    gens: GeneratorState[];       // 8 Stufen
    compression: number;
    comet: { active: boolean; ttl: number; boost: number };  // boost = Restsekunden
  };
  star: {
    unlocked: boolean;
    plasma: Decimal;
    totalPlasma: Decimal;         // dieses Supernova-Runs
    cls: StarClass;
    elements: Decimal[];          // H He C O Si Fe
    reactors: number[];           // 5 Fusionsstufen
    upgrades: boolean[];          // 12
    /** Freischaltung: Kollaps-Meilenstein MS_COLLAPSE[1] (2. Kollaps) */
    autoUpgrades: boolean;
  };
  nova: {
    unlocked: boolean;
    shards: Decimal;
    totalShards: Decimal;         // dieses Galaxy-Runs
    cells: NebulaCell[];          // 19 Hex-Zellen
    cellsBought: number;
    remnants: [number, number, number];  // neutron, pulsar, blackhole
    count: number;                // Supernovae seit letzter Coalescence (Basis der Fe-Leiter)
    pulsarPhase: number;          // Sekunden im Pulsar-Zyklus
    challenge: number;            // -1 = keine aktiv
    challengeTier: 1 | 2;         // Stufe des GERADE laufenden Versuchs (nur relevant, wenn challenge !== -1)
    completedTier: number[];      // 8 — 0 = offen, 1 = Normal geschafft, 2 = Hard geschafft
    /** acc = akkumulierter Gewinn-Anteil des Auto-Trickles (1.0 = ein volles Event) */
    autoIgnite: { on: boolean; at: Decimal; acc: number };
  };
  galaxy: {
    unlocked: boolean;
    dm: Decimal;
    totalDM: Decimal;
    nodes: boolean[];             // 45 Konstellations-Nodes
    count: number;                // Coalescences seit letztem Collapse (Basis der Shard-Leiter)
    autoNova: { on: boolean; at: Decimal; acc: number };
    /** Freischaltung: MS_COLLAPSE[3] (4. Kollaps) */
    autoCoalesce: { on: boolean; acc: number };
  };
  sing: {
    unlocked: boolean;
    entropy: Decimal;
    totalEntropy: Decimal;
    perks: number[];              // 8 Perk-Level
    fed: Decimal;                 // Gesamtmasse im Schwarzen Loch (passiv, aus dem Gewinn-Split gespeist)
    universes: number;            // NG+ Zähler
    collapsesU: number;           // Kollapse in DIESEM Universum (Basis der quadratischen Leiter)
    endgame: boolean;
  };
  achievements: boolean[];
  loreSeen: boolean[];
  /** transiente Ereignis-Queues — UI konsumiert, Sim ignoriert; save-sicher */
  pending: { lore: number[]; ach: number[] };
  ui: {
    scene: number;
    helpSeen: boolean;
    hintsSeen: string[];       // bereits gezeigte Tutorial-Hints (persistent)
    nextClass: StarClass;      // Auswahl für nächste Ignition
    nextRemnant: 0 | 1 | 2;    // Auswahl für nächste Supernova
    nextGtype: GalaxyType;     // Auswahl für nächste Coalescence
    challengesCollapsed: boolean;
    upgradesCollapsed: boolean;
    constellationsCollapsed: boolean;
    nebulaCollapsed: boolean;
  };
}

export function initialState(seed = Date.now() >>> 0): GameState {
  return {
    version: C.SAVE_VERSION,
    savedAt: 0,
    startedAt: 0,
    rngState: seed,
    lang: 'en',
    settings: { sfx: 0.7, music: 0.5, quality: 0, sciNotation: false, confirmResets: true, autoTab: true },
    stats: {
      played: 0, clicks: 0, comets: 0,
      ignitions: 0, supernovae: 0, coalescences: 0, collapses: 0,
      runTime: 0, novaTime: 0, galaxyTime: 0, singTime: 0,
      totalDustEver: ZERO, bestPlasma: ZERO,
      lifetimeShards: ZERO, lifetimeDM: ZERO,
      ignMs: 0, novaMs: 0,
      classPicks: [0, 0, 0], gtypePicks: [0, 0, 0],
      autoIgniteSeen: false, autoNovaSeen: false,
    },
    dust: {
      amount: D(10),
      total: D(10),
      gens: Array.from({ length: C.GEN_COUNT }, () => ({ amount: ZERO, bought: 0 })),
      compression: 0,
      comet: { active: false, ttl: 0, boost: 0 },
    },
    star: {
      unlocked: false,
      plasma: ZERO, totalPlasma: ZERO,
      cls: 1,
      elements: Array.from({ length: C.ELEMENT_COUNT }, () => ZERO),
      reactors: Array.from({ length: C.FUSION_STEPS }, () => 0),
      upgrades: Array.from({ length: C.PLASMA_UPGRADE_COSTS.length }, () => false),
      autoUpgrades: false,
    },
    nova: {
      unlocked: false,
      shards: ZERO, totalShards: ZERO,
      cells: Array.from({ length: C.NEBULA_CELLS }, () => 0 as NebulaCell),
      cellsBought: 0,
      remnants: [0, 0, 0],
      count: 0,
      pulsarPhase: 0,
      challenge: -1,
      challengeTier: 1,
      completedTier: Array.from({ length: C.CHALLENGE_COUNT }, () => 0),
      autoIgnite: { on: false, at: D(1), acc: 0 },
    },
    galaxy: {
      unlocked: false,
      dm: ZERO, totalDM: ZERO,
      nodes: Array.from({ length: C.CONSTELLATION_NODES }, () => false),
      count: 0,
      autoNova: { on: false, at: D(1), acc: 0 },
      autoCoalesce: { on: false, acc: 0 },
    },
    sing: {
      unlocked: false,
      entropy: ZERO, totalEntropy: ZERO,
      perks: Array.from({ length: C.PERK_COUNT }, () => 0),
      fed: ZERO,
      universes: 0,
      collapsesU: 0,
      endgame: false,
    },
    achievements: Array.from({ length: 67 }, () => false),
    loreSeen: Array.from({ length: 32 }, () => false),
    pending: { lore: [], ach: [] },
    ui: { scene: 0, helpSeen: false, hintsSeen: [], nextClass: 1, nextRemnant: 0, nextGtype: 0, challengesCollapsed: false, upgradesCollapsed: false, constellationsCollapsed: false, nebulaCollapsed: false },
  };
}
