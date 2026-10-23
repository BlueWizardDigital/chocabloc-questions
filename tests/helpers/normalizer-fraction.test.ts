import { describe, it, expect, vi, afterEach } from 'vitest';
import { normalizeQuestion } from '../../src/helpers/normalizer';
import * as env from '../../src/internal/env';

afterEach(() => vi.restoreAllMocks());

const row = (format: string, content: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({
  id: `q-${format}`,
  skill_ids: ['FRAC-TEST'],
  format,
  image_type: format === 'fraction_text' ? null : format,
  content,
  questionText: 'What fraction is shaded?',
  answer: '3/4',
  distractors: [
    { value: '1/4', error_type: 'x' },
    { value: '2/4', error_type: 'y' },
  ],
  ...extra,
});

const goodModels = { operation: 'fraction_read', layout: 'row', models: [{ shape: 'bar', d: 4, n: 3, wholes: 1 }] };
const goodLine = { operation: 'fraction_line_read', lines: [{ max: 1, d: 4 }], points: [{ line: 0, n: 3 }] };

describe('fraction formats — answer-carrying rows', () => {
  it('fraction_models normalizes with imageType and the content passed through', () => {
    const q = normalizeQuestion(row('fraction_models', goodModels))!;
    expect(q).not.toBeNull();
    expect(q.format).toBe('fraction_models');
    expect(q.imageType).toBe('fraction_models');
    expect(q.content).toEqual(goodModels);
    expect(q.answer).toBe('3/4');
  });
  it('fraction_number_line normalizes with imageType and the content passed through', () => {
    const q = normalizeQuestion(row('fraction_number_line', goodLine))!;
    expect(q.format).toBe('fraction_number_line');
    expect(q.imageType).toBe('fraction_number_line');
    expect(q.content).toEqual(goodLine);
  });
  it('fraction_text becomes a text question whose stem is questionText', () => {
    const q = normalizeQuestion(row('fraction_text', { operation: 'fraction_simplify' }, { questionText: 'Write 2/4 in simplest form.' }))!;
    expect(q.format).toBe('text');
    expect(q.content).toMatchObject({ stem: 'Write 2/4 in simplest form.' });
  });

  it.each([
    ['models with no models', 'fraction_models', {}],
    ['models with d = 0', 'fraction_models', { layout: 'row', models: [{ shape: 'bar', d: 0, n: 0, wholes: 1 }] }],
    ['models with 5 models', 'fraction_models', { layout: 'row', models: [1, 2, 3, 4, 5].map(() => ({ shape: 'bar', d: 4, n: 1, wholes: 1 })) }],
    ['number line with max x d = 18', 'fraction_number_line', { lines: [{ max: 2, d: 9 }], points: [{ line: 0, n: 1 }] }],
    ['number line with no content keys', 'fraction_number_line', {}],
  ])('keeps the question when the picture is malformed: %s', (_n, format, content) => {
    const q = normalizeQuestion(row(format, content));
    expect(q).not.toBeNull();
    expect(q!.format).toBe(format);
    expect(q!.answer).toBe('3/4');
  });
});

describe('fraction formats — choices-only rows', () => {
  const choices = [{ value: '3/4' }, { value: '1/4' }, { value: '2/4' }, { value: '1/2' }];
  const wire = (format: string, content: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({
    id: 'q1', skillIds: ['FRAC-TEST'], format,
    imageType: format === 'fraction_text' ? undefined : format,
    content, questionText: 'Q?', choices, answerToken: 't', ...extra,
  });

  it('picture formats pass through with format and imageType', () => {
    const m = normalizeQuestion(wire('fraction_models', goodModels))!;
    expect(m.format).toBe('fraction_models');
    expect(m.imageType).toBe('fraction_models');
    const n = normalizeQuestion(wire('fraction_number_line', goodLine))!;
    expect(n.format).toBe('fraction_number_line');
  });
  it('a choices-only fraction_text row becomes format text', () => {
    const q = normalizeQuestion(wire('fraction_text', { operation: 'fraction_simplify' }, { questionText: 'Write 2/4 in simplest form.' }))!;
    expect(q.format).toBe('text');
    expect(q.content).toMatchObject({ stem: 'Write 2/4 in simplest form.' });
  });
});

describe('fraction_text without questionText', () => {
  it('returns null in production (answer-carrying)', () => {
    vi.spyOn(env, 'isProd').mockReturnValue(true);
    expect(normalizeQuestion(row('fraction_text', { operation: 'fraction_simplify' }, { questionText: '' }))).toBeNull();
  });
  it('returns null in production (choices-only)', () => {
    vi.spyOn(env, 'isProd').mockReturnValue(true);
    const r = { id: 'q', skillIds: ['S'], format: 'fraction_text', content: {}, choices: [{ value: 'a' }, { value: 'b' }] };
    expect(normalizeQuestion(r)).toBeNull();
  });
  it('throws a ParseError outside production', () => {
    vi.spyOn(env, 'isProd').mockReturnValue(false);
    expect(() => normalizeQuestion(row('fraction_text', {}, { questionText: '' }))).toThrow('fraction_text needs questionText');
  });
});
