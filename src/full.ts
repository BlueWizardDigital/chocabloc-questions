export * from './helpers-only';
export { ChocablocQuestion } from './elements/ChocablocQuestion';
export { ChocaCoinPile } from './elements/ChocaCoinPile';
export { ChocaChoicePad } from './elements/ChocaChoicePad';

// Side-effect register all elements when consumer imports the full barrel
import './elements/ChocablocQuestion';
import './elements/ChocaCoinPile';
import './elements/ChocaChoicePad';
