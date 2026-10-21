import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { pictureFromQuestion } from '../../src/lesson/from-question';
import type { NormalizedQuestion } from '../../src/types';

const FX = JSON.parse(readFileSync('tests/fixtures/server-content-by-format.json', 'utf8')).CONTENT_BY_FORMAT as Record<
  string,
  string[]
>;

const q = (content: Record<string, unknown>) => ({ content }) as unknown as NormalizedQuestion;
const ops = (operands: unknown[], operation = 'addition') => q({ operands, operation });

describe('fixture sanity', () => {
  test('arithmetic formats carry operands and operation; place formats carry number', () => {
    expect(FX.addition).toEqual(['operands', 'operation']);
    expect(FX.place_value).toContain('number');
  });
});

describe('pictureFromQuestion: operands', () => {
  test('addition number line adds a jump a -> a+b', () => {
    expect(pictureFromQuestion({ kind: 'numberLine', from: 'operands' }, ops([8, 5]))).toEqual({
      kind: 'numberLine',
      from: 0,
      to: 13,
      marks: [8, 13],
      jumps: [{ from: 8, to: 13 }],
    });
  });
  test('subtraction number line jumps a -> a-b', () => {
    expect(pictureFromQuestion({ kind: 'numberLine', from: 'operands' }, ops([9, 4], 'subtraction'))).toEqual({
      kind: 'numberLine',
      from: 0,
      to: 9,
      marks: [9, 5],
      jumps: [{ from: 9, to: 5 }],
    });
  });
  test('9 + 4 marks where the jump starts and ends, not its size', () => {
    const p = pictureFromQuestion({ kind: 'numberLine', from: 'operands' }, ops([9, 4]));
    expect(p).toMatchObject({ marks: [9, 13], jumps: [{ from: 9, to: 13 }] });
  });
  test('13 - 5 marks [13, 8]', () => {
    const p = pictureFromQuestion({ kind: 'numberLine', from: 'operands' }, ops([13, 5], 'subtraction'));
    expect(p).toMatchObject({ marks: [13, 8], jumps: [{ from: 13, to: 8 }] });
  });
  test('other operations stop at the largest operand', () => {
    expect(pictureFromQuestion({ kind: 'numberLine', from: 'operands' }, ops([3, 12], 'comparison'))).toEqual({
      kind: 'numberLine',
      from: 0,
      to: 12,
      marks: [3, 12],
    });
  });
  test('decimal_addition draws a columns picture', () => {
    const spec = { kind: 'columns', from: 'operands' } as const;
    expect(pictureFromQuestion(spec, ops([0.27, 87.39], 'decimal_addition'))).toEqual({
      kind: 'columns',
      op: '+',
      numbers: [0.27, 87.39],
    });
    expect(pictureFromQuestion(spec, ops([16.8, 32.8], 'decimal_addition'))).toEqual({
      kind: 'columns',
      op: '+',
      numbers: [16.8, 32.8],
    });
  });
  test('a span over 1000 gives null', () => {
    expect(pictureFromQuestion({ kind: 'numberLine', from: 'operands' }, ops([900, 200]))).toBeNull();
  });
  test('base10 takes 1-2 integers in 0-9999', () => {
    expect(pictureFromQuestion({ kind: 'base10', from: 'operands' }, ops([12, 30]))).toEqual({
      kind: 'base10',
      numbers: [12, 30],
    });
    expect(pictureFromQuestion({ kind: 'base10', from: 'operands' }, ops([12345, 2]))).toBeNull();
    expect(pictureFromQuestion({ kind: 'base10', from: 'operands' }, ops([1.5]))).toBeNull();
    expect(pictureFromQuestion({ kind: 'base10', from: 'operands' }, ops([1, 2, 3]))).toBeNull();
  });
  test('array takes [rows, cols] in 1-15', () => {
    expect(pictureFromQuestion({ kind: 'array', from: 'operands' }, ops([3, 4], 'multiplication'))).toEqual({
      kind: 'array',
      rows: 3,
      cols: 4,
    });
    expect(pictureFromQuestion({ kind: 'array', from: 'operands' }, ops([3, 16], 'multiplication'))).toBeNull();
    expect(pictureFromQuestion({ kind: 'array', from: 'operands' }, ops([0, 4], 'multiplication'))).toBeNull();
    expect(pictureFromQuestion({ kind: 'array', from: 'operands' }, ops([3], 'multiplication'))).toBeNull();
  });
  test('columns map the operation to a symbol', () => {
    const cases: [string, string][] = [['addition', '+'], ['subtraction', '−'], ['multiplication', '×'], ['comparison', 'compare']];
    for (const [operation, op] of cases) {
      expect(pictureFromQuestion({ kind: 'columns', from: 'operands' }, ops([12, 7], operation))).toEqual({
        kind: 'columns',
        op,
        numbers: [12, 7],
      });
    }
    expect(pictureFromQuestion({ kind: 'columns', from: 'operands' }, ops([12, 7], 'division'))).toBeNull();
    expect(pictureFromQuestion({ kind: 'columns', from: 'operands' }, ops([1, 2, 3]))).toBeNull();
  });
  test('missing, non-array or non-numeric operands give null', () => {
    const spec = { kind: 'numberLine', from: 'operands' } as const;
    expect(pictureFromQuestion(spec, q({ operation: 'addition' }))).toBeNull();
    expect(pictureFromQuestion(spec, ops('8,5' as unknown as unknown[]))).toBeNull();
    expect(pictureFromQuestion(spec, ops(['a', 2]))).toBeNull();
    expect(pictureFromQuestion(spec, ops([NaN, 2]))).toBeNull();
    expect(pictureFromQuestion(spec, ops([]))).toBeNull();
  });
});

