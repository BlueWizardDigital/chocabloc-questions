import type {
  NormalizedQuestion,
  MoneyQuestion,
  MoneyContent,
  TextOnlyQuestion,
  Distractor,
  USDCoinName,
  CADCoinName,
  AnswerValue,
} from '../types';
import { ParseError } from '../types';

const USD_COIN_KEYS: ReadonlySet<USDCoinName> = new Set([
  'penny',
  'nickel',
  'dime',
  'quarter',
]);
const CAD_COIN_KEYS: ReadonlySet<CADCoinName> = new Set([
  'nickel',
  'dime',
  'quarter',
  'loonie',
  'toonie',
]);

export function isQuestionLike(raw: unknown): boolean {
  if (typeof raw !== 'object' || raw === null) return false;
  const r = raw as Record<string, unknown>;
  if (typeof r['id'] !== 'string' && typeof r['question_id'] !== 'string') return false;
  if (typeof r['format'] !== 'string') return false;
  return true;
}

function isValidAnswerValue(v: unknown): v is AnswerValue {
  if (typeof v === 'number') return Number.isFinite(v);
  if (typeof v === 'string') return true;
  if (Array.isArray(v)) {
    if (v.length === 2 && v.every((n) => typeof n === 'number' && Number.isFinite(n))) return true;
    if (v.every((n) => typeof n === 'string')) return true;
  }
  return false;
}

function isValidDistractor(d: unknown): d is Distractor {
  if (typeof d !== 'object' || d === null) return false;
  const dd = d as Record<string, unknown>;
  if (!isValidAnswerValue(dd['value'])) return false;
  if (typeof dd['errorType'] !== 'string') return false;
  return true;
}

function isValidMoneyContent(c: unknown): c is MoneyContent {
  if (typeof c !== 'object' || c === null) return false;
  const cc = c as Record<string, unknown>;
  if (cc['currency'] !== 'USD' && cc['currency'] !== 'CAD') return false;
  if (typeof cc['coins'] !== 'object' || cc['coins'] === null) return false;
  const validKeys: ReadonlySet<string> =
    cc['currency'] === 'USD' ? USD_COIN_KEYS : CAD_COIN_KEYS;
  for (const [key, val] of Object.entries(cc['coins'] as Record<string, unknown>)) {
    if (!validKeys.has(key)) return false;
    if (typeof val !== 'number' || val < 0 || !Number.isFinite(val)) return false;
  }
  return true;
}

function isValidMoneyQuestion(r: Record<string, unknown>): r is MoneyQuestion {
  if (r['format'] !== 'money') return false;
  if (r['imageType'] !== 'coins') return false;
  if (!Array.isArray(r['skillIds']) || !r['skillIds'].every((s) => typeof s === 'string')) return false;
  if (typeof r['answer'] !== 'number') return false;
  if (!Array.isArray(r['distractors']) || !r['distractors'].every(isValidDistractor)) return false;
  if (!isValidMoneyContent(r['content'])) return false;
  return true;
}

function isValidTextContent(c: unknown): c is { stem: string } {
  if (typeof c !== 'object' || c === null) return false;
  const cc = c as Record<string, unknown>;
  return typeof cc['stem'] === 'string';
}

function isValidTextQuestion(r: Record<string, unknown>): r is TextOnlyQuestion {
  if (r['format'] !== 'text') return false;
  if (!Array.isArray(r['skillIds']) || !r['skillIds'].every((s) => typeof s === 'string')) return false;
  if (!isValidTextContent(r['content'])) return false;
  if (!isValidAnswerValue(r['answer'])) return false;
  if (!Array.isArray(r['distractors']) || !r['distractors'].every(isValidDistractor)) return false;
  return true;
}

const VISUAL_FORMAT_STRINGS: ReadonlySet<string> = new Set([
  'geometry_attributes',
  'geometry_classify',
  'geometry_properties',
  'pythagorean',
  'geometry_area',
  'geometry_angles',
  'geometry_perimeter',
  'geometry_circumference',
  'geometry_angle_classify',
  'geometry_circle_parts',
  'data_graph',
  'multiplication',
  'fraction_concept',
  'time',
  'pattern',
  'coordinate_distance',
  'money_budget_adjust',
  'base10_blocks',
]);

function isValidVisualQuestion(r: Record<string, unknown>): boolean {
  const format = r['format'];
  if (typeof format !== 'string' || !VISUAL_FORMAT_STRINGS.has(format)) return false;
  if (
    !Array.isArray(r['skillIds']) ||
    !r['skillIds'].every((s) => typeof s === 'string')
  )
    return false;
  if (typeof r['content'] !== 'object' || r['content'] === null) return false;
  if (!isValidAnswerValue(r['answer'])) return false;
  if (
    !Array.isArray(r['distractors']) ||
    !r['distractors'].every(isValidDistractor)
  )
    return false;
  return true;
}

export function isNormalizedQuestion(raw: unknown): raw is NormalizedQuestion {
  if (!isQuestionLike(raw)) return false;
  const r = raw as Record<string, unknown>;
  if (r['format'] === 'money') return isValidMoneyQuestion(r);
  if (r['format'] === 'text') return isValidTextQuestion(r);
  return isValidVisualQuestion(r);
}

export function parseQuestion(raw: unknown): NormalizedQuestion {
  if (!isQuestionLike(raw)) {
    throw new ParseError('Input does not have id + format strings', raw);
  }
  const r = raw as Record<string, unknown>;
  if (isValidMoneyQuestion(r)) return r;
  if (isValidTextQuestion(r)) return r;
  if (isValidVisualQuestion(r)) return r as NormalizedQuestion;
  throw new ParseError(
    `Input failed normalized validation for format=${String(r['format'])}`,
    raw,
  );
}
