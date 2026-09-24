// Grade K–2 rendering gaps (Adventure 101 report, 2026-09-23).
//
// 1. F6 (choices-only) rows skipped per-format routing: arithmetic kept its raw
//    format and hit the canvas renderer instead of rendering as text.
// 2. Pattern rows with no `sequence` crashed the pattern renderer.
// 3. money_coin_* rows rendered as bare text, so "What coin is this?" had no
//    coins on screen. They now carry an optional `coinScene` for the coin pile.

import { describe, expect, it } from 'vitest';
import { normalizeQuestion } from '../../src/helpers/normalizer';

const choices = [{ value: 'loonie' }, { value: 'dime' }, { value: 'quarter' }];

describe('choices-only path — format routing', () => {
  it('routes stem formats to text, keeping choices and answerToken', () => {
    const q = normalizeQuestion({
      id: 'Q-ADD', format: 'addition', skillIds: ['ADD-1'],
      questionText: 'What is 3 + 4?', content: { operands: [3, 4] },
      answer: null, choices: [{ value: 7 }, { value: 6 }], answerToken: 'tok',
    })!;
    expect(q.format).toBe('text');
    expect(q.content).toEqual({ stem: 'What is 3 + 4?' });
    expect(q.choices).toEqual([{ value: 7 }, { value: 6 }]);
    expect(q.answerToken).toBe('tok');
    expect(q.answer).toBeUndefined();
    expect(q.imageType).toBeUndefined();
  });

  it('builds a stem when a stem-format row has no questionText', () => {
    const q = normalizeQuestion({
      id: 'Q-MC', format: 'money_make_change', skillIds: ['MONEY-CHANGE-CAD'],
      content: { payment_display: '$1.00', item_price_display: '$0.75' },
      choices: [{ value: 25 }],
    })!;
    expect(q.format).toBe('text');
    if (q.format === 'text') expect(q.content.stem).toContain('$1.00');
  });

  it('routes multiplication without a visual imageType to text', () => {
    const q = normalizeQuestion({
      id: 'Q-MUL', format: 'multiplication', skillIds: ['MULT-1'],
      questionText: 'What is 6 x 7?', content: { operands: [6, 7] },
      choices: [{ value: 42 }],
    })!;
    expect(q.format).toBe('text');
  });

  it('keeps multiplication with an array imageType visual', () => {
    const q = normalizeQuestion({
      id: 'Q-ARR', format: 'multiplication', imageType: 'array', skillIds: ['MULT-1'],
      content: { operands: [3, 4] }, choices: [{ value: 12 }],
    })!;
    expect(q.format).toBe('multiplication');
    expect(q.imageType).toBe('array');
  });

  it('routes a pattern row with no sequence to text', () => {
    const q = normalizeQuestion({
      id: 'Q-PAT', format: 'pattern', imageType: 'pattern_visual', skillIds: ['PAT-1'],
      questionText: 'What comes next: A, A, B, B, A, A, ?',
      content: { operation: 'pattern' }, choices: [{ value: 'B' }, { value: 'A' }],
    })!;
    expect(q.format).toBe('text');
    if (q.format === 'text') expect(q.content.stem).toBe('What comes next: A, A, B, B, A, A, ?');
  });

  it('keeps a pattern row that has a sequence visual', () => {
    const q = normalizeQuestion({
      id: 'Q-PAT2', format: 'pattern', imageType: 'pattern_visual', skillIds: ['PAT-1'],
      content: { sequence: ['A', 'B', 'A'] }, choices: [{ value: 'B' }],
    })!;
    expect(q.format).toBe('pattern');
  });

  // The choices-only path never ran the per-format normalizer, so it was already
  // passing shape_2d through while the answer-bearing path discarded it. This
  // pins that pass-through so the two paths stay in step.
  it('keeps shape_2d on a geometry_properties row', () => {
    const q = normalizeQuestion({
      id: 'GEOM-2D-SHAPE-PROPERTIES-BASIC-circle-sides', format: 'geometry_properties',
      imageType: 'shape_2d', skillIds: ['GEOM-2D-SHAPE-PROPERTIES-BASIC'],
      questionText: 'How many sides does a circle have?',
      content: { shape: 'circle', property: 'sides' },
      choices: [{ value: '0' }, { value: '4' }], answerToken: 'tok',
    })!;
    expect(q.format).toBe('geometry_properties');
    expect(q.imageType).toBe('shape_2d');
  });
});

