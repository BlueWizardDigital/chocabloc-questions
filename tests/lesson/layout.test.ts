import { describe, test, expect } from 'vitest';
import { base10Blocks, base10Caption, focusColors, PALE } from '../../src/lesson/layout/base10';
import { labelGap, numberLineLayout } from '../../src/lesson/layout/number-line';
import { columnsLayout } from '../../src/lesson/layout/columns';
import { createMessages } from '../../src/lesson/messages';

const msg = createMessages({ lang: 'en' });

describe('base10', () => {
  test('blocks split a number by place', () => {
    expect(base10Blocks(1234)).toEqual({ thousands: 1, hundreds: 2, tens: 3, ones: 4 });
    expect(base10Blocks(0)).toEqual({ thousands: 0, hundreds: 0, tens: 0, ones: 0 });
  });
  test('caption skips empty places and joins the rest', () => {
    expect(base10Caption(34, msg, 'en')).toBe('3 tens and 4 ones');
    expect(base10Caption(1003, msg, 'en')).toBe('1 thousand and 3 ones');
    expect(base10Caption(0, msg, 'en')).toBe('0 ones');
    expect(base10Caption(1, msg, 'en')).toBe('1 one');
  });
  test('focusColors keeps the focused place and pales the rest', () => {
    expect(focusColors(undefined)).toBeUndefined();
    const c = focusColors('tens')!;
    expect(c.fillTens).toBeUndefined();
    expect(c.fillOnes).toBe(PALE);
    expect(c.fillHundreds).toBe(PALE);
    expect(c.fillThousands).toBe(PALE);
  });
});

describe('numberLineLayout', () => {
  const W = 320;
  test('0-20 has a tick for every whole number, labelled every second one', () => {
    const l = numberLineLayout({ kind: 'numberLine', from: 0, to: 20 }, W);
    expect(l.ticks.map((t) => t.value)).toEqual(Array.from({ length: 21 }, (_, i) => i));
    expect(l.ticks.filter((t) => t.label).map((t) => t.value)).toEqual([0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20]);
  });
  test('0-20 with marks 10 and 12 and a jump 12 to 10 keeps ticks 10, 11, 12', () => {
    const l = numberLineLayout({ kind: 'numberLine', from: 0, to: 20, marks: [10, 12], jumps: [{ from: 12, to: 10 }] }, W);
    for (const v of [10, 11, 12]) expect(l.ticks.some((t) => t.value === v)).toBe(true);
    for (const v of [10, 12]) expect(l.ticks.find((t) => t.value === v)?.label).toBe(true);
  });
  test('0-100 uses step 5 and labels 0, 10 ... 100', () => {
    const l = numberLineLayout({ kind: 'numberLine', from: 0, to: 100 }, W);
    expect(l.ticks[1].value).toBe(5);
    expect(l.ticks.filter((t) => t.label).map((t) => t.value)).toEqual([0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100]);
  });
  test('0-10 is fully labelled', () => {
    const l = numberLineLayout({ kind: 'numberLine', from: 0, to: 10 }, W);
    expect(l.ticks).toHaveLength(11);
    expect(l.ticks.every((t) => t.label)).toBe(true);
  });
  test('0-1000 uses step 50, 21 ticks', () => {
    const l = numberLineLayout({ kind: 'numberLine', from: 0, to: 1000 }, W);
    expect(l.ticks).toHaveLength(21);
    expect(l.ticks[1].value).toBe(50);
  });
  test('more than 11 ticks label every second tick plus the ends', () => {
    const l = numberLineLayout({ kind: 'numberLine', from: 0, to: 15 }, W);
    expect(l.ticks).toHaveLength(16);
    expect(l.ticks.filter((t) => t.label).map((t) => t.value)).toEqual([0, 2, 4, 6, 8, 10, 12, 14, 15]);
  });
  test('x stays inside the padding; marks and jumps are placed', () => {
    const l = numberLineLayout(
      { kind: 'numberLine', from: 0, to: 13, marks: [8, 5], jumps: [{ from: 8, to: 13 }, { from: 13, to: 4 }] },
      W,
    );
    for (const t of l.ticks) {
      expect(t.x).toBeGreaterThanOrEqual(16);
      expect(t.x).toBeLessThanOrEqual(W - 16);
    }
    expect(l.ticks[0].x).toBe(16);
    expect(l.ticks[l.ticks.length - 1].x).toBe(W - 16);
    expect(l.marks.map((m) => m.value)).toEqual([8, 5]);
    expect(l.jumps.map((j) => j.label)).toEqual(['+5', '−9']);
    expect(l.jumps[0].fromX).toBeLessThan(l.jumps[0].toX);
  });
  test('0-20 at 320: every mark and jump end is labelled, and no labels on one row touch', () => {
    const l = numberLineLayout(
      {
        kind: 'numberLine',
        from: 0,
        to: 20,
        marks: [9, 13],
        jumps: [{ from: 9, to: 10 }, { from: 10, to: 13 }],
      },
      W,
    );
    const shown = [
      ...l.ends.map((e) => ({ v: e.value, x: e.x, row: e.row })),
      ...l.ticks.filter((t) => t.label).map((t) => ({ v: t.value, x: t.x, row: t.row })),
    ];
    for (const v of [9, 10, 13]) expect(shown.some((s) => s.v === v)).toBe(true);
    // no double label at one value
    expect(new Set(shown.map((s) => s.v)).size).toBe(shown.length);
    for (let i = 0; i < shown.length; i++)
      for (let j = i + 1; j < shown.length; j++)
        if (shown[i].row === shown[j].row) expect(Math.abs(shown[i].x - shown[j].x)).toBeGreaterThanOrEqual(labelGap(shown[i].v, shown[j].v));
    // the plain ticks beside 9 and 13 gave way
    // 8 is one character wide beside 9, so it still fits (gap 10.5 < 14.4)
    expect(l.ticks.find((t) => t.value === 8)?.label).toBe(true);
    expect(l.ticks.find((t) => t.value === 12)?.label).toBe(false);
    expect(l.ticks.find((t) => t.value === 4)?.label).toBe(true);
  });
  test('three close forced values (width 160) use three rows, none touching', () => {
    const l = numberLineLayout({ kind: 'numberLine', from: 0, to: 20, marks: [9, 10, 11] }, 160);
    const shown = [...l.ends, ...l.ticks.filter((t) => t.label && [9, 10, 11].includes(t.value))];
    expect(l.rows).toBe(3);
    for (let i = 0; i < shown.length; i++)
      for (let j = i + 1; j < shown.length; j++)
        if (shown[i].row === shown[j].row)
          expect(Math.abs(shown[i].x - shown[j].x)).toBeGreaterThanOrEqual(labelGap(shown[i].value, shown[j].value));
  });
  test('4-character labels need a wider gap than 2-digit ones', () => {
    expect(labelGap(1000, -150)).toBeGreaterThanOrEqual(34);
    expect(labelGap(9, 10)).toBeLessThan(labelGap(1000, 900));
    const l = numberLineLayout({ kind: 'numberLine', from: 900, to: 1000, marks: [995, 1000] }, W);
    expect(l.rows).toBe(2);
  });
  test('one row for a plain line', () => {
    expect(numberLineLayout({ kind: 'numberLine', from: 0, to: 10, marks: [3, 7] }, W).rows).toBe(1);
  });
  test('a 0-10 line with marks keeps every tick labelled', () => {
    const l = numberLineLayout({ kind: 'numberLine', from: 0, to: 10, marks: [3, 7] }, W);
    expect(l.ticks.every((t) => t.label)).toBe(true);
    expect(l.ends).toEqual([]);
  });
  test('a zero-width line does not divide by zero', () => {
    const l = numberLineLayout({ kind: 'numberLine', from: 5, to: 5 }, W);
    expect(l.ticks).toHaveLength(1);
    expect(Number.isFinite(l.ticks[0].x)).toBe(true);
  });
  test('a huge span falls back to the largest step', () => {
    const l = numberLineLayout({ kind: 'numberLine', from: 0, to: 100000 }, W);
    expect(l.ticks[1].value).toBe(1000);
  });
});

