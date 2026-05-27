import { expect } from '@esm-bundle/chai';
import '../../src/elements/ChocaCanvasQuestion';
import '../../src/elements/ChocaTableQuestion';
import '../../src/elements/ChocaPatternQuestion';
import '../../src/elements/ChocaNumberLineQuestion';
import '../../src/elements/ChocaChoicePad';

/* ---------- helpers ---------- */

function mount(html: string): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.innerHTML = html;
  document.body.appendChild(wrapper);
  return wrapper.firstElementChild as HTMLElement;
}

function setQuestion(el: HTMLElement, q: unknown): Promise<void> {
  (el as HTMLElement & { question: unknown }).question = q;
  return new Promise((r) => requestAnimationFrame(r));
}

afterEach(() => {
  document.body.innerHTML = '';
});

/* ---------- test data ---------- */

const canvasQ = () => ({
  id: 'GEOM-2D-ATTRIBUTES-1',
  skillIds: ['GEOM-2D-ATTRIBUTES'],
  format: 'geometry_attributes' as const,
  imageType: 'shape_2d' as const,
  content: { attribute: 'no sides and no corners' },
  answer: 'circle',
  distractors: [
    { value: 'triangle', errorType: 'wrong-classification' },
    { value: 'square', errorType: 'wrong-classification' },
  ],
});