describe('pattern — answer-bearing row with no sequence', () => {
  it('falls back to text when questionText is present', () => {
    const q = normalizeQuestion({
      id: 'Q-PAT3', format: 'pattern', skillIds: ['PAT-1'],
      questionText: 'What comes next: A, B, A, ?', content: { operation: 'pattern' },
      answer: 'B', distractors: [{ value: 'A', error_type: 'x' }],
    })!;
    expect(q.format).toBe('text');
    expect(q.answer).toBe('B');
  });

  it('still throws when there is no sequence and no questionText', () => {
    expect(() => normalizeQuestion({
      id: 'Q-PAT4', format: 'pattern', skillIds: ['PAT-1'],
      content: { operation: 'pattern' }, answer: 'B', distractors: [],
    })).toThrow(/sequence/);
  });
});

describe('money_coin_* — coin scene', () => {
  const sizeRow = {
    id: 'Q-SIZE', format: 'money_coin_size', image_type: 'coins',
    skill_ids: ['MONEY-COIN-ID-CAD'], questionText: 'Which of these coins is the largest?',
    content: {
      operation: 'money_coin_size', currency: 'CAD',
      coins: ['dime', 'loonie', 'quarter'], attribute: 'size', target_value: 'largest',
    },
  };

  it('F6 row: text question carrying a coinScene', () => {
    const q = normalizeQuestion({ ...sizeRow, answer: null, choices })!;
    expect(q.format).toBe('text');
    if (q.format === 'text') {
      expect(q.content.stem).toBe('Which of these coins is the largest?');
      expect(q.content.coinScene).toEqual({
        coins: { dime: 1, loonie: 1, quarter: 1 }, currency: 'CAD',
      });
    }
    expect(q.choices).toEqual(choices);
  });

  it('answer-bearing row: same coinScene, answer kept', () => {
    const q = normalizeQuestion({
      ...sizeRow, answer: 'loonie', distractors: [{ value: 'dime', error_type: 'x' }],
    })!;
    expect(q.format).toBe('text');
    expect(q.answer).toBe('loonie');
    if (q.format === 'text') expect(q.content.coinScene?.coins).toEqual({ dime: 1, loonie: 1, quarter: 1 });
  });

  it('counts repeated coins', () => {
    const q = normalizeQuestion({
      ...sizeRow, content: { ...sizeRow.content, coins: ['dime', 'dime', 'nickel'] }, choices,
    })!;
    if (q.format === 'text') expect(q.content.coinScene?.coins).toEqual({ dime: 2, nickel: 1 });
  });

  it('infers currency from skill ids when content has none', () => {
    const q = normalizeQuestion({
      ...sizeRow, skill_ids: ['MONEY-COIN-ID-USD'],
      content: { operation: 'money_coin_name', coins: ['penny'] }, format: 'money_coin_name', choices,
    })!;
    if (q.format === 'text') expect(q.content.coinScene).toEqual({ coins: { penny: 1 }, currency: 'USD' });
  });

  it('drops coin names that are not valid for the currency', () => {
    const q = normalizeQuestion({
      ...sizeRow, content: { ...sizeRow.content, coins: ['penny', 'toonie', 42, '<img>'] }, choices,
    })!;
    if (q.format === 'text') expect(q.content.coinScene?.coins).toEqual({ toonie: 1 });
  });

  it('omits coinScene when there are no coins (attribute framing)', () => {
    const q = normalizeQuestion({
      ...sizeRow, format: 'money_coin_name',
      content: { operation: 'money_coin_name', currency: 'CAD', coins: [] }, choices,
    })!;
    expect(q.format).toBe('text');
    if (q.format === 'text') expect(q.content.coinScene).toBeUndefined();
  });

  it('omits coinScene when currency cannot be determined', () => {
    const q = normalizeQuestion({
      ...sizeRow, skill_ids: ['MONEY-COIN-ID'],
      content: { operation: 'money_coin_size', coins: ['dime'] }, choices,
    })!;
    expect(q.format).toBe('text');
    if (q.format === 'text') expect(q.content.coinScene).toBeUndefined();
  });

  it('does not add a coinScene to other stem formats', () => {
    const q = normalizeQuestion({
      id: 'Q-CS', format: 'money_count_single', skillIds: ['MONEY-CAD'],
      questionText: 'How much is 2 dimes?', content: { coins: ['dime'], count: 2, coin: 'dime' },
      choices: [{ value: 20 }],
    })!;
    if (q.format === 'text') expect(q.content.coinScene).toBeUndefined();
  });
});
