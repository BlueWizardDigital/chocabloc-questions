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

  it('geometry_face_identify: content has shape + face_shape, imageType preserved', () => {
    const q = normalizeQuestion(fixtures.geometry_face_identify)!;
    expect(q.format).toBe('geometry_face_identify');
    if (q.format === 'geometry_face_identify') {
      expect(q.content.shape).toBe('cube');
      expect(q.content.face_shape).toBe('square');
      expect(q.imageType).toBe('shape_3d');
    }
  });

  it('geometry_identify: 2D content has shape, imageType preserved', () => {
    const q = normalizeQuestion(fixtures.geometry_identify_2d)!;
    expect(q.format).toBe('geometry_identify');
    if (q.format === 'geometry_identify') {
      expect(q.content.shape).toBe('circle');
      expect(q.imageType).toBe('shape_2d');
    }
  });

  it('geometry_identify: 3D content has shape, imageType preserved', () => {
    const q = normalizeQuestion(fixtures.geometry_identify_3d)!;
    expect(q.format).toBe('geometry_identify');
    if (q.format === 'geometry_identify') {
      expect(q.content.shape).toBe('cube');
      expect(q.imageType).toBe('shape_3d');
    }
  });

  it('geometry_symmetry: content has shape + lines_of_symmetry', () => {
    const q = normalizeQuestion(fixtures.geometry_symmetry)!;
    expect(q.format).toBe('geometry_symmetry');
    if (q.format === 'geometry_symmetry') {
      expect(q.content.shape).toBe('triangle');
      expect(q.content.lines_of_symmetry).toBe(3);
      expect(q.imageType).toBe('shape_2d');
    }
  });

  it('geometry_classify_triangle: content has operands + classify_by', () => {
    const q = normalizeQuestion(fixtures.geometry_classify_triangle)!;
    expect(q.format).toBe('geometry_classify_triangle');
    if (q.format === 'geometry_classify_triangle') {
      expect(q.content.operands).toEqual([3, 4, 5]);
      expect(q.content.classify_by).toBe('sides');
      expect(q.imageType).toBe('shape_2d');
    }
  });

  it('geometry_volume: content has shape + operands, imageType preserved', () => {
    const q = normalizeQuestion(fixtures.geometry_volume)!;
    expect(q.format).toBe('geometry_volume');
    if (q.format === 'geometry_volume') {
      expect(q.content.shape).toBe('rectangular prism');
      expect(q.content.operands).toEqual([11, 18, 14]);
      expect(q.imageType).toBe('shape_3d');
    }
  });

  it('geometry_surface_area: content has shape + operands, imageType preserved', () => {
    const q = normalizeQuestion(fixtures.geometry_surface_area)!;
    expect(q.format).toBe('geometry_surface_area');
    if (q.format === 'geometry_surface_area') {
      expect(q.content.shape).toBe('rectangular prism');
      expect(q.content.operands).toEqual([6, 5, 9]);
      expect(q.imageType).toBe('shape_3d');
    }
  });

  it('geometry_circle_convert: content has value + given_type + find_type', () => {
    const q = normalizeQuestion(fixtures.geometry_circle_convert)!;
    expect(q.format).toBe('geometry_circle_convert');
    if (q.format === 'geometry_circle_convert') {
      expect(q.content.value).toBe(17);
      expect(q.content.given_type).toBe('radius');
      expect(q.content.find_type).toBe('diameter');
      expect(q.imageType).toBe('shape_2d');
    }
  });

  it('rejects unknown format', () => {
    expect(() =>
      normalizeQuestion({ id: 'x', format: 'nope', content: {}, answer: '1', distractors: [] }),
    ).toThrow(/Unsupported format/);
  });
});
