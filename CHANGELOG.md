# Changelog

All notable changes to chocabloc-questions are documented here.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

## [0.1.0-alpha.6] — 2026-05-27

### Added (full format expansion)

- **17 new question formats** with full pipeline coverage: types → normalizer →
  validator → choice-builder → Web Component renderer. `NormalizedQuestion` is
  now a 19-member discriminated union (up from 2).
- **`ChocaCanvasQuestion`** — single canvas component rendering 13 formats:
  geometry (attributes, classify, properties, area, angles, perimeter,
  circumference, angle classify, circle parts), data graphs (bar + pictograph),
  fractions, analog clock, coordinate plane, multiplication arrays.
- **`ChocaTableQuestion`** — DOM-based real HTML `<table>` for
  `money_budget_adjust` format. Solve-for cell highlighted via `part="solve-for"`.
- **`ChocaPatternQuestion`** — DOM flexbox for `pattern` format. Renders colors
  as filled circles, animals as emoji (🐄🐕🐱🐸🐢🦊), shapes as unicode, letters
  as text. CSS vars for item size, colors, borders.
- **`ChocaNumberLineQuestion`** — SVG-in-DOM for `multiplication` with
  `number_line` imageType. Quadratic-curve arc jumps with arrowheads, tick marks,
  labels. CSS vars for line/arc colors.
- **`elements/canvas-question`** build entry point for tree-shaking visual
  formats separately from money.
- **Bar graph Y-axis** with scale numbers and light gridlines.
- **Pictograph emoji** — maps common labels (fruits, animals) to emoji instead
  of generic circles.
- **`question_id` field support** in normalizer/parser — raw DB rows accepted
  without renaming.
- **Empty distractor filtering** in `buildChoicePool` — blank `""` values no
  longer produce empty choice buttons.
- **DB snapshot script** tracked at `scripts/db-snapshot/snapshot.sh` (JSON
  output gitignored).
- **All-format example page** at `examples/vanilla-html/` with Prev/Next cycling
  through 10 questions per format from snapshot data.
- 17 format types via `VisualQuestion<F, I, C>` generic (internal).
- Map-based normalizer dispatch (`FORMAT_NORMALIZERS`) with shared utilities.
- `VISUAL_FORMAT_STRINGS` set in parsers for validation.
- Test fixtures: `tests/fixtures/visual-format-samples.json` (16 formats).
- 76 visual normalizer tests + 34 browser tests for new components.
- Total: 179 unit tests + 78 browser tests.

### Changed

- `NormalizedQuestion` union expanded from `MoneyQuestion | TextOnlyQuestion`
  to all 19 formats.
- `ChocablocQuestion` dispatcher routes to format-specific components instead
  of logging unsupported-format warnings.
- Build outputs 5 bundles (was 4): added `elements/canvas-question`.
- Size budgets updated: helpers-only 12 KB (was 8), full 40 KB (was 25),
  new canvas-question 20 KB.
- `isQuestionLike` accepts `question_id` as alias for `id`.
- `choice-builder` accesses `q.content.currency` via typed path instead of cast.

### Removed

- `src/internal/future-formats.ts` — all formats now promoted to public surface.

## [0.1.0-alpha.5] — 2026-05-15

### Fixed (`<choca-coin-pile>` — Phase D follow-up)

- Same-denom overlap previously used `margin-left: -25%`, which CSS resolves
  against the flex container's width (not the coin's own width). Result:
  rows with mixed/many coins collapsed leftward — coins disappeared off the
  left edge and z-index stacking visually inverted because all coins piled
  on top of each other near x=0.
- Switched to `margin-left: calc(var(--cq-coin-px) * var(--cq-coin-overlap-frac, -0.25))`
  where `--cq-coin-px` is a per-denomination size set by each
  `[part~="coin-<denom>"]` selector. Overlap is now a unitless multiplier
  of the coin's own width — predictable across rows of any denomination.
- Added `flex: 0 0 auto` to coin spans so flex can't shrink them when the
  row exceeds available width.

### Changed (breaking, theming surface)

- Var renamed: `--cq-coin-overlap-pct` → `--cq-coin-overlap-frac` (value
  semantics changed from percentage string to unitless number, e.g. `-0.25`
  instead of `-25%`). Consumers overriding the old name need to update.

## [0.1.0-alpha.4] — 2026-05-15