describe('numberLineLayout guards', () => {
  test('an enormous span returns quickly with a bounded number of ticks', () => {
    const l = numberLineLayout({ kind: 'numberLine', from: 0, to: 1e300 }, 320);
    expect(l.ticks.length).toBeLessThanOrEqual(21);
  });
  test('a span that cannot advance, is negative or is not finite gives no ticks', () => {
    expect(numberLineLayout({ kind: 'numberLine', from: 1e300, to: 1e301 }, 320).ticks.length).toBeLessThanOrEqual(21);
    expect(numberLineLayout({ kind: 'numberLine', from: 10, to: 0 }, 320).ticks).toEqual([]);
    expect(numberLineLayout({ kind: 'numberLine', from: 0, to: Infinity }, 320).ticks).toEqual([]);
    expect(numberLineLayout({ kind: 'numberLine', from: 5, to: 5 }, 320).ticks).toHaveLength(1);
  });
});

describe('columnsLayout', () => {
  test('integers right-align with the op in the second number row', () => {
    const l = columnsLayout({ kind: 'columns', op: '+', numbers: [4521, 378] });
    expect(l.opColumn).toBe(true);
    expect(new Set(l.rows.map((r) => r.cells.length)).size).toBe(1);
    expect(l.width).toBe(5);
    expect(l.rows[0].cells).toEqual(['', '4', '5', '2', '1']);
    expect(l.rows[1].cells).toEqual(['+', '', '3', '7', '8']);
    expect(l.rows.map((r) => r.role)).toEqual(['number', 'number']);
  });
  test('carry goes above and result below', () => {
    const l = columnsLayout({ kind: 'columns', op: '+', numbers: [45, 38], carry: '1 ', result: '83' });
    expect(l.rows.map((r) => r.role)).toEqual(['carry', 'number', 'number', 'result']);
    expect(l.rows[0].cells).toEqual(['', '1', '']);
    expect(l.rows[3].cells).toEqual(['', '8', '3']);
  });
  test('decimals align by the point and keep trailing zeros', () => {
    const l = columnsLayout({ kind: 'columns', op: '+', numbers: ['2.50', '13.4'] });
    expect(l.rows[0].cells).toEqual(['', '', '2', '.', '5', '0']);
    expect(l.rows[1].cells).toEqual(['+', '1', '3', '.', '4', '']);
  });
  test('float operands with one and two decimals line their points up', () => {
    const l = columnsLayout({ kind: 'columns', op: '+', numbers: [16.8, 87.39] });
    expect(l.rows[0].cells).toEqual(['', '1', '6', '.', '8', '']);
    expect(l.rows[1].cells).toEqual(['+', '8', '7', '.', '3', '9']);
  });
  test('compare has no op column', () => {
    const l = columnsLayout({ kind: 'columns', op: 'compare', numbers: [12, 7] });
    expect(l.opColumn).toBe(false);
    expect(l.width).toBe(2);
    expect(l.rows[1].cells).toEqual(['', '7']);
  });
});
