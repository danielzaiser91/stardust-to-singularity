import Decimal from 'break_eternity.js';

export { Decimal };
export type DecSource = Decimal | number | string;

export const D = (v: DecSource): Decimal => new Decimal(v);
export const ZERO = new Decimal(0);
export const ONE = new Decimal(1);

/** Anzahl kaufbarer Einheiten einer geometrischen Kostenreihe: base*g^bought * (g^n-1)/(g-1) <= budget */
export function affordGeometric(budget: Decimal, base: Decimal, growth: number, bought: number): number {
  const first = base.mul(Decimal.pow(growth, bought));
  if (budget.lt(first)) return 0;
  // n = floor( log_g( budget*(g-1)/first + 1 ) )
  const inner = budget.mul(growth - 1).div(first).add(1);
  const n = Math.floor(inner.log(growth).toNumber());
  return Math.max(n, 1);
}

/**
 * Potenz mit Softcap: x^exp bis capAt, darüber nur noch ^tailExp.
 * Verhindert Layer-Leapfrogging durch Overkill-Runs.
 */
export function softpow(x: Decimal, exp: number, capAt: number, tailExp: number): Decimal {
  if (x.lte(capAt)) return x.pow(exp);
  return Decimal.pow(capAt, exp).mul(x.div(capAt).pow(tailExp));
}

/** Gesamtkosten für n Käufe einer geometrischen Reihe ab `bought` */
export function costGeometric(n: number, base: Decimal, growth: number, bought: number): Decimal {
  const first = base.mul(Decimal.pow(growth, bought));
  return first.mul(Decimal.pow(growth, n).sub(1)).div(growth - 1);
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
