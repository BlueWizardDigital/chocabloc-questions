# Question Tools & Input-to-Answer Mode

## Overview

Four new features for chocabloc-questions, all opt-in by the consumer app:

1. **Whiteboard** — freehand drawing canvas for scratch work
2. **Place Value Chart** — structured number decomposition manipulative
3. **Calculator** — four-function + memory calculator
4. **Input-to-Answer** — typed answer field replacing multiple-choice for eligible questions

Tools 1-3 are helper overlays toggled via boolean attributes on `<chocabloc-question>`. Tool 4 (input mode) is driven by a field on the question data itself.

---

## Component Architecture

### Consumer API

Boolean attributes on `<chocabloc-question>` control tool availability:

```html
<chocabloc-question
  whiteboard
  calculator
  place-value-chart
></chocabloc-question>
```

Consumer adds attributes per-app. Library handles all rendering, positioning, and state.

### Internal Components (Hybrid A+B)

`ChocablocQuestion` renders a toolbar and manages tool visibility. Each tool is an independent web component with its own shadow DOM, instantiated lazily (only created when first toggled open).

**New components:**

| Component | Role | Tier |
|---|---|---|
| `ChocaToolbar` | Icon buttons for toggling tools | 2 (full bundle) |
| `ChocaWhiteboard` | Freehand drawing canvas | 2 (lazy-loaded) |
| `ChocaCalculator` | Four-function + memory calculator | 2 (lazy-loaded) |
| `ChocaPlaceValueChart` | Structured number decomposition grid | 2 (lazy-loaded) |
| `ChocaAnswerInput` | Typed answer field for input-mode questions | 2 (full bundle) |

**Lazy loading:** `ChocaWhiteboard`, `ChocaCalculator`, and `ChocaPlaceValueChart` are dynamically imported on first toggle. Zero bundle cost when unused.

### Input-to-Answer Routing

When a question's `answerMode` field is `'input'`, `ChocablocQuestion` renders `ChocaAnswerInput` instead of `ChocaChoicePad`. No choice pool is built. Same `answered` event shape.

---

## Tool Behaviors

### Whiteboard (Freehand Canvas)

**Features:**
- Pen tool (default) — draw with mouse/touch/stylus
- Eraser tool — erase strokes
- Color picker — 4-6 preset colors (black, red, blue, green, orange). No custom color picker.
- Line width — 2-3 presets (thin, medium, thick)
- Clear all — double-tap or confirmation to prevent accidents
- Undo — step back one stroke

**Implementation:** HTML `<canvas>` element. Captures pointer events. Stores strokes as arrays of points for undo.

**Panel:** Overlay/drawer below question visual, above answer area. Fixed position, reasonable default size. Not draggable/resizable in v1.

**Data:** No persistence. Clears on question change. Scratch paper only.

### Calculator

**Features:**
- Number pad: 0-9, decimal point
- Operations: +, −, ×, ÷
- Equals, Clear (C), Backspace
- Memory: M+, M−, MR, MC
- Display: current input + running result

**Panel:** Compact floating panel, fixed position. Stays open across question changes (student may want to keep calculating).

**Memory buttons:** Visible for all grade bands in v1. Can be gated by grade band later based on user testing.

### Place Value Chart

**Features:**
- Column headers auto-set by question context:
  - Money → Dollars | Dimes (tens) | Pennies (ones)
  - Regular math → Thousands | Hundreds | Tens | Ones (based on answer magnitude)
  - Fallback → Hundreds | Tens | Ones
- +/− buttons per column to add/remove counters
- Visual counters (dots or blocks)
- Running total at bottom
- Regrouping animation: stretch goal for v1 (10 counters consolidate into 1 in next column)

**Panel:** Overlay/drawer similar to whiteboard. Clears on question change.

**Context-awareness:** Reads current question format and content to set columns.

---

## Input-to-Answer Mode

### Question Data Contract

New optional field on `NormalizedQuestion`:

```typescript
answerMode?: 'choice' | 'input';  // default: 'choice'
```

Set in the question bank by the content author. Normalizer passes it through from raw data.

### ChocaAnswerInput Component

**Format-aware input types:**

