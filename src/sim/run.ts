/**
 * Headless-Balance-Simulation.
 *   npx tsx src/sim/run.ts --until supernova_1 --profile active --maxDays 2
 * Gibt die Meilenstein-Timeline aus und schreibt sim/reports/<timestamp>.json.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { initialState } from '../core/state';
import { simulate, type Profile } from './bot';

function arg(name: string, def: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}

const until = arg('until', 'endgame');
const profile = arg('profile', 'active') as Profile;
const maxDays = Number(arg('maxDays', '30'));
const seed = Number(arg('seed', '42'));

const fmtT = (sec: number) => {
  if (sec < 3600) return `${(sec / 60).toFixed(1)} min`;
  if (sec < 86400) return `${(sec / 3600).toFixed(2)} h`;
  return `${(sec / 86400).toFixed(2)} d`;
};

console.log(`▶ sim: profile=${profile} until=${until} maxDays=${maxDays} seed=${seed}`);
const t0 = Date.now();
const result = simulate(initialState(seed), profile, until, maxDays);
const wall = ((Date.now() - t0) / 1000).toFixed(1);

console.log(`\n Meilenstein          Spielzeit`);
console.log(` ─────────────────────────────────`);
for (const ms of result.milestones) {
  console.log(` ${ms.name.padEnd(20)} ${fmtT(ms.at)}`);
}
console.log(`\n Simulierte Zeit: ${fmtT(result.state.stats.played)} · Wall-Time: ${wall}s`);
console.log(` Ignitions: ${result.state.stats.ignitions} · Supernovae: ${result.state.stats.supernovae}` +
  ` · Coalescences: ${result.state.stats.coalescences} · Collapses: ${result.state.stats.collapses}`);

mkdirSync('sim/reports', { recursive: true });
const file = `sim/reports/${profile}-${until}-${Date.now()}.json`;
writeFileSync(file, JSON.stringify({ profile, until, maxDays, seed, milestones: result.milestones }, null, 2));
console.log(` Report: ${file}`);