### Changed (`<choca-coin-pile>` — Phase D visual refinement)

- Coin pile now lays out one denomination per row in high-to-low canonical
  order (toonie → loonie → quarter → dime → nickel → penny), replacing the
  previous flex-wrap single row.
- Per-denomination size defaults reflect physical scale: dime 40px, nickel
  43px, penny 43px; toonie/loonie/quarter inherit `--cq-coin-size` (now
  56px, up from 48px).
- Same-denom coins overlap horizontally by `--cq-coin-overlap-pct` (default
  `-25%`) so high-count rows stay readable. Each coin gets an inline
  ascending `z-index` so later coins layer over earlier.

### Added (theming surface)

- Parts: `coin-row`, `coin-row-<denom>` for each emitted row.
- CSS vars:
  - `--cq-coin-{toonie,loonie,quarter,dime,nickel,penny}-size` per-denom overrides
  - `--cq-coin-row-gap` (default `8px`) — vertical gap between rows
  - `--cq-coin-overlap-pct` (default `-25%`) — same-denom horizontal overlap
  - `--cq-canvas-align` (default `flex-start`) — cross-axis row alignment

### Removed

- `--cq-coin-gap` (replaced by `--cq-coin-row-gap` for column-direction
  rhythm; intra-row spacing now controlled by `--cq-coin-overlap-pct`).
  Breaking only for consumers that set `--cq-coin-gap` directly; no known
  consumers do.

## [0.1.0-alpha.0] — 2026-05-12

Initial alpha release. Lib reaches consumers via `npm link` only; no npm
publish yet. Tier 1 helpers + Tier 2 elements ship the money-format pipeline
end-to-end.

### Added

- Tier 1 helpers: `parseQuestion`, `isQuestionLike`, `isNormalizedQuestion`,
  `normalizeQuestion`, `normalizeBatch`, `validateAnswer`, `matchesDistractor`,
  `buildChoicePool`, `shuffleChoices`, `computeCoinTotal`, `formatCurrency`,
  `formatAnswerForDisplay`, `formatCoinCountForScreenReader`, `isValidSkillId`,
  `matchesGradeFilter`
- Tier 2 elements: `<chocabloc-question>`, `<choca-coin-pile>`,
  `<choca-choice-pad>`
- Discriminated union `NormalizedQuestion = MoneyQuestion | TextOnlyQuestion`.
  Future formats are gated behind minor versions when their renderers ship.
- Currency-specific narrow coin types: `USDCoinName` (penny/nickel/dime/quarter),
  `CADCoinName` (nickel/dime/quarter/loonie/toonie)
- Async `validateAnswer(): Promise<ValidationResult>` from day one
- Strict-dev / lenient-prod normalizer with `onMalformed` event hook
- Accessibility: roving tabindex, ArrowLeft/Right/Up/Down + Home/End +
  Space/Enter keyboard nav, `aria-checked`, `aria-disabled`,
  `aria-live="polite"` coin-count summary, container `aria-label`,
  `:focus-visible` outlines, reduced-motion-aware hover
- XSS hardening: ESLint forbids `innerHTML` / `outerHTML` /
  `insertAdjacentHTML` assignment in `src/`. User content via `textContent`.
  Regression tests cover malicious prompts in both coin pile and text fallback.
- Multi-entry build: `index`, `helpers-only`, `full`, `elements/coin-pile`
- TypeScript declarations emitted via `vite-plugin-dts`
- Bundle size limits enforced via `size-limit`:
  - `helpers-only.mjs`: 8 KB gzip budget (actual 2.73 KB)
  - `elements/coin-pile.mjs`: 15 KB gzip budget (actual 3.82 KB)
  - `full.mjs`: 25 KB gzip budget (actual 5.59 KB)
- Unit tests (98) + browser tests (36) via Vitest + @web/test-runner + Playwright
- Coverage thresholds: lines >= 90%, branches >= 85%, functions >= 90%

### Known limitations (deferred to later versions)

- Slot composition (`prompt`, `canvas`, `choices`) not yet implemented
- Theme presets (`theme="chocabloc"` etc.) deferred
- Image-based question assets path deferred
- Server-authoritative answer checking deferred (validator already async
  to enable this without API churn)
- IIFE bundle for CDN deferred
- npm + CDN publishing deferred
