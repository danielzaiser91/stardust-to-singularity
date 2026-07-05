/**
 * ★ BALANCE-SHEET ★
 * Sämtliche Spielbalance-Zahlen leben hier. Die Sim (src/sim) und die Balance-Tests
 * (tests/balance.test.ts) validieren jede Änderung. Kein Magic Number außerhalb dieser Datei.
 */

export const SAVE_VERSION = 1;

// ── Ebene 0: Dust ────────────────────────────────────────────────────────────
export const GEN_COUNT = 8;
export const GEN_BASE_COST = [10, 1e3, 1e6, 1e10, 1e14, 1e18, 1e22, 1e26];
export const GEN_GROWTH = [2.0, 2.3, 2.6, 3.0, 3.5, 4.0, 4.5, 5.0];
export const GEN_RATE = [1, 0.5, 0.4, 0.3, 0.25, 0.2, 0.15, 0.1];  // Output je Einheit/s
export const GEN_MULT_PER_10 = 2;            // jede volle 10er-Packung verdoppelt Output der Stufe
export const COMPRESSION_BASE = 500;
export const COMPRESSION_GROWTH = 14;
export const COMPRESSION_EFFECT = 1.25;      // × auf alle Generator-Produktion, pro Stufe
export const CLICK_BASE = 1;
export const CLICK_FRACTION = 0.02;          // Klick gibt zusätzlich 2 % der Dust/s
export const COMET_CHANCE_PER_SEC = 1 / 150;
export const COMET_TTL = 12;                 // Sekunden sichtbar/anklickbar
export const COMET_BOOST_MULT = 3;
export const COMET_BOOST_TIME = 30;

// ── Ebene 1: Star (Ignition) ─────────────────────────────────────────────────
export const IGNITION_REQ = 1e30;            // Dust (total dieses Runs)
export const PLASMA_EXP = 0.5;               // gain = (total/REQ)^exp
export const PLASMA_DUST_EXP = 1.1;          // Dust-Mult = (1+plasma)^exp
export const ELEMENT_COUNT = 6;              // H He C O Si Fe
export const FUSION_STEPS = 5;               // H→He→C→O→Si→Fe
export const H_RATE_EXP = 0.75;              // H/s = (1+totalPlasma)^exp * Klassen-/Boost-Mults
export const FUSION_RATIO = 10;              // 10 Input → 1 Output
export const REACTOR_RATE = [1, 0.6, 0.35, 0.2, 0.12];   // Basis-Durchsatz je Level
export const REACTOR_BASE_COST = [1, 4, 16, 64, 256];    // Plasma
export const REACTOR_COST_GROWTH = 2.5;
// Element-Boosts: mult = (1 + log10(1+stock))^EXP  (Fe boostet nichts — Gift)
export const ELEMENT_BOOST_EXP = [0, 2.0, 1.5, 1.4, 1.2, 0]; // H,He,C,O,Si,Fe
export const STAR_CLASSES = [
  { speed: 0.6, plasmaGain: 2.0 },  // Roter Zwerg
  { speed: 1.0, plasmaGain: 1.0 },  // Gelber Stern
  { speed: 1.8, plasmaGain: 0.5 },  // Blauer Riese
];
// Index 4 = Auto-Gen 1–4 · 8 = Auto-Gen 5–8 · 13 = Auto-Kompression · 14 = Auto-Reaktoren
export const PLASMA_UPGRADE_COSTS = [2, 4, 8, 15, 30, 60, 120, 300, 800, 2000, 6000, 15000, 25000, 100, 1500];
export const SOLAR_SAIL_CLICKS = 4;          // Upgrade 13: passiver Staub = 4 Klicks/s

