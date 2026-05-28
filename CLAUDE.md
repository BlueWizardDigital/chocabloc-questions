# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run test                  # Vitest unit tests (Tier 1, node env)
npm run test:watch            # Vitest watch mode
npm run test:browser          # @web/test-runner + Playwright Chromium (Tier 2 / Web Components)
npm run typecheck             # tsc --noEmit
npm run lint                  # eslint src tests --ext .ts
npm run lint:fix
npm run format                # prettier on src + tests
npm run build                 # vite build (multi-entry library)
npm run build:watch           # used for `npm link` consumer workflow
npm run size                  # size-limit on built bundles
npm run ci                    # typecheck + lint + test + build + size (mirror CI)
```

Run a single Vitest file or test:

```bash
npx vitest run tests/helpers/normalizer.test.ts
npx vitest run -t "infers USD from skill ids"
```

Run a single browser test file:

```bash
npx wtr tests/elements/ChocaCoinPile.browser.test.ts
```

Note: `tests/elements/**/*.browser.test.ts` are excluded from Vitest and only execute via `wtr`. Unit tests run in node env (no DOM); anything that touches `customElements` must live under `tests/elements/`.

Working branch is `develop`. `main` is empty and unused (see `CONTRIBUTING.md`).

Local consumer dev uses `npm link` — run `npm run build:watch` in this repo, then `npm link chocabloc-questions` in the consumer (e.g. monkeymoney). Re-link after any `npm install` in the consumer.

## Architecture

### Two-tier library

The library is intentionally split into two tiers, each with its own entry point in `vite.config.ts`:

- **Tier 1 — `src/helpers/`** — pure logic. No DOM, no framework, no globals. Exported via `src/helpers-only.ts` (the `chocabloc-questions/helpers` subpath). Sufficient to render any supported format from inside a Phaser canvas or other custom renderer.
- **Tier 2 — `src/elements/`** — Web Components built on top of Tier 1. `ChocablocQuestion` is the root dispatcher; it routes to format-specific elements:
  - `ChocaCoinPile` — money (DOM, per-denom CSS vars)
  - `ChocaCanvasQuestion` — 13 canvas-rendered formats (geometry, data graphs, fractions, clock, arrays, coordinates)
  - `ChocaTableQuestion` — budget tables (real HTML `<table>`)
  - `ChocaPatternQuestion` — patterns (DOM flexbox, emoji animals, colored dots)
  - `ChocaNumberLineQuestion` — number line multiplication (SVG-in-DOM)
  - `ChocaChoicePad` — shared multiple-choice pad (all components use this)

  Side-effect imports in `src/full.ts`, `src/elements/coin-pile.ts`, and `src/elements/canvas-question.ts` register elements via `customElements.define`.

Build outputs five bundles: `index`, `helpers-only`, `full`, `elements/coin-pile`, and `elements/canvas-question`. Size budgets in `.size-limit.cjs` (helpers-only 12 KB gz, coin-pile 15 KB gz, canvas-question 20 KB gz, full 40 KB gz).

### Public surface

`NormalizedQuestion` is a 20-member discriminated union on `format`. All format types and their content types are exported from `helpers-only.ts`. The normalizer uses a `FORMAT_NORMALIZERS` map for dispatch — adding a format means adding a normalizer function and a map entry. The `VisualQuestion<F, I, C>` generic (internal, not exported) DRYs up the 18 visual format type definitions.

### Question pipeline

Raw bank rows → `normalizeQuestion` → `NormalizedQuestion`. The normalizer accepts both `id` and `question_id` fields (raw DB rows use the latter). Shared utilities (`extractBase`, `extractAnswer`, `requireContent`, `resolveImageType`, `getNumber`, `getNumberArray`) DRY up the 20 per-format normalizers. Validation happens through `validateAnswer` (which also matches distractors by `errorType`). `buildChoicePool` filters out empty-string distractors and deduplicates. Currency for money questions is inferred from `-USD`/`-CAD` suffixes on skill IDs in `normalizer.ts:inferCurrency`.

### Coin pile rendering

`ChocaCoinPile` renders per-denomination rows with sizes and overlap driven by CSS custom properties. Same-denom overlap is computed against the **coin's own width**, not the flex container, via `margin-left: calc(var(--cq-coin-px) * var(--cq-coin-overlap-frac, -0.25))`. The `--cq-coin-px` value is set per-denomination by `[part~="coin-<denom>"]` selectors. Coin spans use `flex: 0 0 auto` so a wide row never shrinks them. This is the fix in alpha.5 — earlier `-25%` margins were resolving against container width and collapsing rows.

### Event flow across shadow DOM

`ChocablocQuestion` does **not** re-dispatch events from its inner element. The inner `<choca-coin-pile>` (and similar per-format elements) must dispatch with `bubbles: true` + `composed: true` so the event naturally crosses the shadow DOM boundary to a listener on the host. Re-dispatching causes double-fire — there's a regression commit (`349ccfe`) you can grep for if this comes up.

## Hard rules

### No HTML injection of user content

User-controllable text (question stems, choice labels, distractor labels, prompts) must be written via `textContent` / `innerText` only. ESLint enforces this via `no-restricted-syntax` in `.eslintrc.cjs`:

- `innerHTML` / `outerHTML` assignment forbidden
- `insertAdjacentHTML` forbidden

`src/elements/*.ts` and `tests/elements/*.ts` are exempted (static template strings with no user-data interpolation, or fixture parsing). If you need to bypass the rule for a one-off, add `// eslint-disable-next-line no-restricted-syntax` with a one-line justification — reviewers will scrutinize. XSS regression tests live under `tests/elements/` and `tests/helpers/`.

### Public API is semver-load-bearing

Adding a helper / attribute / event field / CSS part / CSS var = **minor**. Renaming or removing any of them = **major**. Bumping the public surface means bumping the version. Don't silently rename a CSS var (alpha.5 already broke `--cq-coin-overlap-pct` → `--cq-coin-overlap-frac` and called it out in `CHANGELOG.md`).

### Console policy

`no-console` is on with `{ allow: ['warn', 'error'] }`. Use `console.warn` for unsupported-format fallbacks (`ChocablocQuestion._render` already does this for unknown formats); never `console.log` in `src/`.

## Coverage thresholds

Vitest enforces 90/90/85/90 (lines / functions / branches / statements) on `src/**/*.ts`. Re-export files (`index.ts`, `full.ts`, `helpers-only.ts`, `elements/coin-pile.ts`, `elements/canvas-question.ts`) and `src/elements/**` (covered by browser tests) are excluded.

## DB snapshots

`scripts/db-snapshot/snapshot.sh` dumps question-bank data from local Postgres into JSON files. The JSON files are gitignored; the script is tracked. Output has literal `\n` between array elements (psql artifact) — in browser contexts, parse with `text.replace(/\\n/g, '\n')` before `JSON.parse`. The example page at `examples/vanilla-html/` uses these files.
