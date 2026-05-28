import type { AnswerValue, QuestionFormat } from '../types';

const MONEY_FORMATS: ReadonlySet<string> = new Set(['money', 'money_budget_adjust']);
const DEGREE_FORMATS: ReadonlySet<string> = new Set(['geometry_angles', 'geometry_angle_classify']);
const NUMERIC_FORMATS: ReadonlySet<string> = new Set([
  'geometry_area', 'geometry_perimeter', 'geometry_circumference',
  'pythagorean', 'coordinate_distance', 'multiplication',
  'data_graph', 'geometry_properties',
]);
const STRING_FORMATS: ReadonlySet<string> = new Set(['time']);

export function parseInputAnswer(rawInput: string, format: QuestionFormat): AnswerValue {
  const trimmed = rawInput.trim();

  if (MONEY_FORMATS.has(format))
    return Math.round(parseFloat(trimmed.replace(/^\$/, '')) * 100);

  if (DEGREE_FORMATS.has(format))
    return Number(trimmed.replace(/°$/, ''));

  if (STRING_FORMATS.has(format))
    return trimmed;

  if (format === 'fraction_concept') {
    if (/^\d+\/\d+$/.test(trimmed)) return trimmed;
    const n = Number(trimmed);
    return Number.isFinite(n) ? n : trimmed;
  }

  if (format === 'pattern') {
    const n = Number(trimmed);
    return Number.isFinite(n) ? n : trimmed;
  }

  if (NUMERIC_FORMATS.has(format))
    return trimmed === '' ? NaN : Number(trimmed);

  const n = Number(trimmed);
  return Number.isFinite(n) ? n : trimmed;
}
