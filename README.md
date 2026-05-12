# chocabloc-questions

Framework-agnostic question data + renderers for ChocaBLOC iframe games.

## Why this exists

ChocaBLOC games run in sandboxed iframes and can't share React components with
the host. This library gives every game a single source of truth for:

- **Normalized question schema** — consume the messy bank shape, expose a clean
  discriminated union to consumers
- **Pure math + validation helpers** — coin totals, distractor matching, choice
  building, currency formatting, screen-reader text
- **Optional Web Component renderers** — `<chocabloc-question>` and per-format
  custom elements that work in React, Phaser, vanilla HTML

The library is **two-tier**. Tier 1 is pure logic (no DOM, no framework dep).
Tier 2 is Web Components built on top, optional and themable.

## Tier 1 is sufficient

Any format the lib supports is renderable using **Tier 1 alone**. The
`<chocabloc-question>` element is convenience, not capability. A Phaser game
that wants to render questions inside its canvas can use Tier 1 helpers
(`computeCoinTotal`, `validateAnswer`, `buildChoicePool`) directly. Tier 2 just
gives you defaults, accessibility, and a themable surface for free.

## Install

```bash
npm install chocabloc-questions
```

(Not yet published. Local dev uses `npm link`. See `CONTRIBUTING.md`.)

## Quick start (React)

```jsx
import 'chocabloc-questions/elements/coin-pile';
import { normalizeQuestion } from 'chocabloc-questions/helpers';

const q = normalizeQuestion(rawBankRow);

<chocabloc-question
  ref={(el) => el && (el.question = q)}
  answer-mode="mc"
  seed="42"
/>
```

## Quick start (vanilla HTML)

```html
<script type="module">
  import '../node_modules/chocabloc-questions/dist/elements/coin-pile.mjs';
  import { normalizeQuestion } from '../node_modules/chocabloc-questions/dist/helpers-only.mjs';

  const el = document.querySelector('chocabloc-question');
  el.question = normalizeQuestion({ /* raw bank row */ });
  el.addEventListener('answered', (e) => console.log(e.detail));
</script>
```

See `examples/` for working demos.

## v0 scope

v0 ships **money format only** (plus a `text` fallback for forms without a
custom renderer). Public discriminated union is:

```ts
type NormalizedQuestion = MoneyQuestion | TextOnlyQuestion;
```

Future formats (bar graph, pictograph, coordinate plane, number line, geometry
properties / area / angles / volume, pythagorean, coordinate distance) are NOT
in v0's public surface. Each ships as a minor version once its helpers +
renderer + tests are ready.

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