| Question Format | Input Type | Placeholder | Parse Logic |
|---|---|---|---|
| `money` | number | `$0.00` | Strip `$`, parse as cents |
| `geometry_area` | number | `0` | Numeric |
| `geometry_perimeter` | number | `0` | Numeric |
| `geometry_circumference` | number | `0` | Numeric |
| `pythagorean` | number | `0` | Numeric (tolerance for decimals) |
| `geometry_angles` | number | `0°` | Strip `°`, numeric |
| `coordinate_distance` | number | `0` | Numeric |
| `money_budget_adjust` | number | `$0.00` | Currency parse |
| `multiplication` | number | `0` | Numeric |
| `fraction_concept` | text | `1/2` | Fraction string or decimal |
| `time` | text | `0:00` | Time string parse |
| `data_graph` | number | `0` | Numeric |
| `pattern` | number/text | varies | Match expected next value |

**Behavior:**
- Auto-focus on render
- Submit on Enter key + submit button for touch
- One attempt — wrong answer fires `answered` event with `correct: false`, displays correct answer
- Disabled after submission (matches ChocaChoicePad behavior)

### New Tier 1 Helper

```typescript
parseInputAnswer(rawInput: string, format: QuestionFormat): AnswerValue
```

Exported from `helpers-only`. Handles:
- Currency symbol stripping (`$2.53` → `253` cents)
- Degree symbol stripping (`45°` → `45`)
- Coordinate parsing (`(3, 5)` → `[3, 5]`)
- Fraction parsing (`1/2` → keeps as string `"1/2"` or converts to decimal, matching answer format)
- Whitespace trimming
- Numeric fallback

---

## Events & Analytics

### tool-used Event

Fires when student opens or closes a tool:

```typescript
detail: {
  tool: 'whiteboard' | 'calculator' | 'place-value-chart';
  action: 'opened' | 'closed';
}
```

Bubbles + composed.

### Extended answered Event

Existing `answered` event detail gains optional fields:

```typescript
toolsUsed?: ('whiteboard' | 'calculator' | 'place-value-chart')[];
rawInput?: string;  // Only for input-mode answers
```

- `toolsUsed` — tools opened at any point during question. Undefined if no tools.
- `rawInput` — original typed string before parsing. Only present for `answerMode: 'input'`.

`studentAnswer` contains the parsed `AnswerValue` (not raw string).

---

## Bundle Impact

| Entry Point | Change | New Budget |
|---|---|---|
| `helpers-only` | +`parseInputAnswer`, updated types | 12 KB gz (unchanged — small addition) |
| `full` | +`ChocaToolbar`, +`ChocaAnswerInput` | ~45 KB gz (from 40 KB) |
| Lazy chunks | `ChocaWhiteboard`, `ChocaCalculator`, `ChocaPlaceValueChart` | Not counted in static bundles |

### Vite Config

Add lazy-loaded tool components as separate chunks. Vite's dynamic `import()` handles code splitting automatically.

---

## Testing Plan

### Tier 1 — Vitest (Node)

**`parseInputAnswer`:**
- Currency: `$2.53` → 253, `$0.10` → 10, `2.53` → 253
- Coordinates: `(3, 5)` → `[3, 5]`, `( 3 , 5 )` → `[3, 5]`
- Fractions: `1/2` → `"1/2"` (string match against answer) or decimal if answer is numeric
- Degrees: `45°` → `45`, `90` → `90`
- Time: `2:30` → `"2:30"` (string match)
- Edge cases: empty string, non-numeric garbage, extra whitespace

**Normalizer:**
- `answerMode` field passes through from raw data
- Missing `answerMode` defaults to `'choice'`

**Validators:**
- Input-mode parsed values validate correctly through `validateAnswer`

### Tier 2 — Browser Tests (@web/test-runner)

**`ChocaAnswerInput`:**
- Renders input field with correct placeholder per format
- Submit fires `answered` event with correct detail shape
- Disabled after submit
- Correct/incorrect display
- Enter key submits

**`ChocaToolbar`:**
- Renders icon buttons based on attributes
- Toggle fires `tool-used` event
- Icons not present when attribute absent

