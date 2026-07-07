/**
 * ★ BALANCE-SHEET ★
 * Sämtliche Spielbalance-Zahlen leben hier. Die Sim (src/sim) und die Balance-Tests
 * (tests/balance.test.ts) validieren jede Änderung. Kein Magic Number außerhalb dieser Datei.
 */

export const SAVE_VERSION = 4;

// ── Ebene 0: Dust ────────────────────────────────────────────────────────────
export const GEN_COUNT = 8;
export const GEN_BASE_COST = [10, 1e3, 1e6, 1e10, 1e14, 1e18, 1e22, 1e26];
export const GEN_GROWTH = [2.0, 2.3, 2.6, 3.0, 3.5, 4.0, 4.5, 5.0];
export const GEN_RATE = [1, 0.5, 0.4, 0.3, 0.25, 0.2, 0.15, 0.1];  // Output je Einheit/s
export const GEN_MULT_PER_10 = 2;            // jede volle 10er-Packung verdoppelt Output der Stufe
// Autobuyer-Budgetanteil je Stufe/Tick — sonst frisst die erste Stufe in einem Tick den
// gesamten Staub weg, bevor andere Stufen drankommen (sichtbarer Staub bleibt bei 0).
export const AUTOBUY_BUDGET_FRAC = 0.3;
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
export const NEBULA_DARK_BONUS = 2;          // ×2 auf den Multiplikator jeder Nachbarzelle (max. 6 Nachbarn ⇒ ≤ ×64)
export const REMNANT_NEUTRON_FUSION = 1.5;   // × Fusion je Neutronenstern
export const REMNANT_PULSAR_PERIOD = 60;
export const REMNANT_PULSAR_DURATION = 10;
export const REMNANT_PULSAR_MULT = 5;        // Basis-Burst; +2 je weiterem Pulsar
export const REMNANT_BH_SHARDS = 0.5;        // +50 % Scherben-CLAMP je kleinem BH (hebt den Deckel selbst an)
export const CHALLENGE_COUNT = 8;
// Challenge i verlangt IGNITION_REQ × CH_GOAL_MULT[i] Dust — echte Meilensteine statt Formalität.
// Leiter kalibriert an realer Spielerstärke zur Unlock-Zeit (Ch5 ≈ 1e350 absolut).
export const CH_GOAL_MULT = ['1e6', '1e20', '1e60', '1e150', '1e320', '1e600', '1e1000', '1e1600'];
export const CH7_DECAY = 0.01;               // 1 %/s Dust-Zerfall in Challenge 7
export const CH4_COST_EXP = 1.2;
// Hard-Stufe (Stufe 2) je Challenge: gleiche Restriktion, höheres Ziel — Fortsetzung der
// wachsenden Log-Abstände von CH_GOAL_MULT (14,40,90,170,280,400,600 → weiter steigend).
// Erste-Fassung-Werte; per Spieler-Feedback nachjustierbar wie der Rest der Balance-Sheet.
export const CH_GOAL_MULT_TIER2 = ['1e46', '1e110', '1e230', '1e430', '1e720', '1e1200', '1e1900', '1e2900'];
// Hard-Stufe wählbar ab MS_GALAXY[3] Coalescences (zusätzlich: Normal-Stufe muss bereits stehen).

// ── Ebene 3: Galaxy ──────────────────────────────────────────────────────────
export const COALESCE_REQ = 2500;            // total Nova Shards (Basis)
export const COALESCE_REQ_GROWTH = 3;        // Anforderung ×3 je Coalescence (unter dem ×4-Clamp-Takt)
export const DM_EXP = 0.55;                  // dm = (totalShards/aktuelleReq)^exp
export const CONSTELLATION_NODES = 45;       // 3 Äste à 15
export const NODE_COST = (i: number) => Math.max(1, Math.floor(Math.pow(1.55, i % 15) * (1 + Math.floor(i / 15))));
// Galaxientyp-Wahl skaliert wie Remnants: JEDE Wahl zählt permanent (stats.gtypePicks),
// alle drei Boni wirken gleichzeitig, jeder mit seiner eigenen Basis hoch Anzahl-Wahlen —
// kein „aktiver" Typ mehr, mehrfach denselben Typ zu wählen verstärkt ihn exponentiell.
export const GALAXY_TYPE_ALL = 1.25;         // Spiral: Gesamtproduktion ×1,25 je Wahl
export const GALAXY_TYPE_OFFLINE = 2;        // Elliptisch: Offline-Fortschritt ×2 je Wahl
export const GALAXY_TYPE_ACTIVE = 3;         // Irregulär: Klick-/Kometen-Kraft ×3 je Wahl
// Collapse setzt stats.coalescences zurück (frische Galaxie, frische Verschmelzungs-Leiter) —
// als Ausgleich zählt jede Verschmelzung danach ×COALESCENCE_BONUS_MULT (steigt +1 je Collapse).
export const COALESCENCE_BONUS_PER_COLLAPSE = 1;

