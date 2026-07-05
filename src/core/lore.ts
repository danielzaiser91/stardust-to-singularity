import type { GameState } from './state';
import { ENDGAME_ENTROPY } from './constants';

/** 32 Lore-Trigger — Texte in i18n unter lore.N. Die Reise vom Staubkorn zur Singularität. */
type Trigger = (s: GameState) => boolean;

export const LORE_TRIGGERS: Trigger[] = [
  s => s.stats.played >= 3,                       // 0  Intro: Du bist ein Staubkorn.
  s => s.dust.gens[0].bought > 0,                 // 1  Erster Attractor
  s => s.dust.gens[3].bought > 0,                 // 2  Planetesimale
  s => s.dust.gens[5].bought > 0,                 // 3  Ein Planet!
  s => s.dust.gens[7].bought > 0,                 // 4  Protostern
  s => s.stats.totalDustEver.gte(1e15),           // 5  Die Wolke verdichtet sich
  s => s.stats.totalDustEver.gte(1e27),           // 6  Kurz vor der Zündung
  s => s.stats.ignitions >= 1,                    // 7  IGNITION
  s => s.star.elements[1].gt(0),                  // 8  Erstes Helium
  s => s.star.elements[2].gt(0),                  // 9  Kohlenstoff — Baustein des Lebens
  s => s.star.elements[4].gt(0),                  // 10 Silizium
  s => s.star.elements[5].gt(0),                  // 11 Eisen. Der Anfang vom Ende.
  s => s.stats.ignitions >= 10,                   // 12 Routine der Wiedergeburt
  s => s.star.elements[5].gte(5e3),               // 13 Der Kern wird schwer
  s => s.stats.supernovae >= 1,                   // 14 SUPERNOVA
  s => s.nova.cellsBought >= 1,                   // 15 Erster Nebel gesät
  s => s.nova.remnants[1] >= 1,                   // 16 Ein Pulsar blinkt
  s => s.nova.completed.some(Boolean),            // 17 Erste Challenge
  s => s.nova.completed.filter(Boolean).length >= 8, // 18 Alle Challenges
  s => s.nova.totalShards.gte(1e4),               // 19 Die Trümmer sammeln sich
  s => s.stats.coalescences >= 1,                 // 20 GALAXIE
  s => s.galaxy.nodes.filter(Boolean).length >= 1,   // 21 Erste Konstellation
  s => s.galaxy.nodes[14],                        // 22 Gravity-Keystone
  s => s.galaxy.nodes[29],                        // 23 Time-Keystone
  s => s.galaxy.nodes[44],                        // 24 Light-Keystone
  s => s.galaxy.totalDM.gte(1e3),                 // 25 Dunkle Materie flüstert
  s => s.stats.collapses >= 1,                    // 26 KOLLAPS — Singularität
  s => s.sing.fed.gte(100),                       // 27 Das Loch frisst
  s => s.sing.perks.some(p => p > 0),             // 28 Erster Perk
  s => s.sing.totalEntropy.gte(ENDGAME_ENTROPY / 5),   // 29 Entropie steigt
  s => s.sing.totalEntropy.gte(ENDGAME_ENTROPY),       // 30 Am Rand des Endes
  s => s.sing.universes >= 1,                     // 31 EIN NEUES UNIVERSUM
];

export function checkLore(s: GameState): void {
  for (let i = 0; i < LORE_TRIGGERS.length; i++) {
    if (!s.loreSeen[i] && LORE_TRIGGERS[i](s)) {
      s.loreSeen[i] = true;
      s.pending.lore.push(i);
    }
  }
}
