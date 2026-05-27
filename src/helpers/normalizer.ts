import type {
  NormalizedQuestion,
  MoneyContent,
  MoneyQuestion,
  TextOnlyQuestion,
  Currency,
  Distractor,
  AnswerValue,
  USDCoinName,
  CADCoinName,
  GeometryAttributesQuestion,
  GeometryClassifyQuestion,
  GeometryPropertiesQuestion,
  PythagoreanQuestion,
  GeometryAreaQuestion,
  GeometryAnglesQuestion,
  GeometryPerimeterQuestion,
  GeometryCircumferenceQuestion,
  GeometryAngleClassifyQuestion,
  GeometryCirclePartsQuestion,
  DataGraphQuestion,
  MultiplicationVisualQuestion,
  FractionConceptQuestion,
  TimeQuestion,
  PatternQuestion,
  CoordinateDistanceQuestion,
  MoneyBudgetAdjustQuestion,
} from '../types';
import { NormalizeError } from '../types';
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
  let usdFound = false;
  let cadFound = false;
  for (const id of skillIds) {
    if (id.endsWith('-USD')) usdFound = true;
    if (id.endsWith('-CAD')) cadFound = true;
  }
  if (usdFound && cadFound) {
    throw new NormalizeError(
      'Ambiguous currency in skill ids: both -USD and -CAD suffixes present',
      skillIds,
    );
  }
  if (usdFound) return 'USD';
  if (cadFound) return 'CAD';
  throw new NormalizeError('Cannot infer currency from skill ids', skillIds);
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
    throw new NormalizeError('Money content must be an object', rawContent);
  }
  const cc = rawContent as Record<string, unknown>;
  const rawCoins = cc['coins'];
  if (typeof rawCoins !== 'object' || rawCoins === null) {
    throw new NormalizeError('Money content.coins must be an object', rawContent);
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

function getString(r: Record<string, unknown>, key: string, fallbackKey?: string): string | undefined {
  const v = r[key] ?? (fallbackKey ? r[fallbackKey] : undefined);
  return typeof v === 'string' ? v : undefined;
}

function getStringArray(r: Record<string, unknown>, keyA: string, keyB?: string): string[] {
  const v = r[keyA] ?? (keyB ? r[keyB] : undefined);
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === 'string');
}

