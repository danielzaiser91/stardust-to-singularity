/** Nova→Galaxie-Schleife instrumentieren: warum stockt DM? */
import { initialState } from '../core/state';
import { tick } from '../core/tick';
import { botStep } from './bot';
import { computeMults, shardGain, dmGain, novaReq, coalesceReq } from '../core/formulas';

const s = initialState(42);
let lastNova = 0, lastGal = 0;
const t0 = Date.now();
while (s.stats.played < 3 * 86400 && Date.now() - t0 < 240000) {
  const m0 = tick(s, 1);
  botStep(s, 'active', m0);
  const day = s.stats.played / 86400;
  if (day < 1.5) continue;  // nur Tag 1,5–3 beobachten
  if (s.stats.supernovae !== lastNova) {
    lastNova = s.stats.supernovae;
    const m = computeMults(s);
    console.log(`NOVA #${lastNova} (run ${s.nova.count}) @d${day.toFixed(2)} | ` +
      `totalShards=${s.nova.totalShards.toExponential(1)} nextReq=${novaReq(s).toExponential(1)} ` +
      `Fe=${s.star.elements[5].toExponential(1)} nextGain=${shardGain(s, m).toExponential(1)} novaTime=${s.stats.novaTime.toFixed(0)}`);
  }
  if (s.stats.coalescences !== lastGal) {
    lastGal = s.stats.coalescences;
    const m = computeMults(s);
    console.log(`GALAXY #${lastGal} (run ${s.galaxy.count}) @d${day.toFixed(2)} | ` +
      `totalDM=${s.galaxy.totalDM.toExponential(1)} galReq=${coalesceReq(s).toExponential(1)} ` +
      `dmGain(now)=${dmGain(s, m).toExponential(1)} galaxyTime=${(s.stats.galaxyTime / 3600).toFixed(1)}h`);
  }
  if (s.stats.coalescences >= 8) break;
}
console.log('ende @d', (s.stats.played / 86400).toFixed(2), 'gal', s.stats.coalescences, 'dm', s.galaxy.totalDM.toExponential(1));