// ── Ebene 2: Supernova ───────────────────────────────────────────────────────
export const SUPERNOVA_REQ = 1e4;            // Fe (Basis)
export const NOVA_REQ_GROWTH = 1.8;          // Fe-Anforderung ×1,8 je Supernova (seit letzter Galaxie)
export const NOVA_LADDER_CAP = 60;           // Leiter steigt bis Stufe 60, dann konstant (Engine überholt wieder)
export const GALAXY_LADDER_CAP = 25;         // analog für die Galaxie-Leiter
export const SHARD_EXP = 0.45;               // shards = (Fe/aktuelleReq)^exp
export const GAIN_SOFTCAP = 1e3;             // ab diesem Verhältnis greift der Softcap-Tail
export const GAIN_TAIL_EXP = 0.2;            // Exponent jenseits des Softcaps (alle Prestige-Gains)
// Härtester Schutz gegen Layer-Leapfrogging: Wachstum pro Reset gedeckelt.
// Faktor je Schleifenfrequenz: Plasma ist der 30-s-Innenloop und darf schneller
// compounden (×20), die äußeren Ebenen (10 min / 40 min / 2 h) bleiben bei ×4.
export const GAIN_CLAMP_MULT = 3;            // Shards/DM/Entropie: gain ≤ total×3 + floor
export const PLASMA_CLAMP_MULT = 19;         // Plasma: gain ≤ total×19 + floor
export const GAIN_CLAMP_FLOOR = 10;
// Aufladezeiten: voller Prestige-Gain erst nach dieser Zeit seit dem letzten Reset der Ebene
export const NOVA_MIN_TIME = 600;            // 10 min
export const GALAXY_MIN_TIME = 2400;         // 40 min
export const COLLAPSE_MIN_TIME = 7200;       // 2 h
export const CH_UNLOCK_NOVAE = (i: number) => 2 + 2 * i;  // Challenge i ab so vielen Supernovae
// ★ Kaskaden-Passiveffekte auf LIFETIME-Werten (resetten nie → kein Prestige-Whiplash)
export const SHARD_DUST_EXP = 0.6;           // Dust ×(1+lifetimeShards)^exp
export const SHARD_H_EXP = 0.4;              // H-Rate ×(1+lifetimeShards)^exp
export const DM_ALL_EXP = 0.6;               // Gesamtproduktion ×(1+lifetimeDM)^exp
export const ENTROPY_ALL_EXP = 0.8;          // Gesamtproduktion ×(1+totalEntropy)^exp
export const NEBULA_CELLS = 19;              // Hex-Grid Radius 2
export const NEBULA_COST_BASE = 1;           // Shards
export const NEBULA_COST_GROWTH = 2;
export const NEBULA_EMISSION_MULT = 3;       // Basis-× Dust-Produktion je Zelle
export const NEBULA_REFLECTION_MULT = 2;     // Basis-× Plasma-Gain je Zelle
export const NEBULA_DARK_BONUS = 2;          // +2 auf Multiplikator jeder Nachbarzelle
export const REMNANT_NEUTRON_FUSION = 1.5;   // × Fusion je Neutronenstern
export const REMNANT_PULSAR_PERIOD = 60;
export const REMNANT_PULSAR_DURATION = 10;
export const REMNANT_PULSAR_MULT = 5;        // Basis-Burst; +2 je weiterem Pulsar
export const REMNANT_BH_SHARDS = 0.5;        // +50 % Shard-Gain je kleinem BH
export const CHALLENGE_COUNT = 8;
// Challenge i verlangt IGNITION_REQ × CH_GOAL_MULT[i] Dust — echte Meilensteine statt Formalität.
// Leiter kalibriert an realer Spielerstärke zur Unlock-Zeit (Ch5 ≈ 1e350 absolut).
export const CH_GOAL_MULT = ['1e6', '1e20', '1e60', '1e150', '1e320', '1e600', '1e1000', '1e1600'];
export const CH7_DECAY = 0.01;               // 1 %/s Dust-Zerfall in Challenge 7
export const CH4_COST_EXP = 1.2;

// ── Ebene 3: Galaxy ──────────────────────────────────────────────────────────
export const COALESCE_REQ = 2500;            // total Nova Shards (Basis)
export const COALESCE_REQ_GROWTH = 3;        // Anforderung ×3 je Coalescence (unter dem ×4-Clamp-Takt)
export const DM_EXP = 0.55;                  // dm = (totalShards/aktuelleReq)^exp
export const CONSTELLATION_NODES = 45;       // 3 Äste à 15
export const NODE_COST = (i: number) => Math.max(1, Math.floor(Math.pow(1.55, i % 15) * (1 + Math.floor(i / 15))));
export const GALAXY_TYPES = [
  { all: 1.25, offline: 1, active: 1 },      // Spiral: +25 % alles
  { all: 1, offline: 2, active: 1 },         // Elliptisch: Offline/Autobuyer ×2
  { all: 1, offline: 1, active: 3 },         // Irregulär: Klick/Komet ×3
];

// ── Ebene 4: Singularity ─────────────────────────────────────────────────────
export const COLLAPSE_REQ = 300;             // total Dark Matter (Basis)
export const COLLAPSE_REQ_GROWTH = 8;        // Anforderung ×8 je bisherigem Collapse
export const ENTROPY_EXP = 0.6;
export const PERK_COUNT = 9;
export const PERK_HAWKING_H = 2.5;           // Hawking: H-Rate ×2,5 je Level (geometrischer Endgame-Motor)
export const PERK_BASE_COST = [1, 3, 10, 25, 100, 500, 2500, 10000, 25];
export const PERK_COST_GROWTH = [3, 4, 5, 6, 8, 10, 12, 15, 20];
// Perk 9 „Sternen-Gedächtnis": L1 Plasma-Upgrades überleben Supernova,
// L2 Reaktoren überleben Supernova, L3 Nebelzellen überleben Coalescence
export const STELLAR_MEMORY_MAX = 3;
export const FEED_ACCRETION_EXP = 2;         // global mult = (1+log10(1+fed))^exp
export const DILATION_MULT = 4;
export const DILATION_TIME = 300;
export const DILATION_CD = 3600;
export const ENDGAME_ENTROPY = 2500;

// ── Meilensteine (je Ebene; Index 0/1 = QoL, danach Persistenz) ─────────────
export const MS_IGNITION = [1, 5, 25];       // Max-Buttons · Sternklassen · Kompression bleibt
export const MS_NOVA = [1, 2, 10, 15, 20, 25]; // Reaktor-Max · Auto-Zündung · je 1 Automation wird permanent
export const MS_GALAXY = [1, 8];             // Typ-Wahl · halbe Remnants bleiben
export const MS_COLLAPSE = [1, 5];           // Perks · Keystones bleiben

// ── Querschnitt ──────────────────────────────────────────────────────────────
export const ACH_MULT = 1.02;                // globale Produktion je Achievement
export const OFFLINE_MAX_SECONDS = 24 * 3600;
export const OFFLINE_CHUNKS = 2000;
export const AUTOSAVE_INTERVAL = 30;