describe('pictureFromQuestion: number', () => {
  const num = (n: unknown) => q({ number: n, operation: 'place_value' });
  test('base10 shows the number', () => {
    expect(pictureFromQuestion({ kind: 'base10', from: 'number' }, num(1111))).toEqual({
      kind: 'base10',
      numbers: [1111],
    });
    expect(pictureFromQuestion({ kind: 'base10', from: 'number' }, num(10000))).toBeNull();
    expect(pictureFromQuestion({ kind: 'base10', from: 'number' }, num(-3))).toBeNull();
  });
  test('number line brackets the number by its size', () => {
    expect(pictureFromQuestion({ kind: 'numberLine', from: 'number' }, num(47))).toEqual({
      kind: 'numberLine',
      from: 40,
      to: 50,
      marks: [47],
    });
    expect(pictureFromQuestion({ kind: 'numberLine', from: 'number' }, num(7))).toEqual({
      kind: 'numberLine',
      from: 0,
      to: 10,
      marks: [7],
    });
    expect(pictureFromQuestion({ kind: 'numberLine', from: 'number' }, num(1234))).toEqual({
      kind: 'numberLine',
      from: 1000,
      to: 2000,
      marks: [1234],
    });
  });
  test('a number too big for the line gives null', () => {
    for (const n of [123456, 1e17, 1e300, 12345]) {
      expect(pictureFromQuestion({ kind: 'numberLine', from: 'number' }, num(n))).toBeNull();
    }
    expect(pictureFromQuestion({ kind: 'numberLine', from: 'number' }, num(999))).toEqual({
      kind: 'numberLine',
      from: 900,
      to: 1000,
      marks: [999],
    });
  });
  test('other kinds and bad numbers give null', () => {
    expect(pictureFromQuestion({ kind: 'array', from: 'number' }, num(5))).toBeNull();
    expect(pictureFromQuestion({ kind: 'columns', from: 'number' }, num(5))).toBeNull();
    expect(pictureFromQuestion({ kind: 'numberLine', from: 'number' }, num('x'))).toBeNull();
    expect(pictureFromQuestion({ kind: 'numberLine', from: 'number' }, q({}))).toBeNull();
  });
  test('a question with no content gives null', () => {
    expect(pictureFromQuestion({ kind: 'base10', from: 'number' }, {} as unknown as NormalizedQuestion)).toBeNull();
  });
});
