// v0.3.0 — host-provided validateAnswer hook on <chocabloc-question>.
//
// When the host assigns `el.validateAnswer = fn`, the element MUST call
// that fn instead of the built-in client-side compare for every pick or
// input submission. The fn's return value drives the `answered` event so
// downstream consumers (analytics, review-mode painting) don't branch.

import { expect } from '@esm-bundle/chai';
import '../../src/elements/ChocablocQuestion';
import type {
  AnswerValue,
  NormalizedQuestion,
  ValidationResult,
} from '../../src/types';

function mount(html: string): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.innerHTML = html;
  document.body.appendChild(wrapper);
  return wrapper.firstElementChild as HTMLElement;
}

function waitFrame(): Promise<void> {
  return new Promise((r) => requestAnimationFrame(() => r()));
}

const TEXT_Q: NormalizedQuestion = {
  id: 'TEXT-1',
  skillIds: ['MISC'],
  questionText: 'What is the capital of France?',
  format: 'text',
  content: { stem: 'What is the capital of France?' },
  answer: 'Paris',
  distractors: [
    { value: 'London', errorType: 'wrong-country' },
    { value: 'Rome', errorType: 'wrong-country' },
  ],
} as NormalizedQuestion;

afterEach(() => {
  document.body.innerHTML = '';
});

describe('<chocabloc-question> validateAnswer hook (v0.3.0)', () => {
  it('uses host-provided validator on MC pick', async () => {
    const el = mount(`<chocabloc-question></chocabloc-question>`) as HTMLElement & {
      question: NormalizedQuestion;
      validateAnswer: (q: NormalizedQuestion, sa: AnswerValue) => Promise<ValidationResult>;
    };

    const calls: Array<{ qid: string; sa: AnswerValue }> = [];
    el.validateAnswer = async (q, sa) => {
      calls.push({ qid: q.id, sa });
      // Server says wrong even though "Paris" is locally correct
      return {
        correct: false,
        expected: 'Paris',
        distractorMatched: { value: 'London', errorType: 'wrong-country' },
        skillTags: q.skillIds,
      };
    };

    el.question = TEXT_Q;
    await waitFrame();

    const answered = new Promise<CustomEvent>((resolve) => {
      el.addEventListener('answered', (e) => resolve(e as CustomEvent), { once: true });
    });

    // Find the choice pad inside Shadow DOM and click the correct-looking option.
    const pad = el.shadowRoot!.querySelector('choca-choice-pad') as HTMLElement & { choices: { value: AnswerValue }[] };
    pad.dispatchEvent(new CustomEvent('picked', {
      detail: { value: 'Paris', label: 'Paris', correct: true },
      bubbles: true,
      composed: true,
    }));

    const ev = await answered;
    expect(calls.length).to.equal(1);
    expect(calls[0]!.qid).to.equal('TEXT-1');
    expect(calls[0]!.sa).to.equal('Paris');
    // Host verdict wins — element reports !correct + the matched distractor
    expect(ev.detail.correct).to.equal(false);
    expect(ev.detail.distractorMatched).to.deep.equal({ value: 'London', errorType: 'wrong-country' });
    expect(ev.detail.expected).to.equal('Paris');
  });

  it('falls back to built-in validator when host validator is absent', async () => {
    const el = mount(`<chocabloc-question></chocabloc-question>`) as HTMLElement & {
      question: NormalizedQuestion;
    };
    el.question = TEXT_Q;
    await waitFrame();

    const answered = new Promise<CustomEvent>((resolve) => {
      el.addEventListener('answered', (e) => resolve(e as CustomEvent), { once: true });
    });

    const pad = el.shadowRoot!.querySelector('choca-choice-pad') as HTMLElement;
    pad.dispatchEvent(new CustomEvent('picked', {
      detail: { value: 'Paris', label: 'Paris', correct: true },
      bubbles: true,
      composed: true,
    }));

    const ev = await answered;
    expect(ev.detail.correct).to.equal(true);
  });

  it('forwards validateAnswer to inner format element for non-text formats', async () => {
    const el = mount(`<chocabloc-question seed="1"></chocabloc-question>`) as HTMLElement & {
      question: NormalizedQuestion;
      validateAnswer: (q: NormalizedQuestion, sa: AnswerValue) => Promise<ValidationResult>;
    };

    let called = false;
    el.validateAnswer = async (q, _sa) => {
      called = true;
      return { correct: true, expected: q.answer, distractorMatched: null, skillTags: q.skillIds };
    };

    el.question = {
      id: 'MONEY-1',
      skillIds: ['MONEY-COIN-VALUE-USD'],
      questionText: 'How much?',
      format: 'money',
      imageType: 'coins',
      content: { coins: { quarter: 1 }, currency: 'USD' },
      answer: 25,
      distractors: [{ value: 10, errorType: 'misc' }],
    } as NormalizedQuestion;
    await waitFrame();

    const inner = el.shadowRoot!.querySelector('choca-coin-pile') as HTMLElement & {
      validateAnswer?: unknown;
    };
    expect(typeof inner.validateAnswer).to.equal('function');

    // Drive a pick via the inner pad
    const pad = inner.shadowRoot!.querySelector('choca-choice-pad') as HTMLElement;
    const answered = new Promise<CustomEvent>((resolve) => {
      el.addEventListener('answered', (e) => resolve(e as CustomEvent), { once: true });
    });
    pad.dispatchEvent(new CustomEvent('picked', {
      detail: { value: 25, label: '25', correct: true },
      bubbles: true,
      composed: true,
    }));
    await answered;
    expect(called).to.equal(true);
  });

  it('uses host validator on input-mode submissions', async () => {
    const el = mount(`<chocabloc-question answer-mode="input"></chocabloc-question>`) as HTMLElement & {
      question: NormalizedQuestion;
      validateAnswer: (q: NormalizedQuestion, sa: AnswerValue) => Promise<ValidationResult>;
    };

    let called = false;
    el.validateAnswer = async (q, _sa) => {
      called = true;
      return { correct: false, expected: q.answer, distractorMatched: null, skillTags: q.skillIds };
    };

    el.question = TEXT_Q;
    await waitFrame();

    const input = el.shadowRoot!.querySelector('choca-answer-input') as HTMLElement;
    const answered = new Promise<CustomEvent>((resolve) => {
      el.addEventListener('answered', (e) => resolve(e as CustomEvent), { once: true });
    });
    input.dispatchEvent(new CustomEvent('submitted', {
      detail: { parsedValue: 'London', rawInput: 'London' },
    }));
    const ev = await answered;
    expect(called).to.equal(true);
    expect(ev.detail.correct).to.equal(false);
  });
});