function getNumber(r: Record<string, unknown>, key: string): number | undefined {
  const v = r[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

function getNumberArray(r: Record<string, unknown>, key: string): number[] | undefined {
  const v = r[key];
  if (!Array.isArray(v)) return undefined;
  if (!v.every((x): x is number => typeof x === 'number' && Number.isFinite(x))) return undefined;
  return v as number[];
}

function extractBase(r: Record<string, unknown>): {
  id: string;
  skillIds: string[];
  prompt?: string;
} {
  const id = getString(r, 'id', 'question_id');
  if (!id) throw new NormalizeError('Question missing id', r);
  const skillIds = getStringArray(r, 'skill_ids', 'skillIds');
  const promptRaw =
    getString(r, 'prompt') ||
    (typeof (r['content'] as Record<string, unknown> | undefined)?.['question'] === 'string'
      ? ((r['content'] as Record<string, unknown>)['question'] as string)
      : undefined) ||
    (typeof (r['content'] as Record<string, unknown> | undefined)?.['prompt'] === 'string'
      ? ((r['content'] as Record<string, unknown>)['prompt'] as string)
      : undefined);
  return { id, skillIds, ...(promptRaw ? { prompt: promptRaw } : {}) };
}

function extractAnswer(r: Record<string, unknown>): AnswerValue {
  const a = r['answer'];
  if (typeof a === 'number') return a;
  if (typeof a === 'string') return a;
  if (Array.isArray(a) && a.length === 2 && a.every((x) => typeof x === 'number')) {
    return a as [number, number];
  }
  throw new NormalizeError('Answer must be number, string, or [n,n]', r);
}

function requireContent(r: Record<string, unknown>): Record<string, unknown> {
  if (typeof r['content'] !== 'object' || r['content'] === null) {
    throw new NormalizeError('Question content must be an object', r);
  }
  return r['content'] as Record<string, unknown>;
}

function resolveImageType(
  r: Record<string, unknown>,
  allowed: readonly string[],
): string | undefined {
  const v = r['image_type'] ?? r['imageType'];
  if (typeof v !== 'string') return undefined;
  if (allowed.length > 0 && !allowed.includes(v)) return undefined;
  return v;
}

function normalizeMoneyRow(r: Record<string, unknown>): MoneyQuestion {
  const { id, skillIds, prompt: promptRaw } = extractBase(r);
  if (skillIds.length === 0) {
    throw new NormalizeError('Money question missing skill_ids', r);
  }
  const currency = inferCurrency(skillIds);
  const content = normalizeMoneyContent(r['content'], currency);
  if (typeof r['answer'] !== 'number') {
    throw new NormalizeError('Money answer must be a number (cents)', r);
  }
  const out: MoneyQuestion = {
    id, skillIds, format: 'money', imageType: 'coins',
    content, answer: r['answer'], distractors: normalizeDistractors(r['distractors']),
  };
  if (promptRaw) out.prompt = promptRaw;
  return out;
}

function normalizeTextRow(r: Record<string, unknown>): TextOnlyQuestion {
  const { id, skillIds } = extractBase(r);
  const c = requireContent(r);
  const stem = getString(c, 'stem');
  if (!stem) throw new NormalizeError('Text question missing stem', r);
  const answer = r['answer'];
  if (
    typeof answer !== 'number' &&
    typeof answer !== 'string' &&
    !(Array.isArray(answer) && answer.length === 2)
  ) {
    throw new NormalizeError('Text question answer must be number, string, or [n,n]', r);
  }
  return {
    id, skillIds, format: 'text', content: { stem },
    answer: answer as TextOnlyQuestion['answer'],
    distractors: normalizeDistractors(r['distractors']),
  };
}

// -- Geometry family --

function normalizeGeometryAttributesRow(r: Record<string, unknown>): GeometryAttributesQuestion {
  const base = extractBase(r);
  const c = requireContent(r);
  const attribute = getString(c, 'attribute');
  if (!attribute) throw new NormalizeError('geometry_attributes missing attribute', r);
  return {
    ...base, format: 'geometry_attributes', imageType: 'shape_2d',
    content: { attribute }, answer: extractAnswer(r), distractors: normalizeDistractors(r['distractors']),
  };
}

function normalizeGeometryClassifyRow(r: Record<string, unknown>): GeometryClassifyQuestion {
  const base = extractBase(r);
  const c = requireContent(r);
  const shape = getString(c, 'shape');
  const dimension = getString(c, 'dimension');
  if (!shape || !dimension) throw new NormalizeError('geometry_classify missing shape/dimension', r);
  const imageType = resolveImageType(r, ['shape_2d', 'shape_3d']) as 'shape_2d' | 'shape_3d';
  return {
    ...base, format: 'geometry_classify', imageType: imageType ?? 'shape_3d',
    content: { shape, dimension }, answer: extractAnswer(r), distractors: normalizeDistractors(r['distractors']),
  };
}

function normalizeGeometryPropertiesRow(r: Record<string, unknown>): GeometryPropertiesQuestion {
  const base = extractBase(r);
  const c = requireContent(r);
  const shape = getString(c, 'shape');
  const property = getString(c, 'property');
  if (!shape || !property) throw new NormalizeError('geometry_properties missing shape/property', r);
  return {
    ...base, format: 'geometry_properties', imageType: 'shape_3d',
    content: { shape, property }, answer: extractAnswer(r), distractors: normalizeDistractors(r['distractors']),
  };
}

function normalizePythagoreanRow(r: Record<string, unknown>): PythagoreanQuestion {
  const base = extractBase(r);
  const c = requireContent(r);
  const legs = getNumberArray(c, 'legs');
  const hyp = getNumber(c, 'hypotenuse');
  const operands = getNumberArray(c, 'operands');
  if (!legs || legs.length !== 2 || hyp === undefined)
    throw new NormalizeError('pythagorean missing legs/hypotenuse', r);
  return {
    ...base, format: 'pythagorean', imageType: 'right_triangle',
    content: { legs: legs as [number, number], hypotenuse: hyp, operands: (operands ?? legs) as [number, number] },
    answer: extractAnswer(r), distractors: normalizeDistractors(r['distractors']),
  };
}

function normalizeGeometryAreaRow(r: Record<string, unknown>): GeometryAreaQuestion {
  const base = extractBase(r);
  const c = requireContent(r);
  const shape = getString(c, 'shape') ?? 'rectangle';
  const operands = getNumberArray(c, 'operands') ?? [];
  const rawComponents = c['components'];
  let components: { width: number; height: number }[] | undefined;
  if (Array.isArray(rawComponents)) {
    components = rawComponents.filter(
      (x): x is { width: number; height: number } =>
        typeof x === 'object' && x !== null &&
        typeof (x as Record<string, unknown>)['width'] === 'number' &&
        typeof (x as Record<string, unknown>)['height'] === 'number',
    );
  }
  const radius = getNumber(c, 'radius');
  const imageType = components && components.length >= 2 ? ('compound_shape' as const) : undefined;
  return {
    ...base, format: 'geometry_area', imageType,
    content: { shape, operands, ...(components ? { components } : {}), ...(radius !== undefined ? { radius } : {}) },
    answer: extractAnswer(r), distractors: normalizeDistractors(r['distractors']),
  };
}

function normalizeGeometryAnglesRow(r: Record<string, unknown>): GeometryAnglesQuestion {
  const base = extractBase(r);
  const c = requireContent(r);
  const knownAngles = getNumberArray(c, 'known_angles');
  const missingAngle = getNumber(c, 'missing_angle');
  if (!knownAngles || missingAngle === undefined)
    throw new NormalizeError('geometry_angles missing known_angles/missing_angle', r);
  return {
    ...base, format: 'geometry_angles', imageType: undefined,
    content: { known_angles: knownAngles, missing_angle: missingAngle },
    answer: extractAnswer(r), distractors: normalizeDistractors(r['distractors']),
  };
}

function normalizeGeometryPerimeterRow(r: Record<string, unknown>): GeometryPerimeterQuestion {
  const base = extractBase(r);
  const c = requireContent(r);
  const operands = getNumberArray(c, 'operands');
  if (!operands || operands.length < 2)
    throw new NormalizeError('geometry_perimeter missing operands', r);
  const shape = getString(c, 'shape') ?? 'rectangle';
  return {
    ...base, format: 'geometry_perimeter', imageType: undefined,
    content: { shape, operands: operands as [number, number] },
    answer: extractAnswer(r), distractors: normalizeDistractors(r['distractors']),
  };
}

function normalizeGeometryCircumferenceRow(r: Record<string, unknown>): GeometryCircumferenceQuestion {
  const base = extractBase(r);
  const c = requireContent(r);
  const radius = getNumber(c, 'radius');
  if (radius === undefined) throw new NormalizeError('geometry_circumference missing radius', r);
  return {
    ...base, format: 'geometry_circumference', imageType: undefined,
    content: { radius }, answer: extractAnswer(r), distractors: normalizeDistractors(r['distractors']),
  };
}

function normalizeGeometryAngleClassifyRow(r: Record<string, unknown>): GeometryAngleClassifyQuestion {
  const base = extractBase(r);
  const c = requireContent(r);
  const angle = getNumber(c, 'angle');
  if (angle === undefined) throw new NormalizeError('geometry_angle_classify missing angle', r);
  return {
    ...base, format: 'geometry_angle_classify', imageType: 'angle',
    content: { angle }, answer: extractAnswer(r), distractors: normalizeDistractors(r['distractors']),
  };
}

function normalizeGeometryCirclePartsRow(r: Record<string, unknown>): GeometryCirclePartsQuestion {
  const base = extractBase(r);
  const c = requireContent(r);
  const part = getString(c, 'part');
  if (!part) throw new NormalizeError('geometry_circle_parts missing part', r);
  return {
    ...base, format: 'geometry_circle_parts', imageType: 'circle_parts',
    content: { part }, answer: extractAnswer(r), distractors: normalizeDistractors(r['distractors']),
  };
}

// -- Data family --

function normalizeDataGraphRow(r: Record<string, unknown>): DataGraphQuestion {
  const base = extractBase(r);
  const c = requireContent(r);
  const data = c['data'];
  if (typeof data !== 'object' || data === null || Array.isArray(data))
    throw new NormalizeError('data_graph missing data object', r);
  const question = getString(c, 'question') ?? '';
  const imageType = resolveImageType(r, ['bar_graph', 'pictograph']) as 'bar_graph' | 'pictograph';
  if (!imageType) throw new NormalizeError('data_graph missing bar_graph/pictograph image_type', r);
  return {
    ...base, format: 'data_graph', imageType,
    content: { data: data as Record<string, number>, question },
    answer: extractAnswer(r), distractors: normalizeDistractors(r['distractors']),
  };
}

// -- Math visuals --

function normalizeMultiplicationRow(r: Record<string, unknown>): MultiplicationVisualQuestion {
  const base = extractBase(r);
  const c = requireContent(r);
  const operands = getNumberArray(c, 'operands');
  if (!operands || operands.length < 2)
    throw new NormalizeError('multiplication missing operands', r);
  const imageType = resolveImageType(r, ['array', 'number_line']) as 'array' | 'number_line';
  if (!imageType) throw new NormalizeError('multiplication missing array/number_line image_type', r);
  return {
    ...base, format: 'multiplication', imageType,
    content: { operands: operands as [number, number] },
    answer: extractAnswer(r), distractors: normalizeDistractors(r['distractors']),
  };
}

function normalizeFractionConceptRow(r: Record<string, unknown>): FractionConceptQuestion {
  const base = extractBase(r);
  const c = requireContent(r);
  const fraction = getNumberArray(c, 'fraction');
  if (!fraction || fraction.length !== 2)
    throw new NormalizeError('fraction_concept missing fraction [n,d]', r);
  return {
    ...base, format: 'fraction_concept', imageType: 'fraction_visual',
    content: { fraction: fraction as [number, number] },
    answer: extractAnswer(r), distractors: normalizeDistractors(r['distractors']),
  };
}

// -- Special formats --

function normalizeTimeRow(r: Record<string, unknown>): TimeQuestion {
  const base = extractBase(r);
  const c = requireContent(r);
  const hour = getNumber(c, 'hour');
  const minute = getNumber(c, 'minute');
  const time = getString(c, 'time');
  if (hour === undefined || minute === undefined || !time)
    throw new NormalizeError('time missing hour/minute/time', r);
  return {
    ...base, format: 'time', imageType: 'analog_clock',
    content: { hour, minute, time }, answer: extractAnswer(r), distractors: normalizeDistractors(r['distractors']),
  };
}

function normalizePatternRow(r: Record<string, unknown>): PatternQuestion {
  const base = extractBase(r);
  const c = requireContent(r);
  const sequence = c['sequence'];
  if (!Array.isArray(sequence) || !sequence.every((x) => typeof x === 'string'))
    throw new NormalizeError('pattern missing string[] sequence', r);
  return {
    ...base, format: 'pattern', imageType: 'pattern_visual',
    content: { sequence: sequence as string[] },
    answer: extractAnswer(r), distractors: normalizeDistractors(r['distractors']),
  };
}

function normalizeCoordinateDistanceRow(r: Record<string, unknown>): CoordinateDistanceQuestion {
  const base = extractBase(r);
  const c = requireContent(r);
  const p1 = getNumberArray(c, 'point1');
  const p2 = getNumberArray(c, 'point2');
  if (!p1 || p1.length !== 2 || !p2 || p2.length !== 2)
    throw new NormalizeError('coordinate_distance missing point1/point2', r);
  return {
    ...base, format: 'coordinate_distance', imageType: 'coordinate_plane',
    content: { point1: p1 as [number, number], point2: p2 as [number, number] },
    answer: extractAnswer(r), distractors: normalizeDistractors(r['distractors']),
  };
}

function normalizeMoneyBudgetAdjustRow(r: Record<string, unknown>): MoneyBudgetAdjustQuestion {
  const base = extractBase(r);
  const c = requireContent(r);
  const currency = getString(c, 'currency') as Currency | undefined;
  if (currency !== 'USD' && currency !== 'CAD')
    throw new NormalizeError('money_budget_adjust missing valid currency', r);
  const solveFor = getString(c, 'solve_for');
  if (!solveFor) throw new NormalizeError('money_budget_adjust missing solve_for', r);
  const answerCents = getNumber(c, 'answer_cents');
  const originalIncomeCents = getNumber(c, 'original_income_cents');
  if (answerCents === undefined || originalIncomeCents === undefined)
    throw new NormalizeError('money_budget_adjust missing cents fields', r);
  const originalRows = c['original_rows'];
  if (!Array.isArray(originalRows))
    throw new NormalizeError('money_budget_adjust missing original_rows', r);
  const changeEvent = c['change_event'];
  if (typeof changeEvent !== 'object' || changeEvent === null)
    throw new NormalizeError('money_budget_adjust missing change_event', r);
  const ce = changeEvent as Record<string, unknown>;
  return {
    ...base, format: 'money_budget_adjust', imageType: 'table',
    content: {
      currency, solve_for: solveFor, answer_cents: answerCents,
      original_income_cents: originalIncomeCents,
      original_rows: originalRows as { category: string; amount_cents: number }[],
      change_event: { type: getString(ce, 'type') ?? 'unknown', new_income_cents: getNumber(ce, 'new_income_cents') ?? 0 },
    },
    answer: extractAnswer(r), distractors: normalizeDistractors(r['distractors']),
  };
}

const FORMAT_NORMALIZERS: Record<string, (r: Record<string, unknown>) => NormalizedQuestion> = {
  money: normalizeMoneyRow,
  text: normalizeTextRow,
  geometry_attributes: normalizeGeometryAttributesRow,
  geometry_classify: normalizeGeometryClassifyRow,
  geometry_properties: normalizeGeometryPropertiesRow,
  pythagorean: normalizePythagoreanRow,
  geometry_area: normalizeGeometryAreaRow,
  geometry_angles: normalizeGeometryAnglesRow,
  geometry_perimeter: normalizeGeometryPerimeterRow,
  geometry_circumference: normalizeGeometryCircumferenceRow,
  geometry_angle_classify: normalizeGeometryAngleClassifyRow,
  geometry_circle_parts: normalizeGeometryCirclePartsRow,
  data_graph: normalizeDataGraphRow,
  multiplication: normalizeMultiplicationRow,
  fraction_concept: normalizeFractionConceptRow,
  time: normalizeTimeRow,
  pattern: normalizePatternRow,
  coordinate_distance: normalizeCoordinateDistanceRow,
  money_budget_adjust: normalizeMoneyBudgetAdjustRow,
};

function doNormalize(raw: unknown): NormalizedQuestion {
  if (!isQuestionLike(raw)) {
    throw new NormalizeError('Input does not have id + format strings', raw);
  }
  const r = raw as Record<string, unknown>;
  const format = r['format'] as string;
  const normalizer = FORMAT_NORMALIZERS[format];
  if (!normalizer) {
    throw new NormalizeError(`Unsupported format: ${format}`, raw, format);
  }
  return parseQuestion(normalizer(r));
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
    const r = raw as { id?: unknown; question_id?: unknown };
    if (typeof r.id === 'string') return r.id;
    if (typeof r.question_id === 'string') return r.question_id;
  }
  return '<unknown>';
}
