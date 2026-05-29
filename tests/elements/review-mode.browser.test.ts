import { expect } from '@esm-bundle/chai';
import '../../src/elements/ChocablocQuestion';
import '../../src/elements/ChocaChoicePad';

const fixture = {
  id: 'Q1',
  questionText: 'Pick the bigger number',
  content: { stem: 'Pick the bigger number' },
  answer: 5,
  distractors: [
    { value: 3, error_type: 'off-by-two' },
    { value: 1, error_type: 'unrelated' },
  ],
  format: 'text',
  imageType: null,
  difficulty: 'easy',
  skillIds: ['TEST-SKILL'],
};

afterEach(() => {
  document.body.innerHTML = '';
});

async function waitMicrotask(): Promise<void> {
  await new Promise((r) => setTimeout(r, 0));
}

function findChoicePad(host: HTMLElement): HTMLElement | null {
  const shadow = host.shadowRoot!;
  return shadow.querySelector('choca-choice-pad') as HTMLElement | null;
}

function padTarget(host: HTMLElement): ShadowRoot {
  const pad = findChoicePad(host);
  if (pad && pad.shadowRoot) return pad.shadowRoot;
  // Fallback to host shadow if pad has no shadow (shouldn't happen here)
  return host.shadowRoot!;
}

describe('<chocabloc-question> answer-mode="review"', () => {
  it('marks correct choice with part="choice-correct"', async () => {
    const el = document.createElement('chocabloc-question') as HTMLElement & {
      question: unknown;
    };
    el.setAttribute('answer-mode', 'review');
    document.body.appendChild(el);
    el.question = fixture;
    await waitMicrotask();
    const target = padTarget(el);
    const correctEl = target.querySelector('[part~="choice-correct"]');
    expect(correctEl, 'choice-correct part missing').to.exist;
    expect(correctEl!.textContent).to.contain('5');
  });

  it('marks student-answer that matches a distractor with part="choice-wrong"', async () => {
    const el = document.createElement('chocabloc-question') as HTMLElement & {
      question: unknown;
    };
    el.setAttribute('answer-mode', 'review');
    el.setAttribute('student-answer', '3');
    document.body.appendChild(el);
    el.question = fixture;
    await waitMicrotask();
    const target = padTarget(el);
    const wrongEl = target.querySelector('[part~="choice-wrong"]');
    expect(wrongEl, 'choice-wrong part missing').to.exist;
    expect(wrongEl!.textContent).to.contain('3');
  });

  it('PC-3: handles string vs number coercion in student-answer (attribute is string, distractor.value is number)', async () => {
    const el = document.createElement('chocabloc-question') as HTMLElement & {
      question: unknown;
    };
    el.setAttribute('answer-mode', 'review');
    el.setAttribute('student-answer', '3'); // string attribute
    document.body.appendChild(el);
    el.question = { ...fixture }; // distractor value is number 3
    await waitMicrotask();
    const target = padTarget(el);
    const wrongEl = target.querySelector('[part~="choice-wrong"]');
    expect(wrongEl, 'PC-3: wrong-choice marker missing — string vs number coercion failed').to.exist;
  });

  it('PC-3: handles choice objects { value, error_type } in choice pad internals', async () => {
    const el = document.createElement('chocabloc-question') as HTMLElement & {
      question: unknown;
    };
    el.setAttribute('answer-mode', 'review');
    el.setAttribute('student-answer', '3');
    document.body.appendChild(el);
    el.question = fixture;
    await waitMicrotask();
    const target = padTarget(el);
    const correct = target.querySelector('[part~="choice-correct"]');
    const wrong = target.querySelector('[part~="choice-wrong"]');
    expect(correct, 'PC-3: correct choice not marked when internal choice is an object').to.exist;
    expect(wrong, 'PC-3: wrong choice not marked when internal choice is an object').to.exist;
  });

  it('disables all choices in review mode', async () => {
    const el = document.createElement('chocabloc-question') as HTMLElement & {
      question: unknown;
    };
    el.setAttribute('answer-mode', 'review');
    document.body.appendChild(el);
    el.question = fixture;
    await waitMicrotask();
    const target = padTarget(el);
    const buttons = target.querySelectorAll('button, [role="radio"]');
    expect(buttons.length, 'no choice buttons rendered').to.be.greaterThan(0);
    buttons.forEach((b) => expect(b.getAttribute('aria-disabled')).to.equal('true'));
  });

  it('renders no choice-wrong marker when student-answer absent', async () => {
    const el = document.createElement('chocabloc-question') as HTMLElement & {
      question: unknown;
    };
    el.setAttribute('answer-mode', 'review');
    document.body.appendChild(el);
    el.question = fixture;
    await waitMicrotask();
    const target = padTarget(el);
    expect(target.querySelector('[part~="choice-wrong"]')).to.not.exist;
  });
});

/* ================================================================
   Forwarding through visual wrappers
   ================================================================
   The dispatcher (<chocabloc-question>) puts the wrapper element (e.g.
   <choca-coin-pile>) inside its own shadow, and the <choca-choice-pad>
   lives inside the wrapper's shadow. Without student-answer forwarding
   at the wrapper layer, review-mode markers never reach the nested pad.
   ================================================================ */

