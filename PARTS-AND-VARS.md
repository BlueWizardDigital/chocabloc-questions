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
| `canvas` | Visual area (coin pile, graph, etc.). Carries `hidden` on questions that have no picture: `geometry_attributes` (beta.18+) and `base10_block_count` (beta.19+). A `display` set on this part would show an empty box |

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
| `choice-correct` | Correct choice (review mode marks visually; retry mode post-answer) |
| `choice-wrong` | Student's prior wrong pick (review mode only, requires `student-answer` attr) |
| `choice-other` | Non-correct, non-picked choices (review mode only, dimmed) |
| `choice-coins` | Row of coins inside a coin-list choice (`coin-choices` only) — v0.6.0-beta.14+ |
| `choice-coin`, `choice-coin-<denom>` | One coin in that row; image from `--cq-coin-<denom>-img` — v0.6.0-beta.14+ |

| Var | Default | Purpose |
|-----|---------|---------|
| `--cq-choice-gap` | `8px` | Gap between choice buttons |
| `--cq-choices-padding` | `0` | Padding around choice row |
| `--cq-choice-padding` | `12px 20px` | Padding inside each button |
| `--cq-choice-bg` | `#f0f0f0` | Choice button background |
| `--cq-choice-text` | `inherit` | Choice button text color |
| `--cq-choice-border` | `1px solid #ccc` | Choice button border |
| `--cq-choice-radius` | `8px` | Choice button border-radius |
| `--cq-choice-correct-border` | `#10b981` | Border on correct choice in review mode |
| `--cq-choice-wrong-border` | `#ef4444` | Border on student's wrong pick in review mode |
| `--cq-choice-disabled-opacity` | `0.5` | Opacity for non-marked choices in review mode |
| `--cq-choice-coin-size` | `32px` | Coin size inside a coin-list choice — v0.6.0-beta.14+ |
| `--cq-choice-coin-gap` | `4px` | Gap between those coins — v0.6.0-beta.14+ |

### Coin-list choices (`coin-choices`) — v0.6.0-beta.14+

`<choca-coin-pile>` sets `coin-choices` on its pad when the question's
`content.coinChoices` is true. The normalizer sets that for `money_coin_colour`
only, whose answers are sets of coins (v0.6.0-beta.16+; beta.14 set it for every
coin scene). A choice value that is a set of coin names then draws as coins, in
pile order with repeats kept: a comma-joined string as the platform sends it
(`"nickel,quarter"`; a single name is a set of one) or a list. The button's
`aria-label` names the coins; an empty set (`""` or `[]`) reads "None". A value
holding anything but coin names stays text. Display only: the value a pick
reports is the original, unchanged. The other `money_coin_*` formats keep text
labels, since naming the coin is the question. Coin images come from the same
`--cq-coin-<denom>-img` vars as the pile, so a game that themes the pile needs
nothing new.

### Review mode (`answer-mode="review"`) — v0.2.0+

The parent `<chocabloc-question>` element accepts:

| Attribute | Type | Purpose |
|-----------|------|---------|
| `answer-mode="review"` | string | Read-only display: all choices disabled, correct + wrong highlights applied |
| `student-answer` | string | Optional. Marks the matching distractor with `choice-wrong`. String-coerced — `"5"` matches numeric `5` per PC-3. |

`<chocabloc-question>` forwards both attributes through `_passAttrs` to the active visual wrapper (`<choca-canvas-question>`, `<choca-coin-pile>`, `<choca-pattern-question>`, `<choca-table-question>`, `<choca-number-line-question>`), which re-emits them onto the nested `<choca-choice-pad>` via internal `mode` attribute. Public API is `answer-mode` on the parent; consumers should not read child `mode` directly.

`container`, `prompt`, `canvas`, `choices` are re-exported from the inner format renderer (`exportparts`), so `chocabloc-question::part(…)` styles them (beta.17+).

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
