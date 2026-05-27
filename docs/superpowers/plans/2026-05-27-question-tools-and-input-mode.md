# Question Tools & Input-to-Answer Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add four opt-in features — whiteboard, calculator, place value chart (toolbar helper tools) and input-to-answer mode (typed answer replacing multiple choice) — to the chocabloc-questions library.

**Architecture:** Hybrid A+B. Consumer-facing API is boolean attributes on `<chocabloc-question>`. Internally, each tool is an independent web component with its own shadow DOM, managed by a shared `ChocaToolbar`. Three tool components (`ChocaWhiteboard`, `ChocaCalculator`, `ChocaPlaceValueChart`) are lazy-loaded via dynamic `import()`. `ChocaAnswerInput` and `ChocaToolbar` ship in the static `full` bundle. A new Tier 1 helper `parseInputAnswer` handles format-aware input parsing.

**Tech Stack:** TypeScript, Web Components (shadow DOM), HTML Canvas (whiteboard), CSS custom properties + `::part()` for theming, Vitest (Tier 1 tests), @web/test-runner + Playwright (Tier 2 browser tests), Vite (build).

---

## File Structure

### New Files

| File | Responsibility |
|---|---|
| `src/helpers/input-parser.ts` | `parseInputAnswer()` — format-aware string→AnswerValue parser |
| `src/elements/ChocaToolbar.ts` | Toolbar icon buttons, toggle state, tool-used events |
| `src/elements/ChocaAnswerInput.ts` | Typed answer input field, submit, validation, answered event |
| `src/elements/ChocaWhiteboard.ts` | Freehand drawing canvas (pen, eraser, color, width, undo, clear) |
| `src/elements/ChocaCalculator.ts` | Four-function + memory calculator |
| `src/elements/ChocaPlaceValueChart.ts` | Structured place value decomposition grid |
| `tests/helpers/input-parser.test.ts` | Unit tests for parseInputAnswer |
| `tests/elements/ChocaAnswerInput.browser.test.ts` | Browser tests for answer input component |
| `tests/elements/ChocaToolbar.browser.test.ts` | Browser tests for toolbar component |
| `tests/elements/ChocaWhiteboard.browser.test.ts` | Browser tests for whiteboard component |
| `tests/elements/ChocaCalculator.browser.test.ts` | Browser tests for calculator component |
| `tests/elements/ChocaPlaceValueChart.browser.test.ts` | Browser tests for place value chart |

### Modified Files

| File | Change |
|---|---|
| `src/types.ts` | Add `ToolName` type, `answerMode` to BaseQuestion, `toolsUsed`/`rawInput` to answered detail type, `AnsweredDetail` type |
| `src/helpers/normalizer.ts` | Pass through `answerMode` field in `extractBase` |
| `src/helpers-only.ts` | Export `parseInputAnswer` and new types |
| `src/full.ts` | Export new components (`ChocaToolbar`, `ChocaAnswerInput`) + side-effect imports |
| `src/elements/ChocablocQuestion.ts` | Integrate toolbar rendering, input-mode routing, tool-used tracking, extended answered event |
| `.size-limit.cjs` | Bump full bundle limit from 40 KB to 45 KB |
| `vite.config.ts` | No change needed — Vite handles dynamic import chunks automatically |

---

## Phase 1: Types & Input Parser (Tier 1, pure logic)

### Task 1: Add New Types to `src/types.ts`

**Files:**
- Modify: `src/types.ts:37-45` (BaseQuestion), add new types at end of file

- [ ] **Step 1: Write the failing test for answerMode on BaseQuestion**

Create `tests/helpers/input-parser.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import type { NormalizedQuestion, MoneyQuestion } from '../../src/types';

describe('answerMode type field', () => {
  it('accepts answerMode on a question type', () => {
    const q: MoneyQuestion = {
      id: 'M-1',
      skillIds: ['MONEY-COIN-VALUE-USD'],
      format: 'money',
      imageType: 'coins',
      content: { coins: { quarter: 1 }, currency: 'USD' },
      answer: 25,
      distractors: [],
      answerMode: 'input',
    };
    expect(q.answerMode).toBe('input');
  });

  it('defaults answerMode to undefined', () => {
    const q: MoneyQuestion = {
      id: 'M-2',
      skillIds: ['MONEY-COIN-VALUE-USD'],
      format: 'money',
      imageType: 'coins',
      content: { coins: { quarter: 1 }, currency: 'USD' },
      answer: 25,
      distractors: [],
    };
    expect(q.answerMode).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/helpers/input-parser.test.ts`
Expected: FAIL — `answerMode` does not exist on `MoneyQuestion`

- [ ] **Step 3: Add types to `src/types.ts`**

Add `answerMode` to `BaseQuestion` (after `prompt?`):

```typescript
export type BaseQuestion = {
  id: string;
  skillIds: SkillId[];
  gradeBand?: 'sprout' | 'adventure' | 'thunder';
  gradeLevel?: number;
  prompt?: string;
  answerMode?: 'choice' | 'input';
};
```

Add new types at end of file (before the closing exports):

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

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/helpers/input-parser.test.ts`
Expected: PASS

- [ ] **Step 5: Run full type check**

Run: `npm run typecheck`
Expected: PASS — no regressions

- [ ] **Step 6: Commit**

```bash
git add src/types.ts tests/helpers/input-parser.test.ts
git commit -m "feat(types): add answerMode, ToolName, AnsweredDetail types"
```

---

### Task 2: Implement `parseInputAnswer` Helper

**Files:**
- Create: `src/helpers/input-parser.ts`
- Modify: `tests/helpers/input-parser.test.ts`

- [ ] **Step 1: Write failing tests for parseInputAnswer**

Append to `tests/helpers/input-parser.test.ts`:

```typescript
import { parseInputAnswer } from '../../src/helpers/input-parser';

