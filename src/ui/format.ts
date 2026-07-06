import { Decimal } from '../core/decimal';
import { t } from '../i18n';

const SUFFIXES = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi'];

/** Zahlformatierung: < 1e21 mit Suffix (außer sci-only), darüber 1.23e45; ab e1e6 Layer-Notation */
export function fmt(d: Decimal, sciOnly = false, decimals = 2): string {
  // Absicherung: ein NaN/Infinity-Decimal (Bug oder korruptes Save) würde die e{fmt(e)}-Rekursion
  // unten endlos laufen lassen (e bleibt NaN) und den Tab mit "Maximum call stack size" abstürzen.
  if (d.isNan() || !d.isFinite()) return '0';
  if (d.lt(0)) return '-' + fmt(d.neg(), sciOnly, decimals);
  if (d.eq(0)) return '0';
  if (d.lt(1000)) {
    const n = d.toNumber();
    return n === Math.floor(n) ? String(n) : n.toFixed(n < 10 ? 2 : 1);
  }
  const e = d.log10().toNumber();
  if (!sciOnly && e < 21) {
    const tier = Math.floor(e / 3);
    const mant = d.div(Decimal.pow(10, tier * 3)).toNumber();
    return `${mant.toFixed(mant < 10 ? 2 : mant < 100 ? 1 : 0)}${SUFFIXES[tier]}`;
  }
  if (e < 1e6) {
    const exp = Math.floor(e);
    const mant = d.div(Decimal.pow(10, exp)).toNumber();
    return `${mant.toFixed(2)}e${exp}`;
  }
  return `e${fmt(new Decimal(e), sciOnly, decimals)}`;  // extreme Skalen: ee-Notation
}

export function fmtInt(d: Decimal): string {
  return d.lt(1e4) ? String(Math.floor(d.toNumber())) : fmt(d);
}

export function fmtTime(sec: number): string {
  if (sec < 60) return `${Math.floor(sec)}${t('time.s')}`;
  if (sec < 3600) return `${Math.floor(sec / 60)}${t('time.m')} ${Math.floor(sec % 60)}${t('time.s')}`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}${t('time.h')} ${Math.floor((sec % 3600) / 60)}${t('time.m')}`;
  return `${Math.floor(sec / 86400)}${t('time.d')} ${Math.floor((sec % 86400) / 3600)}${t('time.h')}`;
}

export function fmtMult(x: number): string {
  return x === Math.floor(x) ? String(x) : x.toFixed(2).replace(/\.?0+$/, '');
}

/** Ressourcen-Icon + Farbe (identisch zu den HUD-Pills) — für Tooltip-Fließtext (innerHTML). */
const RES_META: Record<string, { icon: string; cls: string }> = {
  dust: { icon: '✦', cls: 'res-dust' },
  plasma: { icon: '☀', cls: 'res-plasma' },
  shards: { icon: '✸', cls: 'res-shards' },
  dm: { icon: '◈', cls: 'res-dm' },
  entropy: { icon: '◉', cls: 'res-entropy' },
};
export function resTag(kind: keyof typeof RES_META, value: string): string {
  const r = RES_META[kind];
  return `<span class="tip-res ${r.cls}">${r.icon} ${value}</span>`;
}
/** Hebt eine entscheidende Zahl im Tooltip-Fließtext hervor (Ziel/Bonus/Schwellenwert). */
export function numTag(value: string): string {
  return `<b class="tip-num">${value}</b>`;
}
