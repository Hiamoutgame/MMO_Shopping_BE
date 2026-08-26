import Decimal from 'decimal.js';

Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

export function money(value: Decimal.Value): Decimal {
  return new Decimal(value || 0);
}

export function formatMoney(value: Decimal.Value): string {
  return money(value).toDecimalPlaces(4).toFixed(4);
}

export function addMoney(a: Decimal.Value, b: Decimal.Value): string {
  return formatMoney(money(a).plus(b));
}

export function subtractMoney(a: Decimal.Value, b: Decimal.Value): string {
  return formatMoney(money(a).minus(b));
}

export function multiplyMoney(a: Decimal.Value, b: Decimal.Value): string {
  return formatMoney(money(a).times(b));
}

export function minMoney(a: Decimal.Value, b: Decimal.Value): string {
  return Decimal.min(money(a), money(b)).toDecimalPlaces(4).toFixed(4);
}