**`ChocaWhiteboard`:**
- Canvas renders, accepts pointer input
- Eraser clears strokes
- Clear all removes all strokes
- Undo removes last stroke
- Clears on question change

**`ChocaCalculator`:**
- Number entry displays correctly
- Four operations compute correctly
- Memory store/recall works
- Clear resets display
- Persists across question changes

**`ChocaPlaceValueChart`:**
- Columns match question context (money vs. regular math)
- +/− buttons update counter count
- Running total updates correctly
- Clears on question change
- Fallback columns for unrecognized formats

---

## Theming & Customization

All new components follow the same pattern as existing components: CSS custom properties for values, `::part()` selectors for structural styling, and replaceable icons.

### CSS Custom Properties (`--cq-tool-*`)

- `--cq-tool-bg` — tool panel background
- `--cq-tool-border` — panel border
- `--cq-tool-icon-size` — toolbar icon size (default 32px)
- `--cq-tool-icon-color` — icon color (default currentColor)
- `--cq-tool-icon-active` — active/toggled icon color
- `--cq-tool-radius` — panel border radius
- `--cq-tool-btn-bg` — tool panel button background (calculator keys, whiteboard tools, PVC +/−)
- `--cq-tool-btn-color` — tool panel button text color
- `--cq-tool-btn-radius` — tool panel button border radius
- `--cq-tool-btn-font` — tool panel button font family
- `--cq-tool-btn-size` — tool panel button font size
- `--cq-input-border` — answer input border
- `--cq-input-focus` — answer input focus ring color
- `--cq-input-error` — wrong answer feedback color
- `--cq-input-success` — correct answer feedback color
- `--cq-input-font` — answer input font family
- `--cq-input-size` — answer input font size

### CSS Parts (`::part()`)

Consumers can fully restyle any element exposed as a part:

**ChocaToolbar:**
- `toolbar` — toolbar container
- `tool-btn` — each toolbar icon button
- `tool-btn-whiteboard` — whiteboard toggle specifically
- `tool-btn-calculator` — calculator toggle specifically
- `tool-btn-pvc` — place value chart toggle specifically

**ChocaWhiteboard:**
- `wb-panel` — whiteboard panel container
- `wb-canvas` — the drawing canvas
- `wb-tool-btn` — each tool button (pen, eraser, clear, undo)
- `wb-color-btn` — each color swatch button
- `wb-width-btn` — each line width button

**ChocaCalculator:**
- `calc-panel` — calculator panel container
- `calc-display` — result display
- `calc-key` — each calculator button
- `calc-key-num` — number keys specifically
- `calc-key-op` — operation keys (+, −, ×, ÷)
- `calc-key-mem` — memory keys (M+, M−, MR, MC)
- `calc-key-action` — action keys (=, C, backspace)

**ChocaPlaceValueChart:**
- `pvc-panel` — chart panel container
- `pvc-header` — column header row
- `pvc-column` — each column
- `pvc-counter` — each counter dot/block
- `pvc-btn` — +/− buttons
- `pvc-total` — running total display

**ChocaAnswerInput:**
- `input-field` — the text/number input element
- `input-submit` — submit button
- `input-feedback` — correct/incorrect feedback area

### Replaceable Icons

Toolbar icons use CSS `mask-image` with a default SVG data URI. Consumer overrides icon by setting `mask-image` on the part:

```css
chocabloc-question::part(tool-btn-calculator) {
  mask-image: url('/my-custom-calculator-icon.svg');
  background-color: var(--my-brand-color);
}
```

This pattern means:
- Default icons ship with the library (no external asset dependencies)
- Consumer replaces any icon with one line of CSS
- Icon color is controlled via `background-color` (since `mask-image` acts as a stencil)

Same approach for whiteboard tool icons (pen, eraser) and any other iconography.

---

## Semver Impact

This is a **minor** version bump:
- New attributes (`whiteboard`, `calculator`, `place-value-chart`)
- New optional field on question data (`answerMode`)
- New events (`tool-used`)
- Extended `answered` event detail (additive)
- New helper export (`parseInputAnswer`)
- New CSS custom properties

No breaking changes to existing API.
