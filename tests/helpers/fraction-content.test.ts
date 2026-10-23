import { describe, it, expect } from 'vitest';
import { parseFractionModels, parseFractionNumberLine } from '../../src/helpers/fraction-content';

const bar = (o: Record<string, unknown> = {}) => ({ shape: 'bar', d: 4, n: 3, wholes: 1, ...o });
const models = (ms: unknown[], o: Record<string, unknown> = {}) => ({
  operation: 'fraction_read', layout: 'row', models: ms, ...o,
});

describe('parseFractionModels', () => {
  it('parses a single bar', () => {
    expect(parseFractionModels(models([bar()]))).toEqual({
      layout: 'row',
      models: [{ shape: 'bar', d: 4, n: 3, wholes: 1 }],
    });
  });
  it('parses a circle with d 8', () => {
    expect(parseFractionModels(models([{ shape: 'circle', d: 8, n: 5, wholes: 1 }]))?.models[0]?.shape).toBe('circle');
  });
  it('parses 4 labelled, captioned models', () => {
    const ms = ['A', 'B', 'C', 'D'].map((label) => bar({ label, caption: '3/4' }));
    const spec = parseFractionModels(models(ms));
    expect(spec?.models.map((m) => m.label)).toEqual(['A', 'B', 'C', 'D']);
    expect(spec?.models[0]?.caption).toBe('3/4');
  });
  it('accepts n = d x wholes and 3 wholes', () => {
    expect(parseFractionModels(models([bar({ d: 4, n: 12, wholes: 3 })]))).not.toBeNull();
  });
  it('parses a split on a one-whole bar', () => {
    const spec = parseFractionModels(models([bar({ d: 3, n: 0, split: [1, 2, 3] })]));
    expect(spec?.models[0]?.split).toEqual([1, 2, 3]);
  });
  it('parses a stack with a guide', () => {
    const spec = parseFractionModels(models([bar(), bar({ d: 8, n: 0 })], { layout: 'stack', guide: [3, 4] }));
    expect(spec?.layout).toBe('stack');
    expect(spec?.guide).toEqual([3, 4]);
  });

  const bad: [string, unknown][] = [
    ['non-object', 'x'],
    ['null', null],
    ['no models', { layout: 'row' }],
    ['empty models', models([])],
    ['5 models', models([1, 2, 3, 4, 5].map(() => bar()))],
    ['bad layout', models([bar()], { layout: 'grid' })],
    ['unknown shape', models([bar({ shape: 'hex' })])],
    ['d = 0', models([bar({ d: 0, n: 0 })])],
    ['d = 13', models([bar({ d: 13, n: 1 })])],
    ['non-integer d', models([bar({ d: 2.5 })])],
    ['circle d = 9', models([{ shape: 'circle', d: 9, n: 1, wholes: 1 }])],
    ['circle wholes 2', models([{ shape: 'circle', d: 4, n: 1, wholes: 2 }])],
    ['wholes 4', models([bar({ wholes: 4 })])],
    ['wholes 0', models([bar({ wholes: 0 })])],
    ['n > d x wholes', models([bar({ d: 4, n: 9, wholes: 2 })])],
    ['negative n', models([bar({ n: -1 })])],
    ['label e', models([bar({ label: 'E' })])],
    ['duplicate label', models([bar({ label: 'A' }), bar({ label: 'A' })])],
    ['caption too long', models([bar({ caption: '123456789' })])],
    ['caption not text', models([bar({ caption: 3 })])],
    ['split on a circle', models([{ shape: 'circle', d: 3, n: 1, wholes: 1, split: [1, 2, 3] }])],
    ['split with wholes 2', models([bar({ wholes: 2, split: [1, 2, 3, 4] })])],
    ['split wrong length', models([bar({ split: [1, 2] })])],
    ['split zero part', models([bar({ d: 2, split: [0, 1] })])],
    ['guide with row', models([bar()], { guide: [1, 2] })],
    ['guide n > d', models([bar()], { layout: 'stack', guide: [5, 4] })],
    ['guide d 13', models([bar()], { layout: 'stack', guide: [1, 13] })],
    ['guide not a pair', models([bar()], { layout: 'stack', guide: [1] })],
  ];
  it.each(bad)('returns null for %s', (_name, content) => {
    expect(parseFractionModels(content)).toBeNull();
  });
});

const line = (o: Record<string, unknown> = {}) => ({ max: 1, d: 4, ...o });
const nl = (o: Record<string, unknown> = {}) => ({
  operation: 'fraction_line_read',
  lines: [line()],
  points: [{ line: 0, n: 3 }],
  ...o,
});

describe('parseFractionNumberLine', () => {
  it('parses one line and one point, tickLabels defaults to false', () => {
    expect(parseFractionNumberLine(nl())).toEqual({
      lines: [{ max: 1, d: 4 }],
      points: [{ line: 0, n: 3 }],
      tickLabels: false,
    });
  });
  it('maps wire tick_labels to tickLabels', () => {
    expect(parseFractionNumberLine(nl({ tick_labels: true }))?.tickLabels).toBe(true);
  });
  it('parses two lines and four labelled points', () => {
    const spec = parseFractionNumberLine(nl({
      lines: [line(), line({ d: 8 })],
      points: ['A', 'B', 'C', 'D'].map((label, i) => ({ line: i % 2, n: i, label })),
    }));
    expect(spec?.lines).toHaveLength(2);
    expect(spec?.points.map((p) => p.label)).toEqual(['A', 'B', 'C', 'D']);
  });
  it('accepts max x d = 16', () => {
    expect(parseFractionNumberLine(nl({ lines: [line({ max: 2, d: 8 })], points: [{ line: 0, n: 16 }] }))).not.toBeNull();
  });

  const bad: [string, unknown][] = [
    ['non-object', 3],
    ['no lines', { points: [{ line: 0, n: 1 }] }],
    ['empty lines', nl({ lines: [] })],
    ['3 lines', nl({ lines: [line(), line(), line()] })],
    ['no points', nl({ points: [] })],
    ['5 points', nl({ points: [0, 1, 2, 3, 4].map((n) => ({ line: 0, n })) })],
    ['max 0', nl({ lines: [line({ max: 0 })] })],
    ['max 4', nl({ lines: [line({ max: 4, d: 2 })] })],
    ['d 0', nl({ lines: [line({ d: 0 })] })],
    ['d 13', nl({ lines: [line({ d: 13 })] })],
    ['max x d = 18', nl({ lines: [line({ max: 2, d: 9 })], points: [{ line: 0, n: 1 }] })],
    ['line index out of range', nl({ points: [{ line: 1, n: 1 }] })],
    ['negative line index', nl({ points: [{ line: -1, n: 1 }] })],
    ['n > max x d', nl({ points: [{ line: 0, n: 5 }] })],
    ['n non-integer', nl({ points: [{ line: 0, n: 1.5 }] })],
    ['label e', nl({ points: [{ line: 0, n: 1, label: 'E' }] })],
    ['duplicate label', nl({ points: [{ line: 0, n: 1, label: 'A' }, { line: 0, n: 2, label: 'A' }] })],
    ['tick_labels not boolean', nl({ tick_labels: 'yes' })],
  ];
  it.each(bad)('returns null for %s', (_name, content) => {
    expect(parseFractionNumberLine(content)).toBeNull();
  });
});
