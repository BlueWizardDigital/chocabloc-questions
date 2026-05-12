// Tier 1 only — pure logic, zero DOM. Tree-shake friendly.
export {
  parseQuestion,
  isQuestionLike,
  isNormalizedQuestion,
} from './helpers/parsers';

export {
  normalizeQuestion,
  normalizeBatch,
  type MalformedRowReport,
  type NormalizeOptions,
} from './helpers/normalizer';

export {
  validateAnswer,
  matchesDistractor,
} from './helpers/validators';

export {
  buildChoicePool,
  shuffleChoices,
  type ChoiceBuilderOptions,
} from './helpers/choice-builder';

export {
  formatCurrency,
  formatAnswerForDisplay,
  formatCoinCountForScreenReader,
  type CurrencyFormatOptions,
} from './helpers/formatters';

export {
  isValidSkillId,
  matchesGradeFilter,
  type GradeFilter,
} from './helpers/skill-utils';

export {
  computeCoinTotal,
  COIN_VALUES_USD,
  COIN_VALUES_CAD,
} from './helpers/computers/money';

// v0 public types — money + text only. Future formats live in
// src/internal/future-formats.ts and are intentionally NOT re-exported.
export type {
  NormalizedQuestion,
  MoneyQuestion,
  MoneyContent,
  MoneyContentUSD,
  MoneyContentCAD,
  TextOnlyQuestion,
  QuestionFormat,
  Choice,
  Distractor,
  AnswerValue,
  ValidationResult,
  Currency,
  USDCoinName,
  CADCoinName,
  CoinName,
  GradeBand,
  SkillId,
} from './types';

export { SCHEMA_VERSION, ParseError, NormalizeError } from './types';
