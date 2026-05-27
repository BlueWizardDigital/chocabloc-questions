# Input-to-Answer & Whiteboard — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two opt-in features — input-to-answer mode (typed answers replacing multiple choice) and a freehand whiteboard tool — to chocabloc-questions. Calculator and place value chart are specced but deferred to a follow-up.

**Architecture:** `answerMode` field on question data drives input vs. choice rendering. `whiteboard` boolean attribute on `<chocabloc-question>` toggles a toolbar + lazy-loaded whiteboard panel. Toolbar is designed to accept more tools later (calculator, PVC) without rework.

**Tech Stack:** TypeScript, Web Components, HTML Canvas, CSS custom properties + `::part()`, Vitest, @web/test-runner, Vite.

---

## File Structure

### New Files

| File | Responsibility |
|---|---|
| `src/helpers/input-parser.ts` | `parseInputAnswer()` — format-aware string→AnswerValue |
| `src/elements/ChocaToolbar.ts` | Icon buttons for toggling tools, designed for N tools |
| `src/elements/ChocaAnswerInput.ts` | Typed answer field — submit, validation, feedback |
| `src/elements/ChocaWhiteboard.ts` | Freehand drawing canvas |
| `tests/helpers/input-parser.test.ts` | Unit tests |
| `tests/elements/ChocaAnswerInput.browser.test.ts` | Browser tests |
| `tests/elements/ChocaToolbar.browser.test.ts` | Browser tests |
| `tests/elements/ChocaWhiteboard.browser.test.ts` | Browser tests |

### Modified Files

| File | Change |
|---|---|
| `src/types.ts` | `answerMode` on BaseQuestion, `ToolName`, `AnsweredDetail` |
| `src/helpers/normalizer.ts` | Pass `answerMode` through `extractBase` |
| `src/helpers-only.ts` | Export `parseInputAnswer` + new types |
| `src/full.ts` | Export + register `ChocaToolbar`, `ChocaAnswerInput` |
| `src/elements/ChocablocQuestion.ts` | Toolbar rendering, input-mode routing, lazy whiteboard, extended answered event |
| `.size-limit.cjs` | Bump full bundle 40→45 KB |

---

## Task 1: Types + Input Parser

**Files:**
- Modify: `src/types.ts`
- Create: `src/helpers/input-parser.ts`
- Create: `tests/helpers/input-parser.test.ts`
- Modify: `src/helpers/normalizer.ts`
- Modify: `src/helpers-only.ts`

- [ ] **Step 1: Add types to `src/types.ts`**

Add `answerMode` to `BaseQuestion` (after `prompt?`):

```typescript
answerMode?: 'choice' | 'input';
```

Add at end of file:

```typescript
export type ToolName = 'whiteboard' | 'calculator' | 'place-value-chart';

export type AnsweredDetail = {
  questionId: string;
  studentAnswer: AnswerValue;
  correct: boolean;
  distractorMatched: Distractor | null;
  skillTags: SkillId[];
  expected: AnswerValue;
  timeToAnswerMs: number;
  toolsUsed?: ToolName[];
  rawInput?: string;
};
```

- [ ] **Step 2: Write tests for `parseInputAnswer`**

Create `tests/helpers/input-parser.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import type { MoneyQuestion } from '../../src/types';
import { parseInputAnswer } from '../../src/helpers/input-parser';

describe('answerMode type field', () => {
  it('accepts answerMode on a question type', () => {
    const q: MoneyQuestion = {
      id: 'M-1', skillIds: ['MONEY-COIN-VALUE-USD'], format: 'money',
      imageType: 'coins', content: { coins: { quarter: 1 }, currency: 'USD' },
      answer: 25, distractors: [], answerMode: 'input',
    };
    expect(q.answerMode).toBe('input');
  });
});

describe('parseInputAnswer', () => {
  it('parses $2.53 as 253 cents for money', () => {
    expect(parseInputAnswer('$2.53', 'money')).toBe(253);
  });
  it('parses bare 2.53 as 253 cents', () => {
    expect(parseInputAnswer('2.53', 'money')).toBe(253);
  });
  it('parses $5 as 500 cents', () => {
    expect(parseInputAnswer('$5', 'money')).toBe(500);
  });
  it('parses $0.05 as 5 cents', () => {
    expect(parseInputAnswer('$0.05', 'money')).toBe(5);
  });
  it('handles money_budget_adjust same as money', () => {
    expect(parseInputAnswer('$12.50', 'money_budget_adjust')).toBe(1250);
  });
  it('strips degree symbol', () => {
    expect(parseInputAnswer('45°', 'geometry_angles')).toBe(45);
  });
  it('parses plain number for degrees', () => {
    expect(parseInputAnswer('90', 'geometry_angles')).toBe(90);
  });
  it('parses integer for numeric formats', () => {
    expect(parseInputAnswer('24', 'geometry_area')).toBe(24);
  });
  it('parses decimal for pythagorean', () => {
    expect(parseInputAnswer('5.0', 'pythagorean')).toBe(5);
  });
  it('keeps time string as-is', () => {
    expect(parseInputAnswer('2:30', 'time')).toBe('2:30');
  });
  it('keeps fraction string as-is', () => {
    expect(parseInputAnswer('1/2', 'fraction_concept')).toBe('1/2');
  });
  it('passes numeric fraction through as number', () => {
    expect(parseInputAnswer('0.5', 'fraction_concept')).toBe(0.5);
  });
  it('parses numeric pattern answer', () => {
    expect(parseInputAnswer('12', 'pattern')).toBe(12);
  });
  it('keeps non-numeric pattern as string', () => {
    expect(parseInputAnswer('red', 'pattern')).toBe('red');
  });
  it('returns NaN for empty on numeric format', () => {
    expect(parseInputAnswer('', 'geometry_area')).toBeNaN();
  });
  it('returns NaN for garbage on numeric format', () => {
    expect(parseInputAnswer('abc', 'geometry_area')).toBeNaN();
  });
  it('trims whitespace', () => {
    expect(parseInputAnswer('  24  ', 'geometry_area')).toBe(24);
  });
});
```

- [ ] **Step 3: Run tests — expect fail**

Run: `npx vitest run tests/helpers/input-parser.test.ts`

