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
  GeometryFaceIdentifyQuestion,
  GeometryIdentifyQuestion,
  GeometrySymmetryQuestion,
  GeometryClassifyTriangleQuestion,
  GeometryVolumeQuestion,
  GeometrySurfaceAreaQuestion,
  GeometryCircleConvertQuestion,
  DataGraphQuestion,
  MultiplicationVisualQuestion,
  FractionConceptQuestion,
  TimeQuestion,
  PatternQuestion,
  CoordinateDistanceQuestion,
  MoneyBudgetAdjustQuestion,
  Base10BlocksQuestion,
  Base10Blocks,
  Base10BlocksContent,
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
const INPUT_ANSWER_TYPES: ReadonlySet<string> = new Set(['numeric', 'text', 'expression']);

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
    const label = typeof dd['value_display'] === 'string' ? dd['value_display'] : undefined;
    out.push({ value: dd['value'] as Distractor['value'], errorType, ...(label ? { label } : {}) });
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
  questionText: string;
  answerMode?: 'choice' | 'input';
  answerDisplay?: string;
} {
  const id = getString(r, 'id', 'question_id');
  if (!id) throw new NormalizeError('Question missing id', r);
  const skillIds = getStringArray(r, 'skill_ids', 'skillIds');
  // v0.2.0 canonical shape: strict read from questionText only. No fallback
  // to legacy `prompt`, `content.question`, or `content.prompt`. Rows lacking
  // questionText get an empty string default; format-specific normalizers may
  // backfill via buildStem() if the format supports it.
  const questionText = getString(r, 'questionText') || '';
  const rawMode = getString(r, 'answerMode', 'answer_mode');
  const rawType = getString(r, 'answer_type');
  const answerMode: 'choice' | 'input' | undefined =
    rawMode === 'input' || rawMode === 'choice' ? rawMode
    : rawType === 'mc_only' || rawType === 'money' ? 'choice'
    : rawType && INPUT_ANSWER_TYPES.has(rawType) ? 'input'
    : undefined;
  const answerDisplay = getString(r, 'answer_display', 'answerDisplay');
  return {
    id, skillIds, questionText,
    ...(answerMode ? { answerMode } : {}),
    ...(answerDisplay ? { answerDisplay } : {}),
  };
}

function extractAnswer(r: Record<string, unknown>): AnswerValue {
  const a = r['answer'];
  if (typeof a === 'number') return a;
  if (typeof a === 'string') return a;
  if (Array.isArray(a)) {
    if (a.length === 2 && a.every((x) => typeof x === 'number')) {
      return a as [number, number];
    }
    if (a.every((x) => typeof x === 'string')) {
      return a as string[];
    }
  }
  throw new NormalizeError('Answer must be number, string, [n,n], or string[]', r);
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
  const base = extractBase(r);
  if (base.skillIds.length === 0) {
    throw new NormalizeError('Money question missing skill_ids', r);
  }
  const currency = inferCurrency(base.skillIds);
  const content = normalizeMoneyContent(r['content'], currency);
  const rawAns = r['answer'];
  const answer =
    typeof rawAns === 'string' && /^-?\d+(\.\d+)?$/.test(rawAns)
      ? Number(rawAns)
      : rawAns;
  if (typeof answer !== 'number') {
    throw new NormalizeError('Money answer must be a number (cents)', r);
  }
  const out: MoneyQuestion = {
    ...base, format: 'money', imageType: 'coins',
    content, answer, distractors: normalizeDistractors(r['distractors']),
  };
  return out;
}

