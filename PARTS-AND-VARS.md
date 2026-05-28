# Theming Surface

Complete catalog of `::part()` names and CSS Custom Properties exposed by
each Tier 2 element. Additions land in minor versions. Removals require a
major bump. Default values shown in parentheses.

Defaults are designed to meet WCAG AA contrast (4.5:1 for text). Consumer
themes are expected to meet the same bar.

## All elements (universal vars)

| Var | Default | Purpose |
|-----|---------|---------|
| `--cq-font` | `system-ui, sans-serif` | Base font stack |
| `--cq-text` | `#222` | Body text color |
| `--cq-bg` | `transparent` | Host background |
| `--cq-section-gap` | `16px` | Vertical rhythm |
| `--cq-focus-ring` | `currentColor` | Focus-visible outline color |

## `<chocabloc-question>` + `<choca-coin-pile>` shared parts

| Part | What it targets |
|------|-----------------|
| `container` | Outer flex column wrapping prompt + canvas + choices |
| `prompt` | Question stem text |
| `canvas` | Visual area (coin pile, graph, etc.) |

## `<choca-coin-pile>` specific

| Part | What it targets |
|------|-----------------|
| `coin` | Every coin sprite |
| `coin-penny` | Penny coins |
| `coin-nickel` | Nickel coins |
| `coin-dime` | Dime coins |
| `coin-quarter` | Quarter coins |
| `coin-loonie` | Loonie coins (CAD) |
| `coin-toonie` | Toonie coins (CAD) |
| `coin-row` | One row per non-empty denomination (high-to-low order) |
| `coin-row-<name>` | Specific denomination row (e.g. `coin-row-quarter`) |

| Var | Default | Purpose |
|-----|---------|---------|
| `--cq-container-padding` | `16px` | Padding inside container |
| `--cq-container-bg` | `transparent` | Container background |
| `--cq-container-radius` | `0` | Container border-radius |
| `--cq-container-border` | `none` | Container border |
| `--cq-prompt-size` | `1rem` | Prompt font size |
| `--cq-prompt-weight` | `600` | Prompt font weight |
| `--cq-canvas-justify` | `flex-start` | Coin pile horizontal justify |
| `--cq-canvas-align` | `flex-start` | Coin pile cross-axis alignment of rows |
| `--cq-coin-size` | `56px` | Base coin diameter (toonie/loonie/quarter inherit) |
| `--cq-coin-toonie-size` | `var(--cq-coin-size)` | Toonie diameter override |
| `--cq-coin-loonie-size` | `var(--cq-coin-size)` | Loonie diameter override |
| `--cq-coin-quarter-size` | `var(--cq-coin-size)` | Quarter diameter override |
| `--cq-coin-dime-size` | `40px` | Dime diameter (smaller per physical scale) |
| `--cq-coin-nickel-size` | `43px` | Nickel diameter |
| `--cq-coin-penny-size` | `43px` | Penny diameter |
| `--cq-coin-row-gap` | `8px` | Vertical gap between denomination rows |
| `--cq-coin-overlap-frac` | `-0.25` | Horizontal overlap between same-denom coins as unitless multiplier of the coin's own width (negative = overlap leftward into prior coin). Replaces alpha.4 `--cq-coin-overlap-pct` which resolved against the row, not the coin. |
| `--cq-coin-fallback-bg` | `#d4af37` | Gold disc shown when no sprite URL |
| `--cq-coin-penny-img` | `none` | Penny sprite URL |
| `--cq-coin-nickel-img` | `none` | Nickel sprite URL |
| `--cq-coin-dime-img` | `none` | Dime sprite URL |
| `--cq-coin-quarter-img` | `none` | Quarter sprite URL |
| `--cq-coin-loonie-img` | `none` | Loonie sprite URL |
| `--cq-coin-toonie-img` | `none` | Toonie sprite URL |

## `<choca-canvas-question>` — base-10 blocks

Applies when `format === 'base10_blocks'`. These vars are read from the host
element via `getComputedStyle` and passed to the canvas draw function.

| Var | Default | Purpose |
|-----|---------|---------|
| `--cq-b10-ones` | `#90caf9` | Unit cube fill |
| `--cq-b10-tens` | `#a5d6a7` | Ten rod fill |
| `--cq-b10-hundreds` | `#ffcc80` | Hundred flat fill |
| `--cq-b10-thousands` | `#ef9a9a` | Thousand cube fill |
| `--cq-b10-stroke` | `#000` | Block stroke/outline color |

## `<choca-choice-pad>` specific

| Part | What it targets |
|------|-----------------|
| `pad` | Choice button row container |
| `choice` | Every choice button |
| `choice-correct` | The correct choice button (also has `choice`) |

| Var | Default | Purpose |
|-----|---------|---------|
| `--cq-choice-gap` | `8px` | Gap between choice buttons |
| `--cq-choices-padding` | `0` | Padding around choice row |
| `--cq-choice-padding` | `12px 20px` | Padding inside each button |
| `--cq-choice-bg` | `#f0f0f0` | Choice button background |
| `--cq-choice-text` | `inherit` | Choice button text color |
| `--cq-choice-border` | `1px solid #ccc` | Choice button border |
| `--cq-choice-radius` | `8px` | Choice button border-radius |

## Slots

| Element | Slot name (M1 subset) | Default content |
|---------|----------------------|-----------------|
| `<choca-coin-pile>` | (slots planned for M2.1 — none in v0.1.0-alpha.0) | — |

Note: v0.1.0-alpha.0 ships with embedded default content in the shadow DOM
(no slot composition). Slot-based override (`prompt`, `canvas`, `choices`)
will land in a later minor version.

## Events

| Event | Detail shape | Fires |
|-------|--------------|-------|
| `rendered` | `{ renderedAt: number }` | After first paint of each question |
| `answered` | `{ questionId, studentAnswer, correct, distractorMatched, skillTags, expected, timeToAnswerMs }` | After consumer picks a choice |
| `skipped` | `{ reason: string }` | Reserved (not emitted by v0 elements) |

All events use `bubbles: true, composed: true` so they cross shadow DOM
boundaries cleanly.
