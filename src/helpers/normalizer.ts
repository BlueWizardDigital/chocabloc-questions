import type {
  NormalizedQuestion,
  MoneyContent,
  MoneyQuestion,
  TextOnlyQuestion,
  Currency,
  Distractor,
  USDCoinName,
  CADCoinName,
} from '../types';
import { ParseError } from '../types';
import { parseQuestion, isQuestionLike } from './parsers';
import { isProd } from '../internal/env';

export type MalformedRowReport = {
  id: string;
  reason: string;
  raw: unknown;
};

export type NormalizeOptions = {
  onMalformed?: (report: MalformedRowReport) => void;
};

const USD_COIN_KEYS: readonly USDCoinName[] = ['penny', 'nickel', 'dime', 'quarter'];
const CAD_COIN_KEYS: readonly CADCoinName[] = ['nickel', 'dime', 'quarter', 'loonie', 'toonie'];

function inferCurrency(skillIds: string[]): Currency {
  for (const id of skillIds) {
    if (id.endsWith('-USD')) return 'USD';
    if (id.endsWith('-CAD')) return 'CAD';
  }
  throw new ParseError('Cannot infer currency from skill ids', skillIds);
}

function normalizeDistractors(raw: unknown): Distractor[] {
  if (!Array.isArray(raw)) return [];
  const out: Distractor[] = [];
  for (const d of raw) {
    if (typeof d !== 'object' || d === null) continue;
    const dd = d as Record<string, unknown>;
    if (dd['value'] === undefined || dd['value'] === null) continue;
    const errorType =
      typeof dd['errorType'] === 'string'
        ? dd['errorType']
        : typeof dd['error_type'] === 'string'
          ? dd['error_type']
          : 'unknown';
    out.push({ value: dd['value'] as Distractor['value'], errorType });
  }
  return out;
}

function normalizeMoneyContent(rawContent: unknown, currency: Currency): MoneyContent {
  if (typeof rawContent !== 'object' || rawContent === null) {
    throw new ParseError('Money content must be an object', rawContent);
  }
  const cc = rawContent as Record<string, unknown>;
  const rawCoins = cc['coins'];
  if (typeof rawCoins !== 'object' || rawCoins === null) {
    throw new ParseError('Money content.coins must be an object', rawContent);
  }
  const coinSrc = rawCoins as Record<string, unknown>;

  if (currency === 'USD') {
    const coins: Partial<Record<USDCoinName, number>> = {};
    for (const key of USD_COIN_KEYS) {
      const v = coinSrc[key];
      if (typeof v === 'number' && v >= 0 && Number.isFinite(v)) coins[key] = v;
    }
    return { currency: 'USD', coins };
  }

  const coins: Partial<Record<CADCoinName, number>> = {};
  for (const key of CAD_COIN_KEYS) {
    const v = coinSrc[key];
    if (typeof v === 'number' && v >= 0 && Number.isFinite(v)) coins[key] = v;
  }
  return { currency: 'CAD', coins };
}

function getString(r: Record<string, unknown>, key: string): string | undefined {
  const v = r[key];
  return typeof v === 'string' ? v : undefined;
}

function getStringArray(r: Record<string, unknown>, keyA: string, keyB?: string): string[] {
  const v = r[keyA] ?? (keyB ? r[keyB] : undefined);
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === 'string');
}

function normalizeMoneyRow(r: Record<string, unknown>): MoneyQuestion {
  const skillIds = getStringArray(r, 'skill_ids', 'skillIds');
  if (skillIds.length === 0) {
    throw new ParseError('Money question missing skill_ids', r);
  }
  const currency = inferCurrency(skillIds);
  const content = normalizeMoneyContent(r['content'], currency);
  if (typeof r['answer'] !== 'number') {
    throw new ParseError('Money answer must be a number (cents)', r);
  }
  const id = getString(r, 'id');
  if (!id) throw new ParseError('Question missing id', r);
  return {
    id,
    skillIds,
    format: 'money',
    imageType: 'coins',
    content,
    answer: r['answer'],
    distractors: normalizeDistractors(r['distractors']),
  };
}

function normalizeTextRow(r: Record<string, unknown>): TextOnlyQuestion {
  const skillIds = getStringArray(r, 'skill_ids', 'skillIds');
  const id = getString(r, 'id');
  if (!id) throw new ParseError('Question missing id', r);
  if (typeof r['content'] !== 'object' || r['content'] === null) {
    throw new ParseError('Text question content must be an object', r);
  }
  const stem = getString(r['content'] as Record<string, unknown>, 'stem');
  if (!stem) throw new ParseError('Text question missing stem', r);
  const answer = r['answer'];
  if (
    typeof answer !== 'number' &&
    typeof answer !== 'string' &&
    !(Array.isArray(answer) && answer.length === 2)
  ) {
    throw new ParseError('Text question answer must be number, string, or [n,n]', r);
  }
  return {
    id,
    skillIds,
    format: 'text',
    content: { stem },
    answer: answer as TextOnlyQuestion['answer'],
    distractors: normalizeDistractors(r['distractors']),
  };
}

function doNormalize(raw: unknown): NormalizedQuestion {
  if (!isQuestionLike(raw)) {
    throw new ParseError('Input does not have id + format strings', raw);
  }
  const r = raw as Record<string, unknown>;
  let result: NormalizedQuestion;
  if (r['format'] === 'money') {
    result = normalizeMoneyRow(r);
  } else if (r['format'] === 'text') {
    result = normalizeTextRow(r);
  } else {
    throw new ParseError(
      `Unsupported format: ${String(r['format'])} (v0 supports money + text only)`,
      raw,
    );
  }
  return parseQuestion(result);
}

export function normalizeQuestion(
  raw: unknown,
  opts: NormalizeOptions = {},
): NormalizedQuestion | null {
  try {
    return doNormalize(raw);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    const id = extractId(raw);
    const report: MalformedRowReport = { id, reason, raw };
    if (isProd()) {
      opts.onMalformed?.(report);
      return null;
    }
    throw err;
  }
}

export function normalizeBatch(
  rows: unknown[],
  opts: NormalizeOptions = {},
): NormalizedQuestion[] {
  const out: NormalizedQuestion[] = [];
  for (const row of rows) {
    const q = normalizeQuestion(row, opts);
    if (q !== null) out.push(q);
  }
  return out;
}

function extractId(raw: unknown): string {
  if (typeof raw === 'object' && raw !== null) {
    const r = raw as { id?: unknown };
    if (typeof r.id === 'string') return r.id;
  }
  return '<unknown>';
}