// ── Ebene 4: Singularity ─────────────────────────────────────────────────────
export const COLLAPSE_REQ = 300;             // total Dark Matter (Basis)
export const COLLAPSE_REQ_GROWTH = 8;        // Anforderung ×8 je bisherigem Collapse
export const ENTROPY_EXP = 0.6;
export const PERK_COUNT = 9;
export const PERK_HAWKING_H = 2.5;           // Hawking: H-Rate ×2,5 je Level (geometrischer Endgame-Motor)
export const PERK_BASE_COST = [1, 3, 10, 25, 100, 500, 2500, 10000, 25];
export const PERK_COST_GROWTH = [3, 4, 5, 6, 8, 10, 12, 15, 20];
// ⚠ Endgame-Kalibrierung offen: 40-Tage-Sim (aktiv, Seed 42) erreicht nur 2 Kollapse, Endgame
// (2500 Entropie) nicht. Zwei Konstanten-Fixes an Perk 1 (Hawking) wurden geprüft und verworfen
// (Diagnose in BALANCE.md) — beide halfen nicht bzw. schadeten. Braucht eine echte Design-
// Entscheidung, kein Constants-Tweak. Siehe BALANCE.md „Endgame-Kalibrierung" + todo.md.
// Perk 9 „Sternen-Gedächtnis": L1 Reaktoren überleben Supernova/Coalescence/Collapse (sonst
// NIRGENDS anders persistierbar); L2/L3 lassen einen Teil des Fusionsmaterials (He/C/O/Si)
// eine Supernova überstehen. Absichtlich NICHT mehr an Plasma-Upgrades/Nebelgarten — die sind
// über die Meilenstein-Leitern (MS_NOVA_KEEP, MS_GALAXY[7]) ohnehin erreichbar und machten den
// Perk redundant (2026-07-07).
export const STELLAR_MEMORY_MAX = 3;
export const PERK_STELLAR_ELEMENT_RETAIN = [0, 0, 0.10, 0.25];  // Index = Perk-Level
export const FEED_ACCRETION_EXP = 2;         // global mult = (1+log10(1+fed))^exp
// Konsum bei Gewinn: JEDER Ressourcen-Gewinn (Dust/Plasma/Shards/DM) wird nach Singularitäts-
// Unlock sofort gesplittet — die Hälfte bleibt Spielwährung, die andere Hälfte nährt die Leere
// (log-gewichtet nach Ressourcenstufe: höhere Stufen zählen überproportional stärker, wie
// zuvor bei feedMass). Ersetzt den alten periodischen Voll-Wipe (verursachte den Bug, dass
// Scherben kurz nach einer Supernova auf 0 fielen, wenn der Wipe-Akkumulator gerade kippte).
export const FEED_SPLIT_FRAC = 0.5;
export const FEED_WEIGHT_DUST = 1;
export const FEED_WEIGHT_PLASMA = 10;
export const FEED_WEIGHT_SHARDS = 100;
export const FEED_WEIGHT_DM = 1000;
// Zeitdilation: kein aktivierbarer Button mehr, sondern ein DAUERHAFTER Speed-Bonus, der als
// Bruchteil des Akkretions-Bonus (Füttere-die-Leere) mitwächst — kein eigenes Timing/Cooldown.
export const DILATION_ACCRETION_FRAC = 0.1;
// Hart gedeckelt: der Akkretions-Bonus selbst ist UNBEGRENZT (wächst mit log(fed)^2 für immer),
// ein daran gekoppelter Zeitfaktor darf das nicht sein — sonst wird gdt (Spielzeit/Tick) bei
// hohem `fed` astronomisch groß und reißt jeden Sekunden-Akkumulator (z. B. Auto-Supernova) über
// seine 100-%-Schwelle, was zu Reset-Dauerfeuer führt (jeder Frame ein neuer Supernova-Reset —
// Fusionselemente zeigen dauerhaft 0, Bildschirm flackert). Realer Bug, 2026-07-07.
export const DILATION_MAX_MULT = 50;
export const ENDGAME_ENTROPY = 2500;

