import { describe, expect, it } from 'vitest';
import { longDivision, shareRow, type LdLine } from '../../src/lesson/layout/share';

const txt = (ls: LdLine[]) => ls.map((l) => l.kind + ':' + l.cells.map((c) => c.text || '·').join(''));

describe('longDivision', () => {
  it('shows only the setup at shown 0', () => {
    expect(txt(longDivision(59, 4, 0, false))).toEqual(['quotient:····', 'dividend:459·']);
  });
  it('shows the tens step', () => {
    const ls = longDivision(59, 4, 1, false);
    expect(txt(ls)).toEqual(['quotient:·1··', 'dividend:459·', 'product:−4··', 'rule:·─··', 'difference:·19·']);
    expect(ls[2].note).toEqual({ key: 'ldTens', count: 4, value: 40 });
    expect(ls[4].note).toEqual({ key: 'ldLeft', count: 19 });
  });
  it('shows both steps with the remainder', () => {
    const ls = longDivision(59, 4, 2, true);
    expect(txt(ls)).toEqual([
      'quotient:·14R3', 'dividend:459·', 'product:−4··', 'rule:·─··', 'difference:·19·',
      'product:−16·', 'rule:·──·', 'difference:··3·',
    ]);
    expect(ls[5].note).toEqual({ key: 'ldTimes', a: 4, b: 4 });
    expect(ls[7].note).toBeUndefined();
    expect(ls[7].cells[2].tone).toBe('left');
    expect(ls[0].cells[3].tone).toBe('left');
    expect(ls[0].cells[1].tone).toBe(0);
    expect(ls[0].cells[2].tone).toBe(1);
    expect(ls[2].cells.filter((c) => c.text).every((c) => c.tone === 0)).toBe(true);
    expect(ls[5].cells.filter((c) => c.text).every((c) => c.tone === 1)).toBe(true);
  });
  it('leaves the remainder plain without left', () => {
    const ls = longDivision(59, 4, 2, false);
    expect(txt(ls)[0]).toBe('quotient:·14·');
    expect(txt(ls).at(-1)).toBe('difference:··3·');
    expect(ls.at(-1)!.cells[2].tone).toBeNull();
  });
  it('handles an exact division', () => {
    const ls = longDivision(57, 3, 2, false);
    expect(txt(ls)).toEqual([
      'quotient:·19·', 'dividend:357·', 'product:−3··', 'rule:·─··', 'difference:·27·',
      'product:−27·', 'rule:·──·', 'difference:··0·',
    ]);
    expect(ls[2].note).toEqual({ key: 'ldTens', count: 3, value: 30 });
    expect(ls[4].note).toEqual({ key: 'ldLeft', count: 27 });
    expect(ls[5].note).toEqual({ key: 'ldTimes', a: 3, b: 9 });
  });
  it('handles a one-part quotient', () => {
    const ls = longDivision(47, 6, 1, true);
    expect(txt(ls)).toEqual(['quotient:··7R5', 'dividend:647·', 'product:−42·', 'rule:·──·', 'difference:··5·']);
    expect(ls[2].note).toEqual({ key: 'ldTimes', a: 6, b: 7 });
  });
  it('puts the minus just left of a one-digit product, and the rule under its digit', () => {
    const ls = longDivision(51, 4, 2, false);
    expect(txt(ls)).toEqual([
      'quotient:·12·', 'dividend:451·', 'product:−4··', 'rule:·─··', 'difference:·11·',
      'product:·−8·', 'rule:··─·', 'difference:··3·',
    ]);
    expect(ls[5].cells[1]).toEqual({ text: '−', tone: 1 });
    expect(ls[5].note).toEqual({ key: 'ldTimes', a: 4, b: 2 });
    expect(txt(longDivision(10, 9, 1, true)).slice(2)).toEqual(['product:·−9·', 'rule:··─·', 'difference:··1·']);
  });
});

describe('shareRow', () => {
  it('lists given dots then spots', () => {
    expect(shareRow(59, 4, 1)).toEqual([...Array(10).fill(0), ...Array(4).fill('spot')]);
    expect(shareRow(59, 4, 2)).toEqual([...Array(10).fill(0), ...Array(4).fill(1)]);
    expect(shareRow(59, 4, 0)).toEqual(Array(14).fill('spot'));
  });
});
