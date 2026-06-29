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

This package is distributed as a **GitHub tarball pinned by tag** — it is *not*
on the npm registry. Pin an exact tag in `package.json`:

```jsonc
"chocabloc-questions": "github:BlueWizardDigital/chocabloc-questions#v0.6.0-beta.4"
```

(For local lib development, consumers use `npm link` instead — see
`CONTRIBUTING.md`.)

Because it's a git dependency, the install/update workflow has sharp edges. The
rest of this section is the field guide — every gotcha below traces back to
"tag-pinned git dep, not a registry package."

### Fresh clone / CI

```bash
npm ci
```

`npm ci` reads the lockfile's resolved commit — fully deterministic, no gotcha.
(This is why CI is never at risk from a tag bump: it pins the resolved SHA, not
the moving tag.)

### Updating to a new tag ⚠️ (the big one)

**Bumping the tag in `package.json` and running `npm install` does _not_ work.**
npm reuses its cached git resolution and the lockfile silently keeps the old
commit — and it still prints `added 1 package`, so it looks like it worked.

- **Symptom:** the new API is missing after the bump — e.g.
  `bridge.requestQuestions` is `undefined`, or TS reports *"Property
  'requestQuestions' does not exist"*. (This bit us mid-migration: the lockfile's
  resolved commit stayed on `beta.3` while `package.json` already said `beta.4`.)
- **Fix — force re-resolution:**

  ```bash
  npm install "github:BlueWizardDigital/chocabloc-questions#v0.6.0-beta.4" --force
  ```

  (Or `rm -rf node_modules/chocabloc-questions` first, then `npm install`.) This
  rewrites the lockfile's resolved commit. **Commit both `package.json` and
  `package-lock.json`.**

### Verifying an install

- **Don't** use `node -p "require('chocabloc-questions/package.json').version"` —
  the package's `exports` map blocks the `./package.json` subpath
  (`ERR_PACKAGE_PATH_NOT_EXPORTED`). Read the file directly:

  ```bash
  node -e "console.log(JSON.parse(require('fs').readFileSync('node_modules/chocabloc-questions/package.json','utf8')).version)"
  ```

- Confirm the lockfile resolved the intended commit — compare the remote tag's
  dereferenced (`^{}`) SHA to the lockfile's `resolved`:

  ```bash
  git ls-remote --tags https://github.com/BlueWizardDigital/chocabloc-questions.git | grep v0.6.0-beta.4
  grep -A3 '"node_modules/chocabloc-questions"' package-lock.json   # resolved #<sha> must match
  ```

- Confirm the API surface you depend on actually shipped in that tag:

  ```bash
  grep -n "requestQuestions" node_modules/chocabloc-questions/dist/bridge.d.ts
  ```

### For maintainers (publishing) — precondition

Consumers can only pin a tag that has been **pushed and tagged on the remote** —
committing on `develop` is not enough, because the github dependency resolves by
tag, not by branch. **Push + tag first, then bump consumers.** (Skipping this is
what blocked the `beta.4` migration until the tag existed.)

## Quick start (React)

```jsx
import 'chocabloc-questions/full';  // registers all elements
import { normalizeQuestion } from 'chocabloc-questions/helpers';

// v0.2.0+: lib accepts canonical chocabloc question shape directly:
//   { id, skillIds, content, answer, distractors, format, imageType, difficulty, questionText }
// No prompt, no correctIndex, no choices — lib builds choices from answer + distractors.
const q = normalizeQuestion(canonicalBankRow);

<chocabloc-question
  ref={(el) => el && (el.question = q)}
  answer-mode="mc"
  seed="42"
/>
```

### Review mode (v0.2.0+)

```jsx
<chocabloc-question
  ref={(el) => el && (el.question = canonicalQuestion)}
  answer-mode="review"
  student-answer="3"  // optional — marks the prior wrong pick (string-coerced)
/>
```

`answer-mode="review"` disables all choices, highlights the correct answer (`part="choice-correct"`), and if `student-answer` matches a distractor, marks it (`part="choice-wrong"`). Other choices get `part="choice-other"` (dimmed). Theme via `--cq-choice-correct-border`, `--cq-choice-wrong-border`, `--cq-choice-disabled-opacity`.