- [ ] **Step 4: Implement `src/helpers/input-parser.ts`**

```typescript
import type { AnswerValue, QuestionFormat } from '../types';

const MONEY_FORMATS: ReadonlySet<string> = new Set(['money', 'money_budget_adjust']);
const DEGREE_FORMATS: ReadonlySet<string> = new Set(['geometry_angles', 'geometry_angle_classify']);
const NUMERIC_FORMATS: ReadonlySet<string> = new Set([
  'geometry_area', 'geometry_perimeter', 'geometry_circumference',
  'pythagorean', 'coordinate_distance', 'multiplication',
  'data_graph', 'geometry_properties',
]);
const STRING_FORMATS: ReadonlySet<string> = new Set(['time']);

export function parseInputAnswer(rawInput: string, format: QuestionFormat): AnswerValue {
  const trimmed = rawInput.trim();

  if (MONEY_FORMATS.has(format))
    return Math.round(parseFloat(trimmed.replace(/^\$/, '')) * 100);

  if (DEGREE_FORMATS.has(format))
    return Number(trimmed.replace(/°$/, ''));

  if (STRING_FORMATS.has(format))
    return trimmed;

  if (format === 'fraction_concept') {
    if (/^\d+\/\d+$/.test(trimmed)) return trimmed;
    const n = Number(trimmed);
    return Number.isFinite(n) ? n : trimmed;
  }

  if (format === 'pattern') {
    const n = Number(trimmed);
    return Number.isFinite(n) ? n : trimmed;
  }

  if (NUMERIC_FORMATS.has(format))
    return Number(trimmed);

  const n = Number(trimmed);
  return Number.isFinite(n) ? n : trimmed;
}
```

- [ ] **Step 5: Run tests — expect pass**

Run: `npx vitest run tests/helpers/input-parser.test.ts`

- [ ] **Step 6: Pass `answerMode` through normalizer**

In `src/helpers/normalizer.ts`, modify `extractBase` return type and body — add after `promptRaw` resolution:

```typescript
const rawMode = getString(r, 'answerMode', 'answer_mode');
const answerMode = rawMode === 'input' || rawMode === 'choice' ? rawMode : undefined;
```

Spread into return: `...(answerMode ? { answerMode } : {})`

Update return type to include `answerMode?: 'choice' | 'input'`.

- [ ] **Step 7: Add normalizer test**

Append to `tests/helpers/normalizer.test.ts`:

```typescript
describe('answerMode passthrough', () => {
  it('passes answerMode: input through', () => {
    const raw = {
      id: 'INPUT-1', format: 'money', skill_ids: ['MONEY-COIN-VALUE-USD'],
      content: { coins: { quarter: 1 } }, answer: 25, distractors: [],
      answerMode: 'input',
    };
    const q = normalizeQuestion(raw);
    expect(q?.answerMode).toBe('input');
  });

  it('reads snake_case answer_mode', () => {
    const raw = {
      id: 'SNAKE-1', format: 'money', skill_ids: ['MONEY-COIN-VALUE-USD'],
      content: { coins: { quarter: 1 } }, answer: 25, distractors: [],
      answer_mode: 'input',
    };
    const q = normalizeQuestion(raw);
    expect(q?.answerMode).toBe('input');
  });

  it('leaves undefined when absent', () => {
    const raw = {
      id: 'NONE-1', format: 'money', skill_ids: ['MONEY-COIN-VALUE-USD'],
      content: { coins: { quarter: 1 } }, answer: 25, distractors: [],
    };
    const q = normalizeQuestion(raw);
    expect(q?.answerMode).toBeUndefined();
  });
});
```

- [ ] **Step 8: Run all tests — expect pass**

Run: `npm run test`

- [ ] **Step 9: Export from `helpers-only.ts`**

Add: `export { parseInputAnswer } from './helpers/input-parser';`

Add `ToolName, AnsweredDetail,` to the type exports block.

- [ ] **Step 10: Typecheck + build**

Run: `npm run typecheck && npm run build`

- [ ] **Step 11: Commit**

```bash
git add src/types.ts src/helpers/input-parser.ts src/helpers/normalizer.ts \
  src/helpers-only.ts tests/helpers/input-parser.test.ts tests/helpers/normalizer.test.ts
git commit -m "feat: add answerMode types, parseInputAnswer helper, normalizer passthrough"
```

---

## Task 2: ChocaAnswerInput Component

**Files:**
- Create: `src/elements/ChocaAnswerInput.ts`
- Create: `tests/elements/ChocaAnswerInput.browser.test.ts`

- [ ] **Step 1: Write browser tests**

Create `tests/elements/ChocaAnswerInput.browser.test.ts`:

