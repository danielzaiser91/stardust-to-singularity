import Decimal from 'break_eternity.js';

export { Decimal };
export type DecSource = Decimal | number | string;

export const D = (v: DecSource): Decimal => new Decimal(v);
export const ZERO = new Decimal(0);
export const ONE = new Decimal(1);

/**
 * Harte Obergrenze für Zähler, die als Exponent in Decimal.pow() dienen (bought/compression/
 * Reaktorstufen) — das sind normale JS-Zahlen, keine Decimals! Normale Addition liefe ab
 * Number.MAX_VALUE (~1.8e308) in Infinity über → Decimal.pow(base, Infinity) vergiftet danach
 * jeden Tick (Anzeige zeigt buchstäblich "Infinity", Produktion fällt auf 0/NaN). Der Zähler
 * selbst braucht diese Größe nie: growth^MAX_SAFE_INTEGER hat bereits mehrere Billiarden
 * Dezimalstellen — Deckeln hier kostet keine spürbare Balance, ist reines Sicherheitsnetz.
 * Gleichzeitig die einzige Zahl, bis zu der JS-Doubles noch JEDE Ganzzahl exakt darstellen —
 * jenseits davon hat affordGeometric() unten keine verlässliche Grundlage mehr zu suchen.
 */
export const MAX_COUNTER = Number.MAX_SAFE_INTEGER;
export function addCounter(current: number, n: number): number {
  return Math.min(current + n, MAX_COUNTER);
}

/** Gesamtkosten für n Käufe einer geometrischen Reihe ab `bought` */
export function costGeometric(n: number, base: Decimal, growth: number, bought: number): Decimal {
  const first = base.mul(Decimal.pow(growth, bought));
  return first.mul(Decimal.pow(growth, n).sub(1)).div(growth - 1);
}

/** Anzahl kaufbarer Einheiten einer geometrischen Kostenreihe: base*g^bought * (g^n-1)/(g-1) <= budget */
export function affordGeometric(budget: Decimal, base: Decimal, growth: number, bought: number): number {
  const first = base.mul(Decimal.pow(growth, bought));
  if (budget.lt(first)) return 0;
  // n = floor( log_g( budget*(g-1)/first + 1 ) ) — nur eine ERSTE Schätzung für die Suche unten.
  const inner = budget.mul(growth - 1).div(first).add(1);
  const estimate = inner.log(growth).toNumber();
  // Bei extremen Größenordnungen (viele Layer tief) kann break_eternitys .log()/.toNumber()
  // NaN liefern. n landet u. a. direkt in dust.compression/gens[].bought (normale Zahlen, keine
  // Decimals!) — einmal NaN dort vergiftet JEDEN folgenden Tick auf Dauer (übersteht Ignitionen).
  // Lieber diesen Tick nichts kaufen als den Save dauerhaft zu korrumpieren.
  if (!Number.isFinite(estimate)) return 0;
  // Der log()/toNumber()-Rundtrip verliert bei riesigem n an Präzision (beobachtet: Schätzung
  // ~100 Einheiten zu hoch bei n > 1e16) — costGeometric(n) landet dann übers Budget, "Max"
  // kauft sichtbar nichts, obwohl fast die geschätzte Menge bezahlbar wäre. Statt zu raten:
  // binär exakt zwischen 1 und MAX_COUNTER suchen. WICHTIG: die Suchgrenze bei MAX_COUNTER
  // kappen (= Number.MAX_SAFE_INTEGER) — jenseits davon können JS-Doubles nicht mehr jede
  // Ganzzahl darstellen (ULP > 1), wodurch `mid`-Berechnungen nicht mehr konvergieren würden.
  // Mehr als MAX_COUNTER auf einen Schlag zu kaufen wäre ohnehin sinnlos: addCounter() kappt
  // bought/compression dort sowieso.
  let lo = 1;
  let hi = Math.min(Math.max(2, Math.floor(estimate) + 1), MAX_COUNTER);
  while (lo < hi) {
    const mid = lo + Math.ceil((hi - lo) / 2);
    if (costGeometric(mid, base, growth, bought).lte(budget)) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/**
 * Potenz mit Softcap: x^exp bis capAt, darüber nur noch ^tailExp.
 * Verhindert Layer-Leapfrogging durch Overkill-Runs.
 */
export function softpow(x: Decimal, exp: number, capAt: number, tailExp: number): Decimal {
  if (x.lte(capAt)) return x.pow(exp);
  return Decimal.pow(capAt, exp).mul(x.div(capAt).pow(tailExp));
}

/**
 * Reduziert eine volle Max-Kaufmenge auf einen Budget-Anteil — auf n (Zahl), NICHT auf das
 * Decimal-Budget: bei extremen Skalen (Layer-2-Decimals, z. B. "ee16...") ist budget.mul(0.3)
 * numerisch identisch zum vollen Budget (der Faktor verschwindet in der Rundung), reduziert die
 * Kaufmenge also gar nicht — Autobuyer würde weiterhin 100 % verkonsumieren. n*frac auf einer
 * normalen JS-Zahl bleibt exakt und senkt die Kosten dank exponentiellem Wachstum drastisch.
 */
export function capAffordCount(nFull: number, budgetFrac: number): number {
  if (budgetFrac >= 1 || nFull <= 0) return nFull;
  return Math.max(1, Math.floor(nFull * budgetFrac));
}