function normalizeTextRow(r: Record<string, unknown>): TextOnlyQuestion {
  const base = extractBase(r);
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
    ...base, format: 'text', content: { stem },
    // v0.4.0+: TextOnlyQuestion.answer is optional, but at this branch we
    // proved above that `answer` is one of (number | string | [n, n]).
    // Cast to AnswerValue (the non-undefined union) to satisfy
    // exactOptionalPropertyTypes.
    answer: answer as AnswerValue,
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
  const diameter = getNumber(c, 'diameter');
  const radius = getNumber(c, 'radius') ?? (diameter !== undefined ? diameter / 2 : undefined);
  if (radius === undefined) throw new NormalizeError('geometry_circumference missing radius or diameter', r);
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

function normalizeGeometryFaceIdentifyRow(r: Record<string, unknown>): GeometryFaceIdentifyQuestion {
  const base = extractBase(r);
  const c = requireContent(r);
  const shape = getString(c, 'shape');
  const face_shape = getString(c, 'face_shape');
  if (!shape) throw new NormalizeError('geometry_face_identify missing shape', r);
  if (!face_shape) throw new NormalizeError('geometry_face_identify missing face_shape', r);
  return {
    ...base, format: 'geometry_face_identify', imageType: 'shape_3d',
    content: { shape, face_shape }, answer: extractAnswer(r), distractors: normalizeDistractors(r['distractors']),
  };
}

function normalizeGeometryIdentifyRow(r: Record<string, unknown>): GeometryIdentifyQuestion {
  const base = extractBase(r);
  const c = requireContent(r);
  const shape = getString(c, 'shape');
  if (!shape) throw new NormalizeError('geometry_identify missing shape', r);
  const imageType = resolveImageType(r, ['shape_2d', 'shape_3d']) as 'shape_2d' | 'shape_3d';
  return {
    ...base, format: 'geometry_identify', imageType: imageType ?? 'shape_2d',
    content: { shape }, answer: extractAnswer(r), distractors: normalizeDistractors(r['distractors']),
  };
}

function normalizeGeometrySymmetryRow(r: Record<string, unknown>): GeometrySymmetryQuestion {
  const base = extractBase(r);
  const c = requireContent(r);
  const shape = getString(c, 'shape');
  if (!shape) throw new NormalizeError('geometry_symmetry missing shape', r);
  const lines_of_symmetry = getNumber(c, 'lines_of_symmetry') ?? 0;
  return {
    ...base, format: 'geometry_symmetry', imageType: 'shape_2d',
    content: { shape, lines_of_symmetry }, answer: extractAnswer(r), distractors: normalizeDistractors(r['distractors']),
  };
}

function normalizeGeometryClassifyTriangleRow(r: Record<string, unknown>): GeometryClassifyTriangleQuestion {
  const base = extractBase(r);
  const c = requireContent(r);
  const operands = getNumberArray(c, 'operands');
  const classify_by = getString(c, 'classify_by');
  if (!operands || operands.length < 3) throw new NormalizeError('geometry_classify_triangle missing operands', r);
  if (!classify_by) throw new NormalizeError('geometry_classify_triangle missing classify_by', r);
  return {
    ...base, format: 'geometry_classify_triangle', imageType: 'shape_2d',
    content: { operands, classify_by }, answer: extractAnswer(r), distractors: normalizeDistractors(r['distractors']),
  };
}

function normalizeGeometryVolumeRow(r: Record<string, unknown>): GeometryVolumeQuestion {
  const base = extractBase(r);
  const c = requireContent(r);
  const shape = getString(c, 'shape');
  const operands = getNumberArray(c, 'operands');
  if (!shape) throw new NormalizeError('geometry_volume missing shape', r);
  if (!operands || operands.length === 0) throw new NormalizeError('geometry_volume missing operands', r);
  const dimensions = getString(c, 'dimensions');
  const radius = getNumber(c, 'radius');
  const height = getNumber(c, 'height');
  return {
    ...base, format: 'geometry_volume', imageType: 'shape_3d',
    content: { shape, operands, ...(dimensions ? { dimensions } : {}), ...(radius !== undefined ? { radius } : {}), ...(height !== undefined ? { height } : {}) },
    answer: extractAnswer(r), distractors: normalizeDistractors(r['distractors']),
  };
}

function normalizeGeometrySurfaceAreaRow(r: Record<string, unknown>): GeometrySurfaceAreaQuestion {
  const base = extractBase(r);
  const c = requireContent(r);
  const shape = getString(c, 'shape');
  const operands = getNumberArray(c, 'operands');
  if (!shape) throw new NormalizeError('geometry_surface_area missing shape', r);
  if (!operands || operands.length === 0) throw new NormalizeError('geometry_surface_area missing operands', r);
  const radius = getNumber(c, 'radius');
  const height = getNumber(c, 'height');
  const slant = getNumber(c, 'slant');
  return {
    ...base, format: 'geometry_surface_area', imageType: 'shape_3d',
    content: { shape, operands, ...(radius !== undefined ? { radius } : {}), ...(height !== undefined ? { height } : {}), ...(slant !== undefined ? { slant } : {}) },
    answer: extractAnswer(r), distractors: normalizeDistractors(r['distractors']),
  };
}

function normalizeGeometryCircleConvertRow(r: Record<string, unknown>): GeometryCircleConvertQuestion {
  const base = extractBase(r);
  const c = requireContent(r);
  const value = getNumber(c, 'value');
  const given_type = getString(c, 'given_type');
  const find_type = getString(c, 'find_type');
  if (value === undefined) throw new NormalizeError('geometry_circle_convert missing value', r);
  if (!given_type) throw new NormalizeError('geometry_circle_convert missing given_type', r);
  if (!find_type) throw new NormalizeError('geometry_circle_convert missing find_type', r);
  return {
    ...base, format: 'geometry_circle_convert', imageType: 'shape_2d',
    content: { value, given_type, find_type }, answer: extractAnswer(r), distractors: normalizeDistractors(r['distractors']),
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
  if (!Array.isArray(sequence))
    throw new NormalizeError('pattern missing sequence array', r);
  const strSeq = sequence.map((x) => String(x));
  return {
    ...base, format: 'pattern', imageType: 'pattern_visual',
    content: { sequence: strSeq },
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

function parseBlocks(raw: unknown): Base10Blocks {
  if (typeof raw !== 'object' || raw === null) return {};
  const b = raw as Record<string, unknown>;
  return {
    ...(typeof b['thousands'] === 'number' ? { thousands: b['thousands'] } : {}),
    ...(typeof b['hundreds'] === 'number' ? { hundreds: b['hundreds'] } : {}),
    ...(typeof b['tens'] === 'number' ? { tens: b['tens'] } : {}),
    ...(typeof b['ones'] === 'number' ? { ones: b['ones'] } : {}),
  };
}

function normalizeBase10BlocksRow(r: Record<string, unknown>): Base10BlocksQuestion {
  const base = extractBase(r);
  const c = requireContent(r);
  const operation = getString(c, 'operation') ?? 'base10_count';
  const content: Base10BlocksContent = { operation };

  content.blocks = parseBlocks(c['blocks']);

  const num = getNumber(c, 'number');
  if (num !== undefined) content.number = num;

  const place = getString(c, 'place');
  if (place) content.place = place;

  const tensShown = getNumber(c, 'tens_shown');
  if (tensShown !== undefined) content.tens_shown = tensShown;
  const onesShown = getNumber(c, 'ones_shown');
  if (onesShown !== undefined) content.ones_shown = onesShown;

  if (operation === 'base10_compare') {
    const rawA = c['set_a'];
    if (typeof rawA === 'object' && rawA !== null) {
      const sa = rawA as Record<string, unknown>;
      content.set_a = {
        number: getNumber(sa, 'number') ?? 0,
        blocks: parseBlocks(sa['blocks']),
      };
    }
    const rawB = c['set_b'];
    if (typeof rawB === 'object' && rawB !== null) {
      const sb = rawB as Record<string, unknown>;
      content.set_b = {
        number: getNumber(sb, 'number') ?? 0,
        blocks: parseBlocks(sb['blocks']),
      };
    }
  }

  return {
    ...base, format: 'base10_blocks', imageType: 'base10_blocks',
    content, answer: extractAnswer(r), distractors: normalizeDistractors(r['distractors']),
  };
}

// -- Stem builder for text-only formats --

function fmtInt(v: unknown): string {
  const n = v as number;
  return n < 0 ? `(−${Math.abs(n)})` : String(n);
}

function fmtSigned(n: number): string {
  return n < 0 ? `−${Math.abs(n)}` : String(n);
}

function fmtFrac(v: unknown): string {
  if (typeof v === 'number') return String(v);
  if (Array.isArray(v) && v.length === 2) return `${v[0]}/${v[1]}`;
  return String(v);
}

const BINARY_OPS: Record<string, { sym: string; fmt?: (v: unknown) => string }> = {
  addition: { sym: '+' },
  subtraction: { sym: '−' },
  division: { sym: '÷' },
  integer_addition: { sym: '+', fmt: fmtInt },
  integer_subtraction: { sym: '−', fmt: fmtInt },
  decimal_addition: { sym: '+' },
  decimal_multiplication: { sym: '×' },
  decimal_division: { sym: '÷' },
  fraction_addition: { sym: '+', fmt: fmtFrac },
  fraction_subtraction: { sym: '−', fmt: fmtFrac },
  fraction_multiplication: { sym: '×', fmt: fmtFrac },
  fraction_division: { sym: '÷', fmt: fmtFrac },
};

function buildStem(format: string, c: Record<string, unknown>): string {
  const ops = c['operands'] as number[] | unknown[] | undefined;

  const binOp = BINARY_OPS[format];
  if (binOp && ops) {
    const f = binOp.fmt ?? String;
    return `${f(ops[0])} ${binOp.sym} ${f(ops[1])} = ?`;
  }

  switch (format) {
    case 'addition_three':
      return `${ops![0]} + ${ops![1]} + ${ops![2]} = ?`;
    case 'missing_addend':
      return `${ops![0]} + ___ = ${c['result']}`;
    case 'missing_subtrahend':
      return `${ops![0]} − ___ = ${c['result']}`;
    case 'comparison':
      return `${ops![0]} ___ ${ops![1]}  (< > =)`;
    case 'integer_comparison':
      return `${fmtSigned(ops![0] as number)} ___ ${fmtSigned(ops![1] as number)}  (< > =)`;
    case 'order_of_operations':
      return `${c['expression']} = ?`;
    case 'algebra_eval':
      return `Evaluate ${c['expression']} when ${c['var']} = ${c['var_value']}`;
    case 'algebra_solve':
      return `Solve: ${c['equation']}`;
    case 'algebra_write':
      return `Write an expression: ${c['words']}`;
    case 'fraction_of_quantity':
      return `${fmtFrac(ops![0])} of ${ops![1]} = ?`;
    case 'fraction_to_decimal':
      return `Convert ${c['value']} to a decimal`;
    case 'decimal_to_fraction':
      return `Convert ${c['value']} to a fraction`;
    case 'decimal_to_percent':
      return `Convert ${c['value']} to a percent`;
    case 'percent_to_decimal':
      return `Convert ${c['value']}% to a decimal`;
    case 'conversion':
      return `Convert ${c['value']} ${c['from_unit']} to ${c['to_unit']}`;
    case 'exponent': {
      const exp = c['exp'] as number;
      const sup = exp === 2 ? '²' : exp === 3 ? '³' : `^${exp}`;
      return `${c['base']}${sup} = ?`;
    }
    case 'square_root':
      return `√${c['number']} = ?`;
    case 'gcf':
      return `GCF of ${ops![0]} and ${ops![1]}`;
    case 'lcm':
      return `LCM of ${ops![0]} and ${ops![1]}`;
    case 'prime_composite':
      return `Is ${c['number']} prime or composite?`;
    case 'odd_even':
      return `Is ${c['number']} odd or even?`;
    case 'absolute_value': {
      const num = (c['number'] as number) ?? ops?.[0];
      return `|${fmtSigned(num as number)}| = ?`;
    }
    case 'place_value':
      return `What digit is in the ${c['place']} place of ${c['number']}?`;
    case 'rounding':
      return `Round ${c['number']} to the nearest ${c['round_to']}`;
    case 'ratio':
      return `Simplify ${ops![0]} : ${ops![1]}`;
    case 'proportion': {
      const ratio = c['ratio'] as number[];
      return `${ratio[0]} ${c['item'] ?? 'items'} per ${ratio[1]} ${c['unit'] ?? 'units'}. How many ${c['unit'] ?? 'units'} for ${c['known']} ${c['item'] ?? 'items'}?`;
    }
    case 'unit_rate':
      return `${c['total']} in ${c['units']} = ? ${c['rate_name'] ?? 'per unit'}`;
    case 'percent_of':
      return `${c['percent']}% of ${c['whole']} = ?`;
    case 'statistics_mean':
    case 'statistics_median':
    case 'statistics_mode': {
      const stat = (c['stat_type'] as string) ?? format.split('_')[1];
      const dataset = c['data_set'] as number[];
      return `Find the ${stat}: [${dataset.join(', ')}]`;
    }
    case 'skip_count': {
      const seq = c['sequence'] as (number | string)[];
      return `${seq.join(', ')}, ___`;
    }
    case 'pythagorean_converse':
      return `Do sides ${(ops as number[]).join(', ')} form a right triangle?`;
    case 'geometry_angle_pairs': {
      const rel = c['relationship'] as string | undefined;
      return `The ${rel === 'complement' ? 'complement' : 'supplement'} of ${ops![0]}° is ___`;
    }
    case 'geometry_classify_quad':
      return `${c['properties']} → ?`;
    case 'geometry_formula_identify':
      return `Formula for ${c['concept']}?`;
    case 'geometry_interior_angles':
      return `Sum of interior angles of a ${c['shape']}?`;
    case 'money_best_buy':
      return `${c['a_count']} ${c['item_plural'] ?? 'items'} for ${c['a_total_display']} or ${c['b_count']} ${c['item_plural'] ?? 'items'} for ${c['b_total_display']}. Unit price of cheaper?`;
    case 'money_compare_buys':
      return `${c['a_count']} ${c['item_plural'] ?? 'items'} at ${c['a_total_display']} vs ${c['b_count']} at ${c['b_list_display']} (${c['b_discount']}% off). Cheaper unit price?`;
    case 'money_compare_savings':
      return `${c['principal_display']} at ${c['a_rate']}% for ${c['a_time']}yr vs ${c['b_rate']}% for ${c['b_time']}yr. Which earns more?`;
    case 'money_decimal_calc':
      return `${c['a_display']} ${c['operator'] === '+' ? '+' : '−'} ${c['b_display']} = ?`;
    case 'money_round':
      return `Round ${c['value_display']} to the nearest ${c['round_to_display']}`;
    case 'money_unit_price':
      return `${c['count']} ${c['item_plural'] ?? 'items'} for ${c['total_display']}. Price per ${c['item'] ?? 'item'}?`;
    case 'money_simple_interest_amount':
      return `Simple interest on ${c['principal_display']} at ${c['rate']}% for ${c['time_years']} years?`;
    case 'money_simple_interest_final_balance':
      return `Final balance: ${c['principal_display']} at ${c['rate']}% for ${c['time_years']} years?`;
    case 'money_count_single':
      return `How much is ${c['count']} ${c['coin']}${(c['count'] as number) !== 1 ? 's' : ''}?`;
    case 'money_make_change':
      return `Pay ${c['payment_display']} for an item costing ${c['item_price_display']}. How much change?`;
    case 'money_purchase_find_difference':
      return `You have coins worth some amount. Item costs ${c['price_display']}. What is the ${c['direction'] ?? 'difference'}?`;
    case 'money_coin_colour':
    case 'money_coin_denomination':
    case 'money_coin_name':
    case 'money_coin_size':
      return `Which coin matches: ${c['attribute']} = ${c['target_value']}?`;
    case 'money_budget_balance': {
      const dir = c['direction'] ?? 'surplus';
      return `What is the ${dir} in this budget?`;
    }
    case 'money_budget_plan':
      return `How much goes to ${c['solve_for']}?`;
    case 'money_financial_records':
      return 'What is the final balance?';
    case 'money_price_list':
      return 'What is the total cost?';
    case 'geometry_identify':
      return `What shape is this? (${c['shape']})`;
    case 'geometry_classify_triangle':
      return `Classify triangle with sides ${(ops as number[]).join(', ')} by ${c['classify_by']}.`;
    case 'geometry_face_identify':
      return `What shape is the face of a ${c['shape']}?`;
    case 'geometry_circle_convert':
      return `${c['given_type']} = ${c['value']}. Find the ${c['find_type']}.`;
    case 'geometry_symmetry':
      return `How many lines of symmetry does a ${c['shape']} have?`;
    case 'geometry_surface_area': {
      const shape = c['shape'] ?? 'shape';
      return `Find the surface area of the ${shape} (${(ops as number[]).join(' × ')}).`;
    }
    case 'geometry_volume': {
      const shape = c['shape'] ?? 'shape';
      return `Find the volume of the ${shape} (${(ops as number[]).join(' × ')}).`;
    }
    case 'coordinate':
      return `What are the coordinates of the point?`;
    case 'number_line':
      return `What number is shown on the number line?`;
    default:
      return 'Solve:';
  }
}

function normalizeWithStem(r: Record<string, unknown>): TextOnlyQuestion {
  const base = extractBase(r);
  const c = requireContent(r);
  const format = r['format'] as string;
  // v0.2.0: prefer canonical questionText if present; fall back to format-derived
  // stem for legacy bank rows that don't ship one. Once server-side recipe
  // resolver always populates questionText, this OR becomes a noop.
  const stem = base.questionText || buildStem(format, c);
  return {
    ...base, format: 'text', imageType: undefined,
    content: { stem },
    answer: extractAnswer(r), distractors: normalizeDistractors(r['distractors']),
  };
}

const FORMAT_NORMALIZERS: Record<string, (r: Record<string, unknown>) => NormalizedQuestion> = {
  money: normalizeMoneyRow,
  money_count_mixed: normalizeMoneyRow,
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
  geometry_face_identify: normalizeGeometryFaceIdentifyRow,
  geometry_identify: normalizeGeometryIdentifyRow,
  geometry_symmetry: normalizeGeometrySymmetryRow,
  geometry_classify_triangle: normalizeGeometryClassifyTriangleRow,
  geometry_volume: normalizeGeometryVolumeRow,
  geometry_surface_area: normalizeGeometrySurfaceAreaRow,
  geometry_circle_convert: normalizeGeometryCircleConvertRow,
  data_graph: normalizeDataGraphRow,
  multiplication: (r) => {
    const imageType = resolveImageType(r, ['array', 'number_line']);
    if (imageType) return normalizeMultiplicationRow(r);
    return normalizeWithStem(r);
  },
  fraction_concept: normalizeFractionConceptRow,
  time: normalizeTimeRow,
  pattern: normalizePatternRow,
  coordinate_distance: normalizeCoordinateDistanceRow,
  money_budget_adjust: normalizeMoneyBudgetAdjustRow,
  base10_blocks: normalizeBase10BlocksRow,
  base10_count: normalizeBase10BlocksRow,
  base10_block_count: normalizeBase10BlocksRow,
  base10_regroup: normalizeBase10BlocksRow,
  base10_compare: normalizeBase10BlocksRow,
};

const STEM_FORMATS = [
  'addition', 'addition_three', 'subtraction', 'division',
  'integer_addition', 'integer_subtraction',
  'decimal_addition', 'decimal_multiplication', 'decimal_division',
  'missing_addend', 'missing_subtrahend',
  'comparison', 'integer_comparison',
  'order_of_operations',
  'algebra_eval', 'algebra_solve', 'algebra_write',
  'fraction_addition', 'fraction_subtraction', 'fraction_multiplication',
  'fraction_division', 'fraction_of_quantity',
  'fraction_to_decimal', 'decimal_to_fraction', 'decimal_to_percent', 'percent_to_decimal',
  'conversion', 'exponent', 'square_root', 'gcf', 'lcm',
  'prime_composite', 'odd_even', 'absolute_value', 'place_value', 'rounding',
  'ratio', 'proportion', 'unit_rate', 'percent_of',
  'statistics_mean', 'statistics_median', 'statistics_mode',
  'skip_count', 'pythagorean_converse',
  'geometry_angle_pairs', 'geometry_classify_quad', 'geometry_formula_identify',
  'geometry_interior_angles',
  'money_best_buy', 'money_compare_buys', 'money_compare_savings',
  'money_decimal_calc', 'money_round', 'money_unit_price',
  'money_simple_interest_amount', 'money_simple_interest_final_balance',
  'money_count_single', 'money_make_change', 'money_purchase_find_difference',
  'money_coin_colour', 'money_coin_denomination', 'money_coin_name', 'money_coin_size',
  'money_budget_balance', 'money_budget_plan', 'money_financial_records', 'money_price_list',
  'coordinate', 'number_line',
] as const;
for (const f of STEM_FORMATS) FORMAT_NORMALIZERS[f] = normalizeWithStem;

function doNormalize(raw: unknown): NormalizedQuestion {
  if (!isQuestionLike(raw)) {
    throw new NormalizeError('Input does not have id + format strings', raw);
  }
  const r = raw as Record<string, unknown>;
  const format = r['format'] as string;

  // v0.4.0+: server-validated path. When `choices` is present, skip the
  // per-format normalizer (which would throw on missing `answer`) and build
  // the shape directly from the base fields + content + choices. The
  // resulting NormalizedQuestion has `choices` set and `answer`/`distractors`
  // omitted; buildChoicePool uses `choices`, and the lib's built-in validator
  // returns `correct: false` so a host validateAnswer is required.
  const rawChoices = r['choices'];
  if (Array.isArray(rawChoices)) {
    const choices = normalizeChoicesField(rawChoices);
    const base = extractBase(r);
    const content =
      typeof r['content'] === 'object' && r['content'] !== null
        ? (r['content'] as Record<string, unknown>)
        : {};
    const imageType = typeof r['imageType'] === 'string' ? r['imageType']
      : typeof r['image_type'] === 'string' ? r['image_type']
      : undefined;
    const out: Record<string, unknown> = {
      ...base, format, content, choices,
      ...(imageType ? { imageType } : {}),
    };
    return out as NormalizedQuestion;
  }

  const normalizer = FORMAT_NORMALIZERS[format];
  if (!normalizer) {
    throw new NormalizeError(`Unsupported format: ${format}`, raw, format);
  }
  return parseQuestion(normalizer(r));
}

/**
 * v0.4.0+: validate + coerce the wire-shape `choices` array. Each entry must
 * carry a `value` of a valid AnswerValue. Drops invalid entries silently so
 * server emission glitches degrade rather than blank-screen the kid.
 */
function normalizeChoicesField(raw: unknown[]): { value: AnswerValue }[] {
  const out: { value: AnswerValue }[] = [];
  for (const entry of raw) {
    if (typeof entry !== 'object' || entry === null) continue;
    const e = entry as Record<string, unknown>;
    const v = e['value'];
    if (typeof v === 'number' || typeof v === 'string') {
      out.push({ value: v });
    } else if (Array.isArray(v)) {
      if (v.length === 2 && v.every((n) => typeof n === 'number')) {
        out.push({ value: v as [number, number] });
      } else if (v.every((s) => typeof s === 'string')) {
        out.push({ value: v as string[] });
      }
    }
  }
  // Operational signal — silent-drop of a malformed `choices` entry is the
  // intentional pre-launch posture (kid sees a degraded pad, not a blank
  // screen), but a quiet warn surfaces server data-quality regressions
  // during burn-in. Matches the warn pattern in validators.ts.
  if (out.length !== raw.length) {
    console.warn(
      `[chocabloc-questions] normalizeChoicesField: dropped ${
        raw.length - out.length
      } malformed choice entr${raw.length - out.length === 1 ? 'y' : 'ies'}`,
    );
  }
  return out;
}

export function normalizeQuestion(
  raw: unknown,
  opts: NormalizeOptions = {},
): NormalizedQuestion | null {
  if (raw && typeof raw === 'object' && 'correctIndex' in raw) {
    throw new Error(
      "Received legacy question shape with 'correctIndex' field; " +
      "expected canonical chocabloc question shape (use 'answer' + 'distractors' instead). " +
      "See chocabloc-questions v0.2.0 migration notes.",
    );
  }
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