```typescript
import { expect } from '@esm-bundle/chai';
import '../../src/elements/ChocaAnswerInput';

function mount(html: string): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.innerHTML = html;
  document.body.appendChild(wrapper);
  return wrapper.firstElementChild as HTMLElement;
}

async function frame(): Promise<void> {
  await new Promise((r) => requestAnimationFrame(r));
}

afterEach(() => { document.body.innerHTML = ''; });

describe('<choca-answer-input>', () => {
  it('registers as custom element', () => {
    expect(customElements.get('choca-answer-input')).to.not.be.undefined;
  });

  it('renders input + submit button', async () => {
    const el = mount(`<choca-answer-input></choca-answer-input>`);
    (el as any).format = 'geometry_area';
    await frame();
    expect(el.shadowRoot!.querySelector('[part="input-field"]')).to.not.be.null;
    expect(el.shadowRoot!.querySelector('[part="input-submit"]')).to.not.be.null;
  });

  it('placeholder matches format — money', async () => {
    const el = mount(`<choca-answer-input></choca-answer-input>`);
    (el as any).format = 'money';
    await frame();
    const input = el.shadowRoot!.querySelector('[part="input-field"]') as HTMLInputElement;
    expect(input.placeholder).to.equal('$0.00');
  });

  it('placeholder matches format — degrees', async () => {
    const el = mount(`<choca-answer-input></choca-answer-input>`);
    (el as any).format = 'geometry_angles';
    await frame();
    expect((el.shadowRoot!.querySelector('[part="input-field"]') as HTMLInputElement).placeholder).to.equal('0°');
  });

  it('fires submitted on button click', async () => {
    const el = mount(`<choca-answer-input></choca-answer-input>`);
    (el as any).format = 'geometry_area';
    await frame();
    const input = el.shadowRoot!.querySelector('[part="input-field"]') as HTMLInputElement;
    const btn = el.shadowRoot!.querySelector('[part="input-submit"]') as HTMLButtonElement;
    let captured: any = null;
    el.addEventListener('submitted', (e) => { captured = (e as CustomEvent).detail; });
    input.value = '24';
    btn.click();
    expect(captured).to.deep.equal({ parsedValue: 24, rawInput: '24' });
  });

  it('fires submitted on Enter key', async () => {
    const el = mount(`<choca-answer-input></choca-answer-input>`);
    (el as any).format = 'money';
    await frame();
    const input = el.shadowRoot!.querySelector('[part="input-field"]') as HTMLInputElement;
    let captured: any = null;
    el.addEventListener('submitted', (e) => { captured = (e as CustomEvent).detail; });
    input.value = '$2.53';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(captured).to.deep.equal({ parsedValue: 253, rawInput: '$2.53' });
  });

  it('does not fire when disabled', async () => {
    const el = mount(`<choca-answer-input disabled></choca-answer-input>`);
    (el as any).format = 'geometry_area';
    await frame();
    let fired = false;
    el.addEventListener('submitted', () => { fired = true; });
    (el.shadowRoot!.querySelector('[part="input-submit"]') as HTMLButtonElement).click();
    expect(fired).to.be.false;
  });

  it('showFeedback disables and shows result', async () => {
    const el = mount(`<choca-answer-input></choca-answer-input>`) as any;
    el.format = 'geometry_area';
    await frame();
    el.showFeedback(false, 24);
    await frame();
    const fb = el.shadowRoot!.querySelector('[part="input-feedback"]') as HTMLElement;
    expect(fb.textContent).to.contain('24');
    expect((el.shadowRoot!.querySelector('[part="input-field"]') as HTMLInputElement).disabled).to.be.true;
  });
});
```

- [ ] **Step 2: Run — expect fail**

Run: `npx wtr tests/elements/ChocaAnswerInput.browser.test.ts`

- [ ] **Step 3: Implement `src/elements/ChocaAnswerInput.ts`**

