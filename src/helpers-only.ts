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

export type {
  NormalizedQuestion,
  MoneyQuestion,
  MoneyContent,
  MoneyContentUSD,
  MoneyContentCAD,
  TextOnlyQuestion,
  GeometryAttributesQuestion,
  GeometryAttributesContent,
  GeometryClassifyQuestion,
  GeometryClassifyContent,
  GeometryPropertiesQuestion,
  GeometryPropertiesContent,
  PythagoreanQuestion,
  PythagoreanContent,
  GeometryAreaQuestion,
  GeometryAreaContent,
  GeometryAnglesQuestion,
  GeometryAnglesContent,
  GeometryPerimeterQuestion,
  GeometryPerimeterContent,
  GeometryCircumferenceQuestion,
  GeometryCircumferenceContent,
  GeometryAngleClassifyQuestion,
  GeometryAngleClassifyContent,
  GeometryCirclePartsQuestion,
  GeometryCirclePartsContent,
  DataGraphQuestion,
  DataGraphContent,
  MultiplicationVisualQuestion,
  MultiplicationVisualContent,
  FractionConceptQuestion,
  FractionConceptContent,
  TimeQuestion,
  TimeContent,
  PatternQuestion,
  PatternContent,
  CoordinateDistanceQuestion,
  CoordinateDistanceContent,
  MoneyBudgetAdjustQuestion,
  MoneyBudgetAdjustContent,
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
