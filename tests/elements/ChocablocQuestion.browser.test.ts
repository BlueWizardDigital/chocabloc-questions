import { expect } from '@esm-bundle/chai';
import '../../src/elements/ChocablocQuestion';

function mount(html: string): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.innerHTML = html;
  document.body.appendChild(wrapper);
  return wrapper.firstElementChild as HTMLElement;
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('<chocabloc-question> M1 subset', () => {
  it('registers', () => {
    expect(customElements.get('chocabloc-question')).to.not.be.undefined;
  });

  it('dispatches to <choca-coin-pile> for money format', async () => {
    const el = mount(`<chocabloc-question seed="42"></chocabloc-question>`);
    (el as HTMLElement & { question: unknown }).question = {
      id: 'X',
      skillIds: ['MONEY-COIN-VALUE-USD'],
      format: 'money',
      imageType: 'coins',
      content: { coins: { quarter: 1 }, currency: 'USD' },
      answer: 25,
      distractors: [],
    };
    await new Promise((r) => requestAnimationFrame(r));
    const inner = el.shadowRoot!.querySelector('choca-coin-pile');
    expect(inner).to.not.be.null;
  });

  it('renders text-only fallback for text format', async () => {
    const el = mount(`<chocabloc-question></chocabloc-question>`);
    (el as HTMLElement & { question: unknown }).question = {
      id: 'X',
      skillIds: ['MISC'],
      format: 'text',
      content: { stem: 'What is the capital of France?' },
      answer: 'Paris',
      distractors: [],
    };
    await new Promise((r) => requestAnimationFrame(r));
    const text = el.shadowRoot!.textContent ?? '';
    expect(text).to.contain('What is the capital');
  });

  it('forwards answered event from inner renderer', async () => {
    const el = mount(`<chocabloc-question seed="42"></chocabloc-question>`);
    (el as HTMLElement & { question: unknown }).question = {
      id: 'X',
      skillIds: ['MONEY-COIN-VALUE-USD'],
      format: 'money',
      imageType: 'coins',
      content: { coins: { quarter: 1 }, currency: 'USD' },
      answer: 25,
      distractors: [{ value: 20, errorType: 'off-by-nickel' }],
    };
    await new Promise((r) => requestAnimationFrame(r));
    let captured: unknown = null;
    el.addEventListener('answered', (e) => {
      captured = (e as CustomEvent).detail;
    });
    const inner = el.shadowRoot!.querySelector('choca-coin-pile') as HTMLElement;
    const pad = inner.shadowRoot!.querySelector('choca-choice-pad') as HTMLElement;
    const correctBtn = pad.shadowRoot!.querySelector('[part~="choice-correct"]') as HTMLButtonElement;
    correctBtn.click();
    await new Promise((r) => requestAnimationFrame(r));
    expect(captured).to.not.be.null;
  });
});

describe('<chocabloc-question> M2 hardening', () => {
  it('XSS hardening — malicious text-only stem does not inject HTML', async () => {
    const el = mount(`<chocabloc-question></chocabloc-question>`);
    (el as HTMLElement & { question: unknown }).question = {
      id: 'X',
      skillIds: ['MISC'],
      format: 'text',
      content: { stem: '<img src=x onerror="window.__pwned2=true">' },
      answer: 'whatever',
      distractors: [],
    };
    await new Promise((r) => requestAnimationFrame(r));
    expect(el.shadowRoot!.querySelector('img')).to.be.null;
    expect((window as unknown as { __pwned2?: boolean }).__pwned2).to.be.undefined;
  });

  it('forwards rendered event from inner', async () => {
    const el = mount(`<chocabloc-question seed="42"></chocabloc-question>`);
    let rendered = 0;
    el.addEventListener('rendered', () => rendered++);
    (el as HTMLElement & { question: unknown }).question = {
      id: 'X',
      skillIds: ['MONEY-COIN-VALUE-USD'],
      format: 'money',
      imageType: 'coins',
      content: { coins: { quarter: 1 }, currency: 'USD' },
      answer: 25,
      distractors: [],
    };
    await new Promise((r) => requestAnimationFrame(r));
    expect(rendered).to.be.greaterThan(0);
  });
});

describe('<chocabloc-question> dispatcher routing', () => {
  it('dispatches to choca-canvas-question for geometry_attributes format', async () => {
    const el = mount(`<chocabloc-question seed="42"></chocabloc-question>`);
    (el as HTMLElement & { question: unknown }).question = {
      id: 'GEOM-2D-ATTRIBUTES-1',
      skillIds: ['GEOM-2D-ATTRIBUTES'],
      format: 'geometry_attributes',
      imageType: 'shape_2d',
      content: { attribute: 'no sides and no corners' },
      answer: 'circle',
      distractors: [{ value: 'triangle', errorType: 'wrong-classification' }],
    };
    await new Promise((r) => requestAnimationFrame(r));
    const inner = el.shadowRoot!.querySelector('choca-canvas-question');
    expect(inner).to.not.be.null;
  });

  it('dispatches to choca-table-question for money_budget_adjust format', async () => {
    const el = mount(`<chocabloc-question seed="42"></chocabloc-question>`);
    (el as HTMLElement & { question: unknown }).question = {
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
      distractors: [{ value: 300, errorType: 'unchanged-original' }],
    };
    await new Promise((r) => requestAnimationFrame(r));
    const inner = el.shadowRoot!.querySelector('choca-table-question');
    expect(inner).to.not.be.null;
  });

  it('dispatches to choca-pattern-question for pattern format', async () => {
    const el = mount(`<chocabloc-question seed="42"></chocabloc-question>`);
    (el as HTMLElement & { question: unknown }).question = {
      id: 'PATTERN-1',
      skillIds: ['PATTERN-REPEATING-SIMPLE'],
      format: 'pattern',
      imageType: 'pattern_visual',
      content: { sequence: ['A', 'B', 'A', 'B'] },
      answer: 'A',
      distractors: [{ value: 'B', errorType: 'wrong-element' }],
    };
    await new Promise((r) => requestAnimationFrame(r));
    const inner = el.shadowRoot!.querySelector('choca-pattern-question');
    expect(inner).to.not.be.null;
  });

  it('dispatches to choca-number-line-question for multiplication + number_line', async () => {
    const el = mount(`<chocabloc-question seed="42"></chocabloc-question>`);
    (el as HTMLElement & { question: unknown }).question = {
      id: 'MULT-NL-1',
      skillIds: ['INT-MULT-NUMBER-LINE'],
      format: 'multiplication',
      imageType: 'number_line',
      content: { operands: [3, 4] },
      answer: 12,
      distractors: [{ value: 11, errorType: 'off-by-1' }],
    };
    await new Promise((r) => requestAnimationFrame(r));
    const inner = el.shadowRoot!.querySelector('choca-number-line-question');
    expect(inner).to.not.be.null;
  });
});