The `sideEffects` field in `package.json` tells bundlers which entry points
are safe to tree-shake. Importing from `chocabloc-questions` or
`chocabloc-questions/helpers` lets your bundler drop anything you don't use.

For finer control over which Web Components ship, import individual entries:

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

## Use inside ChocaBLOC iframe games

The lib works inside iframe-sandboxed games the same as anywhere else —
install, register the element, render with a canonical question. The only
extra piece is **how the game receives questions from the host**: via
`postMessage` using the `chocabloc:questions:deliver` protocol.

That protocol (request payload, deliver payload, attempt reporting) is
documented in one place: the ChocaBLOC iframe integration guide →
https://github.com/jasonbluewizard/Chocabloc/blob/develop/docs/games/IFRAME-GAME-INTEGRATION-GUIDE.md#phase-2--curated-question-delivery-chocabloc-questions-lib

Don't reinvent the bridge or the canonical shape per game. Both live in
chocabloc's docs; this README is the element + helpers reference only.

### The bridge subpath (`chocabloc-questions/bridge`)

Question acquisition lives in the lib's bridge (v0.6.0-beta.4+), so games don't
hand-roll a `postMessage` channel. Inside a host it routes through
`chocabloc:questions:request` — **the host pins the gameId from the iframe's
manifest, so the game never sends one** (and can't request another game's bank).
Host-less but same-origin, it falls back to a relative fetch using a
caller-supplied, validated `gameId`:

- `bridge.requestQuestions({ count })` → `Promise<unknown[]>` — bulk batch (e.g. a
  board). Returns `[]` on standalone / timeout / error reply / empty; never throws.
- `bridge.requestNextQuestion({ skillId?, recipeSlug? })` → `Promise<unknown | null>`
  — adaptive single question. Returns `null` on failure; never throws.

Usually you pass neither `recipe`/`recipeSlug` nor `skillId` — the host resolves
the game's `default_recipe_slug`. Both methods return canonical questions
**verbatim**; apply your own `normalizeQuestion`.

**Import safety (v0.6.0-beta.5+).** The bridge is safe to `import` without a
`window`: its message listener and boot handshake run only in a browser (guarded
by `typeof window`), so node tests, SSR, and the `/host` kit can import it without
crashing. Before beta.5 it touched `window` at load — consumers imported it from a
single module and reached it lazily (`await import('./bridge')`); that's no longer
required, though injecting a fake fetcher in tests is still the tidiest way to
avoid real network calls. (The game template still routes bridge use through one
module via an ESLint `no-restricted-imports` fence — now a convention, not a
crash guard.)

### The host kit (`chocabloc-questions/host`)

A framework-free convenience layer over the bridge — the glue most iframe games
need, so they don't re-implement it per game. Import-safe (it wraps the
import-safe bridge):

- **Boot / context** — `hostContext()`, `whenHostReady(timeoutMs?)`,
  `notifyStarted()`. `whenHostReady` resolves once the host replies, or falls back
  to a synthesized standalone context after the timeout (and stays resolved, so
  repeat calls don't re-wait).
- **Progress (fail-safe)** — `reportAttempt(payload)`, `reportScore(payload)`,
  `notifySave()`. Each swallows transport errors — telemetry never crashes the
  game. Forward the question's `answerToken` on attempts so the host grades
  server-side.
- **Answer check** — `checkAnswer(q, studentAnswer, validator?)`: local compare
  when the question carries `answer`; server validation via the bridge when it
  carries `answerToken`. A missing validator or a transport failure returns
  `false` — never counts as correct.
- **Question loading** — `requestBankQuestions(count)` (bulk) and
  `requestNextBankQuestion({ skillId? | recipeSlug? })` (adaptive single) return
  normalized, `answerToken`-preserving questions. `loadQuestions(count, opts, deps)`
  is the bank → fixture → generate loader: the bank defaults to the bridge, while a
  game injects its own fixture/generator, and any tier without a dep (or that
  errors) is skipped — so a round never comes up empty while a later tier can fill
  it.

A game whose questions use the lib's own formats can consume `loadQuestions`
directly; a game with its own question shape can use the boot / reporting /
checkAnswer helpers and keep its own loader.

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
