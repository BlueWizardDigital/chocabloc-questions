import { describe, it, expect } from 'vitest';
import { orderFixedChoiceSet } from '../../src/helpers/choice-order';

describe('orderFixedChoiceSet', () => {
  it('orders letters', () => {
    expect(orderFixedChoiceSet(['C', 'A', 'D', 'B'])).to.deep.equal(['A', 'B', 'C', 'D']);
  });
  it('puts Same after the letters', () => {
    expect(orderFixedChoiceSet(['Same', 'B', 'A'])).to.deep.equal(['A', 'B', 'Same']);
  });
  it('orders the comparison words', () => {
    expect(orderFixedChoiceSet(['greater than', 'less than', 'equal to'])).to.deep.equal([
      'less than', 'equal to', 'greater than',
    ]);
  });
  it('orders the benchmarks', () => {
    expect(orderFixedChoiceSet(['1', '0', '1/2'])).to.deep.equal(['0', '1/2', '1']);
  });
  it('returns null for a set outside one list', () => {
    expect(orderFixedChoiceSet(['3/4', '1/2', '2/3'])).to.equal(null);
  });
  it('returns null for a set that spans two lists', () => {
    expect(orderFixedChoiceSet(['A', '0'])).to.equal(null);
  });
  it('returns null for an empty set', () => {
    expect(orderFixedChoiceSet([])).to.equal(null);
  });
});