// ── Meilensteine (je Ebene; Index 0/1 = QoL, danach Persistenz) ─────────────
export const MS_IGNITION = [1, 5, 25];       // Max-Buttons · Sternklassen · Kompression bleibt
export const MS_NOVA = [1, 2, 4, 8, 12, 16, 20, 25, 30, 35, 40, 50];
// Ab MS_NOVA[2]: welches Plasma-Upgrade bei diesem Meilenstein permanent wird (-1 = alle übrigen).
// Reihenfolge: erst die vier Automationen, dann die wichtigsten Boosts.
export const MS_NOVA_KEEP = [4, 13, 8, 14, 1, 6, 10, 7, 11, -1];
// Galaxie-Meilensteine: Typ-Wahl · Reflexionsnebel boosten auch Eisen · Challenges bleiben ·
// Hard-Challenge-Stufe wählbar · Zündungs-Meilensteine permanent · Supernova-Meilensteine bleiben ·
// Auto-Supernova · Nebelgarten bleibt · Remnants bleiben („bleiben" = über Coalescence)
export const MS_GALAXY = [1, 2, 3, 5, 6, 9, 10, 12, 50];
// Auto-Trickle: kontinuierlicher Anteil des aktuellen Prestige-Gewinns pro Sekunde
// (pro Tick berechnet); bei 100 % Akkumulation zählt ein Reset-Event (Leitern/Charge intakt).
// Zündung: ln(20)/19 ≈ 15,8 %/s = kontinuierliches Äquivalent EINER vollen Zündung pro
// Sekunde am ×20-Clamp — Auto ist damit exakt so stark wie optimaler manueller Spam.
export const AUTO_IGNITE_RATE = Math.log(PLASMA_CLAMP_MULT + 1) / PLASMA_CLAMP_MULT;
export const AUTO_NOVA_RATE = 0.01;
export const AUTO_COALESCE_RATE = 0.01;
// Kollaps-Meilensteine: Perks · Spezial-MS Supernova · Spezial-MS Staub + Nebelgarten-Sockel ·
// Remnants bleiben + Auto-Verschmelzen · Keystones bleiben
export const MS_COLLAPSE = [1, 2, 3, 4, 5];
// ── Spezial-Meilensteine ─────────────────────────────────────────────────────
// Supernova (ab 2 Kollapsen): je 10 Remnants EINES Typs steigt dessen Effekt eine Stufe.
// Staub (ab 3 Kollapsen): je 100 Käufe einer Generator-Stufe (im Run) Output ×3, stapelnd.
export const SPECIAL_REMNANT_STEP = 10;
export const SPECIAL_NEUTRON_BONUS = 0.1;    // +0,1 Fusions-Basis je Stufe (1,5 → 1,6 → …)
export const SPECIAL_PULSAR_BONUS = 1;       // +1 Burst-Beitrag je weiterem Pulsar, je Stufe
export const SPECIAL_PULSAR_DUR = 10;        // +10 s Burst-Dauer je Stufe → ab Stufe 5 (50 Pulsare) permanent
export const SPECIAL_BH_BONUS = 0.15;        // +15 % Scherben je Schwarzem Loch, je Stufe
export const SPECIAL_GEN_STEP = 100;
export const SPECIAL_GEN_MULT = 3;
export const REMNANT_PULSAR_PER = 2;         // Basis-Burst-Beitrag je weiterem Pulsar

// ── Querschnitt ──────────────────────────────────────────────────────────────
export const ACH_MULT = 1.02;                // globale Produktion je Achievement
export const OFFLINE_MAX_SECONDS = 24 * 3600;
export const OFFLINE_CHUNKS = 2000;
export const AUTOSAVE_INTERVAL = 30;
