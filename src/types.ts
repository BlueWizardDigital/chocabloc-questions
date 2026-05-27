// Public contract for the lib. Consumers import types from here.
// Bank's raw row shape is NOT exported — only NormalizedQuestion is.
// v0 public union: MoneyQuestion | TextOnlyQuestion. Future formats are
// gated behind minor versions when their renderers ship — they do not exist
// in the public surface yet.

export type GradeBand = 'sprout' | 'adventure' | 'thunder';

export type SkillId = string; // UPPER-KEBAB convention, e.g. 'MONEY-COIN-VALUE-USD'

export type AnswerValue = number | string | [number, number];

export type Distractor = {
  value: AnswerValue;
  errorType: string;
};

export type Choice = {
  value: AnswerValue;
  label?: string;
  correct: boolean;
  errorType?: string;
};

export type ValidationResult = {
  correct: boolean;
  partial?: number;
  skillTags?: SkillId[];
  distractorMatched?: Distractor | null;
  expected?: AnswerValue;
};

export type Currency = 'USD' | 'CAD';

// Currency-specific narrow coin types (R2.3)
export type USDCoinName = 'penny' | 'nickel' | 'dime' | 'quarter';
export type CADCoinName = 'nickel' | 'dime' | 'quarter' | 'loonie' | 'toonie';
export type CoinName = USDCoinName | CADCoinName;

export type BaseQuestion = {
  id: string;
  skillIds: SkillId[];
  gradeBand?: GradeBand;
  gradeLevel?: number;
  // Human-readable question stem. Optional — renderers fall back to a
  // format-appropriate default if unset.
  prompt?: string;
};

// USD / CAD content variants discriminated on currency
export type MoneyContentUSD = {
  coins: Partial<Record<USDCoinName, number>>;
  currency: 'USD';
};

export type MoneyContentCAD = {
  coins: Partial<Record<CADCoinName, number>>;
  currency: 'CAD';
};

export type MoneyContent = MoneyContentUSD | MoneyContentCAD;

export type MoneyQuestion = BaseQuestion & {
  format: 'money';
  imageType: 'coins';
  content: MoneyContent;
  answer: number; // cents
  distractors: Distractor[];
};

export type TextOnlyQuestion = BaseQuestion & {
  format: 'text';
  imageType?: undefined;
  content: { stem: string };
  answer: AnswerValue;
  distractors: Distractor[];
};

type VisualQuestion<
  F extends string,
  I extends string | undefined,
  C extends Record<string, unknown>,
> = BaseQuestion & {
  format: F;
  imageType: I;
  content: C;
  answer: AnswerValue;
  distractors: Distractor[];
};

// — Geometry family —

export type GeometryAttributesContent = { attribute: string };
export type GeometryAttributesQuestion = VisualQuestion<
  'geometry_attributes',
  'shape_2d',
  GeometryAttributesContent
>;

export type GeometryClassifyContent = { shape: string; dimension: string };
export type GeometryClassifyQuestion = VisualQuestion<
  'geometry_classify',
  'shape_2d' | 'shape_3d',
  GeometryClassifyContent
>;

export type GeometryPropertiesContent = { shape: string; property: string };
export type GeometryPropertiesQuestion = VisualQuestion<
  'geometry_properties',
  'shape_3d',
  GeometryPropertiesContent
>;

export type PythagoreanContent = {
  legs: [number, number];
  hypotenuse: number;
  operands: [number, number];
};
export type PythagoreanQuestion = VisualQuestion<
  'pythagorean',
  'right_triangle',
  PythagoreanContent
>;

export type GeometryAreaContent = {
  shape: string;
  operands: number[];
  components?: { width: number; height: number }[];
  radius?: number;
};
export type GeometryAreaQuestion = VisualQuestion<
  'geometry_area',
  'compound_shape' | undefined,
  GeometryAreaContent
>;

