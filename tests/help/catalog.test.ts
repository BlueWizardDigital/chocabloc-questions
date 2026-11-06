import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { STRATEGIES, familyOf, familyForSkill, factKey } from '../../src/help/catalog';
import { helpFactFromQuestion } from '../../src/help/from-question';
import type { HelpFact } from '../../src/help/types';

const FIXTURE = JSON.parse(readFileSync('tests/fixtures/help-catalog.json', 'utf8'));
// The server's `fact` column check (server-new routes/help validation).
const SERVER_FACT = /^[0-9]{1,3}(x|÷)[0-9]{1,3}$/;

const mult = (a: number | null, b: number | null, c: number | null): HelpFact => ({
  op: 'mult',
  a,
  b,
  c,
});
const div = (a: number | null, b: number | null, c: number | null): HelpFact => ({
  op: 'div',
  a,
  b,
  c,
});

describe('catalog', () => {
  test('STRATEGIES matches tests/fixtures/help-catalog.json', () => {
    expect(STRATEGIES).toEqual(FIXTURE);
  });

  test('familyOf: only an unknown product is mult-facts; a missing factor counts as division', () => {
    expect(familyOf(mult(7, 8, null))).toBe('mult-facts');
    expect(familyOf(mult(null, 8, 56))).toBe('div-facts');
    expect(familyOf(mult(7, null, 56))).toBe('div-facts');
    expect(familyOf(div(24, 4, null))).toBe('div-facts');
    expect(familyOf(div(24, null, 6))).toBe('div-facts');
    expect(familyOf(div(null, 4, 6))).toBe('div-facts');
  });

  test('familyForSkill maps MULT-FACTS-* and DIV-BASIC-DIVISION-FACTS, nothing else', () => {
    expect(familyForSkill('MULT-FACTS-0-5')).toBe('mult-facts');
    expect(familyForSkill('MULT-FACTS-0-10')).toBe('mult-facts');
    expect(familyForSkill('MULT-FACTS-11-12')).toBe('mult-facts');
    expect(familyForSkill('DIV-BASIC-DIVISION-FACTS')).toBe('div-facts');
    for (const other of [
      'MULT-FACTS',
      'MULT-2DIGIT-BY-1DIGIT',
      'mult-facts-0-5',
      'DIV-BASIC-DIVISION-FACTS-0-10',
      'DIV-BASIC-WITHIN-100-NO-REMAINDER',
      '',
    ]) {
      expect(familyForSkill(other)).toBeNull();
    }
    expect(familyForSkill(42 as unknown as string)).toBeNull();
  });

  test('factKey uses only visible numbers and fits the server check', () => {
    const cases: [HelpFact, string][] = [
      [mult(7, 8, null), '7x8'],
      [mult(13, 4, null), '13x4'],
      [mult(null, 4, 24), '24÷4'],
      [mult(4, null, 24), '24÷4'],
      [div(24, 4, null), '24÷4'],
      [div(24, null, 6), '24÷6'],
      [div(225, 15, null), '225÷15'],
      [div(null, 4, 6), '6x4'],
    ];
    for (const [fact, key] of cases) {
      expect(factKey(fact)).toBe(key);
      expect(key).toMatch(SERVER_FACT);
    }
  });
});

describe('helpFactFromQuestion', () => {
  const q = (operation: unknown, operands: unknown, extra: Record<string, unknown> = {}) => ({
    ...extra,
    content: { operation, operands },
  });

  test('multiplication [a, b] and division [dividend, divisor]', () => {
    expect(helpFactFromQuestion(q('multiplication', [7, 8]))).toEqual(mult(7, 8, null));
    expect(helpFactFromQuestion(q('division', [24, 4]))).toEqual(div(24, 4, null));
    expect(helpFactFromQuestion(q('multiplication', [0, 3]))).toEqual(mult(0, 3, null));
    expect(helpFactFromQuestion(q('division', [0, 10]))).toEqual(div(0, 10, null));
    expect(helpFactFromQuestion(q('multiplication', [15, 15]))).toEqual(mult(15, 15, null));
    expect(helpFactFromQuestion(q('division', [225, 15]))).toEqual(div(225, 15, null));
  });

  test('helpFactFromQuestion ignores answer, choices and answerToken and refuses non-integers, negatives and out-of-range values', () => {
    const leaky = q('multiplication', [7, 8], {
      answer: '56',
      choices: [{ value: '56' }, { value: '54' }],
      answerToken: 'tok',
      id: 'q123',
    });
    expect(helpFactFromQuestion(leaky)).toEqual(mult(7, 8, null));
    // An answer never stands in for missing operands.
    expect(
      helpFactFromQuestion({
        answer: '56',
        choices: [{ value: '56' }],
        content: { operation: 'multiplication' },
      }),
    ).toBeNull();

    const refused: unknown[] = [
      q('multiplication', [7.5, 8]),
      q('multiplication', [-3, 8]),
      q('multiplication', [16, 2]),
      q('multiplication', ['7', '8']),
      q('multiplication', [NaN, 8]),
      q('multiplication', [Infinity, 8]),
      q('multiplication', [7]),
      q('multiplication', [7, 8, 9]),
      q('multiplication', '7,8'),
      q('division', [226, 2]),
      q('division', [24, 16]),
      q('division', [-24, 4]),
      q('division', [24, 4.5]),
      q('addition', [7, 8]),
      q(undefined, [7, 8]),
      { content: null },
      { content: 'multiplication' },
      { operands: [7, 8], operation: 'multiplication' },
      null,
      undefined,
      42,
      'multiplication',
    ];
    for (const r of refused) expect(helpFactFromQuestion(r)).toBeNull();
  });

  test('reads only content.operation and content.operands', () => {
    const reads: string[] = [];
    const watch = <T extends object>(obj: T, where: string): T =>
      new Proxy(obj, {
        get(target, prop, receiver) {
          reads.push(`${where}.${String(prop)}`);
          return Reflect.get(target, prop, receiver);
        },
      });
    const content = watch(
      { operation: 'division', operands: [24, 4], answer: 6, choices: [] },
      'content',
    );
    const question = watch({ content, answer: '6', answerToken: 't', choices: [], id: 'q1' }, 'q');
    expect(helpFactFromQuestion(question)).toEqual(div(24, 4, null));
    expect(new Set(reads)).toEqual(new Set(['q.content', 'content.operation', 'content.operands']));
  });
});
