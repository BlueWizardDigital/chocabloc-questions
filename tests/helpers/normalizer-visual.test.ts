import { describe, it, expect } from 'vitest';
import { normalizeQuestion } from '../../src/helpers/normalizer';
import fixtures from '../fixtures/visual-format-samples.json';

describe('normalizeQuestion — visual formats', () => {
  const formats = Object.entries(fixtures) as [string, Record<string, unknown>][];

  for (const [name, raw] of formats) {
    describe(name, () => {
      it('normalizes without throwing', () => {
        const result = normalizeQuestion(raw);
        expect(result).not.toBeNull();
      });

      it('preserves id and format', () => {
        const result = normalizeQuestion(raw)!;
        expect(result.id).toBe(raw['id']);
        expect(result.format).toBe(raw['format']);
      });

      it('normalizes distractors', () => {
        const result = normalizeQuestion(raw)!;
        expect(result.distractors.length).toBeGreaterThan(0);
        for (const d of result.distractors) {
          expect(d).toHaveProperty('value');
          expect(d).toHaveProperty('errorType');
        }
      });

      it('has an answer', () => {
        const result = normalizeQuestion(raw)!;
        expect(result.answer).toBeDefined();
      });
    });
  }

  it('geometry_attributes: content has attribute', () => {
    const q = normalizeQuestion(fixtures.geometry_attributes)!;
    expect(q.format).toBe('geometry_attributes');
    if (q.format === 'geometry_attributes') {
      expect(q.content.attribute).toBe('no sides and no corners');
      expect(q.imageType).toBe('shape_2d');
    }
  });

  it('pythagorean: content has legs and hypotenuse', () => {
    const q = normalizeQuestion(fixtures.pythagorean)!;
    if (q.format === 'pythagorean') {
      expect(q.content.legs).toEqual([3, 4]);
      expect(q.content.hypotenuse).toBe(5);
      expect(q.imageType).toBe('right_triangle');
    }
  });

  it('data_graph: bar_graph imageType resolved', () => {
    const q = normalizeQuestion(fixtures.data_graph_bar)!;
    if (q.format === 'data_graph') {
      expect(q.imageType).toBe('bar_graph');
      expect(q.content.data).toHaveProperty('Apples');
    }
  });

  it('data_graph: pictograph imageType resolved', () => {
    const q = normalizeQuestion(fixtures.data_graph_pictograph)!;
    if (q.format === 'data_graph') {
      expect(q.imageType).toBe('pictograph');
    }
  });

  it('multiplication: array imageType resolved', () => {
    const q = normalizeQuestion(fixtures.multiplication_array)!;
    if (q.format === 'multiplication') {
      expect(q.imageType).toBe('array');
      expect(q.content.operands).toEqual([2, 3]);
    }
  });

  it('fraction_concept: fraction tuple preserved', () => {
    const q = normalizeQuestion(fixtures.fraction_concept)!;
    if (q.format === 'fraction_concept') {
      expect(q.content.fraction).toEqual([1, 2]);
      expect(q.answer).toBe('1/2');
    }
  });

  it('time: hour/minute/time preserved', () => {
    const q = normalizeQuestion(fixtures.time)!;
    if (q.format === 'time') {
      expect(q.content.hour).toBe(3);
      expect(q.content.minute).toBe(0);
      expect(q.content.time).toBe('3:00');
    }
  });

  it('pattern: sequence preserved', () => {
    const q = normalizeQuestion(fixtures.pattern)!;
    if (q.format === 'pattern') {
      expect(q.content.sequence).toEqual(['A', 'B', 'A', 'B', 'A', 'B']);
    }
  });

  it('coordinate_distance: points preserved', () => {
    const q = normalizeQuestion(fixtures.coordinate_distance)!;
    if (q.format === 'coordinate_distance') {
      expect(q.content.point1).toEqual([0, 2]);
      expect(q.content.point2).toEqual([10, 2]);
    }
  });

  it('money_budget_adjust: table content preserved', () => {
    const q = normalizeQuestion(fixtures.money_budget_adjust)!;
    if (q.format === 'money_budget_adjust') {
      expect(q.content.currency).toBe('CAD');
      expect(q.content.solve_for).toBe('entertainment');
      expect(q.content.original_rows).toHaveLength(3);
      expect(q.imageType).toBe('table');
    }
  });

  it('geometry_area: compound components preserved', () => {
    const q = normalizeQuestion(fixtures.geometry_area)!;
    if (q.format === 'geometry_area') {
      expect(q.content.components).toHaveLength(2);
      expect(q.imageType).toBe('compound_shape');
    }
  });

  it('rejects unknown format', () => {
    expect(() =>
      normalizeQuestion({ id: 'x', format: 'nope', content: {}, answer: '1', distractors: [] }),
    ).toThrow(/Unsupported format/);
  });
});
