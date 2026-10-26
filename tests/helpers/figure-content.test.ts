import { describe, expect, it } from 'vitest';
import { FIGURE_EXAMPLE } from './figure-fixture';
import { parseFigure, parsePolygonPoints } from '../../src/helpers/figure-content';

const tri = [[0, 0], [5, 0], [0, 5]];
const poly = (points: unknown = tri) => ({ points });
const panel = (extra: Record<string, unknown> = {}) => ({ polygons: [poly()], lines: [], ...extra });
const fig = (panels: unknown) => ({ operation: 'x', panels });
const lines3 = [
  { from: [0, 0], to: [1, 1], label: 'A' },
  { from: [0, 0], to: [1, 2], label: 'B' },
  { from: [0, 0], to: [2, 1], label: 'C' },
];

describe('parseFigure', () => {
  it('parses FIGURE_EXAMPLE with lettered lines', () => {
    const f = parseFigure(FIGURE_EXAMPLE)!;
    expect(f).not.toBeNull();
    expect(f.lettered).toBe('lines');
    expect(f.panels).toHaveLength(1);
    expect(f.panels[0]!.lines.map((l) => l.label)).toEqual(['A', 'B', 'C', 'D']);
    expect(f.panels[0]!.polygons[0]).toHaveLength(4);
  });

  it('parses a single unlabelled panel with no lines', () => {
    const f = parseFigure(fig([panel()]))!;
    expect(f.lettered).toBeNull();
    expect(f.panels[0]!.lines).toEqual([]);
  });

  it('treats a missing lines key as no lines', () => {
    expect(parseFigure(fig([{ polygons: [poly()] }]))).not.toBeNull();
  });

  it('parses 3 and 4 lettered panels', () => {
    const three = fig(['A', 'B', 'C'].map((label) => panel({ label })));
    expect(parseFigure(three)!.lettered).toBe('panels');
    const four = fig(['A', 'B', 'C', 'D'].map((label) => panel({ label })));
    expect(parseFigure(four)!.panels.map((p) => p.label)).toEqual(['A', 'B', 'C', 'D']);
  });

  it('accepts unlabelled lines, and 8 polygons and 48 points', () => {
    const unlabelled = lines3.map(({ from, to }) => ({ from, to }));
    expect(parseFigure(fig([panel({ lines: unlabelled })]))!.lettered).toBeNull();
    const pts = Array.from({ length: 48 }, (_, i) => [Math.cos(i) * 9, Math.sin(i) * 9]);
    expect(parseFigure(fig([{ polygons: Array(8).fill(poly(pts)) }]))).not.toBeNull();
  });

  it('accepts coordinates on the frame edge', () => {
    expect(parseFigure(fig([{ polygons: [poly([[-10, -10], [10, -10], [10, 10]])] }]))).not.toBeNull();
  });

  const invalid: [string, unknown][] = [
    ['null content', null],
    ['non-object content', 'x'],
    ['no panels', { operation: 'x' }],
    ['empty panels', fig([])],
    ['2 panels', fig([panel({ label: 'A' }), panel({ label: 'B' })])],
    ['5 panels', fig(['A', 'B', 'C', 'D', 'E'].map((label) => panel({ label })))],
    ['labels on panels and lines', fig(['A', 'B', 'C'].map((label, i) => panel({ label, lines: i === 0 ? lines3 : [] })))],
    ['lettered lines in a lettered-panel figure', fig([panel({ label: 'A' }), panel({ label: 'B' }), panel()])],
    ['an unlabelled panel among labelled ones', fig([panel({ label: 'A' }), panel(), panel({ label: 'C' })])],
    ['a labelled single panel', fig([panel({ label: 'A' })])],
    ['panel labels out of order', fig(['A', 'C', 'B'].map((label) => panel({ label })))],
    ['duplicate panel labels', fig(['A', 'A', 'B'].map((label) => panel({ label })))],
    ['3 panels starting at B', fig(['B', 'C', 'D'].map((label) => panel({ label })))],
    ['lettered lines in a multi-panel figure', fig(['A', 'B', 'C'].map((label, i) => panel({ label, lines: i === 0 ? lines3 : [] })))],
    ['line letters out of order', fig([panel({ lines: [lines3[0], lines3[2], lines3[1]] })])],
    ['duplicate line letters', fig([panel({ lines: [lines3[0], lines3[0], lines3[1]] })])],
    ['2 lettered lines', fig([panel({ lines: lines3.slice(0, 2) })])],
    ['5 lines', fig([panel({ lines: Array(5).fill({ from: [0, 0], to: [1, 1] }) })])],
    ['mixed labelled and unlabelled lines', fig([panel({ lines: [lines3[0], lines3[1], { from: [0, 0], to: [1, 1] }] })])],
    ['a non-string line label', fig([panel({ lines: [{ from: [0, 0], to: [1, 1], label: 1 }] })])],
    ['a line with a bad endpoint', fig([panel({ lines: [{ from: [0], to: [1, 1] }] })])],
    ['no polygons', fig([{ polygons: [] }])],
    ['9 polygons', fig([{ polygons: Array(9).fill(poly()) }])],
    ['a 49-point polygon', fig([{ polygons: [poly(Array.from({ length: 49 }, (_, i) => [i % 10, 0]))] }])],
    ['a 2-point polygon', fig([{ polygons: [poly([[0, 0], [1, 1]])] }])],
    ['a coordinate of 10.5', fig([{ polygons: [poly([[0, 0], [10.5, 0], [0, 5]])] }])],
    ['a coordinate of -10.5', fig([{ polygons: [poly([[0, 0], [-10.5, 0], [0, 5]])] }])],
    ['a NaN coordinate', fig([{ polygons: [poly([[0, 0], [NaN, 0], [0, 5]])] }])],
    ['an Infinity coordinate', fig([{ polygons: [poly([[0, 0], [Infinity, 0], [0, 5]])] }])],
    ['a string coordinate', fig([{ polygons: [poly([[0, 0], ['5', 0], [0, 5]])] }])],
    ['a 3-element point', fig([{ polygons: [poly([[0, 0], [5, 0, 1], [0, 5]])] }])],
    ['panels not an array', fig({})],
    ['a null panel', fig([null])],
    ['a polygon without points', fig([{ polygons: [{}] }])],
  ];
  for (const [name, content] of invalid) {
    it(`returns null for ${name}`, () => {
      expect(parseFigure(content)).toBeNull();
    });
  }

  it('never throws on hostile input', () => {
    for (const x of [undefined, 0, [], () => 1, { panels: { length: 3 } }]) {
      expect(() => parseFigure(x)).not.toThrow();
    }
  });
});

describe('parsePolygonPoints', () => {
  it('returns the points for a valid polygon', () => {
    expect(parsePolygonPoints(tri)).toEqual(tri);
  });
  it('returns null for 2 points, 49 points, out-of-frame, NaN and non-arrays', () => {
    expect(parsePolygonPoints([[0, 0], [1, 1]])).toBeNull();
    expect(parsePolygonPoints(Array.from({ length: 49 }, (_, i) => [i % 10, 0]))).toBeNull();
    expect(parsePolygonPoints([[0, 0], [10.5, 0], [0, 5]])).toBeNull();
    expect(parsePolygonPoints([[0, 0], [NaN, 0], [0, 5]])).toBeNull();
    expect(parsePolygonPoints(undefined)).toBeNull();
    expect(parsePolygonPoints('abc')).toBeNull();
  });
});
