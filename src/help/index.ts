export { STRATEGIES, familyOf, familyForSkill, factKey } from './catalog';
export { buildSteps, strategyOrder } from './strategies';
export type { HelpOptions } from './strategies';
export { helpFactFromQuestion } from './from-question';
export { createHelpMessages, helpMessagesEn } from './messages';
export type { Msg, Translator } from '../lesson/message-format';
export type {
  HelpEventReport,
  HelpFact,
  HelpFamily,
  HelpPicture,
  HelpRecord,
  HelpStep,
  MsgRef,
  SolvedFact,
  StrategyId,
} from './types';
export type { HelpDraw } from './dom/ChocaHelp';
// Importing the entry registers <chocabloc-help> (guarded, like every library element).
export { ChocaHelp } from './dom/ChocaHelp';