export type GeometryAnglesContent = {
  known_angles: number[];
  missing_angle: number;
};
export type GeometryAnglesQuestion = VisualQuestion<
  'geometry_angles',
  undefined,
  GeometryAnglesContent
>;

export type GeometryPerimeterContent = {
  shape: string;
  operands: [number, number];
};
export type GeometryPerimeterQuestion = VisualQuestion<
  'geometry_perimeter',
  undefined,
  GeometryPerimeterContent
>;

export type GeometryCircumferenceContent = { radius: number };
export type GeometryCircumferenceQuestion = VisualQuestion<
  'geometry_circumference',
  undefined,
  GeometryCircumferenceContent
>;

export type GeometryAngleClassifyContent = { angle: number };
export type GeometryAngleClassifyQuestion = VisualQuestion<
  'geometry_angle_classify',
  'angle',
  GeometryAngleClassifyContent
>;

export type GeometryCirclePartsContent = { part: string };
export type GeometryCirclePartsQuestion = VisualQuestion<
  'geometry_circle_parts',
  'circle_parts',
  GeometryCirclePartsContent
>;

// — Data family —

export type DataGraphContent = {
  data: Record<string, number>;
  question: string;
};
export type DataGraphQuestion = VisualQuestion<
  'data_graph',
  'bar_graph' | 'pictograph',
  DataGraphContent
>;

// — Math visuals —

export type MultiplicationVisualContent = { operands: [number, number] };
export type MultiplicationVisualQuestion = VisualQuestion<
  'multiplication',
  'array' | 'number_line',
  MultiplicationVisualContent
>;

export type FractionConceptContent = { fraction: [number, number] };
export type FractionConceptQuestion = VisualQuestion<
  'fraction_concept',
  'fraction_visual',
  FractionConceptContent
>;

// — Special formats —

export type TimeContent = { hour: number; minute: number; time: string };
export type TimeQuestion = VisualQuestion<
  'time',
  'analog_clock',
  TimeContent
>;

export type PatternContent = { sequence: string[] };
export type PatternQuestion = VisualQuestion<
  'pattern',
  'pattern_visual',
  PatternContent
>;

export type CoordinateDistanceContent = {
  point1: [number, number];
  point2: [number, number];
};
export type CoordinateDistanceQuestion = VisualQuestion<
  'coordinate_distance',
  'coordinate_plane',
  CoordinateDistanceContent
>;

export type MoneyBudgetAdjustContent = {
  currency: Currency;
  solve_for: string;
  answer_cents: number;
  original_income_cents: number;
  original_rows: { category: string; amount_cents: number }[];
  change_event: { type: string; new_income_cents: number };
};
export type MoneyBudgetAdjustQuestion = VisualQuestion<
  'money_budget_adjust',
  'table',
  MoneyBudgetAdjustContent
>;

// PUBLIC union — all 19 formats.
export type NormalizedQuestion =
  | MoneyQuestion
  | TextOnlyQuestion
  | GeometryAttributesQuestion
  | GeometryClassifyQuestion
  | GeometryPropertiesQuestion
  | PythagoreanQuestion
  | GeometryAreaQuestion
  | GeometryAnglesQuestion
  | GeometryPerimeterQuestion
  | GeometryCircumferenceQuestion
  | GeometryAngleClassifyQuestion
  | GeometryCirclePartsQuestion
  | DataGraphQuestion
  | MultiplicationVisualQuestion
  | FractionConceptQuestion
  | TimeQuestion
  | PatternQuestion
  | CoordinateDistanceQuestion
  | MoneyBudgetAdjustQuestion;

export type QuestionFormat = NormalizedQuestion['format'];

export const SCHEMA_VERSION = 1 as const;

export class ParseError extends Error {
  constructor(message: string, public readonly raw: unknown) {
    super(message);
    this.name = 'ParseError';
  }
}

export class NormalizeError extends Error {
  constructor(
    message: string,
    public readonly raw: unknown,
    public readonly format?: string,
  ) {
    super(message);
    this.name = 'NormalizeError';
  }
}
