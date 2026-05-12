import type { CADCoinName, Currency, USDCoinName } from '../../types';

export const COIN_VALUES_USD: Readonly<Record<USDCoinName, number>> = Object.freeze({
  penny: 1,
  nickel: 5,
  dime: 10,
  quarter: 25,
});

export const COIN_VALUES_CAD: Readonly<Record<CADCoinName, number>> = Object.freeze({
  nickel: 5,
  dime: 10,
  quarter: 25,
  loonie: 100,
  toonie: 200,
});

export function computeCoinTotal(
  coins: Partial<Record<USDCoinName | CADCoinName, number>>,
  currency: Currency,
): number {
  if (currency === 'USD') {
    let total = 0;
    for (const key of Object.keys(COIN_VALUES_USD) as USDCoinName[]) {
      const count = coins[key];
      if (typeof count === 'number' && count > 0) {
        total += count * COIN_VALUES_USD[key];
      }
    }
    return total;
  }
  let total = 0;
  for (const key of Object.keys(COIN_VALUES_CAD) as CADCoinName[]) {
    const count = coins[key];
    if (typeof count === 'number' && count > 0) {
      total += count * COIN_VALUES_CAD[key];
    }
  }
  return total;
}
