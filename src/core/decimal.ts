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

/** Gesamtkosten für n Käufe einer geometrischen Reihe ab `bought` */
export function costGeometric(n: number, base: Decimal, growth: number, bought: number): Decimal {
  const first = base.mul(Decimal.pow(growth, bought));
  return first.mul(Decimal.pow(growth, n).sub(1)).div(growth - 1);
}
