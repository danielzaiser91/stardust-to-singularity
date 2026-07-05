import { initialState } from '../core/state';
import { tick } from '../core/tick';
import { botStep } from './bot';
import { computeMults, novaReq } from '../core/formulas';

const s = initialState(42);
let lastNova = 0;
let lastIgn = 0;
const t0 = Date.now();
while (s.stats.played < 6 * 3600 && Date.now() - t0 < 120000) {
  tick(s, 1);
  botStep(s, 'active');
  if (s.stats.supernovae !== lastNova) {
    lastNova = s.stats.supernovae;
    const m = computeMults(s);
    console.log(`NOVA #${lastNova} @ ${(s.stats.played / 3600).toFixed(2)}h | ` +
      `totalShards=${s.nova.totalShards.toExponential(2)} req(next)=${novaReq(s).toExponential(1)} ` +
      `plasma=${s.star.plasma.toExponential(2)} hRate=${m.hRate.toExponential(2)} ` +
      `ign=${s.stats.ignitions} lifetimeShards=${s.stats.lifetimeShards.toExponential(2)}`);
  }
  if (s.stats.ignitions !== lastIgn) {
    if (s.stats.ignitions >= 55 && s.stats.ignitions <= 80) {
      const m2 = computeMults(s);
      console.log(`  ign ${s.stats.ignitions} @ ${(s.stats.played / 3600).toFixed(3)}h ` +
        `plasma=${s.star.plasma.toExponential(2)} totalPlasma=${s.star.totalPlasma.toExponential(2)} ` +
        `dustMult=${m2.dustMult.toExponential(1)} He=${s.star.elements[1].toExponential(1)} ` +
        `comp=${s.dust.compression} plasmaGainMult=${m2.plasmaGainMult.toExponential(1)}`);
    }
    lastIgn = s.stats.ignitions;
  }
  if (s.stats.coalescences > 0) { console.log('GALAXY @', (s.stats.played / 3600).toFixed(2), 'h'); break; }
}