function nestedPadTarget(host: HTMLElement, wrapperTag: string): ShadowRoot | null {
  const wrapper = host.shadowRoot!.querySelector(wrapperTag) as HTMLElement | null;
  if (!wrapper || !wrapper.shadowRoot) return null;
  const pad = wrapper.shadowRoot.querySelector('choca-choice-pad') as HTMLElement | null;
  if (!pad || !pad.shadowRoot) return null;
  return pad.shadowRoot;
}

describe('<chocabloc-question> forwards student-answer through visual wrappers', () => {
  it('forwards student-answer to coin-pile choice pad', async () => {
    const moneyFixture = {
      id: 'MONEY-1',
      skillIds: ['MONEY-COIN-VALUE-USD'],
      format: 'money',
      imageType: 'coins',
      content: { coins: { quarter: 1 }, currency: 'USD' },
      answer: 25,
      distractors: [{ value: 20, errorType: 'off-by-nickel' }],
    };
    const el = document.createElement('chocabloc-question') as HTMLElement & {
      question: unknown;
    };
    el.setAttribute('answer-mode', 'review');
    el.setAttribute('student-answer', '20');
    document.body.appendChild(el);
    el.question = moneyFixture;
    await waitMicrotask();
    const target = nestedPadTarget(el, 'choca-coin-pile');
    expect(target, 'coin-pile shadow / nested pad not found').to.exist;
    const wrong = target!.querySelector('[part~="choice-wrong"]');
    expect(wrong, 'choice-wrong not marked on coin-pile pad').to.exist;
    expect(wrong!.textContent).to.contain('20');
  });

  it('forwards student-answer to pattern choice pad', async () => {
    const patternFixture = {
      id: 'PATTERN-1',
      skillIds: ['PATTERN-REPEATING-SIMPLE'],
      format: 'pattern',
      imageType: 'pattern_visual',
      content: { sequence: ['A', 'B', 'A', 'B', 'A', 'B'] },
      answer: 'A',
      distractors: [
        { value: 'B', errorType: 'wrong-element' },
        { value: 'C', errorType: 'wrong-pattern' },
      ],
    };
    const el = document.createElement('chocabloc-question') as HTMLElement & {
      question: unknown;
    };
    el.setAttribute('answer-mode', 'review');
    el.setAttribute('student-answer', 'B');
    document.body.appendChild(el);
    el.question = patternFixture;
    await waitMicrotask();
    const target = nestedPadTarget(el, 'choca-pattern-question');
    expect(target, 'pattern shadow / nested pad not found').to.exist;
    const wrong = target!.querySelector('[part~="choice-wrong"]');
    expect(wrong, 'choice-wrong not marked on pattern pad').to.exist;
    expect(wrong!.textContent).to.contain('B');
  });

  it('forwards student-answer to table choice pad', async () => {
    const tableFixture = {
      id: 'MONEY-BUDGET-ADJUST-1',
      skillIds: ['MONEY-BUDGET-ADJUST'],
      format: 'money_budget_adjust',
      imageType: 'table',
      content: {
        currency: 'CAD',
        solve_for: 'entertainment',
        answer_cents: 100,
        change_event: { type: 'income_drop', new_income_cents: 1135 },
        original_rows: [
          { category: 'utilities', amount_cents: 185 },
          { category: 'entertainment', amount_cents: 300 },
          { category: 'rent', amount_cents: 850 },
        ],
        original_income_cents: 1335,
      },
      answer: 100,
      distractors: [
        { value: 300, errorType: 'unchanged-original' },
        { value: 200, errorType: 'wrong-calc' },
      ],
    };
    const el = document.createElement('chocabloc-question') as HTMLElement & {
      question: unknown;
    };
    el.setAttribute('answer-mode', 'review');
    el.setAttribute('student-answer', '300');
    document.body.appendChild(el);
    el.question = tableFixture;
    await waitMicrotask();
    const target = nestedPadTarget(el, 'choca-table-question');
    expect(target, 'table shadow / nested pad not found').to.exist;
    const wrong = target!.querySelector('[part~="choice-wrong"]');
    expect(wrong, 'choice-wrong not marked on table pad').to.exist;
    expect(wrong!.textContent).to.contain('300');
  });

  it('forwards student-answer to number-line choice pad', async () => {
    const numberLineFixture = {
      id: 'MULT-NL-1',
      skillIds: ['INT-MULT-NUMBER-LINE'],
      format: 'multiplication',
      imageType: 'number_line',
      content: { operands: [3, 4] },
      answer: 12,
      distractors: [
        { value: 11, errorType: 'off-by-1' },
        { value: 13, errorType: 'off-by-1' },
      ],
    };
    const el = document.createElement('chocabloc-question') as HTMLElement & {
      question: unknown;
    };
    el.setAttribute('answer-mode', 'review');
    el.setAttribute('student-answer', '11');
    document.body.appendChild(el);
    el.question = numberLineFixture;
    await waitMicrotask();
    const target = nestedPadTarget(el, 'choca-number-line-question');
    expect(target, 'number-line shadow / nested pad not found').to.exist;
    const wrong = target!.querySelector('[part~="choice-wrong"]');
    expect(wrong, 'choice-wrong not marked on number-line pad').to.exist;
    expect(wrong!.textContent).to.contain('11');
  });
});
