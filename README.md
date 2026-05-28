# chocabloc-questions

A question library for ChocaBLOC's iframe-based learning games. Think of it
as a shared toolkit so every game (built in React, Phaser, or plain HTML)
handles questions the same way — without each game having to reinvent the
wheel.

## The problem it solves

ChocaBLOC games run inside sandboxed iframes, which means they can't share
React components with the host page. So this library gives every game one
common foundation for:

- Reading messy raw question data from the bank and turning it into a clean,
  predictable shape
- Doing the math (coin totals, answer checking, building multiple-choice
  options)
- Optionally rendering the question UI for you

## Two tiers, pick what you need

**Tier 1 — Pure logic (`src/helpers/`)**
Just functions. No DOM, no framework. Drop it into a Phaser canvas, a React
component, anything. Gives you helpers like `normalizeQuestion`,
`validateAnswer`, `buildChoicePool`, currency formatters, and screen-reader
text.

**Tier 2 — Web Components (`src/elements/`)**
If you don't want to build your own UI, use the custom elements. The root
dispatcher `<chocabloc-question>` routes to format-specific renderers:

- `<choca-coin-pile>` — money questions (DOM, CSS vars for coin images)
- `<choca-canvas-question>` — geometry, data graphs, fractions, clock, arrays, coordinates (canvas)
- `<choca-table-question>` — budget tables (real HTML `<table>` for a11y)
- `<choca-pattern-question>` — patterns with emoji animals, colored dots, shapes (DOM flexbox)
- `<choca-number-line-question>` — number line multiplication (SVG-in-DOM)
- `<choca-choice-pad>` — shared multiple-choice answer pad (all components use this)

All components support theming via CSS custom properties and `::part()`
selectors, and work in any framework because they're native browser elements.

Tier 1 is enough on its own. A Phaser game rendering inside its canvas can
use the helpers directly. Tier 2 is just there if you want defaults, a11y,
and a themable surface for free.

## Install

```bash
npm install chocabloc-questions
```

(Not yet published. Local dev uses `npm link`. See `CONTRIBUTING.md`.)

## Quick start (React)

```jsx
import 'chocabloc-questions/full';  // registers all elements
import { normalizeQuestion } from 'chocabloc-questions/helpers';

const q = normalizeQuestion(rawBankRow);

<chocabloc-question
  ref={(el) => el && (el.question = q)}
  answer-mode="mc"
  seed="42"
/>
```

For tree-shaking, import only what you need:

```jsx
import 'chocabloc-questions/elements/coin-pile';       // money only
import 'chocabloc-questions/elements/canvas-question';  // visual formats
```

## Quick start (vanilla HTML)

```html
<script type="module">
  import '../node_modules/chocabloc-questions/dist/full.mjs';
  import { normalizeQuestion } from '../node_modules/chocabloc-questions/dist/helpers-only.mjs';

  const el = document.querySelector('chocabloc-question');
  el.question = normalizeQuestion({ /* raw bank row */ });
  el.addEventListener('answered', (e) => console.log(e.detail));
</script>
```

See `examples/vanilla-html/` for a working demo that renders all formats
from DB snapshot data with per-card cycling.

## Supported formats

20-member discriminated union on `format`:

| Format | Image type | Renderer |
|--------|-----------|----------|
| `money` | `coins` | `ChocaCoinPile` (DOM) |
| `text` | — | inline fallback |
| `money_budget_adjust` | `table` | `ChocaTableQuestion` (DOM) |
| `pattern` | `pattern_visual` | `ChocaPatternQuestion` (DOM) |
| `multiplication` | `number_line` | `ChocaNumberLineQuestion` (SVG) |
| `multiplication` | `array` | `ChocaCanvasQuestion` (canvas) |
| `geometry_attributes` | `shape_2d` | `ChocaCanvasQuestion` |
| `geometry_classify` | `shape_2d` / `shape_3d` | `ChocaCanvasQuestion` |
| `geometry_properties` | `shape_3d` | `ChocaCanvasQuestion` |
| `pythagorean` | `right_triangle` | `ChocaCanvasQuestion` |
| `geometry_area` | `compound_shape` | `ChocaCanvasQuestion` |
| `geometry_angles` | — | `ChocaCanvasQuestion` |
| `geometry_perimeter` | — | `ChocaCanvasQuestion` |
| `geometry_circumference` | — | `ChocaCanvasQuestion` |
| `geometry_angle_classify` | `angle` | `ChocaCanvasQuestion` |
| `geometry_circle_parts` | `circle_parts` | `ChocaCanvasQuestion` |
| `data_graph` | `bar_graph` / `pictograph` | `ChocaCanvasQuestion` |
| `fraction_concept` | `fraction_visual` | `ChocaCanvasQuestion` |
| `time` | `analog_clock` | `ChocaCanvasQuestion` |
| `coordinate_distance` | `coordinate_plane` | `ChocaCanvasQuestion` |
| `base10_blocks` | `base10_blocks` | `ChocaCanvasQuestion` |

```ts
type NormalizedQuestion =
  | MoneyQuestion | TextOnlyQuestion | MoneyBudgetAdjustQuestion
  | PatternQuestion | MultiplicationVisualQuestion | GeometryAttributesQuestion
  | GeometryClassifyQuestion | GeometryPropertiesQuestion | PythagoreanQuestion
  | GeometryAreaQuestion | GeometryAnglesQuestion | GeometryPerimeterQuestion
  | GeometryCircumferenceQuestion | GeometryAngleClassifyQuestion
  | GeometryCirclePartsQuestion | DataGraphQuestion | FractionConceptQuestion
  | TimeQuestion | CoordinateDistanceQuestion | Base10BlocksQuestion;
```

## Theming

CSS Custom Properties pierce shadow DOM:

```css
chocabloc-question {
  --cq-coin-size: 64px;
  --cq-coin-penny-img: url('/sprites/penny.png');
  --cq-choice-bg: #D4881F;
  --cq-focus-ring: #1C2B45;
}
chocabloc-question::part(container) {
  background: #FFF8E5;
  border-radius: 14px;
}
```

Full theming surface: see [`PARTS-AND-VARS.md`](./PARTS-AND-VARS.md).

## Accessibility

Out of the box:
- Roving tabindex on choice buttons (radiogroup convention)
- Arrow Left/Right/Up/Down, Home/End keys
- Space / Enter activation
- `aria-checked` reflects pick state
- `aria-disabled` reflects locked state
- `aria-live="polite"` region announces coin pile composition for screen readers
- Container `aria-label="Question: <stem>"`
- `:focus-visible` outline (default; override via `--cq-focus-ring`)
- Hover transforms wrapped in `@media (prefers-reduced-motion: no-preference)`

## Security

- No `innerHTML` for user content. All stems, choice labels, prompts go through
  `textContent`. Lint rule enforces this in `src/`.
- XSS regression tests cover both coin pile prompts and text-format stems.

## Versioning

- Adding a helper, attribute, event field, part, or CSS var = **minor** bump
- Renaming or removing any of the above = **major** bump
- Lib follows strict semver: `^1.0.0` in `package.json` is safe

## License

MIT