```typescript
import type { AnswerValue, QuestionFormat } from '../types';
import { parseInputAnswer } from '../helpers/input-parser';

const PLACEHOLDERS: Partial<Record<QuestionFormat, string>> = {
  money: '$0.00', money_budget_adjust: '$0.00',
  geometry_angles: '0°', geometry_angle_classify: '0°',
  time: '0:00', fraction_concept: '1/2',
};

export class ChocaAnswerInput extends HTMLElement {
  private _shadow: ShadowRoot;
  private _inputEl: HTMLInputElement;
  private _submitBtn: HTMLButtonElement;
  private _feedbackEl: HTMLElement;
  private _format: QuestionFormat = 'text';

  static get observedAttributes(): string[] { return ['disabled']; }

  constructor() {
    super();
    this._shadow = this.attachShadow({ mode: 'open' });

    const style = document.createElement('style');
    style.textContent = `
      :host { display: block; font-family: var(--cq-font, system-ui, sans-serif); }
      .wrap { display: flex; gap: 8px; align-items: center; }
      [part="input-field"] {
        font-family: var(--cq-input-font, inherit);
        font-size: var(--cq-input-size, 1.25rem);
        padding: 10px 14px; border: var(--cq-input-border, 2px solid #ccc);
        border-radius: 8px; outline: none; flex: 1; min-width: 0;
      }
      [part="input-field"]:focus {
        border-color: var(--cq-input-focus, #4a90d9);
        box-shadow: 0 0 0 3px color-mix(in srgb, var(--cq-input-focus, #4a90d9) 25%, transparent);
      }
      [part="input-field"]:disabled, [part="input-submit"]:disabled {
        opacity: 0.6; cursor: not-allowed;
      }
      [part="input-submit"] {
        font-family: var(--cq-input-font, inherit); font-size: var(--cq-input-size, 1.25rem);
        padding: 10px 20px; background: var(--cq-choice-bg, #4a90d9);
        color: var(--cq-choice-text, #fff); border: none; border-radius: 8px; cursor: pointer;
      }
      [part="input-feedback"] { margin-top: 8px; font-size: 0.95rem; min-height: 1.4em; }
      [part="input-feedback"].correct { color: var(--cq-input-success, #2a7d2a); }
      [part="input-feedback"].incorrect { color: var(--cq-input-error, #c0392b); }
    `;

    const wrap = document.createElement('div');
    wrap.className = 'wrap';

    this._inputEl = document.createElement('input');
    this._inputEl.setAttribute('part', 'input-field');
    this._inputEl.type = 'text';
    this._inputEl.autocomplete = 'off';
    this._inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); this._submit(); }
    });

    this._submitBtn = document.createElement('button');
    this._submitBtn.setAttribute('part', 'input-submit');
    this._submitBtn.type = 'button';
    this._submitBtn.textContent = 'Submit';
    this._submitBtn.addEventListener('click', () => this._submit());

    wrap.append(this._inputEl, this._submitBtn);

    this._feedbackEl = document.createElement('div');
    this._feedbackEl.setAttribute('part', 'input-feedback');
    this._feedbackEl.setAttribute('aria-live', 'polite');

    this._shadow.append(style, wrap, this._feedbackEl);
  }

  set format(f: QuestionFormat) {
    this._format = f;
    this._inputEl.placeholder = PLACEHOLDERS[f] ?? '0';
  }
  get format(): QuestionFormat { return this._format; }

  attributeChangedCallback(): void {
    const d = this.hasAttribute('disabled');
    this._inputEl.disabled = d;
    this._submitBtn.disabled = d;
  }
  connectedCallback(): void { this.attributeChangedCallback(); }

  showFeedback(correct: boolean, expected?: AnswerValue): void {
    this._feedbackEl.className = correct ? 'correct' : 'incorrect';
    this._feedbackEl.textContent = correct
      ? 'Correct!'
      : expected !== undefined ? `Incorrect. The answer is ${String(expected)}.` : 'Incorrect.';
    this.setAttribute('disabled', '');
  }

  private _submit(): void {
    if (this.hasAttribute('disabled')) return;
    const raw = this._inputEl.value;
    this.dispatchEvent(new CustomEvent('submitted', {
      detail: { parsedValue: parseInputAnswer(raw, this._format), rawInput: raw },
      bubbles: true, composed: true,
    }));
  }
}

if (!customElements.get('choca-answer-input'))
  customElements.define('choca-answer-input', ChocaAnswerInput);
```

- [ ] **Step 4: Run browser tests — expect pass**

Run: `npx wtr tests/elements/ChocaAnswerInput.browser.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/elements/ChocaAnswerInput.ts tests/elements/ChocaAnswerInput.browser.test.ts
git commit -m "feat(elements): add ChocaAnswerInput web component"
```

---

## Task 3: ChocaToolbar Component

**Files:**
- Create: `src/elements/ChocaToolbar.ts`
- Create: `tests/elements/ChocaToolbar.browser.test.ts`

- [ ] **Step 1: Write browser tests**

Create `tests/elements/ChocaToolbar.browser.test.ts`:

```typescript
import { expect } from '@esm-bundle/chai';
import '../../src/elements/ChocaToolbar';

function mount(html: string): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.innerHTML = html;
  document.body.appendChild(wrapper);
  return wrapper.firstElementChild as HTMLElement;
}
async function frame(): Promise<void> { await new Promise((r) => requestAnimationFrame(r)); }
afterEach(() => { document.body.innerHTML = ''; });

describe('<choca-toolbar>', () => {
  it('registers', () => {
    expect(customElements.get('choca-toolbar')).to.not.be.undefined;
  });

  it('no buttons when no tools', async () => {
    const el = mount(`<choca-toolbar></choca-toolbar>`);
    await frame();
    expect(el.shadowRoot!.querySelectorAll('[part~="tool-btn"]').length).to.equal(0);
  });

  it('renders whiteboard button', async () => {
    const el = mount(`<choca-toolbar></choca-toolbar>`) as any;
    el.tools = ['whiteboard'];
    await frame();
    expect(el.shadowRoot!.querySelector('[part~="tool-btn-whiteboard"]')).to.not.be.null;
  });

  it('fires tool-toggled on click', async () => {
    const el = mount(`<choca-toolbar></choca-toolbar>`) as any;
    el.tools = ['whiteboard'];
    await frame();
    let captured: any = null;
    el.addEventListener('tool-toggled', (e: CustomEvent) => { captured = e.detail; });
    (el.shadowRoot!.querySelector('[part~="tool-btn-whiteboard"]') as HTMLButtonElement).click();
    expect(captured).to.deep.equal({ tool: 'whiteboard', active: true });
  });

  it('toggles off on second click', async () => {
    const el = mount(`<choca-toolbar></choca-toolbar>`) as any;
    el.tools = ['whiteboard'];
    await frame();
    const events: any[] = [];
    el.addEventListener('tool-toggled', (e: CustomEvent) => { events.push(e.detail); });
    (el.shadowRoot!.querySelector('[part~="tool-btn-whiteboard"]') as HTMLButtonElement).click();
    await frame();
    (el.shadowRoot!.querySelector('[part~="tool-btn-whiteboard"]') as HTMLButtonElement).click();
    expect(events[1]).to.deep.equal({ tool: 'whiteboard', active: false });
  });

  it('sets aria-pressed', async () => {
    const el = mount(`<choca-toolbar></choca-toolbar>`) as any;
    el.tools = ['whiteboard'];
    await frame();
    const btn = el.shadowRoot!.querySelector('[part~="tool-btn-whiteboard"]') as HTMLButtonElement;
    expect(btn.getAttribute('aria-pressed')).to.equal('false');
    btn.click();
    await frame();
    expect(el.shadowRoot!.querySelector('[part~="tool-btn-whiteboard"]')!.getAttribute('aria-pressed')).to.equal('true');
  });
});
```

- [ ] **Step 2: Run — expect fail**

Run: `npx wtr tests/elements/ChocaToolbar.browser.test.ts`

- [ ] **Step 3: Implement `src/elements/ChocaToolbar.ts`**

```typescript
import type { ToolName } from '../types';

const TOOL_META: Record<ToolName, { label: string; partSuffix: string; icon: string }> = {
  'whiteboard': {
    label: 'Whiteboard', partSuffix: 'whiteboard',
    icon: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2'%3E%3Cpath d='M12 19l7-7 3 3-7 7-3-3z'/%3E%3Cpath d='M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z'/%3E%3Cpath d='M2 2l7.586 7.586'/%3E%3C/svg%3E")`,
  },
  'calculator': {
    label: 'Calculator', partSuffix: 'calculator',
    icon: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2'%3E%3Crect x='4' y='2' width='16' height='20' rx='2'/%3E%3Cline x1='8' y1='6' x2='16' y2='6'/%3E%3C/svg%3E")`,
  },
  'place-value-chart': {
    label: 'Place Value Chart', partSuffix: 'pvc',
    icon: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2'%3E%3Crect x='3' y='3' width='18' height='18' rx='2'/%3E%3Cline x1='9' y1='3' x2='9' y2='21'/%3E%3Cline x1='15' y1='3' x2='15' y2='21'/%3E%3Cline x1='3' y1='9' x2='21' y2='9'/%3E%3C/svg%3E")`,
  },
};

export class ChocaToolbar extends HTMLElement {
  private _shadow: ShadowRoot;
  private _tools: ToolName[] = [];
  private _active = new Set<ToolName>();
  private _container: HTMLElement;

  constructor() {
    super();
    this._shadow = this.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = `
      :host { display: block; }
      [part="toolbar"] { display: flex; gap: 8px; padding: 4px 0; }
      [part~="tool-btn"] {
        width: var(--cq-tool-icon-size, 32px); height: var(--cq-tool-icon-size, 32px);
        border: var(--cq-tool-border, 1px solid #ccc); border-radius: var(--cq-tool-radius, 6px);
        background-color: var(--cq-tool-icon-color, currentColor); cursor: pointer; padding: 4px;
        mask-size: 60%; mask-repeat: no-repeat; mask-position: center;
        -webkit-mask-size: 60%; -webkit-mask-repeat: no-repeat; -webkit-mask-position: center;
      }
      [part~="tool-btn"][aria-pressed="true"] {
        background-color: var(--cq-tool-icon-active, #4a90d9);
        outline: 2px solid var(--cq-tool-icon-active, #4a90d9); outline-offset: 1px;
      }
      [part~="tool-btn"]:focus-visible {
        outline: 2px solid var(--cq-focus-ring, currentColor); outline-offset: 2px;
      }
    `;
    this._container = document.createElement('div');
    this._container.setAttribute('part', 'toolbar');
    this._container.setAttribute('role', 'toolbar');
    this._container.setAttribute('aria-label', 'Question tools');
    this._shadow.append(style, this._container);
  }

  set tools(v: ToolName[]) { this._tools = v; this._render(); }
  get tools(): ToolName[] { return this._tools; }
  get activeTools(): Set<ToolName> { return new Set(this._active); }

  private _render(): void {
    this._container.replaceChildren();
    for (const tool of this._tools) {
      const meta = TOOL_META[tool];
      const btn = document.createElement('button');
      btn.setAttribute('part', `tool-btn tool-btn-${meta.partSuffix}`);
      btn.type = 'button';
      btn.setAttribute('aria-label', meta.label);
      btn.setAttribute('aria-pressed', String(this._active.has(tool)));
      btn.style.setProperty('mask-image', meta.icon);
      btn.style.setProperty('-webkit-mask-image', meta.icon);
      btn.addEventListener('click', () => {
        if (this._active.has(tool)) this._active.delete(tool);
        else this._active.add(tool);
        this._render();
        this.dispatchEvent(new CustomEvent('tool-toggled', {
          detail: { tool, active: this._active.has(tool) },
          bubbles: true, composed: true,
        }));
      });
      this._container.appendChild(btn);
    }
  }
}

if (!customElements.get('choca-toolbar'))
  customElements.define('choca-toolbar', ChocaToolbar);
```

- [ ] **Step 4: Run browser tests — expect pass**

Run: `npx wtr tests/elements/ChocaToolbar.browser.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/elements/ChocaToolbar.ts tests/elements/ChocaToolbar.browser.test.ts
git commit -m "feat(elements): add ChocaToolbar with mask-image icons and toggle"
```

---

## Task 4: ChocaWhiteboard Component

**Files:**
- Create: `src/elements/ChocaWhiteboard.ts`
- Create: `tests/elements/ChocaWhiteboard.browser.test.ts`

- [ ] **Step 1: Write browser tests**

Create `tests/elements/ChocaWhiteboard.browser.test.ts`:

```typescript
import { expect } from '@esm-bundle/chai';
import '../../src/elements/ChocaWhiteboard';

function mount(html: string): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.innerHTML = html;
  document.body.appendChild(wrapper);
  return wrapper.firstElementChild as HTMLElement;
}
async function frame(): Promise<void> { await new Promise((r) => requestAnimationFrame(r)); }
afterEach(() => { document.body.innerHTML = ''; });

describe('<choca-whiteboard>', () => {
  it('registers', () => {
    expect(customElements.get('choca-whiteboard')).to.not.be.undefined;
  });

  it('renders canvas', async () => {
    const el = mount(`<choca-whiteboard></choca-whiteboard>`);
    await frame();
    expect(el.shadowRoot!.querySelector('[part="wb-canvas"]')!.tagName.toLowerCase()).to.equal('canvas');
  });

  it('renders tool buttons', async () => {
    const el = mount(`<choca-whiteboard></choca-whiteboard>`);
    await frame();
    expect(el.shadowRoot!.querySelectorAll('[part~="wb-tool-btn"]').length).to.be.at.least(4);
  });

  it('renders color + width buttons', async () => {
    const el = mount(`<choca-whiteboard></choca-whiteboard>`);
    await frame();
    expect(el.shadowRoot!.querySelectorAll('[part~="wb-color-btn"]').length).to.be.at.least(4);
    expect(el.shadowRoot!.querySelectorAll('[part~="wb-width-btn"]').length).to.be.at.least(2);
  });

  it('pen is default tool', async () => {
    const el = mount(`<choca-whiteboard></choca-whiteboard>`) as any;
    await frame();
    expect(el.activeTool).to.equal('pen');
  });

  it('eraser click switches tool', async () => {
    const el = mount(`<choca-whiteboard></choca-whiteboard>`) as any;
    await frame();
    const btns = el.shadowRoot!.querySelectorAll('[part~="wb-tool-btn"]');
    const eraser = Array.from(btns).find((b: any) => b.dataset.tool === 'eraser') as HTMLButtonElement;
    eraser.click();
    expect(el.activeTool).to.equal('eraser');
  });

  it('pointer events create strokes', async () => {
    const el = mount(`<choca-whiteboard></choca-whiteboard>`) as any;
    await frame();
    const c = el.shadowRoot!.querySelector('[part="wb-canvas"]') as HTMLCanvasElement;
    c.dispatchEvent(new PointerEvent('pointerdown', { clientX: 10, clientY: 10, bubbles: true }));
    c.dispatchEvent(new PointerEvent('pointermove', { clientX: 50, clientY: 50, bubbles: true }));
    c.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
    expect(el.strokeCount).to.equal(1);
  });

  it('undo removes last stroke', async () => {
    const el = mount(`<choca-whiteboard></choca-whiteboard>`) as any;
    await frame();
    const c = el.shadowRoot!.querySelector('[part="wb-canvas"]') as HTMLCanvasElement;
    c.dispatchEvent(new PointerEvent('pointerdown', { clientX: 10, clientY: 10, bubbles: true }));
    c.dispatchEvent(new PointerEvent('pointermove', { clientX: 50, clientY: 50, bubbles: true }));
    c.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
    c.dispatchEvent(new PointerEvent('pointerdown', { clientX: 60, clientY: 10, bubbles: true }));
    c.dispatchEvent(new PointerEvent('pointermove', { clientX: 100, clientY: 50, bubbles: true }));
    c.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
    expect(el.strokeCount).to.equal(2);
    const undo = Array.from(el.shadowRoot!.querySelectorAll('[part~="wb-tool-btn"]'))
      .find((b: any) => b.dataset.tool === 'undo') as HTMLButtonElement;
    undo.click();
    expect(el.strokeCount).to.equal(1);
  });

  it('clear() resets everything', async () => {
    const el = mount(`<choca-whiteboard></choca-whiteboard>`) as any;
    await frame();
    const c = el.shadowRoot!.querySelector('[part="wb-canvas"]') as HTMLCanvasElement;
    c.dispatchEvent(new PointerEvent('pointerdown', { clientX: 10, clientY: 10, bubbles: true }));
    c.dispatchEvent(new PointerEvent('pointermove', { clientX: 50, clientY: 50, bubbles: true }));
    c.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
    el.clear();
    expect(el.strokeCount).to.equal(0);
  });
});
```

- [ ] **Step 2: Run — expect fail**

Run: `npx wtr tests/elements/ChocaWhiteboard.browser.test.ts`

- [ ] **Step 3: Implement `src/elements/ChocaWhiteboard.ts`**

```typescript
type Point = { x: number; y: number };
type Stroke = { points: Point[]; color: string; width: number; tool: 'pen' | 'eraser' };

const COLORS = ['#222', '#e74c3c', '#2980b9', '#27ae60', '#f39c12'];
const WIDTHS = [2, 4, 8];

export class ChocaWhiteboard extends HTMLElement {
  private _shadow: ShadowRoot;
  private _canvas!: HTMLCanvasElement;
  private _strokes: Stroke[] = [];
  private _current: Stroke | null = null;
  private _tool: 'pen' | 'eraser' = 'pen';
  private _color = COLORS[0]!;
  private _width = WIDTHS[1]!;
  private _clearPending = false;

  constructor() {
    super();
    this._shadow = this.attachShadow({ mode: 'open' });
    this._build();
  }

  get activeTool(): string { return this._tool; }
  get strokeCount(): number { return this._strokes.length; }
  clear(): void { this._strokes = []; this._redraw(); }

  private _build(): void {
    const style = document.createElement('style');
    style.textContent = `
      :host { display: block; }
      [part="wb-panel"] {
        background: var(--cq-tool-bg, #fff); border: var(--cq-tool-border, 1px solid #ccc);
        border-radius: var(--cq-tool-radius, 8px); padding: 8px;
        display: flex; flex-direction: column; gap: 8px;
      }
      .row { display: flex; gap: 4px; align-items: center; flex-wrap: wrap; }
      [part~="wb-tool-btn"], [part~="wb-color-btn"], [part~="wb-width-btn"] {
        background: var(--cq-tool-btn-bg, #f0f0f0); color: var(--cq-tool-btn-color, #222);
        border: 1px solid #ccc; border-radius: var(--cq-tool-btn-radius, 4px);
        font-family: var(--cq-tool-btn-font, inherit); font-size: var(--cq-tool-btn-size, 0.85rem);
        padding: 4px 8px; cursor: pointer;
      }
      [aria-pressed="true"] { outline: 2px solid var(--cq-tool-icon-active, #4a90d9); outline-offset: 1px; }
      [part="wb-canvas"] { border: 1px solid #ddd; border-radius: 4px; cursor: crosshair; touch-action: none; }
    `;

    const panel = document.createElement('div');
    panel.setAttribute('part', 'wb-panel');

    const toolRow = document.createElement('div');
    toolRow.className = 'row';
    for (const t of ['pen', 'eraser', 'undo', 'clear'] as const) {
      const btn = document.createElement('button');
      btn.setAttribute('part', 'wb-tool-btn');
      btn.type = 'button';
      btn.dataset.tool = t;
      btn.textContent = t[0]!.toUpperCase() + t.slice(1);
      if (t === 'pen' || t === 'eraser') btn.setAttribute('aria-pressed', String(this._tool === t));
      btn.addEventListener('click', () => this._onTool(t));
      toolRow.appendChild(btn);
    }
    panel.appendChild(toolRow);

    const colorRow = document.createElement('div');
    colorRow.className = 'row';
    for (const c of COLORS) {
      const btn = document.createElement('button');
      btn.setAttribute('part', 'wb-color-btn');
      btn.type = 'button';
      btn.style.backgroundColor = c;
      btn.style.width = btn.style.height = btn.style.minWidth = '24px';
      btn.setAttribute('aria-label', c);
      btn.setAttribute('aria-pressed', String(this._color === c));
      btn.addEventListener('click', () => { this._color = c; this._updatePressed(colorRow, c, 'backgroundColor'); });
      colorRow.appendChild(btn);
    }
    panel.appendChild(colorRow);

    const widthRow = document.createElement('div');
    widthRow.className = 'row';
    for (const w of WIDTHS) {
      const btn = document.createElement('button');
      btn.setAttribute('part', 'wb-width-btn');
      btn.type = 'button';
      btn.textContent = `${w}px`;
      btn.setAttribute('aria-pressed', String(this._width === w));
      btn.addEventListener('click', () => { this._width = w; this._updatePressed(widthRow, `${w}px`, 'textContent'); });
      widthRow.appendChild(btn);
    }
    panel.appendChild(widthRow);

    this._canvas = document.createElement('canvas');
    this._canvas.setAttribute('part', 'wb-canvas');
    this._canvas.width = 400;
    this._canvas.height = 250;
    this._canvas.addEventListener('pointerdown', (e) => this._down(e));
    this._canvas.addEventListener('pointermove', (e) => this._move(e));
    this._canvas.addEventListener('pointerup', () => this._up());
    this._canvas.addEventListener('pointerleave', () => this._up());
    panel.appendChild(this._canvas);

    this._shadow.append(style, panel);
  }

  private _updatePressed(row: HTMLElement, match: string, prop: 'backgroundColor' | 'textContent'): void {
    row.querySelectorAll('button').forEach((b) => {
      const val = prop === 'backgroundColor' ? (b as HTMLElement).style.backgroundColor : b.textContent;
      b.setAttribute('aria-pressed', String(val === match));
    });
  }

  private _onTool(t: 'pen' | 'eraser' | 'undo' | 'clear'): void {
    if (t === 'undo') { this._strokes.pop(); this._redraw(); return; }
    if (t === 'clear') {
      if (this._clearPending) { this._strokes = []; this._redraw(); this._clearPending = false; }
      else { this._clearPending = true; setTimeout(() => { this._clearPending = false; }, 1000); }
      return;
    }
    this._tool = t;
    const row = this._shadow.querySelector('.row') as HTMLElement;
    row.querySelectorAll('[part~="wb-tool-btn"]').forEach((b) => {
      const d = (b as HTMLElement).dataset.tool;
      if (d === 'pen' || d === 'eraser') b.setAttribute('aria-pressed', String(this._tool === d));
    });
  }

  private _pt(e: PointerEvent): Point {
    const r = this._canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) * (this._canvas.width / r.width), y: (e.clientY - r.top) * (this._canvas.height / r.height) };
  }

  private _down(e: PointerEvent): void {
    this._canvas.setPointerCapture(e.pointerId);
    this._current = { points: [this._pt(e)], color: this._color, width: this._width, tool: this._tool };
  }

  private _move(e: PointerEvent): void {
    if (!this._current) return;
    this._current.points.push(this._pt(e));
    this._redraw();
    this._draw(this._current);
  }

  private _up(): void {
    if (this._current && this._current.points.length > 1) this._strokes.push(this._current);
    this._current = null;
    this._redraw();
  }

  private _redraw(): void {
    const ctx = this._canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, this._canvas.width, this._canvas.height);
    for (const s of this._strokes) this._draw(s);
  }

  private _draw(s: Stroke): void {
    const ctx = this._canvas.getContext('2d');
    if (!ctx || s.points.length < 2) return;
    ctx.save();
    ctx.lineWidth = s.width;
    ctx.lineCap = ctx.lineJoin = 'round';
    ctx.globalCompositeOperation = s.tool === 'eraser' ? 'destination-out' : 'source-over';
    ctx.strokeStyle = s.tool === 'eraser' ? 'rgba(0,0,0,1)' : s.color;
    ctx.beginPath();
    ctx.moveTo(s.points[0]!.x, s.points[0]!.y);
    for (let i = 1; i < s.points.length; i++) ctx.lineTo(s.points[i]!.x, s.points[i]!.y);
    ctx.stroke();
    ctx.restore();
  }
}

if (!customElements.get('choca-whiteboard'))
  customElements.define('choca-whiteboard', ChocaWhiteboard);
```

- [ ] **Step 4: Run browser tests — expect pass**

Run: `npx wtr tests/elements/ChocaWhiteboard.browser.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/elements/ChocaWhiteboard.ts tests/elements/ChocaWhiteboard.browser.test.ts
git commit -m "feat(elements): add ChocaWhiteboard freehand drawing component"
```

---

## Task 5: Wire Everything into ChocablocQuestion + Exports

**Files:**
- Modify: `src/elements/ChocablocQuestion.ts`
- Modify: `src/full.ts`
- Modify: `.size-limit.cjs`

- [ ] **Step 1: Rewrite ChocablocQuestion dispatcher**

Replace `src/elements/ChocablocQuestion.ts` with toolbar integration, input-mode routing, and lazy whiteboard:

```typescript
import type { AnswerValue, MoneyQuestion, NormalizedQuestion, ToolName } from '../types';
import { validateAnswer } from '../helpers/validators';
import './ChocaCoinPile';
import './ChocaCanvasQuestion';
import './ChocaTableQuestion';
import './ChocaPatternQuestion';
import './ChocaNumberLineQuestion';
import './ChocaToolbar';
import './ChocaAnswerInput';

const TOOL_ATTRS: readonly ToolName[] = ['whiteboard', 'calculator', 'place-value-chart'];

function buildFallback(): { fragment: DocumentFragment; promptEl: HTMLElement } {
  const fragment = document.createDocumentFragment();
  const style = document.createElement('style');
  style.textContent = `
    :host { display: block; font-family: var(--cq-font, system-ui); }
    [part="container"] { padding: var(--cq-container-padding, 16px); }
    [part="prompt"] { font-size: var(--cq-prompt-size, 1rem); }
  `;
  const container = document.createElement('div');
  container.setAttribute('part', 'container');
  container.setAttribute('role', 'group');
  const promptEl = document.createElement('div');
  promptEl.setAttribute('part', 'prompt');
  container.append(promptEl);
  fragment.append(style, container);
  return { fragment, promptEl };
}

export class ChocablocQuestion extends HTMLElement {
  private _shadow: ShadowRoot;
  private _question: NormalizedQuestion | null = null;
  private _toolsUsed = new Set<ToolName>();
  private _toolPanels = new Map<ToolName, HTMLElement>();
  private _panelContainer: HTMLElement | null = null;

  static get observedAttributes(): string[] {
    return ['answer-mode', 'disabled', 'locale', 'seed', ...TOOL_ATTRS];
  }

  constructor() {
    super();
    this._shadow = this.attachShadow({ mode: 'open' });
  }

  set question(q: NormalizedQuestion) {
    this._question = q;
    this._toolsUsed.clear();
    for (const [, el] of this._toolPanels) {
      if (typeof (el as any).clear === 'function') (el as any).clear();
    }
    this._render();
  }

  get question(): NormalizedQuestion | null { return this._question; }

  attributeChangedCallback(): void { this._render(); }

  private _enabledTools(): ToolName[] {
    return TOOL_ATTRS.filter((t) => this.hasAttribute(t));
  }

  private _render(): void {
    if (!this._question) return;
    while (this._shadow.firstChild) this._shadow.removeChild(this._shadow.firstChild);

    const tools = this._enabledTools();
    if (tools.length > 0) this._addToolbar(tools);

    if (this._question.answerMode === 'input') { this._renderInputMode(); return; }

    if (this._question.format === 'money') {
      const inner = document.createElement('choca-coin-pile');
      this._passAttrs(inner);
      (inner as any).question = this._question;
      this._shadow.appendChild(inner);
      this._tapAnswered(inner);
      return;
    }
    if (this._question.format === 'text') {
      const { fragment, promptEl } = buildFallback();
      promptEl.textContent = this._question.content.stem;
      this._shadow.appendChild(fragment);
      return;
    }

    let tag: string;
    if (this._question.format === 'money_budget_adjust') tag = 'choca-table-question';
    else if (this._question.format === 'pattern') tag = 'choca-pattern-question';
    else if (this._question.format === 'multiplication' && this._question.imageType === 'number_line') tag = 'choca-number-line-question';
    else tag = 'choca-canvas-question';

    const inner = document.createElement(tag);
    this._passAttrs(inner);
    (inner as any).question = this._question;
    this._shadow.appendChild(inner);
    this._tapAnswered(inner);
  }

  private _passAttrs(el: HTMLElement): void {
    el.setAttribute('answer-mode', this.getAttribute('answer-mode') ?? 'mc');
    for (const a of ['seed', 'locale']) {
      const v = this.getAttribute(a);
      if (v !== null) el.setAttribute(a, v);
    }
    if (this.hasAttribute('disabled')) el.setAttribute('disabled', '');
  }

  private _tapAnswered(inner: HTMLElement): void {
    if (this._toolsUsed.size === 0) return;
    inner.addEventListener('answered', (e) => {
      const d = (e as CustomEvent).detail;
      if (d && typeof d === 'object') d.toolsUsed = [...this._toolsUsed];
    });
  }

  private _addToolbar(tools: ToolName[]): void {
    const toolbar = document.createElement('choca-toolbar') as any;
    toolbar.tools = tools;

    this._panelContainer = document.createElement('div');
    this._panelContainer.setAttribute('part', 'tool-panels');

    toolbar.addEventListener('tool-toggled', (e: CustomEvent) => {
      const { tool, active } = e.detail as { tool: ToolName; active: boolean };
      if (active) { this._toolsUsed.add(tool); void this._showPanel(tool); }
      else this._hidePanel(tool);
      this.dispatchEvent(new CustomEvent('tool-used', {
        detail: { tool, action: active ? 'opened' : 'closed' },
        bubbles: true, composed: true,
      }));
    });

    this._shadow.append(toolbar, this._panelContainer);
  }

  private async _showPanel(tool: ToolName): Promise<void> {
    if (!this._panelContainer) return;
    let el = this._toolPanels.get(tool);
    if (!el) {
      if (tool === 'whiteboard') {
        const { ChocaWhiteboard } = await import('./ChocaWhiteboard');
        if (!customElements.get('choca-whiteboard')) customElements.define('choca-whiteboard', ChocaWhiteboard);
        el = document.createElement('choca-whiteboard');
      }
      // Future: calculator, place-value-chart lazy imports go here
      if (el) this._toolPanels.set(tool, el);
    }
    if (el) { el.style.display = ''; if (!el.parentNode) this._panelContainer.appendChild(el); }
  }

  private _hidePanel(tool: ToolName): void {
    const el = this._toolPanels.get(tool);
    if (el) el.style.display = 'none';
  }

  private _renderInputMode(): void {
    const q = this._question!;
    const style = document.createElement('style');
    style.textContent = `
      :host { display: block; font-family: var(--cq-font, system-ui, sans-serif); }
      [part="container"] {
        display: flex; flex-direction: column; gap: var(--cq-section-gap, 16px);
        padding: var(--cq-container-padding, 16px);
      }
      [part="prompt"] { font-size: var(--cq-prompt-size, 1rem); font-weight: var(--cq-prompt-weight, 600); }
    `;
    const container = document.createElement('div');
    container.setAttribute('part', 'container');
    container.setAttribute('role', 'group');
    const prompt = document.createElement('div');
    prompt.setAttribute('part', 'prompt');
    prompt.textContent = q.prompt ?? 'Enter your answer:';

    const inputEl = document.createElement('choca-answer-input') as any;
    inputEl.format = q.format;
    if (this.hasAttribute('disabled')) inputEl.setAttribute('disabled', '');

    const t0 = performance.now();
    inputEl.addEventListener('submitted', (e: CustomEvent) => {
      const { parsedValue, rawInput } = e.detail as { parsedValue: AnswerValue; rawInput: string };
      void validateAnswer(q, parsedValue).then((v) => {
        inputEl.showFeedback(v.correct, v.expected);
        this.dispatchEvent(new CustomEvent('answered', {
          detail: {
            questionId: q.id, studentAnswer: parsedValue, correct: v.correct,
            distractorMatched: v.distractorMatched, skillTags: v.skillTags,
            expected: v.expected, timeToAnswerMs: performance.now() - t0, rawInput,
            ...(this._toolsUsed.size > 0 ? { toolsUsed: [...this._toolsUsed] } : {}),
          },
          bubbles: true, composed: true,
        }));
      });
    });

    container.append(prompt, inputEl);
    this._shadow.append(style, container);
    this.dispatchEvent(new CustomEvent('rendered', {
      detail: { renderedAt: t0 }, bubbles: true, composed: true,
    }));
  }
}

if (!customElements.get('chocabloc-question'))
  customElements.define('chocabloc-question', ChocablocQuestion);
```

- [ ] **Step 2: Update `src/full.ts` exports**

Add exports and side-effect imports:

```typescript
export { ChocaToolbar } from './elements/ChocaToolbar';
export { ChocaAnswerInput } from './elements/ChocaAnswerInput';

import './elements/ChocaToolbar';
import './elements/ChocaAnswerInput';
```

- [ ] **Step 3: Bump `.size-limit.cjs` full bundle limit**

Change `'40 KB'` → `'45 KB'` for the full entry.

- [ ] **Step 4: Run full CI**

Run: `npm run ci`
Expected: typecheck + lint + test + build + size ALL PASS

- [ ] **Step 5: Run all browser tests**

Run: `npm run test:browser`
Expected: ALL PASS (including existing tests — no regressions)

- [ ] **Step 6: Commit**

```bash
git add src/elements/ChocablocQuestion.ts src/full.ts .size-limit.cjs
git commit -m "feat(dispatcher): integrate toolbar, input-mode routing, lazy whiteboard"
```

---

## Summary

| Task | What ships |
|---|---|
| 1 | `answerMode` type, `parseInputAnswer` helper, normalizer passthrough, exports |
| 2 | `ChocaAnswerInput` component |
| 3 | `ChocaToolbar` component (supports N tools, only whiteboard wired now) |
| 4 | `ChocaWhiteboard` component |
| 5 | Dispatcher integration, lazy loading, bundle updates |

5 tasks, ~5 files each. Calculator and place value chart can slot into Task 3's toolbar + Task 5's lazy loader later with zero rework.