const tableQ = () => ({
  id: 'MONEY-BUDGET-ADJUST-1',
  skillIds: ['MONEY-BUDGET-ADJUST'],
  format: 'money_budget_adjust' as const,
  imageType: 'table' as const,
  content: {
    currency: 'CAD' as const,
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
});

const patternQ = () => ({
  id: 'PATTERN-1',
  skillIds: ['PATTERN-REPEATING-SIMPLE'],
  format: 'pattern' as const,
  imageType: 'pattern_visual' as const,
  content: { sequence: ['A', 'B', 'A', 'B', 'A', 'B'] },
  answer: 'A',
  distractors: [
    { value: 'B', errorType: 'wrong-element' },
    { value: 'C', errorType: 'wrong-pattern' },
  ],
});

const numberLineQ = () => ({
  id: 'MULT-NL-1',
  skillIds: ['INT-MULT-NUMBER-LINE'],
  format: 'multiplication' as const,
  imageType: 'number_line' as const,
  content: { operands: [3, 4] as [number, number] },
  answer: 12,
  distractors: [
    { value: 11, errorType: 'off-by-1' },
    { value: 13, errorType: 'off-by-1' },
  ],
});

/* ================================================================
   Registration
   ================================================================ */

describe('registration', () => {
  it('choca-canvas-question is defined', () => {
    expect(customElements.get('choca-canvas-question')).to.not.be.undefined;
  });

  it('choca-table-question is defined', () => {
    expect(customElements.get('choca-table-question')).to.not.be.undefined;
  });

  it('choca-pattern-question is defined', () => {
    expect(customElements.get('choca-pattern-question')).to.not.be.undefined;
  });

  it('choca-number-line-question is defined', () => {
    expect(customElements.get('choca-number-line-question')).to.not.be.undefined;
  });
});

/* ================================================================
   <choca-canvas-question>
   ================================================================ */

describe('<choca-canvas-question>', () => {
  it('renders canvas element [part="canvas"] after setting question', async () => {
    const el = mount(`<choca-canvas-question answer-mode="mc" seed="42"></choca-canvas-question>`);
    await setQuestion(el, canvasQ());
    const canvas = el.shadowRoot!.querySelector('[part="canvas"]');
    expect(canvas).to.not.be.null;
    expect(canvas!.tagName.toLowerCase()).to.equal('canvas');
  });

  it('has [part="container"] with role="group"', async () => {
    const el = mount(`<choca-canvas-question answer-mode="mc" seed="42"></choca-canvas-question>`);
    await setQuestion(el, canvasQ());
    const container = el.shadowRoot!.querySelector('[part="container"]') as HTMLElement;
    expect(container).to.not.be.null;
    expect(container.getAttribute('role')).to.equal('group');
  });

  it('has choca-choice-pad in shadow DOM', async () => {
    const el = mount(`<choca-canvas-question answer-mode="mc" seed="42"></choca-canvas-question>`);
    await setQuestion(el, canvasQ());
    const pad = el.shadowRoot!.querySelector('choca-choice-pad');
    expect(pad).to.not.be.null;
  });

  it('prompt text contains question text', async () => {
    const el = mount(`<choca-canvas-question answer-mode="mc" seed="42"></choca-canvas-question>`);
    await setQuestion(el, canvasQ());
    const prompt = el.shadowRoot!.querySelector('[part="prompt"]') as HTMLElement;
    expect(prompt).to.not.be.null;
    expect(prompt.textContent).to.contain('no sides and no corners');
  });

  it('emits rendered event after question set', async () => {
    const el = mount(`<choca-canvas-question answer-mode="mc" seed="42"></choca-canvas-question>`);
    let renderedCount = 0;
    el.addEventListener('rendered', () => renderedCount++);
    await setQuestion(el, canvasQ());
    expect(renderedCount).to.be.greaterThan(0);
  });

  it('emits answered event after clicking correct choice', async () => {
    const el = mount(`<choca-canvas-question answer-mode="mc" seed="42"></choca-canvas-question>`);
    await setQuestion(el, canvasQ());
    let captured: { correct?: boolean; studentAnswer?: unknown } | null = null;
    el.addEventListener('answered', (e) => {
      captured = (e as CustomEvent).detail;
    });
    const pad = el.shadowRoot!.querySelector('choca-choice-pad') as HTMLElement;
    const correctBtn = pad.shadowRoot!.querySelector('[part~="choice-correct"]') as HTMLButtonElement;
    correctBtn.click();
    await new Promise((r) => setTimeout(r, 50));
    expect(captured).to.not.be.null;
    expect(captured!.correct).to.equal(true);
    expect(captured!.studentAnswer).to.equal('circle');
  });

  it('after answer, choice pad gets disabled', async () => {
    const el = mount(`<choca-canvas-question answer-mode="mc" seed="42"></choca-canvas-question>`);
    await setQuestion(el, canvasQ());
    const pad = el.shadowRoot!.querySelector('choca-choice-pad') as HTMLElement;
    const correctBtn = pad.shadowRoot!.querySelector('[part~="choice-correct"]') as HTMLButtonElement;
    correctBtn.click();
    await new Promise((r) => setTimeout(r, 50));
    expect(pad.hasAttribute('disabled')).to.equal(true);
  });
});

/* ================================================================
   <choca-table-question>
   ================================================================ */

describe('<choca-table-question>', () => {
  it('renders <table> element with [part="table"] after setting question', async () => {
    const el = mount(`<choca-table-question answer-mode="mc" seed="42"></choca-table-question>`);
    await setQuestion(el, tableQ());
    const table = el.shadowRoot!.querySelector('[part="table"]');
    expect(table).to.not.be.null;
    expect(table!.tagName.toLowerCase()).to.equal('table');
  });

  it('table has thead with header cells marked [part="table-header"]', async () => {
    const el = mount(`<choca-table-question answer-mode="mc" seed="42"></choca-table-question>`);
    await setQuestion(el, tableQ());
    const headers = el.shadowRoot!.querySelectorAll('[part="table-header"]');
    expect(headers.length).to.equal(2);
    expect((headers[0] as HTMLElement).textContent).to.equal('Category');
    expect((headers[1] as HTMLElement).textContent).to.equal('Amount');
  });

  it('solve-for cell has [part~="solve-for"] and shows "?"', async () => {
    const el = mount(`<choca-table-question answer-mode="mc" seed="42"></choca-table-question>`);
    await setQuestion(el, tableQ());
    const solveForCells = el.shadowRoot!.querySelectorAll('[part~="solve-for"]');
    expect(solveForCells.length).to.be.greaterThan(0);
    const amountCell = Array.from(solveForCells).find(
      (c) => (c as HTMLElement).textContent === '?',
    );
    expect(amountCell).to.not.be.undefined;
  });

  it('has change-event note div [part="change-event"]', async () => {
    const el = mount(`<choca-table-question answer-mode="mc" seed="42"></choca-table-question>`);
    await setQuestion(el, tableQ());
    const note = el.shadowRoot!.querySelector('[part="change-event"]') as HTMLElement;
    expect(note).to.not.be.null;
    expect(note.textContent).to.contain('income drop');
  });

  it('has choca-choice-pad in shadow DOM', async () => {
    const el = mount(`<choca-table-question answer-mode="mc" seed="42"></choca-table-question>`);
    await setQuestion(el, tableQ());
    const pad = el.shadowRoot!.querySelector('choca-choice-pad');
    expect(pad).to.not.be.null;
  });

  it('emits rendered event', async () => {
    const el = mount(`<choca-table-question answer-mode="mc" seed="42"></choca-table-question>`);
    let renderedCount = 0;
    el.addEventListener('rendered', () => renderedCount++);
    await setQuestion(el, tableQ());
    expect(renderedCount).to.be.greaterThan(0);
  });

  it('emits answered event after clicking correct choice', async () => {
    const el = mount(`<choca-table-question answer-mode="mc" seed="42"></choca-table-question>`);
    await setQuestion(el, tableQ());
    let captured: { correct?: boolean; studentAnswer?: unknown } | null = null;
    el.addEventListener('answered', (e) => {
      captured = (e as CustomEvent).detail;
    });
    const pad = el.shadowRoot!.querySelector('choca-choice-pad') as HTMLElement;
    const correctBtn = pad.shadowRoot!.querySelector('[part~="choice-correct"]') as HTMLButtonElement;
    correctBtn.click();
    await new Promise((r) => setTimeout(r, 50));
    expect(captured).to.not.be.null;
    expect(captured!.correct).to.equal(true);
  });
});

/* ================================================================
   <choca-pattern-question>
   ================================================================ */

describe('<choca-pattern-question>', () => {
  it('renders pattern items matching sequence length + 1 (the missing ? item)', async () => {
    const el = mount(`<choca-pattern-question answer-mode="mc" seed="42"></choca-pattern-question>`);
    await setQuestion(el, patternQ());
    const items = el.shadowRoot!.querySelectorAll('[part~="pattern-item"]');
    // sequence has 6 items + 1 missing "?" item = 7
    expect(items.length).to.equal(7);
  });

  it('missing item has [part~="pattern-missing"] with text "?"', async () => {
    const el = mount(`<choca-pattern-question answer-mode="mc" seed="42"></choca-pattern-question>`);
    await setQuestion(el, patternQ());
    const missing = el.shadowRoot!.querySelector('[part~="pattern-missing"]') as HTMLElement;
    expect(missing).to.not.be.null;
    expect(missing.textContent).to.equal('?');
  });

  it('sequence items show correct text (A, B, A, B, A, B)', async () => {
    const el = mount(`<choca-pattern-question answer-mode="mc" seed="42"></choca-pattern-question>`);
    await setQuestion(el, patternQ());
    const items = el.shadowRoot!.querySelectorAll('[part~="pattern-item"]:not([part~="pattern-missing"])');
    const texts = Array.from(items).map((i) => (i as HTMLElement).textContent);
    expect(texts).to.deep.equal(['A', 'B', 'A', 'B', 'A', 'B']);
  });

  it('has choca-choice-pad in shadow DOM', async () => {
    const el = mount(`<choca-pattern-question answer-mode="mc" seed="42"></choca-pattern-question>`);
    await setQuestion(el, patternQ());
    const pad = el.shadowRoot!.querySelector('choca-choice-pad');
    expect(pad).to.not.be.null;
  });

  it('emits rendered event', async () => {
    const el = mount(`<choca-pattern-question answer-mode="mc" seed="42"></choca-pattern-question>`);
    let renderedCount = 0;
    el.addEventListener('rendered', () => renderedCount++);
    await setQuestion(el, patternQ());
    expect(renderedCount).to.be.greaterThan(0);
  });

  it('emits answered event after clicking correct choice', async () => {
    const el = mount(`<choca-pattern-question answer-mode="mc" seed="42"></choca-pattern-question>`);
    await setQuestion(el, patternQ());
    let captured: { correct?: boolean; studentAnswer?: unknown } | null = null;
    el.addEventListener('answered', (e) => {
      captured = (e as CustomEvent).detail;
    });
    const pad = el.shadowRoot!.querySelector('choca-choice-pad') as HTMLElement;
    const correctBtn = pad.shadowRoot!.querySelector('[part~="choice-correct"]') as HTMLButtonElement;
    correctBtn.click();
    await new Promise((r) => setTimeout(r, 50));
    expect(captured).to.not.be.null;
    expect(captured!.correct).to.equal(true);
    expect(captured!.studentAnswer).to.equal('A');
  });
});

/* ================================================================
   <choca-number-line-question>
   ================================================================ */

describe('<choca-number-line-question>', () => {
  it('renders SVG inside [part="number-line"]', async () => {
    const el = mount(`<choca-number-line-question answer-mode="mc" seed="42"></choca-number-line-question>`);
    await setQuestion(el, numberLineQ());
    const container = el.shadowRoot!.querySelector('[part="number-line"]') as HTMLElement;
    expect(container).to.not.be.null;
    const svg = container.querySelector('svg');
    expect(svg).to.not.be.null;
  });

  it('SVG has line elements (ticks + main line)', async () => {
    const el = mount(`<choca-number-line-question answer-mode="mc" seed="42"></choca-number-line-question>`);
    await setQuestion(el, numberLineQ());
    const container = el.shadowRoot!.querySelector('[part="number-line"]') as HTMLElement;
    const lines = container.querySelectorAll('line');
    // At minimum: 1 main line + tick marks for each unique value (0, 4, 8, 12 = 4 ticks)
    expect(lines.length).to.be.greaterThan(1);
  });

  it('SVG has arc path elements (jump arcs)', async () => {
    const el = mount(`<choca-number-line-question answer-mode="mc" seed="42"></choca-number-line-question>`);
    await setQuestion(el, numberLineQ());
    const container = el.shadowRoot!.querySelector('[part="number-line"]') as HTMLElement;
    const paths = container.querySelectorAll('path');
    // 3 jumps of 4 => 3 arcs
    expect(paths.length).to.equal(3);
  });

  it('has choca-choice-pad in shadow DOM', async () => {
    const el = mount(`<choca-number-line-question answer-mode="mc" seed="42"></choca-number-line-question>`);
    await setQuestion(el, numberLineQ());
    const pad = el.shadowRoot!.querySelector('choca-choice-pad');
    expect(pad).to.not.be.null;
  });

  it('emits rendered event', async () => {
    const el = mount(`<choca-number-line-question answer-mode="mc" seed="42"></choca-number-line-question>`);
    let renderedCount = 0;
    el.addEventListener('rendered', () => renderedCount++);
    await setQuestion(el, numberLineQ());
    expect(renderedCount).to.be.greaterThan(0);
  });

  it('emits answered event after clicking correct choice', async () => {
    const el = mount(`<choca-number-line-question answer-mode="mc" seed="42"></choca-number-line-question>`);
    await setQuestion(el, numberLineQ());
    let captured: { correct?: boolean; studentAnswer?: unknown } | null = null;
    el.addEventListener('answered', (e) => {
      captured = (e as CustomEvent).detail;
    });
    const pad = el.shadowRoot!.querySelector('choca-choice-pad') as HTMLElement;
    const correctBtn = pad.shadowRoot!.querySelector('[part~="choice-correct"]') as HTMLButtonElement;
    correctBtn.click();
    await new Promise((r) => setTimeout(r, 50));
    expect(captured).to.not.be.null;
    expect(captured!.correct).to.equal(true);
    expect(captured!.studentAnswer).to.equal(12);
  });
});
