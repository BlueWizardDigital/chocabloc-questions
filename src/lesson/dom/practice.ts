// The lazy practice chunk: Intro, Check and <chocabloc-question>. Help never
// loads it. It imports nothing Help loads (Help's helpers arrive on the shell),
// or Rollup would move Help into a shared chunk behind a facade.
import { ChocablocQuestion } from '../../elements/ChocablocQuestion';
import { ChocaAnswerInput } from '../../elements/ChocaAnswerInput';
import { ChocaCanvasQuestion } from '../../elements/ChocaCanvasQuestion';
import { ChocaChoicePad } from '../../elements/ChocaChoicePad';
import { ChocaCoinPile } from '../../elements/ChocaCoinPile';
import { ChocaNumberLineQuestion } from '../../elements/ChocaNumberLineQuestion';
import { ChocaPatternQuestion } from '../../elements/ChocaPatternQuestion';
import { ChocaTableQuestion } from '../../elements/ChocaTableQuestion';
import { ChocaToolbar } from '../../elements/ChocaToolbar';

export const QUESTION_TAG = 'chocabloc-question';

// <chocabloc-question> and every element it draws with, defined here from used
// bindings. ChocablocQuestion.ts imports the inner ones bare, and a bundler
// drops a bare import of a file that package.json's sideEffects doesn't list.
const ELEMENTS: [string, CustomElementConstructor][] = [
  [QUESTION_TAG, ChocablocQuestion],
  ['choca-choice-pad', ChocaChoicePad],
  ['choca-coin-pile', ChocaCoinPile],
  ['choca-canvas-question', ChocaCanvasQuestion],
  ['choca-table-question', ChocaTableQuestion],
  ['choca-pattern-question', ChocaPatternQuestion],
  ['choca-number-line-question', ChocaNumberLineQuestion],
  ['choca-toolbar', ChocaToolbar],
  ['choca-answer-input', ChocaAnswerInput],
];
for (const [tag, ctor] of ELEMENTS) if (!customElements.get(tag)) customElements.define(tag, ctor);

export { ChocablocQuestion };
export { startIntro } from './intro';
export { startCheck } from './check';
