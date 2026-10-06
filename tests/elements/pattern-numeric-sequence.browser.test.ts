// A bank (choices-only) pattern row skips normalizePatternRow, so its
// sequence reaches <choca-pattern-question> as the server sent it: numbers for
// PATTERN-EXPONENTIAL-GROWTH ([1, 2, 4, 8, 16]). It used to throw
// "value.toLowerCase is not a function".
import { expect } from '@esm-bundle/chai';
import '../../src/full';
import { normalizeQuestion } from '../../src/helpers/normalizer';
import type { NormalizedQuestion } from '../../src/types';

describe('pattern row with a numeric sequence from the bank', () => {
  it('draws one item per term, then the ?', () => {
    const q = normalizeQuestion({
      id: 'P1', skillIds: ['PATTERN-EXPONENTIAL-GROWTH'], format: 'pattern', questionText: '',
      content: { rule: '×2', sequence: [1, 2, 4, 8, 16], operation: 'pattern' },
      answerToken: 'test-token-not-real',
      choices: [{ value: '32' }, { value: 'x1' }, { value: 'x2' }, { value: 'x3' }],
    }) as NormalizedQuestion;
    const el = document.createElement('chocabloc-question');
    document.body.appendChild(el);
    try {
      (el as HTMLElement & { question: NormalizedQuestion }).question = q;
      const inner = el.shadowRoot!.querySelector('choca-pattern-question')!;
      const items = [...inner.shadowRoot!.querySelectorAll('[part~="pattern-item"]')].map((n) => n.textContent);
      expect(items).to.deep.equal(['1', '2', '4', '8', '16', '?']);
    } finally {
      el.remove();
    }
  });
});
