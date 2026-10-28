import { describe, expect, it } from 'vitest';
import { normalizeQuestion } from '../../src/helpers/normalizer';
import { isNormalizedQuestion } from '../../src/helpers/parsers';
import { FIGURE_EXAMPLE } from './figure-fixture';

const base = { id: 'Q1', skillIds: ['GEOM-X'] };
const choices = [{ value: 'A' }, { value: 'B' }, { value: 'C' }, { value: 'D' }];
const answerCarrying = { answer: 'B', distractors: [{ value: 'A' }, { value: 'C' }, { value: 'D' }] };
const choicesOnly = { choices, answerToken: 'tok' };
const shapes = { answer: 'x', distractors: [{ value: 'y' }] };

const wires: [string, Record<string, unknown>][] = [
  ['answer-carrying', answerCarrying],
  ['choices-only', choicesOnly],
];

describe('geometry_figure normalizing', () => {
  for (const [name, wire] of wires) {
    it(`keeps panels intact (${name})`, () => {
      const q = normalizeQuestion({
        ...base, format: 'geometry_figure', imageType: 'shape_2d',
        questionText: 'Which dashed line is a line of symmetry?',
        content: FIGURE_EXAMPLE, ...wire,
      })!;
      expect(q).not.toBeNull();
      expect(q.format).toBe('geometry_figure');
      expect(q.imageType).toBe('shape_2d');
      expect((q.content as Record<string, unknown>)['panels']).toEqual(FIGURE_EXAMPLE.panels);
    });
  }

  it('is accepted by isNormalizedQuestion in the answer-carrying shape', () => {
    const q = normalizeQuestion({
      ...base, format: 'geometry_figure', imageType: 'shape_2d', content: FIGURE_EXAMPLE, ...answerCarrying,
    });
    expect(isNormalizedQuestion(q)).toBe(true);
  });

  it('still normalizes a malformed figure (the picture is checked at draw time)', () => {
    const bad = { operation: 'x', panels: [{ polygons: [{ points: [[0, 0], [99, 0]] }] }, 'junk'] };
    for (const [, wire] of wires) {
      const q = normalizeQuestion({ ...base, format: 'geometry_figure', imageType: 'shape_2d', content: bad, ...wire });
      expect(q).not.toBeNull();
      expect((q!.content as Record<string, unknown>)['panels']).toEqual(bad.panels);
    }
  });

  it('normalizes a figure row with no panels at all', () => {
    const q = normalizeQuestion({ ...base, format: 'geometry_figure', imageType: 'shape_2d', content: {}, ...answerCarrying });
    expect(q).not.toBeNull();
  });
});

describe('points on the four existing formats', () => {
  const pts = [[-5, -5], [5, -5], [0, 6]];
  const cases: [string, Record<string, unknown>, Record<string, unknown>][] = [
    ['geometry_identify', { imageType: 'shape_2d' }, { shape: 'triangle' }],
    ['geometry_properties', { imageType: 'shape_2d' }, { shape: 'triangle', property: 'sides' }],
    ['geometry_symmetry', {}, { shape: 'triangle', lines_of_symmetry: 1 }],
    ['geometry_classify', { imageType: 'shape_2d' }, { shape: 'triangle', dimension: '2D' }],
  ];
  for (const [format, extra, content] of cases) {
    for (const [name, wire] of wires) {
      it(`${format} keeps points (${name})`, () => {
        const q = normalizeQuestion({
          ...base, format, ...extra, content: { ...content, points: pts }, ...(wire === answerCarrying ? shapes : wire),
        })!;
        expect(q.format).toBe(format);
        expect((q.content as Record<string, unknown>)['points']).toEqual(pts);
      });
    }
    it(`${format} still normalizes with malformed points, and omits absent points`, () => {
      const bad = normalizeQuestion({ ...base, format, ...extra, content: { ...content, points: [[1, 2]] }, ...shapes })!;
      expect(bad).not.toBeNull();
      expect((bad.content as Record<string, unknown>)['points']).toEqual([[1, 2]]);
      const none = normalizeQuestion({ ...base, format, ...extra, content, ...shapes })!;
      expect('points' in (none.content as object)).toBe(false);
    });
  }
});

describe('answer-carrying rows of the new operations (teacher and parent screens)', () => {
  it('geometry_real_object with attribute normalizes, in both wire shapes', () => {
    for (const [, wire] of wires) {
      const q = normalizeQuestion({
        ...base, format: 'geometry_attributes', imageType: 'shape_2d',
        questionText: 'A soup can is shaped like a…',
        content: { operation: 'geometry_real_object', attribute: 'A soup can' },
        ...(wire === answerCarrying ? { answer: 'cylinder', distractors: [{ value: 'cube' }] } : wire),
      })!;
      expect(q).not.toBeNull();
      expect(q.format).toBe('geometry_attributes');
      expect((q.content as Record<string, unknown>)['attribute']).toBe('A soup can');
    }
  });

  it('geometry_quad_always normalizes through geometry_classify_quad, in both wire shapes', () => {
    const content = { operation: 'geometry_quad_always', target: 'rectangle', properties: 'always a rectangle' };
    const withAnswer = normalizeQuestion({
      ...base, format: 'geometry_classify_quad', questionText: 'Which of these is always a rectangle?',
      content, answer: 'square', distractors: [{ value: 'rhombus' }, { value: 'kite' }],
    })!;
    expect(withAnswer).not.toBeNull();
    expect(withAnswer.answer).toBe('square');
    const noText = normalizeQuestion({
      ...base, format: 'geometry_classify_quad', content, answer: 'square', distractors: [{ value: 'kite' }],
    })!;
    expect(noText.format).toBe('text');
    if (noText.format === 'text') expect(noText.content.stem).toContain('always a rectangle');
    const choicesRow = normalizeQuestion({
      ...base, format: 'geometry_classify_quad', questionText: 'Which of these is always a rectangle?',
      content, choices: [{ value: 'square' }, { value: 'kite' }], answerToken: 'tok',
    })!;
    expect(choicesRow).not.toBeNull();
    expect(choicesRow.choices).toHaveLength(2);
  });
});
