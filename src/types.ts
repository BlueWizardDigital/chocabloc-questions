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

// v0 PUBLIC union — money + text only.
// Future formats live in src/internal/future-formats.ts and are NOT exported.
export type NormalizedQuestion = MoneyQuestion | TextOnlyQuestion;

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
