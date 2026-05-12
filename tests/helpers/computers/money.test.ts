import { describe, it, expect } from 'vitest';
import {
  computeCoinTotal,
  COIN_VALUES_USD,
  COIN_VALUES_CAD,
} from '../../../src/helpers/computers/money';
import usdSamples from '../../fixtures/money-usd-sample.json';
import cadSamples from '../../fixtures/money-cad-sample.json';

describe('computeCoinTotal USD', () => {
  it('sums basic mix', () => {
    expect(computeCoinTotal({ penny: 4, nickel: 1, dime: 1, quarter: 5 }, 'USD')).toBe(144);
  });

  it('treats missing keys as zero', () => {
    expect(computeCoinTotal({ quarter: 1 }, 'USD')).toBe(25);
  });

  it('returns 0 for empty', () => {
    expect(computeCoinTotal({}, 'USD')).toBe(0);
  });

  it('ignores invalid coin types', () => {
    expect(computeCoinTotal({ penny: 1, toonie: 5 } as Record<string, number>, 'USD')).toBe(1);
  });
});

describe('computeCoinTotal CAD', () => {
  it('sums basic CAD mix', () => {
    expect(computeCoinTotal({ nickel: 1, dime: 3, toonie: 4 }, 'CAD')).toBe(835);
  });

  it('ignores penny for CAD (penny retired)', () => {
    expect(computeCoinTotal({ penny: 100, nickel: 1 } as Record<string, number>, 'CAD')).toBe(5);
  });
});

describe('computeCoinTotal vs bank answers (fixture parity)', () => {
  it.each(usdSamples)('USD $id totals to bank answer', (q) => {
    expect(computeCoinTotal(q.content.coins, 'USD')).toBe(q.answer);
  });

  it.each(cadSamples)('CAD $id totals to bank answer', (q) => {
    expect(computeCoinTotal(q.content.coins, 'CAD')).toBe(q.answer);
  });
});

describe('coin value tables', () => {
  it('USD has penny=1, nickel=5, dime=10, quarter=25', () => {
    expect(COIN_VALUES_USD).toEqual({ penny: 1, nickel: 5, dime: 10, quarter: 25 });
  });

  it('CAD has nickel=5, dime=10, quarter=25, loonie=100, toonie=200', () => {
    expect(COIN_VALUES_CAD).toEqual({
      nickel: 5,
      dime: 10,
      quarter: 25,
      loonie: 100,
      toonie: 200,
    });
  });
});