describe('parseInputAnswer', () => {
  describe('money formats (cents)', () => {
    it('parses $2.53 as 253 cents', () => {
      expect(parseInputAnswer('$2.53', 'money')).toBe(253);
    });

    it('parses $0.10 as 10 cents', () => {
      expect(parseInputAnswer('$0.10', 'money')).toBe(10);
    });

    it('parses 2.53 without $ as 253 cents', () => {
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
  });

  describe('degree stripping', () => {
    it('strips degree symbol from geometry_angles', () => {
      expect(parseInputAnswer('45°', 'geometry_angles')).toBe(45);
    });

    it('parses plain number for geometry_angles', () => {
      expect(parseInputAnswer('90', 'geometry_angles')).toBe(90);
    });

    it('strips degree from geometry_angle_classify answer', () => {
      expect(parseInputAnswer('45°', 'geometry_angle_classify')).toBe(45);
    });
  });

  describe('numeric formats', () => {
    it('parses integer for geometry_area', () => {
      expect(parseInputAnswer('24', 'geometry_area')).toBe(24);
    });

    it('parses decimal for pythagorean', () => {
      expect(parseInputAnswer('5.0', 'pythagorean')).toBe(5);
    });

    it('parses geometry_perimeter', () => {
      expect(parseInputAnswer('20', 'geometry_perimeter')).toBe(20);
    });

    it('parses geometry_circumference with decimal', () => {
      expect(parseInputAnswer('31.42', 'geometry_circumference')).toBe(31.42);
    });

    it('parses coordinate_distance', () => {
      expect(parseInputAnswer('5', 'coordinate_distance')).toBe(5);
    });

    it('parses multiplication', () => {
      expect(parseInputAnswer('42', 'multiplication')).toBe(42);
    });

    it('parses data_graph', () => {
      expect(parseInputAnswer('15', 'data_graph')).toBe(15);
    });
  });

  describe('time format', () => {
    it('keeps time string as-is', () => {
      expect(parseInputAnswer('2:30', 'time')).toBe('2:30');
    });

    it('trims whitespace from time', () => {
      expect(parseInputAnswer('  2:30  ', 'time')).toBe('2:30');
    });
  });

  describe('fraction format', () => {
    it('keeps fraction string as-is', () => {
      expect(parseInputAnswer('1/2', 'fraction_concept')).toBe('1/2');
    });

    it('trims whitespace from fraction', () => {
      expect(parseInputAnswer(' 3/4 ', 'fraction_concept')).toBe('3/4');
    });

    it('passes numeric input through as number', () => {
      expect(parseInputAnswer('0.5', 'fraction_concept')).toBe(0.5);
    });
  });

  describe('pattern format', () => {
    it('parses numeric pattern answer', () => {
      expect(parseInputAnswer('12', 'pattern')).toBe(12);
    });

    it('keeps non-numeric pattern answer as string', () => {
      expect(parseInputAnswer('red', 'pattern')).toBe('red');
    });
  });

  describe('edge cases', () => {
    it('returns NaN for empty string on numeric format', () => {
      expect(parseInputAnswer('', 'geometry_area')).toBeNaN();
    });

    it('returns NaN for garbage on numeric format', () => {
      expect(parseInputAnswer('abc', 'geometry_area')).toBeNaN();
    });

    it('trims whitespace from all formats', () => {
      expect(parseInputAnswer('  24  ', 'geometry_area')).toBe(24);
    });

    it('returns empty string for empty input on string format', () => {
      expect(parseInputAnswer('', 'time')).toBe('');
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/helpers/input-parser.test.ts`
Expected: FAIL — `parseInputAnswer` not found

- [ ] **Step 3: Implement `src/helpers/input-parser.ts`**

```typescript
import type { AnswerValue, QuestionFormat } from '../types';

const MONEY_FORMATS: ReadonlySet<string> = new Set(['money', 'money_budget_adjust']);

const DEGREE_FORMATS: ReadonlySet<string> = new Set([
  'geometry_angles',
  'geometry_angle_classify',
]);

const NUMERIC_FORMATS: ReadonlySet<string> = new Set([
  'geometry_area',
  'geometry_perimeter',
  'geometry_circumference',
  'pythagorean',
  'coordinate_distance',
  'multiplication',
  'data_graph',
  'geometry_properties',
]);

const STRING_FORMATS: ReadonlySet<string> = new Set(['time']);

export function parseInputAnswer(
  rawInput: string,
  format: QuestionFormat,
): AnswerValue {
  const trimmed = rawInput.trim();

  if (MONEY_FORMATS.has(format)) {
    const stripped = trimmed.replace(/^\$/, '');
    return Math.round(parseFloat(stripped) * 100);
  }

  if (DEGREE_FORMATS.has(format)) {
    const stripped = trimmed.replace(/°$/, '');
    return Number(stripped);
  }

  if (STRING_FORMATS.has(format)) {
    return trimmed;
  }

  if (format === 'fraction_concept') {
    if (/^\d+\/\d+$/.test(trimmed)) return trimmed;
    const n = Number(trimmed);
    return Number.isFinite(n) ? n : trimmed;
  }

  if (format === 'pattern') {
    const n = Number(trimmed);
    return Number.isFinite(n) ? n : trimmed;
  }

  if (NUMERIC_FORMATS.has(format)) {
    return Number(trimmed);
  }

  // Fallback: try numeric, else string
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : trimmed;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/helpers/input-parser.test.ts`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add src/helpers/input-parser.ts tests/helpers/input-parser.test.ts
git commit -m "feat(helpers): add parseInputAnswer for typed answer parsing"
```

---

### Task 3: Pass `answerMode` Through Normalizer

**Files:**
- Modify: `src/helpers/normalizer.ts:133-150` (extractBase function)
- Modify: `tests/helpers/normalizer.test.ts`

- [ ] **Step 1: Write failing test for answerMode passthrough**

Add to the existing `tests/helpers/normalizer.test.ts` — find an appropriate describe block or add a new one:

```typescript
describe('answerMode passthrough', () => {
  it('passes answerMode: input through to normalized question', () => {
    const raw = {
      id: 'INPUT-1',
      format: 'money',
      skill_ids: ['MONEY-COIN-VALUE-USD'],
      content: { coins: { quarter: 1 } },
      answer: 25,
      distractors: [],
      answerMode: 'input',
    };
    const q = normalizeQuestion(raw);
    expect(q?.answerMode).toBe('input');
  });

  it('passes answerMode: choice through to normalized question', () => {
    const raw = {
      id: 'CHOICE-1',
      format: 'money',
      skill_ids: ['MONEY-COIN-VALUE-USD'],
      content: { coins: { quarter: 1 } },
      answer: 25,
      distractors: [],
      answerMode: 'choice',
    };
    const q = normalizeQuestion(raw);
    expect(q?.answerMode).toBe('choice');
  });

  it('leaves answerMode undefined when not in raw data', () => {
    const raw = {
      id: 'NONE-1',
      format: 'money',
      skill_ids: ['MONEY-COIN-VALUE-USD'],
      content: { coins: { quarter: 1 } },
      answer: 25,
      distractors: [],
    };
    const q = normalizeQuestion(raw);
    expect(q?.answerMode).toBeUndefined();
  });

  it('also reads answer_mode snake_case field', () => {
    const raw = {
      id: 'SNAKE-1',
      format: 'money',
      skill_ids: ['MONEY-COIN-VALUE-USD'],
      content: { coins: { quarter: 1 } },
      answer: 25,
      distractors: [],
      answer_mode: 'input',
    };
    const q = normalizeQuestion(raw);
    expect(q?.answerMode).toBe('input');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/helpers/normalizer.test.ts -t "answerMode passthrough"`
Expected: FAIL — `answerMode` is undefined because `extractBase` doesn't read it

- [ ] **Step 3: Modify `extractBase` in `src/helpers/normalizer.ts`**

Change the `extractBase` function (around line 133) to also extract `answerMode`:

```typescript
function extractBase(r: Record<string, unknown>): {
  id: string;
  skillIds: string[];
  prompt?: string;
  answerMode?: 'choice' | 'input';
} {
  const id = getString(r, 'id', 'question_id');
  if (!id) throw new NormalizeError('Question missing id', r);
  const skillIds = getStringArray(r, 'skill_ids', 'skillIds');
  const promptRaw =
    getString(r, 'prompt') ||
    (typeof (r['content'] as Record<string, unknown> | undefined)?.['question'] === 'string'
      ? ((r['content'] as Record<string, unknown>)['question'] as string)
      : undefined) ||
    (typeof (r['content'] as Record<string, unknown> | undefined)?.['prompt'] === 'string'
      ? ((r['content'] as Record<string, unknown>)['prompt'] as string)
      : undefined);
  const rawMode = getString(r, 'answerMode', 'answer_mode');
  const answerMode = rawMode === 'input' || rawMode === 'choice' ? rawMode : undefined;
  return {
    id, skillIds,
    ...(promptRaw ? { prompt: promptRaw } : {}),
    ...(answerMode ? { answerMode } : {}),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/helpers/normalizer.test.ts -t "answerMode passthrough"`
Expected: PASS

- [ ] **Step 5: Run full test suite to check no regressions**

Run: `npm run test`
Expected: ALL PASS

- [ ] **Step 6: Commit**

```bash
git add src/helpers/normalizer.ts tests/helpers/normalizer.test.ts
git commit -m "feat(normalizer): pass answerMode field through to NormalizedQuestion"
```

---

### Task 4: Export New Types and Helper from `helpers-only.ts`

**Files:**
- Modify: `src/helpers-only.ts`

- [ ] **Step 1: Add parseInputAnswer export**

Add to `src/helpers-only.ts` after the validators export block:

```typescript
export { parseInputAnswer } from './helpers/input-parser';
```

- [ ] **Step 2: Add new type exports**

Add to the `export type { ... } from './types'` block in `src/helpers-only.ts`:

```typescript
  ToolName,
  AnsweredDetail,
```

These go inside the existing `export type { ... }` block, after `SkillId,`.

- [ ] **Step 3: Run typecheck and build**

Run: `npm run typecheck && npm run build`
Expected: PASS — new exports are included

- [ ] **Step 4: Commit**

```bash
git add src/helpers-only.ts
git commit -m "feat(exports): expose parseInputAnswer, ToolName, AnsweredDetail from helpers-only"
```

---

## Phase 2: ChocaAnswerInput Component

### Task 5: Create `ChocaAnswerInput` Web Component

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

afterEach(() => {
  document.body.innerHTML = '';
});

describe('<choca-answer-input> registration', () => {
  it('registers as custom element', () => {
    expect(customElements.get('choca-answer-input')).to.not.be.undefined;
  });
});

describe('<choca-answer-input> rendering', () => {
  it('renders input field and submit button', async () => {
    const el = mount(`<choca-answer-input></choca-answer-input>`);
    (el as HTMLElement & { format: string }).format = 'geometry_area';
    await frame();
    const input = el.shadowRoot!.querySelector('[part="input-field"]') as HTMLInputElement;
    const btn = el.shadowRoot!.querySelector('[part="input-submit"]') as HTMLButtonElement;
    expect(input).to.not.be.null;
    expect(btn).to.not.be.null;
  });

  it('shows $ placeholder for money format', async () => {
    const el = mount(`<choca-answer-input></choca-answer-input>`);
    (el as HTMLElement & { format: string }).format = 'money';
    await frame();
    const input = el.shadowRoot!.querySelector('[part="input-field"]') as HTMLInputElement;
    expect(input.placeholder).to.equal('$0.00');
  });

  it('shows degree placeholder for geometry_angles', async () => {
    const el = mount(`<choca-answer-input></choca-answer-input>`);
    (el as HTMLElement & { format: string }).format = 'geometry_angles';
    await frame();
    const input = el.shadowRoot!.querySelector('[part="input-field"]') as HTMLInputElement;
    expect(input.placeholder).to.equal('0°');
  });

  it('shows generic 0 placeholder for geometry_area', async () => {
    const el = mount(`<choca-answer-input></choca-answer-input>`);
    (el as HTMLElement & { format: string }).format = 'geometry_area';
    await frame();
    const input = el.shadowRoot!.querySelector('[part="input-field"]') as HTMLInputElement;
    expect(input.placeholder).to.equal('0');
  });

  it('shows time placeholder for time format', async () => {
    const el = mount(`<choca-answer-input></choca-answer-input>`);
    (el as HTMLElement & { format: string }).format = 'time';
    await frame();
    const input = el.shadowRoot!.querySelector('[part="input-field"]') as HTMLInputElement;
    expect(input.placeholder).to.equal('0:00');
  });

  it('shows fraction placeholder for fraction_concept', async () => {
    const el = mount(`<choca-answer-input></choca-answer-input>`);
    (el as HTMLElement & { format: string }).format = 'fraction_concept';
    await frame();
    const input = el.shadowRoot!.querySelector('[part="input-field"]') as HTMLInputElement;
    expect(input.placeholder).to.equal('1/2');
  });
});

describe('<choca-answer-input> submit', () => {
  it('fires submitted event on button click', async () => {
    const el = mount(`<choca-answer-input></choca-answer-input>`);
    (el as HTMLElement & { format: string }).format = 'geometry_area';
    await frame();
    const input = el.shadowRoot!.querySelector('[part="input-field"]') as HTMLInputElement;
    const btn = el.shadowRoot!.querySelector('[part="input-submit"]') as HTMLButtonElement;
    let captured: unknown = null;
    el.addEventListener('submitted', (e) => {
      captured = (e as CustomEvent).detail;
    });
    input.value = '24';
    btn.click();
    expect(captured).to.deep.equal({ parsedValue: 24, rawInput: '24' });
  });

  it('fires submitted event on Enter key', async () => {
    const el = mount(`<choca-answer-input></choca-answer-input>`);
    (el as HTMLElement & { format: string }).format = 'money';
    await frame();
    const input = el.shadowRoot!.querySelector('[part="input-field"]') as HTMLInputElement;
    let captured: unknown = null;
    el.addEventListener('submitted', (e) => {
      captured = (e as CustomEvent).detail;
    });
    input.value = '$2.53';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(captured).to.deep.equal({ parsedValue: 253, rawInput: '$2.53' });
  });

  it('does not fire when disabled', async () => {
    const el = mount(`<choca-answer-input disabled></choca-answer-input>`);
    (el as HTMLElement & { format: string }).format = 'geometry_area';
    await frame();
    const input = el.shadowRoot!.querySelector('[part="input-field"]') as HTMLInputElement;
    const btn = el.shadowRoot!.querySelector('[part="input-submit"]') as HTMLButtonElement;
    let fired = false;
    el.addEventListener('submitted', () => { fired = true; });
    input.value = '24';
    btn.click();
    expect(fired).to.be.false;
  });

  it('disables input and button when disabled attribute set', async () => {
    const el = mount(`<choca-answer-input disabled></choca-answer-input>`);
    (el as HTMLElement & { format: string }).format = 'geometry_area';
    await frame();
    const input = el.shadowRoot!.querySelector('[part="input-field"]') as HTMLInputElement;
    const btn = el.shadowRoot!.querySelector('[part="input-submit"]') as HTMLButtonElement;
    expect(input.disabled).to.be.true;
    expect(btn.disabled).to.be.true;
  });
});

describe('<choca-answer-input> feedback', () => {
  it('shows correct feedback when showFeedback called with correct=true', async () => {
    const el = mount(`<choca-answer-input></choca-answer-input>`) as HTMLElement & {
      format: string;
      showFeedback: (correct: boolean, expected?: unknown) => void;
    };
    el.format = 'geometry_area';
    await frame();
    el.showFeedback(true);
    await frame();
    const feedback = el.shadowRoot!.querySelector('[part="input-feedback"]') as HTMLElement;
    expect(feedback.textContent).to.contain('Correct');
  });

  it('shows incorrect feedback with expected answer', async () => {
    const el = mount(`<choca-answer-input></choca-answer-input>`) as HTMLElement & {
      format: string;
      showFeedback: (correct: boolean, expected?: unknown) => void;
    };
    el.format = 'geometry_area';
    await frame();
    el.showFeedback(false, 24);
    await frame();
    const feedback = el.shadowRoot!.querySelector('[part="input-feedback"]') as HTMLElement;
    expect(feedback.textContent).to.contain('24');
  });

  it('disables after showFeedback', async () => {
    const el = mount(`<choca-answer-input></choca-answer-input>`) as HTMLElement & {
      format: string;
      showFeedback: (correct: boolean, expected?: unknown) => void;
    };
    el.format = 'geometry_area';
    await frame();
    el.showFeedback(false, 24);
    await frame();
    const input = el.shadowRoot!.querySelector('[part="input-field"]') as HTMLInputElement;
    expect(input.disabled).to.be.true;
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx wtr tests/elements/ChocaAnswerInput.browser.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement `src/elements/ChocaAnswerInput.ts`**

```typescript
import type { AnswerValue, QuestionFormat } from '../types';
import { parseInputAnswer } from '../helpers/input-parser';

const PLACEHOLDERS: Partial<Record<QuestionFormat, string>> = {
  money: '$0.00',
  money_budget_adjust: '$0.00',
  geometry_angles: '0°',
  geometry_angle_classify: '0°',
  time: '0:00',
  fraction_concept: '1/2',
};

const DEFAULT_PLACEHOLDER = '0';

function buildTemplate(): {
  fragment: DocumentFragment;
  inputEl: HTMLInputElement;
  submitBtn: HTMLButtonElement;
  feedbackEl: HTMLElement;
} {
  const fragment = document.createDocumentFragment();
  const style = document.createElement('style');
  style.textContent = `
    :host {
      display: block;
      font-family: var(--cq-font, system-ui, sans-serif);
    }
    [part="input-wrap"] {
      display: flex;
      gap: 8px;
      align-items: center;
    }
    [part="input-field"] {
      font-family: var(--cq-input-font, inherit);
      font-size: var(--cq-input-size, 1.25rem);
      padding: 10px 14px;
      border: var(--cq-input-border, 2px solid #ccc);
      border-radius: 8px;
      outline: none;
      flex: 1;
      min-width: 0;
    }
    [part="input-field"]:focus {
      border-color: var(--cq-input-focus, #4a90d9);
      box-shadow: 0 0 0 3px color-mix(in srgb, var(--cq-input-focus, #4a90d9) 25%, transparent);
    }
    [part="input-field"]:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }
    [part="input-submit"] {
      font-family: var(--cq-input-font, inherit);
      font-size: var(--cq-input-size, 1.25rem);
      padding: 10px 20px;
      background: var(--cq-choice-bg, #4a90d9);
      color: var(--cq-choice-text, #fff);
      border: none;
      border-radius: 8px;
      cursor: pointer;
    }
    [part="input-submit"]:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }
    [part="input-feedback"] {
      margin-top: 8px;
      font-size: 0.95rem;
      min-height: 1.4em;
    }
    [part="input-feedback"].correct {
      color: var(--cq-input-success, #2a7d2a);
    }
    [part="input-feedback"].incorrect {
      color: var(--cq-input-error, #c0392b);
    }
  `;
  const wrap = document.createElement('div');
  wrap.setAttribute('part', 'input-wrap');

  const inputEl = document.createElement('input');
  inputEl.setAttribute('part', 'input-field');
  inputEl.setAttribute('type', 'text');
  inputEl.setAttribute('autocomplete', 'off');

  const submitBtn = document.createElement('button');
  submitBtn.setAttribute('part', 'input-submit');
  submitBtn.setAttribute('type', 'button');
  submitBtn.textContent = 'Submit';

  wrap.append(inputEl, submitBtn);

  const feedbackEl = document.createElement('div');
  feedbackEl.setAttribute('part', 'input-feedback');
  feedbackEl.setAttribute('aria-live', 'polite');

  fragment.append(style, wrap, feedbackEl);
  return { fragment, inputEl, submitBtn, feedbackEl };
}

export class ChocaAnswerInput extends HTMLElement {
  private _shadow: ShadowRoot;
  private _inputEl!: HTMLInputElement;
  private _submitBtn!: HTMLButtonElement;
  private _feedbackEl!: HTMLElement;
  private _format: QuestionFormat = 'text';

  static get observedAttributes(): string[] {
    return ['disabled'];
  }

  constructor() {
    super();
    this._shadow = this.attachShadow({ mode: 'open' });
    const shell = buildTemplate();
    this._inputEl = shell.inputEl;
    this._submitBtn = shell.submitBtn;
    this._feedbackEl = shell.feedbackEl;
    this._shadow.append(shell.fragment);

    this._submitBtn.addEventListener('click', () => this._submit());
    this._inputEl.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this._submit();
      }
    });
  }

  set format(f: QuestionFormat) {
    this._format = f;
    this._inputEl.placeholder = PLACEHOLDERS[f] ?? DEFAULT_PLACEHOLDER;
  }

  get format(): QuestionFormat {
    return this._format;
  }

  attributeChangedCallback(): void {
    const disabled = this.hasAttribute('disabled');
    this._inputEl.disabled = disabled;
    this._submitBtn.disabled = disabled;
  }

  connectedCallback(): void {
    this.attributeChangedCallback();
  }

  showFeedback(correct: boolean, expected?: AnswerValue): void {
    this._feedbackEl.className = correct ? 'correct' : 'incorrect';
    if (correct) {
      this._feedbackEl.textContent = 'Correct!';
    } else {
      this._feedbackEl.textContent = expected !== undefined
        ? `Incorrect. The answer is ${String(expected)}.`
        : 'Incorrect.';
    }
    this.setAttribute('disabled', '');
  }

  private _submit(): void {
    if (this.hasAttribute('disabled')) return;
    const raw = this._inputEl.value;
    const parsed = parseInputAnswer(raw, this._format);
    this.dispatchEvent(
      new CustomEvent('submitted', {
        detail: { parsedValue: parsed, rawInput: raw },
        bubbles: true,
        composed: true,
      }),
    );
  }
}

if (!customElements.get('choca-answer-input')) {
  customElements.define('choca-answer-input', ChocaAnswerInput);
}
```

- [ ] **Step 4: Run browser tests to verify they pass**

Run: `npx wtr tests/elements/ChocaAnswerInput.browser.test.ts`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add src/elements/ChocaAnswerInput.ts tests/elements/ChocaAnswerInput.browser.test.ts
git commit -m "feat(elements): add ChocaAnswerInput web component"
```

---

## Phase 3: ChocaToolbar Component

### Task 6: Create `ChocaToolbar` Web Component

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

async function frame(): Promise<void> {
  await new Promise((r) => requestAnimationFrame(r));
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('<choca-toolbar> registration', () => {
  it('registers as custom element', () => {
    expect(customElements.get('choca-toolbar')).to.not.be.undefined;
  });
});

describe('<choca-toolbar> rendering', () => {
  it('renders no buttons when no tools enabled', async () => {
    const el = mount(`<choca-toolbar></choca-toolbar>`);
    await frame();
    const buttons = el.shadowRoot!.querySelectorAll('[part~="tool-btn"]');
    expect(buttons.length).to.equal(0);
  });

  it('renders whiteboard button when tools include whiteboard', async () => {
    const el = mount(`<choca-toolbar></choca-toolbar>`) as HTMLElement & { tools: string[] };
    el.tools = ['whiteboard'];
    await frame();
    const btn = el.shadowRoot!.querySelector('[part~="tool-btn-whiteboard"]');
    expect(btn).to.not.be.null;
  });

  it('renders calculator button when tools include calculator', async () => {
    const el = mount(`<choca-toolbar></choca-toolbar>`) as HTMLElement & { tools: string[] };
    el.tools = ['calculator'];
    await frame();
    const btn = el.shadowRoot!.querySelector('[part~="tool-btn-calculator"]');
    expect(btn).to.not.be.null;
  });

  it('renders pvc button when tools include place-value-chart', async () => {
    const el = mount(`<choca-toolbar></choca-toolbar>`) as HTMLElement & { tools: string[] };
    el.tools = ['place-value-chart'];
    await frame();
    const btn = el.shadowRoot!.querySelector('[part~="tool-btn-pvc"]');
    expect(btn).to.not.be.null;
  });

  it('renders multiple buttons for multiple tools', async () => {
    const el = mount(`<choca-toolbar></choca-toolbar>`) as HTMLElement & { tools: string[] };
    el.tools = ['whiteboard', 'calculator', 'place-value-chart'];
    await frame();
    const buttons = el.shadowRoot!.querySelectorAll('[part~="tool-btn"]');
    expect(buttons.length).to.equal(3);
  });
});

describe('<choca-toolbar> toggle', () => {
  it('fires tool-toggled event on click', async () => {
    const el = mount(`<choca-toolbar></choca-toolbar>`) as HTMLElement & { tools: string[] };
    el.tools = ['whiteboard'];
    await frame();
    let captured: unknown = null;
    el.addEventListener('tool-toggled', (e) => {
      captured = (e as CustomEvent).detail;
    });
    const btn = el.shadowRoot!.querySelector('[part~="tool-btn-whiteboard"]') as HTMLButtonElement;
    btn.click();
    expect(captured).to.deep.equal({ tool: 'whiteboard', active: true });
  });

  it('toggles off on second click', async () => {
    const el = mount(`<choca-toolbar></choca-toolbar>`) as HTMLElement & { tools: string[] };
    el.tools = ['whiteboard'];
    await frame();
    const events: unknown[] = [];
    el.addEventListener('tool-toggled', (e) => {
      events.push((e as CustomEvent).detail);
    });
    const btn = el.shadowRoot!.querySelector('[part~="tool-btn-whiteboard"]') as HTMLButtonElement;
    btn.click();
    await frame();
    const btn2 = el.shadowRoot!.querySelector('[part~="tool-btn-whiteboard"]') as HTMLButtonElement;
    btn2.click();
    expect(events).to.have.length(2);
    expect(events[1]).to.deep.equal({ tool: 'whiteboard', active: false });
  });

  it('sets aria-pressed on active tool', async () => {
    const el = mount(`<choca-toolbar></choca-toolbar>`) as HTMLElement & { tools: string[] };
    el.tools = ['whiteboard'];
    await frame();
    const btn = el.shadowRoot!.querySelector('[part~="tool-btn-whiteboard"]') as HTMLButtonElement;
    expect(btn.getAttribute('aria-pressed')).to.equal('false');
    btn.click();
    await frame();
    const btnAfter = el.shadowRoot!.querySelector('[part~="tool-btn-whiteboard"]') as HTMLButtonElement;
    expect(btnAfter.getAttribute('aria-pressed')).to.equal('true');
  });

  it('exposes activeTool getter', async () => {
    const el = mount(`<choca-toolbar></choca-toolbar>`) as HTMLElement & {
      tools: string[];
      activeTools: Set<string>;
    };
    el.tools = ['whiteboard', 'calculator'];
    await frame();
    expect(el.activeTools.size).to.equal(0);
    const btn = el.shadowRoot!.querySelector('[part~="tool-btn-whiteboard"]') as HTMLButtonElement;
    btn.click();
    expect(el.activeTools.has('whiteboard')).to.be.true;
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx wtr tests/elements/ChocaToolbar.browser.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement `src/elements/ChocaToolbar.ts`**

```typescript
import type { ToolName } from '../types';

const TOOL_LABELS: Record<ToolName, string> = {
  'whiteboard': 'Whiteboard',
  'calculator': 'Calculator',
  'place-value-chart': 'Place Value Chart',
};

const TOOL_PART_SUFFIXES: Record<ToolName, string> = {
  'whiteboard': 'whiteboard',
  'calculator': 'calculator',
  'place-value-chart': 'pvc',
};

const TOOL_ICONS: Record<ToolName, string> = {
  'whiteboard': `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2'%3E%3Cpath d='M12 19l7-7 3 3-7 7-3-3z'/%3E%3Cpath d='M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z'/%3E%3Cpath d='M2 2l7.586 7.586'/%3E%3C/svg%3E")`,
  'calculator': `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2'%3E%3Crect x='4' y='2' width='16' height='20' rx='2'/%3E%3Cline x1='8' y1='6' x2='16' y2='6'/%3E%3Cline x1='8' y1='10' x2='8' y2='10.01'/%3E%3Cline x1='12' y1='10' x2='12' y2='10.01'/%3E%3Cline x1='16' y1='10' x2='16' y2='10.01'/%3E%3Cline x1='8' y1='14' x2='8' y2='14.01'/%3E%3Cline x1='12' y1='14' x2='12' y2='14.01'/%3E%3Cline x1='16' y1='14' x2='16' y2='14.01'/%3E%3Cline x1='8' y1='18' x2='8' y2='18.01'/%3E%3Cline x1='12' y1='18' x2='16' y2='18'/%3E%3C/svg%3E")`,
  'place-value-chart': `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2'%3E%3Crect x='3' y='3' width='18' height='18' rx='2'/%3E%3Cline x1='9' y1='3' x2='9' y2='21'/%3E%3Cline x1='15' y1='3' x2='15' y2='21'/%3E%3Cline x1='3' y1='9' x2='21' y2='9'/%3E%3C/svg%3E")`,
};

export class ChocaToolbar extends HTMLElement {
  private _shadow: ShadowRoot;
  private _tools: ToolName[] = [];
  private _active: Set<ToolName> = new Set();
  private _container!: HTMLElement;

  constructor() {
    super();
    this._shadow = this.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = `
      :host { display: block; }
      [part="toolbar"] {
        display: flex;
        gap: 8px;
        padding: 4px 0;
      }
      [part~="tool-btn"] {
        width: var(--cq-tool-icon-size, 32px);
        height: var(--cq-tool-icon-size, 32px);
        border: var(--cq-tool-border, 1px solid #ccc);
        border-radius: var(--cq-tool-radius, 6px);
        background-color: var(--cq-tool-icon-color, currentColor);
        cursor: pointer;
        padding: 4px;
        -webkit-mask-size: 60%;
        mask-size: 60%;
        -webkit-mask-repeat: no-repeat;
        mask-repeat: no-repeat;
        -webkit-mask-position: center;
        mask-position: center;
      }
      [part~="tool-btn"][aria-pressed="true"] {
        background-color: var(--cq-tool-icon-active, #4a90d9);
        outline: 2px solid var(--cq-tool-icon-active, #4a90d9);
        outline-offset: 1px;
      }
      [part~="tool-btn"]:focus-visible {
        outline: 2px solid var(--cq-focus-ring, currentColor);
        outline-offset: 2px;
      }
    `;
    this._container = document.createElement('div');
    this._container.setAttribute('part', 'toolbar');
    this._container.setAttribute('role', 'toolbar');
    this._container.setAttribute('aria-label', 'Question tools');
    this._shadow.append(style, this._container);
  }

  set tools(value: ToolName[]) {
    this._tools = value;
    this._render();
  }

  get tools(): ToolName[] {
    return this._tools;
  }

  get activeTools(): Set<ToolName> {
    return new Set(this._active);
  }

  private _render(): void {
    this._container.replaceChildren();
    for (const tool of this._tools) {
      const btn = document.createElement('button');
      const suffix = TOOL_PART_SUFFIXES[tool];
      btn.setAttribute('part', `tool-btn tool-btn-${suffix}`);
      btn.setAttribute('type', 'button');
      btn.setAttribute('aria-label', TOOL_LABELS[tool]);
      btn.setAttribute('aria-pressed', String(this._active.has(tool)));
      btn.style.setProperty('-webkit-mask-image', TOOL_ICONS[tool]);
      btn.style.setProperty('mask-image', TOOL_ICONS[tool]);
      btn.addEventListener('click', () => this._toggle(tool));
      this._container.appendChild(btn);
    }
  }

  private _toggle(tool: ToolName): void {
    if (this._active.has(tool)) {
      this._active.delete(tool);
    } else {
      this._active.add(tool);
    }
    this._render();
    this.dispatchEvent(
      new CustomEvent('tool-toggled', {
        detail: { tool, active: this._active.has(tool) },
        bubbles: true,
        composed: true,
      }),
    );
  }
}

if (!customElements.get('choca-toolbar')) {
  customElements.define('choca-toolbar', ChocaToolbar);
}
```

- [ ] **Step 4: Run browser tests to verify they pass**

Run: `npx wtr tests/elements/ChocaToolbar.browser.test.ts`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add src/elements/ChocaToolbar.ts tests/elements/ChocaToolbar.browser.test.ts
git commit -m "feat(elements): add ChocaToolbar web component with toggle + mask-image icons"
```

---

## Phase 4: Integrate into ChocablocQuestion

### Task 7: Wire Toolbar and Input Mode into Dispatcher

**Files:**
- Modify: `src/elements/ChocablocQuestion.ts`

- [ ] **Step 1: Add toolbar + input-mode integration to ChocablocQuestion**

The dispatcher needs three changes:
1. Observe `whiteboard`, `calculator`, `place-value-chart` attributes
2. Render `ChocaToolbar` when any tool attribute is present
3. Route to `ChocaAnswerInput` when question has `answerMode: 'input'`
4. Track tools opened, include in `answered` event
5. Fire `tool-used` events

Replace the full content of `src/elements/ChocablocQuestion.ts`:

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

const TOOL_ATTRS: ToolName[] = ['whiteboard', 'calculator', 'place-value-chart'];

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
  const canvas = document.createElement('div');
  canvas.setAttribute('part', 'canvas');
  container.append(promptEl, canvas);
  fragment.append(style, container);
  return { fragment, promptEl };
}

export class ChocablocQuestion extends HTMLElement {
  private _shadow: ShadowRoot;
  private _question: NormalizedQuestion | null = null;
  private _toolsUsed: Set<ToolName> = new Set();

  static get observedAttributes(): string[] {
    return ['answer-mode', 'disabled', 'locale', 'seed', 'whiteboard', 'calculator', 'place-value-chart'];
  }

  constructor() {
    super();
    this._shadow = this.attachShadow({ mode: 'open' });
  }

  set question(q: NormalizedQuestion) {
    this._question = q;
    this._toolsUsed.clear();
    this._render();
  }

  get question(): NormalizedQuestion | null {
    return this._question;
  }

  attributeChangedCallback(): void {
    this._render();
  }

  private _getEnabledTools(): ToolName[] {
    return TOOL_ATTRS.filter((t) => this.hasAttribute(t));
  }

  private _render(): void {
    if (!this._question) return;
    while (this._shadow.firstChild) {
      this._shadow.removeChild(this._shadow.firstChild);
    }

    const enabledTools = this._getEnabledTools();
    if (enabledTools.length > 0) {
      this._renderToolbar(enabledTools);
    }

    if (this._question.format === 'money') {
      const inner = document.createElement('choca-coin-pile');
      inner.setAttribute('answer-mode', this.getAttribute('answer-mode') ?? 'mc');
      const seed = this.getAttribute('seed');
      if (seed !== null) inner.setAttribute('seed', seed);
      const locale = this.getAttribute('locale');
      if (locale !== null) inner.setAttribute('locale', locale);
      if (this.hasAttribute('disabled')) inner.setAttribute('disabled', '');
      (inner as HTMLElement & { question: MoneyQuestion }).question = this._question as MoneyQuestion;
      this._shadow.appendChild(inner);
      this._wireAnsweredEvent(inner);
      return;
    }
    if (this._question.format === 'text') {
      const { fragment, promptEl } = buildFallback();
      promptEl.textContent = this._question.content.stem;
      this._shadow.appendChild(fragment);
      return;
    }

    if (this._question.answerMode === 'input') {
      this._renderInputMode();
      return;
    }

    let tag: string;
    if (this._question.format === 'money_budget_adjust') {
      tag = 'choca-table-question';
    } else if (this._question.format === 'pattern') {
      tag = 'choca-pattern-question';
    } else if (this._question.format === 'multiplication' && this._question.imageType === 'number_line') {
      tag = 'choca-number-line-question';
    } else {
      tag = 'choca-canvas-question';
    }
    const inner = document.createElement(tag);
    inner.setAttribute('answer-mode', this.getAttribute('answer-mode') ?? 'mc');
    const seed = this.getAttribute('seed');
    if (seed !== null) inner.setAttribute('seed', seed);
    if (this.hasAttribute('disabled')) inner.setAttribute('disabled', '');
    (inner as HTMLElement & { question: NormalizedQuestion }).question = this._question;
    this._shadow.appendChild(inner);
    this._wireAnsweredEvent(inner);
  }

  private _renderToolbar(tools: ToolName[]): void {
    const toolbar = document.createElement('choca-toolbar') as HTMLElement & { tools: ToolName[] };
    toolbar.tools = tools;
    toolbar.addEventListener('tool-toggled', (e) => {
      const detail = (e as CustomEvent).detail as { tool: ToolName; active: boolean };
      if (detail.active) {
        this._toolsUsed.add(detail.tool);
      }
      this.dispatchEvent(
        new CustomEvent('tool-used', {
          detail: { tool: detail.tool, action: detail.active ? 'opened' : 'closed' },
          bubbles: true,
          composed: true,
        }),
      );
    });
    this._shadow.appendChild(toolbar);
  }

  private _renderInputMode(): void {
    if (!this._question) return;
    const q = this._question;

    const container = document.createElement('div');
    container.setAttribute('part', 'container');
    container.setAttribute('role', 'group');

    const style = document.createElement('style');
    style.textContent = `
      :host { display: block; font-family: var(--cq-font, system-ui, sans-serif); }
      [part="container"] {
        display: flex; flex-direction: column;
        gap: var(--cq-section-gap, 16px);
        padding: var(--cq-container-padding, 16px);
      }
      [part="prompt"] {
        font-size: var(--cq-prompt-size, 1rem);
        font-weight: var(--cq-prompt-weight, 600);
      }
    `;

    const promptEl = document.createElement('div');
    promptEl.setAttribute('part', 'prompt');
    promptEl.textContent = q.prompt ?? 'Enter your answer:';

    const inputEl = document.createElement('choca-answer-input') as HTMLElement & {
      format: string;
      showFeedback: (correct: boolean, expected?: AnswerValue) => void;
    };
    inputEl.format = q.format;
    if (this.hasAttribute('disabled')) inputEl.setAttribute('disabled', '');

    const renderedAt = performance.now();
    inputEl.addEventListener('submitted', (e) => {
      const { parsedValue, rawInput } = (e as CustomEvent).detail as {
        parsedValue: AnswerValue;
        rawInput: string;
      };
      void validateAnswer(q, parsedValue).then((verdict) => {
        const timeToAnswerMs = performance.now() - renderedAt;
        inputEl.showFeedback(verdict.correct, verdict.expected);
        this.dispatchEvent(
          new CustomEvent('answered', {
            detail: {
              questionId: q.id,
              studentAnswer: parsedValue,
              correct: verdict.correct,
              distractorMatched: verdict.distractorMatched,
              skillTags: verdict.skillTags,
              expected: verdict.expected,
              timeToAnswerMs,
              rawInput,
              ...(this._toolsUsed.size > 0
                ? { toolsUsed: Array.from(this._toolsUsed) }
                : {}),
            },
            bubbles: true,
            composed: true,
          }),
        );
      });
    });

    container.append(promptEl, inputEl);
    this._shadow.append(style, container);

    this.dispatchEvent(
      new CustomEvent('rendered', {
        detail: { renderedAt },
        bubbles: true,
        composed: true,
      }),
    );
  }

  private _wireAnsweredEvent(inner: HTMLElement): void {
    if (this._toolsUsed.size === 0) return;
    inner.addEventListener('answered', (e) => {
      const detail = (e as CustomEvent).detail;
      if (detail && typeof detail === 'object') {
        detail.toolsUsed = Array.from(this._toolsUsed);
      }
    });
  }
}

if (!customElements.get('chocabloc-question')) {
  customElements.define('chocabloc-question', ChocablocQuestion);
}
```

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 3: Run existing browser tests to check no regressions**

Run: `npx wtr tests/elements/ChocablocQuestion.browser.test.ts`
Expected: ALL PASS — existing dispatcher behavior unchanged

- [ ] **Step 4: Commit**

```bash
git add src/elements/ChocablocQuestion.ts
git commit -m "feat(dispatcher): integrate toolbar, input-mode routing, tool-used tracking"
```

---

### Task 8: Update Exports in `src/full.ts`

**Files:**
- Modify: `src/full.ts`

- [ ] **Step 1: Add new component exports**

Add to `src/full.ts`:

```typescript
export { ChocaToolbar } from './elements/ChocaToolbar';
export { ChocaAnswerInput } from './elements/ChocaAnswerInput';
```

And add side-effect imports:

```typescript
import './elements/ChocaToolbar';
import './elements/ChocaAnswerInput';
```

- [ ] **Step 2: Run build**

Run: `npm run build`
Expected: PASS — new exports included in full bundle

- [ ] **Step 3: Commit**

```bash
git add src/full.ts
git commit -m "feat(exports): add ChocaToolbar and ChocaAnswerInput to full bundle"
```

---

### Task 9: Update Size Limits

**Files:**
- Modify: `.size-limit.cjs`

- [ ] **Step 1: Bump full bundle limit**

Change the `full (everything)` entry limit from `'40 KB'` to `'45 KB'`:

```javascript
{
  name: 'full (everything)',
  path: 'dist/full.mjs',
  limit: '45 KB',
  gzip: true,
},
```

- [ ] **Step 2: Run size check**

Run: `npm run size`
Expected: PASS — within new 45 KB limit

- [ ] **Step 3: Commit**

```bash
git add .size-limit.cjs
git commit -m "chore: bump full bundle size limit to 45 KB for toolbar + input components"
```

---

## Phase 5: Whiteboard Component (Lazy-Loaded)

### Task 10: Create `ChocaWhiteboard` Web Component

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

async function frame(): Promise<void> {
  await new Promise((r) => requestAnimationFrame(r));
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('<choca-whiteboard> registration', () => {
  it('registers as custom element', () => {
    expect(customElements.get('choca-whiteboard')).to.not.be.undefined;
  });
});

describe('<choca-whiteboard> rendering', () => {
  it('renders a canvas element', async () => {
    const el = mount(`<choca-whiteboard></choca-whiteboard>`);
    await frame();
    const canvas = el.shadowRoot!.querySelector('[part="wb-canvas"]');
    expect(canvas).to.not.be.null;
    expect(canvas!.tagName.toLowerCase()).to.equal('canvas');
  });

  it('renders tool buttons (pen, eraser, undo, clear)', async () => {
    const el = mount(`<choca-whiteboard></choca-whiteboard>`);
    await frame();
    const toolBtns = el.shadowRoot!.querySelectorAll('[part~="wb-tool-btn"]');
    expect(toolBtns.length).to.be.at.least(4);
  });

  it('renders color buttons', async () => {
    const el = mount(`<choca-whiteboard></choca-whiteboard>`);
    await frame();
    const colorBtns = el.shadowRoot!.querySelectorAll('[part~="wb-color-btn"]');
    expect(colorBtns.length).to.be.at.least(4);
  });

  it('renders width buttons', async () => {
    const el = mount(`<choca-whiteboard></choca-whiteboard>`);
    await frame();
    const widthBtns = el.shadowRoot!.querySelectorAll('[part~="wb-width-btn"]');
    expect(widthBtns.length).to.be.at.least(2);
  });
});

describe('<choca-whiteboard> tools', () => {
  it('pen is default active tool', async () => {
    const el = mount(`<choca-whiteboard></choca-whiteboard>`) as HTMLElement & { activeTool: string };
    await frame();
    expect(el.activeTool).to.equal('pen');
  });

  it('switching to eraser changes active tool', async () => {
    const el = mount(`<choca-whiteboard></choca-whiteboard>`) as HTMLElement & { activeTool: string };
    await frame();
    const eraserBtn = Array.from(el.shadowRoot!.querySelectorAll('[part~="wb-tool-btn"]'))
      .find((b) => b.getAttribute('data-tool') === 'eraser') as HTMLButtonElement;
    eraserBtn.click();
    expect(el.activeTool).to.equal('eraser');
  });

  it('clear removes all strokes', async () => {
    const el = mount(`<choca-whiteboard></choca-whiteboard>`) as HTMLElement & { strokeCount: number };
    await frame();
    const canvas = el.shadowRoot!.querySelector('[part="wb-canvas"]') as HTMLCanvasElement;
    // Simulate a stroke via pointerdown + pointermove + pointerup
    canvas.dispatchEvent(new PointerEvent('pointerdown', { clientX: 10, clientY: 10, bubbles: true }));
    canvas.dispatchEvent(new PointerEvent('pointermove', { clientX: 50, clientY: 50, bubbles: true }));
    canvas.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
    expect(el.strokeCount).to.be.at.least(1);
    const clearBtn = Array.from(el.shadowRoot!.querySelectorAll('[part~="wb-tool-btn"]'))
      .find((b) => b.getAttribute('data-tool') === 'clear') as HTMLButtonElement;
    clearBtn.click();
    // Clear requires confirmation (double-click)
    clearBtn.click();
    expect(el.strokeCount).to.equal(0);
  });

  it('undo removes last stroke', async () => {
    const el = mount(`<choca-whiteboard></choca-whiteboard>`) as HTMLElement & { strokeCount: number };
    await frame();
    const canvas = el.shadowRoot!.querySelector('[part="wb-canvas"]') as HTMLCanvasElement;
    canvas.dispatchEvent(new PointerEvent('pointerdown', { clientX: 10, clientY: 10, bubbles: true }));
    canvas.dispatchEvent(new PointerEvent('pointermove', { clientX: 50, clientY: 50, bubbles: true }));
    canvas.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
    canvas.dispatchEvent(new PointerEvent('pointerdown', { clientX: 60, clientY: 10, bubbles: true }));
    canvas.dispatchEvent(new PointerEvent('pointermove', { clientX: 100, clientY: 50, bubbles: true }));
    canvas.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
    expect(el.strokeCount).to.equal(2);
    const undoBtn = Array.from(el.shadowRoot!.querySelectorAll('[part~="wb-tool-btn"]'))
      .find((b) => b.getAttribute('data-tool') === 'undo') as HTMLButtonElement;
    undoBtn.click();
    expect(el.strokeCount).to.equal(1);
  });
});

describe('<choca-whiteboard> clear on question change', () => {
  it('clear() method resets strokes', async () => {
    const el = mount(`<choca-whiteboard></choca-whiteboard>`) as HTMLElement & {
      strokeCount: number;
      clear: () => void;
    };
    await frame();
    const canvas = el.shadowRoot!.querySelector('[part="wb-canvas"]') as HTMLCanvasElement;
    canvas.dispatchEvent(new PointerEvent('pointerdown', { clientX: 10, clientY: 10, bubbles: true }));
    canvas.dispatchEvent(new PointerEvent('pointermove', { clientX: 50, clientY: 50, bubbles: true }));
    canvas.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
    expect(el.strokeCount).to.be.at.least(1);
    el.clear();
    expect(el.strokeCount).to.equal(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx wtr tests/elements/ChocaWhiteboard.browser.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement `src/elements/ChocaWhiteboard.ts`**

```typescript
type Point = { x: number; y: number };
type Stroke = {
  points: Point[];
  color: string;
  width: number;
  tool: 'pen' | 'eraser';
};

const COLORS = ['#222', '#e74c3c', '#2980b9', '#27ae60', '#f39c12'];
const WIDTHS = [2, 4, 8];
const WB_W = 400;
const WB_H = 250;

export class ChocaWhiteboard extends HTMLElement {
  private _shadow: ShadowRoot;
  private _canvas!: HTMLCanvasElement;
  private _strokes: Stroke[] = [];
  private _currentStroke: Stroke | null = null;
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

  clear(): void {
    this._strokes = [];
    this._redraw();
  }

  private _build(): void {
    const style = document.createElement('style');
    style.textContent = `
      :host { display: block; }
      [part="wb-panel"] {
        background: var(--cq-tool-bg, #fff);
        border: var(--cq-tool-border, 1px solid #ccc);
        border-radius: var(--cq-tool-radius, 8px);
        padding: 8px;
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .toolbar-row {
        display: flex;
        gap: 4px;
        align-items: center;
        flex-wrap: wrap;
      }
      [part~="wb-tool-btn"], [part~="wb-color-btn"], [part~="wb-width-btn"] {
        background: var(--cq-tool-btn-bg, #f0f0f0);
        color: var(--cq-tool-btn-color, #222);
        border: 1px solid #ccc;
        border-radius: var(--cq-tool-btn-radius, 4px);
        font-family: var(--cq-tool-btn-font, inherit);
        font-size: var(--cq-tool-btn-size, 0.85rem);
        padding: 4px 8px;
        cursor: pointer;
      }
      [part~="wb-tool-btn"][aria-pressed="true"],
      [part~="wb-color-btn"][aria-pressed="true"],
      [part~="wb-width-btn"][aria-pressed="true"] {
        outline: 2px solid var(--cq-tool-icon-active, #4a90d9);
        outline-offset: 1px;
      }
      [part="wb-canvas"] {
        border: 1px solid #ddd;
        border-radius: 4px;
        cursor: crosshair;
        touch-action: none;
      }
    `;

    const panel = document.createElement('div');
    panel.setAttribute('part', 'wb-panel');

    const toolRow = document.createElement('div');
    toolRow.className = 'toolbar-row';

    for (const tool of ['pen', 'eraser', 'undo', 'clear'] as const) {
      const btn = document.createElement('button');
      btn.setAttribute('part', 'wb-tool-btn');
      btn.setAttribute('type', 'button');
      btn.setAttribute('data-tool', tool);
      btn.textContent = tool.charAt(0).toUpperCase() + tool.slice(1);
      if (tool === 'pen' || tool === 'eraser') {
        btn.setAttribute('aria-pressed', String(this._tool === tool));
      }
      btn.addEventListener('click', () => this._onToolClick(tool));
      toolRow.appendChild(btn);
    }
    panel.appendChild(toolRow);

    const colorRow = document.createElement('div');
    colorRow.className = 'toolbar-row';
    for (const color of COLORS) {
      const btn = document.createElement('button');
      btn.setAttribute('part', 'wb-color-btn');
      btn.setAttribute('type', 'button');
      btn.style.backgroundColor = color;
      btn.style.width = '24px';
      btn.style.height = '24px';
      btn.style.minWidth = '24px';
      btn.setAttribute('aria-label', color);
      btn.setAttribute('aria-pressed', String(this._color === color));
      btn.addEventListener('click', () => {
        this._color = color;
        this._updateColorButtons();
      });
      colorRow.appendChild(btn);
    }
    panel.appendChild(colorRow);

    const widthRow = document.createElement('div');
    widthRow.className = 'toolbar-row';
    for (const w of WIDTHS) {
      const btn = document.createElement('button');
      btn.setAttribute('part', 'wb-width-btn');
      btn.setAttribute('type', 'button');
      btn.textContent = `${w}px`;
      btn.setAttribute('aria-pressed', String(this._width === w));
      btn.addEventListener('click', () => {
        this._width = w;
        this._updateWidthButtons();
      });
      widthRow.appendChild(btn);
    }
    panel.appendChild(widthRow);

    this._canvas = document.createElement('canvas');
    this._canvas.setAttribute('part', 'wb-canvas');
    this._canvas.width = WB_W;
    this._canvas.height = WB_H;
    this._canvas.addEventListener('pointerdown', (e) => this._onPointerDown(e));
    this._canvas.addEventListener('pointermove', (e) => this._onPointerMove(e));
    this._canvas.addEventListener('pointerup', () => this._onPointerUp());
    this._canvas.addEventListener('pointerleave', () => this._onPointerUp());
    panel.appendChild(this._canvas);

    this._shadow.append(style, panel);
  }

  private _onToolClick(tool: 'pen' | 'eraser' | 'undo' | 'clear'): void {
    if (tool === 'undo') {
      this._strokes.pop();
      this._redraw();
      return;
    }
    if (tool === 'clear') {
      if (this._clearPending) {
        this._strokes = [];
        this._redraw();
        this._clearPending = false;
      } else {
        this._clearPending = true;
        setTimeout(() => { this._clearPending = false; }, 1000);
      }
      return;
    }
    this._tool = tool;
    this._updateToolButtons();
  }

  private _updateToolButtons(): void {
    const btns = this._shadow.querySelectorAll('[part~="wb-tool-btn"]');
    btns.forEach((b) => {
      const t = b.getAttribute('data-tool');
      if (t === 'pen' || t === 'eraser') {
        b.setAttribute('aria-pressed', String(this._tool === t));
      }
    });
  }

  private _updateColorButtons(): void {
    const btns = this._shadow.querySelectorAll('[part~="wb-color-btn"]');
    btns.forEach((b) => {
      b.setAttribute('aria-pressed', String((b as HTMLElement).style.backgroundColor === this._color));
    });
  }

  private _updateWidthButtons(): void {
    const btns = this._shadow.querySelectorAll('[part~="wb-width-btn"]');
    btns.forEach((b) => {
      b.setAttribute('aria-pressed', String(b.textContent === `${this._width}px`));
    });
  }

  private _getCanvasPoint(e: PointerEvent): Point {
    const rect = this._canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (this._canvas.width / rect.width),
      y: (e.clientY - rect.top) * (this._canvas.height / rect.height),
    };
  }

  private _onPointerDown(e: PointerEvent): void {
    this._canvas.setPointerCapture(e.pointerId);
    const pt = this._getCanvasPoint(e);
    this._currentStroke = {
      points: [pt],
      color: this._color,
      width: this._width,
      tool: this._tool,
    };
  }

  private _onPointerMove(e: PointerEvent): void {
    if (!this._currentStroke) return;
    const pt = this._getCanvasPoint(e);
    this._currentStroke.points.push(pt);
    this._redraw();
    this._drawStroke(this._currentStroke);
  }

  private _onPointerUp(): void {
    if (this._currentStroke && this._currentStroke.points.length > 1) {
      this._strokes.push(this._currentStroke);
    }
    this._currentStroke = null;
    this._redraw();
  }

  private _redraw(): void {
    const ctx = this._canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, this._canvas.width, this._canvas.height);
    for (const stroke of this._strokes) {
      this._drawStroke(stroke);
    }
  }

  private _drawStroke(stroke: Stroke): void {
    const ctx = this._canvas.getContext('2d');
    if (!ctx || stroke.points.length < 2) return;
    ctx.save();
    ctx.lineWidth = stroke.width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (stroke.tool === 'eraser') {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.strokeStyle = 'rgba(0,0,0,1)';
    } else {
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = stroke.color;
    }
    ctx.beginPath();
    ctx.moveTo(stroke.points[0]!.x, stroke.points[0]!.y);
    for (let i = 1; i < stroke.points.length; i++) {
      ctx.lineTo(stroke.points[i]!.x, stroke.points[i]!.y);
    }
    ctx.stroke();
    ctx.restore();
  }
}

if (!customElements.get('choca-whiteboard')) {
  customElements.define('choca-whiteboard', ChocaWhiteboard);
}
```

- [ ] **Step 4: Run browser tests to verify they pass**

Run: `npx wtr tests/elements/ChocaWhiteboard.browser.test.ts`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add src/elements/ChocaWhiteboard.ts tests/elements/ChocaWhiteboard.browser.test.ts
git commit -m "feat(elements): add ChocaWhiteboard freehand drawing component"
```

---

## Phase 6: Calculator Component (Lazy-Loaded)

### Task 11: Create `ChocaCalculator` Web Component

**Files:**
- Create: `src/elements/ChocaCalculator.ts`
- Create: `tests/elements/ChocaCalculator.browser.test.ts`

- [ ] **Step 1: Write browser tests**

Create `tests/elements/ChocaCalculator.browser.test.ts`:

```typescript
import { expect } from '@esm-bundle/chai';
import '../../src/elements/ChocaCalculator';

function mount(html: string): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.innerHTML = html;
  document.body.appendChild(wrapper);
  return wrapper.firstElementChild as HTMLElement;
}

async function frame(): Promise<void> {
  await new Promise((r) => requestAnimationFrame(r));
}

function clickKey(el: HTMLElement, label: string): void {
  const keys = el.shadowRoot!.querySelectorAll('[part~="calc-key"]');
  const key = Array.from(keys).find((k) => k.textContent?.trim() === label) as HTMLButtonElement;
  if (!key) throw new Error(`Key "${label}" not found`);
  key.click();
}

function getDisplay(el: HTMLElement): string {
  const display = el.shadowRoot!.querySelector('[part="calc-display"]') as HTMLElement;
  return display.textContent?.trim() ?? '';
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('<choca-calculator> registration', () => {
  it('registers as custom element', () => {
    expect(customElements.get('choca-calculator')).to.not.be.undefined;
  });
});

describe('<choca-calculator> rendering', () => {
  it('renders display and keys', async () => {
    const el = mount(`<choca-calculator></choca-calculator>`);
    await frame();
    const display = el.shadowRoot!.querySelector('[part="calc-display"]');
    const keys = el.shadowRoot!.querySelectorAll('[part~="calc-key"]');
    expect(display).to.not.be.null;
    expect(keys.length).to.be.at.least(16);
  });

  it('renders number keys 0-9', async () => {
    const el = mount(`<choca-calculator></choca-calculator>`);
    await frame();
    for (let i = 0; i <= 9; i++) {
      const numKeys = el.shadowRoot!.querySelectorAll('[part~="calc-key-num"]');
      const found = Array.from(numKeys).some((k) => k.textContent?.trim() === String(i));
      expect(found, `Number key ${i} should exist`).to.be.true;
    }
  });

  it('renders operation keys', async () => {
    const el = mount(`<choca-calculator></choca-calculator>`);
    await frame();
    const opKeys = el.shadowRoot!.querySelectorAll('[part~="calc-key-op"]');
    expect(opKeys.length).to.equal(4);
  });

  it('renders memory keys', async () => {
    const el = mount(`<choca-calculator></choca-calculator>`);
    await frame();
    const memKeys = el.shadowRoot!.querySelectorAll('[part~="calc-key-mem"]');
    expect(memKeys.length).to.equal(4);
  });
});

describe('<choca-calculator> operations', () => {
  it('displays typed number', async () => {
    const el = mount(`<choca-calculator></choca-calculator>`);
    await frame();
    clickKey(el, '4');
    clickKey(el, '2');
    expect(getDisplay(el)).to.equal('42');
  });

  it('adds two numbers', async () => {
    const el = mount(`<choca-calculator></choca-calculator>`);
    await frame();
    clickKey(el, '5');
    clickKey(el, '+');
    clickKey(el, '3');
    clickKey(el, '=');
    expect(getDisplay(el)).to.equal('8');
  });

  it('subtracts', async () => {
    const el = mount(`<choca-calculator></choca-calculator>`);
    await frame();
    clickKey(el, '9');
    clickKey(el, '−');
    clickKey(el, '4');
    clickKey(el, '=');
    expect(getDisplay(el)).to.equal('5');
  });

  it('multiplies', async () => {
    const el = mount(`<choca-calculator></choca-calculator>`);
    await frame();
    clickKey(el, '6');
    clickKey(el, '×');
    clickKey(el, '7');
    clickKey(el, '=');
    expect(getDisplay(el)).to.equal('42');
  });

  it('divides', async () => {
    const el = mount(`<choca-calculator></choca-calculator>`);
    await frame();
    clickKey(el, '8');
    clickKey(el, '÷');
    clickKey(el, '2');
    clickKey(el, '=');
    expect(getDisplay(el)).to.equal('4');
  });

  it('clears display', async () => {
    const el = mount(`<choca-calculator></choca-calculator>`);
    await frame();
    clickKey(el, '5');
    clickKey(el, 'C');
    expect(getDisplay(el)).to.equal('0');
  });

  it('backspace removes last digit', async () => {
    const el = mount(`<choca-calculator></choca-calculator>`);
    await frame();
    clickKey(el, '4');
    clickKey(el, '2');
    clickKey(el, '⌫');
    expect(getDisplay(el)).to.equal('4');
  });

  it('handles decimal point', async () => {
    const el = mount(`<choca-calculator></choca-calculator>`);
    await frame();
    clickKey(el, '3');
    clickKey(el, '.');
    clickKey(el, '5');
    clickKey(el, '+');
    clickKey(el, '1');
    clickKey(el, '.');
    clickKey(el, '5');
    clickKey(el, '=');
    expect(getDisplay(el)).to.equal('5');
  });
});

describe('<choca-calculator> memory', () => {
  it('M+ stores and MR recalls', async () => {
    const el = mount(`<choca-calculator></choca-calculator>`);
    await frame();
    clickKey(el, '5');
    clickKey(el, 'M+');
    clickKey(el, 'C');
    clickKey(el, 'MR');
    expect(getDisplay(el)).to.equal('5');
  });

  it('M− subtracts from memory', async () => {
    const el = mount(`<choca-calculator></choca-calculator>`);
    await frame();
    clickKey(el, '5');
    clickKey(el, 'M+');
    clickKey(el, 'C');
    clickKey(el, '2');
    clickKey(el, 'M−');
    clickKey(el, 'C');
    clickKey(el, 'MR');
    expect(getDisplay(el)).to.equal('3');
  });

  it('MC clears memory', async () => {
    const el = mount(`<choca-calculator></choca-calculator>`);
    await frame();
    clickKey(el, '5');
    clickKey(el, 'M+');
    clickKey(el, 'MC');
    clickKey(el, 'C');
    clickKey(el, 'MR');
    expect(getDisplay(el)).to.equal('0');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx wtr tests/elements/ChocaCalculator.browser.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement `src/elements/ChocaCalculator.ts`**

```typescript
type Op = '+' | '-' | '*' | '/';

const OP_LABELS: Record<Op, string> = { '+': '+', '-': '−', '*': '×', '/': '÷' };
const LABEL_TO_OP: Record<string, Op> = { '+': '+', '−': '-', '×': '*', '÷': '/' };

export class ChocaCalculator extends HTMLElement {
  private _shadow: ShadowRoot;
  private _displayEl!: HTMLElement;
  private _current = '0';
  private _prev: number | null = null;
  private _op: Op | null = null;
  private _fresh = true;
  private _memory = 0;

  constructor() {
    super();
    this._shadow = this.attachShadow({ mode: 'open' });
    this._build();
  }

  private _build(): void {
    const style = document.createElement('style');
    style.textContent = `
      :host { display: block; }
      [part="calc-panel"] {
        background: var(--cq-tool-bg, #fff);
        border: var(--cq-tool-border, 1px solid #ccc);
        border-radius: var(--cq-tool-radius, 8px);
        padding: 8px;
        display: inline-flex;
        flex-direction: column;
        gap: 4px;
        min-width: 200px;
      }
      [part="calc-display"] {
        background: #f9f9f9;
        border: 1px solid #ddd;
        border-radius: 4px;
        padding: 8px 12px;
        font-size: 1.25rem;
        font-family: var(--cq-tool-btn-font, monospace);
        text-align: right;
        min-height: 1.5em;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .key-grid {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 4px;
      }
      [part~="calc-key"] {
        font-family: var(--cq-tool-btn-font, inherit);
        font-size: var(--cq-tool-btn-size, 1rem);
        padding: 8px;
        background: var(--cq-tool-btn-bg, #f0f0f0);
        color: var(--cq-tool-btn-color, #222);
        border: 1px solid #ccc;
        border-radius: var(--cq-tool-btn-radius, 4px);
        cursor: pointer;
        text-align: center;
      }
      [part~="calc-key-op"] { background: #e8e8e8; }
      [part~="calc-key-mem"] { background: #e0e8f0; font-size: 0.75rem; }
      [part~="calc-key-action"] { background: #ffe0e0; }
    `;

    const panel = document.createElement('div');
    panel.setAttribute('part', 'calc-panel');

    this._displayEl = document.createElement('div');
    this._displayEl.setAttribute('part', 'calc-display');
    this._displayEl.setAttribute('aria-live', 'polite');
    this._displayEl.textContent = '0';
    panel.appendChild(this._displayEl);

    const grid = document.createElement('div');
    grid.className = 'key-grid';

    const memRow: [string, string][] = [
      ['MC', 'calc-key calc-key-mem'],
      ['MR', 'calc-key calc-key-mem'],
      ['M−', 'calc-key calc-key-mem'],
      ['M+', 'calc-key calc-key-mem'],
    ];
    const rows: [string, string][][] = [
      memRow,
      [['C', 'calc-key calc-key-action'], ['⌫', 'calc-key calc-key-action'], ['÷', 'calc-key calc-key-op'], ['×', 'calc-key calc-key-op']],
      [['7', 'calc-key calc-key-num'], ['8', 'calc-key calc-key-num'], ['9', 'calc-key calc-key-num'], ['−', 'calc-key calc-key-op']],
      [['4', 'calc-key calc-key-num'], ['5', 'calc-key calc-key-num'], ['6', 'calc-key calc-key-num'], ['+', 'calc-key calc-key-op']],
      [['1', 'calc-key calc-key-num'], ['2', 'calc-key calc-key-num'], ['3', 'calc-key calc-key-num'], ['=', 'calc-key calc-key-action']],
      [['0', 'calc-key calc-key-num'], ['.', 'calc-key calc-key-num'], ['', ''], ['', '']],
    ];

    for (const row of rows) {
      for (const [label, parts] of row) {
        if (!label) {
          const spacer = document.createElement('div');
          grid.appendChild(spacer);
          continue;
        }
        const btn = document.createElement('button');
        btn.setAttribute('part', parts);
        btn.setAttribute('type', 'button');
        btn.textContent = label;
        btn.addEventListener('click', () => this._onKey(label));
        grid.appendChild(btn);
      }
    }
    panel.appendChild(grid);
    this._shadow.append(style, panel);
  }

  private _updateDisplay(): void {
    this._displayEl.textContent = this._current;
  }

  private _onKey(label: string): void {
    if (label >= '0' && label <= '9') {
      if (this._fresh) {
        this._current = label;
        this._fresh = false;
      } else {
        this._current = this._current === '0' ? label : this._current + label;
      }
      this._updateDisplay();
      return;
    }

    if (label === '.') {
      if (this._fresh) {
        this._current = '0.';
        this._fresh = false;
      } else if (!this._current.includes('.')) {
        this._current += '.';
      }
      this._updateDisplay();
      return;
    }

    if (label === 'C') {
      this._current = '0';
      this._prev = null;
      this._op = null;
      this._fresh = true;
      this._updateDisplay();
      return;
    }

    if (label === '⌫') {
      if (this._current.length > 1) {
        this._current = this._current.slice(0, -1);
      } else {
        this._current = '0';
      }
      this._updateDisplay();
      return;
    }

    const opKey = LABEL_TO_OP[label];
    if (opKey) {
      if (this._prev !== null && this._op && !this._fresh) {
        this._evaluate();
      }
      this._prev = parseFloat(this._current);
      this._op = opKey;
      this._fresh = true;
      return;
    }

    if (label === '=') {
      this._evaluate();
      this._op = null;
      this._fresh = true;
      return;
    }

    if (label === 'M+') {
      this._memory += parseFloat(this._current);
      this._fresh = true;
      return;
    }
    if (label === 'M−') {
      this._memory -= parseFloat(this._current);
      this._fresh = true;
      return;
    }
    if (label === 'MR') {
      this._current = this._formatResult(this._memory);
      this._fresh = true;
      this._updateDisplay();
      return;
    }
    if (label === 'MC') {
      this._memory = 0;
      return;
    }
  }

  private _evaluate(): void {
    if (this._prev === null || !this._op) return;
    const b = parseFloat(this._current);
    let result: number;
    switch (this._op) {
      case '+': result = this._prev + b; break;
      case '-': result = this._prev - b; break;
      case '*': result = this._prev * b; break;
      case '/': result = b === 0 ? 0 : this._prev / b; break;
    }
    this._current = this._formatResult(result);
    this._prev = result;
    this._updateDisplay();
  }

  private _formatResult(n: number): string {
    if (Number.isInteger(n)) return String(n);
    const s = n.toPrecision(10);
    return parseFloat(s).toString();
  }
}

if (!customElements.get('choca-calculator')) {
  customElements.define('choca-calculator', ChocaCalculator);
}
```

- [ ] **Step 4: Run browser tests to verify they pass**

Run: `npx wtr tests/elements/ChocaCalculator.browser.test.ts`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add src/elements/ChocaCalculator.ts tests/elements/ChocaCalculator.browser.test.ts
git commit -m "feat(elements): add ChocaCalculator four-function + memory component"
```

---

## Phase 7: Place Value Chart Component (Lazy-Loaded)

### Task 12: Create `ChocaPlaceValueChart` Web Component

**Files:**
- Create: `src/elements/ChocaPlaceValueChart.ts`
- Create: `tests/elements/ChocaPlaceValueChart.browser.test.ts`

- [ ] **Step 1: Write browser tests**

Create `tests/elements/ChocaPlaceValueChart.browser.test.ts`:

```typescript
import { expect } from '@esm-bundle/chai';
import '../../src/elements/ChocaPlaceValueChart';

function mount(html: string): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.innerHTML = html;
  document.body.appendChild(wrapper);
  return wrapper.firstElementChild as HTMLElement;
}

async function frame(): Promise<void> {
  await new Promise((r) => requestAnimationFrame(r));
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('<choca-place-value-chart> registration', () => {
  it('registers as custom element', () => {
    expect(customElements.get('choca-place-value-chart')).to.not.be.undefined;
  });
});

describe('<choca-place-value-chart> rendering', () => {
  it('renders default columns (Hundreds, Tens, Ones)', async () => {
    const el = mount(`<choca-place-value-chart></choca-place-value-chart>`);
    await frame();
    const headers = el.shadowRoot!.querySelectorAll('[part~="pvc-header"] th');
    expect(headers.length).to.equal(3);
    expect(headers[0]!.textContent).to.equal('Hundreds');
    expect(headers[1]!.textContent).to.equal('Tens');
    expect(headers[2]!.textContent).to.equal('Ones');
  });

  it('renders money columns when mode=money', async () => {
    const el = mount(`<choca-place-value-chart></choca-place-value-chart>`) as HTMLElement & { mode: string };
    el.mode = 'money';
    await frame();
    const headers = el.shadowRoot!.querySelectorAll('[part~="pvc-header"] th');
    expect(headers[0]!.textContent).to.equal('Dollars');
    expect(headers[1]!.textContent).to.equal('Dimes');
    expect(headers[2]!.textContent).to.equal('Pennies');
  });

  it('renders thousands column when mode=thousands', async () => {
    const el = mount(`<choca-place-value-chart></choca-place-value-chart>`) as HTMLElement & { mode: string };
    el.mode = 'thousands';
    await frame();
    const headers = el.shadowRoot!.querySelectorAll('[part~="pvc-header"] th');
    expect(headers.length).to.equal(4);
    expect(headers[0]!.textContent).to.equal('Thousands');
  });

  it('renders +/- buttons per column', async () => {
    const el = mount(`<choca-place-value-chart></choca-place-value-chart>`);
    await frame();
    const addBtns = el.shadowRoot!.querySelectorAll('[part~="pvc-btn"][data-action="add"]');
    const subBtns = el.shadowRoot!.querySelectorAll('[part~="pvc-btn"][data-action="sub"]');
    expect(addBtns.length).to.equal(3);
    expect(subBtns.length).to.equal(3);
  });

  it('renders total display', async () => {
    const el = mount(`<choca-place-value-chart></choca-place-value-chart>`);
    await frame();
    const total = el.shadowRoot!.querySelector('[part="pvc-total"]');
    expect(total).to.not.be.null;
    expect(total!.textContent).to.contain('0');
  });
});

describe('<choca-place-value-chart> interaction', () => {
  it('+ button increments counter and updates total', async () => {
    const el = mount(`<choca-place-value-chart></choca-place-value-chart>`);
    await frame();
    const addBtns = el.shadowRoot!.querySelectorAll('[part~="pvc-btn"][data-action="add"]');
    const onesAdd = addBtns[2] as HTMLButtonElement;
    onesAdd.click();
    onesAdd.click();
    onesAdd.click();
    await frame();
    const total = el.shadowRoot!.querySelector('[part="pvc-total"]') as HTMLElement;
    expect(total.textContent).to.contain('3');
  });

  it('- button decrements counter (min 0)', async () => {
    const el = mount(`<choca-place-value-chart></choca-place-value-chart>`);
    await frame();
    const addBtns = el.shadowRoot!.querySelectorAll('[part~="pvc-btn"][data-action="add"]');
    const subBtns = el.shadowRoot!.querySelectorAll('[part~="pvc-btn"][data-action="sub"]');
    (addBtns[2] as HTMLButtonElement).click();
    (addBtns[2] as HTMLButtonElement).click();
    (subBtns[2] as HTMLButtonElement).click();
    await frame();
    const total = el.shadowRoot!.querySelector('[part="pvc-total"]') as HTMLElement;
    expect(total.textContent).to.contain('1');
  });

  it('cannot go below zero', async () => {
    const el = mount(`<choca-place-value-chart></choca-place-value-chart>`);
    await frame();
    const subBtns = el.shadowRoot!.querySelectorAll('[part~="pvc-btn"][data-action="sub"]');
    (subBtns[2] as HTMLButtonElement).click();
    await frame();
    const total = el.shadowRoot!.querySelector('[part="pvc-total"]') as HTMLElement;
    expect(total.textContent).to.contain('0');
  });

  it('hundreds column adds 100 to total', async () => {
    const el = mount(`<choca-place-value-chart></choca-place-value-chart>`);
    await frame();
    const addBtns = el.shadowRoot!.querySelectorAll('[part~="pvc-btn"][data-action="add"]');
    (addBtns[0] as HTMLButtonElement).click();
    await frame();
    const total = el.shadowRoot!.querySelector('[part="pvc-total"]') as HTMLElement;
    expect(total.textContent).to.contain('100');
  });

  it('tens column adds 10 to total', async () => {
    const el = mount(`<choca-place-value-chart></choca-place-value-chart>`);
    await frame();
    const addBtns = el.shadowRoot!.querySelectorAll('[part~="pvc-btn"][data-action="add"]');
    (addBtns[1] as HTMLButtonElement).click();
    await frame();
    const total = el.shadowRoot!.querySelector('[part="pvc-total"]') as HTMLElement;
    expect(total.textContent).to.contain('10');
  });

  it('renders counter dots', async () => {
    const el = mount(`<choca-place-value-chart></choca-place-value-chart>`);
    await frame();
    const addBtns = el.shadowRoot!.querySelectorAll('[part~="pvc-btn"][data-action="add"]');
    (addBtns[2] as HTMLButtonElement).click();
    (addBtns[2] as HTMLButtonElement).click();
    await frame();
    const counters = el.shadowRoot!.querySelectorAll('[part~="pvc-counter"]');
    expect(counters.length).to.equal(2);
  });
});

describe('<choca-place-value-chart> clear', () => {
  it('clear() resets all columns to 0', async () => {
    const el = mount(`<choca-place-value-chart></choca-place-value-chart>`) as HTMLElement & {
      clear: () => void;
    };
    await frame();
    const addBtns = el.shadowRoot!.querySelectorAll('[part~="pvc-btn"][data-action="add"]');
    (addBtns[0] as HTMLButtonElement).click();
    (addBtns[1] as HTMLButtonElement).click();
    (addBtns[2] as HTMLButtonElement).click();
    await frame();
    el.clear();
    await frame();
    const total = el.shadowRoot!.querySelector('[part="pvc-total"]') as HTMLElement;
    expect(total.textContent).to.contain('0');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx wtr tests/elements/ChocaPlaceValueChart.browser.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement `src/elements/ChocaPlaceValueChart.ts`**

```typescript
type ColumnDef = { label: string; value: number };

const DEFAULT_COLUMNS: ColumnDef[] = [
  { label: 'Hundreds', value: 100 },
  { label: 'Tens', value: 10 },
  { label: 'Ones', value: 1 },
];

const MONEY_COLUMNS: ColumnDef[] = [
  { label: 'Dollars', value: 100 },
  { label: 'Dimes', value: 10 },
  { label: 'Pennies', value: 1 },
];

const THOUSANDS_COLUMNS: ColumnDef[] = [
  { label: 'Thousands', value: 1000 },
  { label: 'Hundreds', value: 100 },
  { label: 'Tens', value: 10 },
  { label: 'Ones', value: 1 },
];

export class ChocaPlaceValueChart extends HTMLElement {
  private _shadow: ShadowRoot;
  private _mode = 'default';
  private _columns: ColumnDef[] = DEFAULT_COLUMNS;
  private _counts: number[] = [];
  private _container!: HTMLElement;

  constructor() {
    super();
    this._shadow = this.attachShadow({ mode: 'open' });
    this._initCounts();
    this._build();
  }

  set mode(m: string) {
    this._mode = m;
    if (m === 'money') this._columns = MONEY_COLUMNS;
    else if (m === 'thousands') this._columns = THOUSANDS_COLUMNS;
    else this._columns = DEFAULT_COLUMNS;
    this._initCounts();
    this._render();
  }

  get mode(): string { return this._mode; }

  clear(): void {
    this._initCounts();
    this._render();
  }

  private _initCounts(): void {
    this._counts = new Array(this._columns.length).fill(0) as number[];
  }

  private _getTotal(): number {
    let total = 0;
    for (let i = 0; i < this._columns.length; i++) {
      total += (this._counts[i] ?? 0) * this._columns[i]!.value;
    }
    return total;
  }

  private _build(): void {
    const style = document.createElement('style');
    style.textContent = `
      :host { display: block; }
      [part="pvc-panel"] {
        background: var(--cq-tool-bg, #fff);
        border: var(--cq-tool-border, 1px solid #ccc);
        border-radius: var(--cq-tool-radius, 8px);
        padding: 12px;
      }
      table { width: 100%; border-collapse: collapse; }
      th, td {
        text-align: center;
        padding: 4px 8px;
        border: 1px solid #ddd;
        vertical-align: top;
      }
      th { font-size: 0.85rem; font-weight: 600; }
      [part~="pvc-btn"] {
        font-family: var(--cq-tool-btn-font, inherit);
        font-size: var(--cq-tool-btn-size, 1rem);
        background: var(--cq-tool-btn-bg, #f0f0f0);
        color: var(--cq-tool-btn-color, #222);
        border: 1px solid #ccc;
        border-radius: var(--cq-tool-btn-radius, 4px);
        padding: 2px 10px;
        cursor: pointer;
        margin: 2px;
      }
      .counter-area {
        min-height: 40px;
        display: flex;
        flex-wrap: wrap;
        gap: 4px;
        justify-content: center;
        padding: 4px;
      }
      [part~="pvc-counter"] {
        width: 12px;
        height: 12px;
        border-radius: 50%;
        background: #4a90d9;
        display: inline-block;
      }
      [part="pvc-total"] {
        text-align: center;
        font-weight: 600;
        font-size: 1.1rem;
        padding: 8px;
        margin-top: 8px;
      }
    `;

    this._container = document.createElement('div');
    this._container.setAttribute('part', 'pvc-panel');

    this._shadow.append(style, this._container);
    this._render();
  }

  private _render(): void {
    this._container.replaceChildren();

    const table = document.createElement('table');

    const headerRow = document.createElement('tr');
    headerRow.setAttribute('part', 'pvc-header');
    for (const col of this._columns) {
      const th = document.createElement('th');
      th.textContent = col.label;
      headerRow.appendChild(th);
    }
    const thead = document.createElement('thead');
    thead.appendChild(headerRow);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');

    const btnRow = document.createElement('tr');
    for (let i = 0; i < this._columns.length; i++) {
      const td = document.createElement('td');
      const addBtn = document.createElement('button');
      addBtn.setAttribute('part', 'pvc-btn');
      addBtn.setAttribute('data-action', 'add');
      addBtn.setAttribute('data-col', String(i));
      addBtn.textContent = '+';
      addBtn.addEventListener('click', () => this._adjust(i, 1));
      const subBtn = document.createElement('button');
      subBtn.setAttribute('part', 'pvc-btn');
      subBtn.setAttribute('data-action', 'sub');
      subBtn.setAttribute('data-col', String(i));
      subBtn.textContent = '−';
      subBtn.addEventListener('click', () => this._adjust(i, -1));
      td.append(addBtn, subBtn);
      btnRow.appendChild(td);
    }
    tbody.appendChild(btnRow);

    const counterRow = document.createElement('tr');
    for (let i = 0; i < this._columns.length; i++) {
      const td = document.createElement('td');
      td.setAttribute('part', 'pvc-column');
      const area = document.createElement('div');
      area.className = 'counter-area';
      const count = this._counts[i] ?? 0;
      for (let j = 0; j < count; j++) {
        const dot = document.createElement('span');
        dot.setAttribute('part', 'pvc-counter');
        area.appendChild(dot);
      }
      td.appendChild(area);
      counterRow.appendChild(td);
    }
    tbody.appendChild(counterRow);

    table.appendChild(tbody);
    this._container.appendChild(table);

    const totalEl = document.createElement('div');
    totalEl.setAttribute('part', 'pvc-total');
    totalEl.setAttribute('aria-live', 'polite');
    totalEl.textContent = `Total: ${this._getTotal()}`;
    this._container.appendChild(totalEl);
  }

  private _adjust(colIndex: number, delta: number): void {
    const current = this._counts[colIndex] ?? 0;
    const next = current + delta;
    if (next < 0) return;
    this._counts[colIndex] = next;
    this._render();
  }
}

if (!customElements.get('choca-place-value-chart')) {
  customElements.define('choca-place-value-chart', ChocaPlaceValueChart);
}
```

- [ ] **Step 4: Run browser tests to verify they pass**

Run: `npx wtr tests/elements/ChocaPlaceValueChart.browser.test.ts`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add src/elements/ChocaPlaceValueChart.ts tests/elements/ChocaPlaceValueChart.browser.test.ts
git commit -m "feat(elements): add ChocaPlaceValueChart structured manipulative component"
```

---

## Phase 8: Lazy Loading Integration

### Task 13: Wire Lazy Loading for Tool Components in Dispatcher

**Files:**
- Modify: `src/elements/ChocablocQuestion.ts`

Currently the dispatcher imports tool components statically. The whiteboard, calculator, and place-value-chart should be lazy-loaded. The toolbar handles toggling — the dispatcher needs to listen for `tool-toggled` events and dynamically create the tool panel.

- [ ] **Step 1: Add lazy tool panel management to ChocablocQuestion**

Add a private method `_onToolToggled` and modify `_renderToolbar` to include a tool panel container:

In `_renderToolbar`, after the toolbar element, add a container div for tool panels:

```typescript
private _toolPanelContainer: HTMLElement | null = null;
private _loadedTools: Map<ToolName, HTMLElement> = new Map();
```

Add to `_renderToolbar`:

```typescript
private _renderToolbar(tools: ToolName[]): void {
  const toolbar = document.createElement('choca-toolbar') as HTMLElement & { tools: ToolName[] };
  toolbar.tools = tools;

  this._toolPanelContainer = document.createElement('div');
  this._toolPanelContainer.setAttribute('part', 'tool-panels');

  toolbar.addEventListener('tool-toggled', (e) => {
    const detail = (e as CustomEvent).detail as { tool: ToolName; active: boolean };
    if (detail.active) {
      this._toolsUsed.add(detail.tool);
      void this._showToolPanel(detail.tool);
    } else {
      this._hideToolPanel(detail.tool);
    }
    this.dispatchEvent(
      new CustomEvent('tool-used', {
        detail: { tool: detail.tool, action: detail.active ? 'opened' : 'closed' },
        bubbles: true,
        composed: true,
      }),
    );
  });

  this._shadow.appendChild(toolbar);
  this._shadow.appendChild(this._toolPanelContainer);
}

private async _showToolPanel(tool: ToolName): Promise<void> {
  if (!this._toolPanelContainer) return;
  let el = this._loadedTools.get(tool);
  if (!el) {
    if (tool === 'whiteboard') {
      const { ChocaWhiteboard } = await import('./ChocaWhiteboard');
      if (!customElements.get('choca-whiteboard')) {
        customElements.define('choca-whiteboard', ChocaWhiteboard);
      }
      el = document.createElement('choca-whiteboard');
    } else if (tool === 'calculator') {
      const { ChocaCalculator } = await import('./ChocaCalculator');
      if (!customElements.get('choca-calculator')) {
        customElements.define('choca-calculator', ChocaCalculator);
      }
      el = document.createElement('choca-calculator');
    } else if (tool === 'place-value-chart') {
      const { ChocaPlaceValueChart } = await import('./ChocaPlaceValueChart');
      if (!customElements.get('choca-place-value-chart')) {
        customElements.define('choca-place-value-chart', ChocaPlaceValueChart);
      }
      el = document.createElement('choca-place-value-chart');
      if (this._question?.format === 'money' || this._question?.format === 'money_budget_adjust') {
        (el as HTMLElement & { mode: string }).mode = 'money';
      }
    }
    if (el) this._loadedTools.set(tool, el);
  }
  if (el) {
    el.style.display = '';
    if (!el.parentNode) {
      this._toolPanelContainer.appendChild(el);
    }
  }
}

private _hideToolPanel(tool: ToolName): void {
  const el = this._loadedTools.get(tool);
  if (el) el.style.display = 'none';
}
```

Also update the `set question` setter to clear tool panels on question change:

```typescript
set question(q: NormalizedQuestion) {
  this._question = q;
  this._toolsUsed.clear();
  for (const [, el] of this._loadedTools) {
    if ('clear' in el && typeof (el as { clear: () => void }).clear === 'function') {
      (el as { clear: () => void }).clear();
    }
  }
  this._render();
}
```

Remove the static imports for `ChocaWhiteboard`, `ChocaCalculator`, and `ChocaPlaceValueChart` — these are now loaded dynamically.

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 3: Run full CI**

Run: `npm run ci`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/elements/ChocablocQuestion.ts
git commit -m "feat(dispatcher): lazy-load whiteboard, calculator, place-value-chart on toggle"
```

---

## Phase 9: Final Validation

### Task 14: Full CI Run and Verification

**Files:** None (verification only)

- [ ] **Step 1: Run full CI pipeline**

Run: `npm run ci`
Expected: typecheck + lint + test + build + size ALL PASS

- [ ] **Step 2: Run all browser tests**

Run: `npm run test:browser`
Expected: ALL PASS

- [ ] **Step 3: Verify build output includes new chunks**

Run: `ls dist/chunks/`
Expected: See chunk files for lazy-loaded components (from dynamic imports in ChocablocQuestion)

- [ ] **Step 4: Verify size budgets**

Run: `npm run size`
Expected: helpers-only ≤ 12 KB, full ≤ 45 KB

- [ ] **Step 5: Commit any remaining fixes**

If any fixes were needed during verification, commit them with appropriate messages.

---

## Summary

| Phase | Tasks | What ships |
|---|---|---|
| 1: Types & Input Parser | 1-4 | `answerMode` on BaseQuestion, `ToolName`/`AnsweredDetail` types, `parseInputAnswer` helper, normalizer passthrough, `helpers-only` exports |
| 2: Answer Input | 5 | `ChocaAnswerInput` web component |
| 3: Toolbar | 6 | `ChocaToolbar` web component with mask-image icons |
| 4: Dispatcher Integration | 7-9 | `ChocablocQuestion` wires toolbar + input mode + tool tracking, `full.ts` exports, size limit bump |
| 5: Whiteboard | 10 | `ChocaWhiteboard` freehand canvas component |
| 6: Calculator | 11 | `ChocaCalculator` four-function + memory component |
| 7: Place Value Chart | 12 | `ChocaPlaceValueChart` structured manipulative component |
| 8: Lazy Loading | 13 | Dynamic import() for tool components |
| 9: Validation | 14 | Full CI pass, size verification |
