export * from './helpers-only';
export { ChocablocQuestion } from './elements/ChocablocQuestion';
export { ChocaCoinPile } from './elements/ChocaCoinPile';
export { ChocaChoicePad } from './elements/ChocaChoicePad';
export { ChocaCanvasQuestion } from './elements/ChocaCanvasQuestion';
export { ChocaTableQuestion } from './elements/ChocaTableQuestion';
export { ChocaPatternQuestion } from './elements/ChocaPatternQuestion';
export { ChocaNumberLineQuestion } from './elements/ChocaNumberLineQuestion';

// Side-effect register all elements when consumer imports the full barrel
import './elements/ChocablocQuestion';
import './elements/ChocaCoinPile';
import './elements/ChocaChoicePad';
import './elements/ChocaCanvasQuestion';
import './elements/ChocaTableQuestion';
import './elements/ChocaPatternQuestion';
import './elements/ChocaNumberLineQuestion';
