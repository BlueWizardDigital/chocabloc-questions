# Changelog

All notable changes to chocabloc-questions are documented here.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

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
