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
- **Tier 2 — `src/elements/`** — Web Components built on top of Tier 1. `ChocablocQuestion` is the root dispatcher; per-format custom elements (`ChocaCoinPile`, `ChocaChoicePad`) render the actual UI. Side-effect imports in `src/full.ts` and `src/elements/coin-pile.ts` register the elements via `customElements.define`.

Build outputs four bundles: `index`, `helpers-only`, `full`, and `elements/coin-pile`. Size budgets are enforced in `.size-limit.cjs` (helpers-only 8 KB gz, coin-pile 15 KB gz, full 25 KB gz).

### Public surface vs. internal

v0 exposes only `MoneyQuestion | TextOnlyQuestion` as `NormalizedQuestion`. Other formats (bar graph, pictograph, number line, geometry, etc.) live in `src/internal/future-formats.ts` and are **deliberately not re-exported** from `helpers-only.ts`. The dts plugin excludes that file from type emission, and Vitest coverage excludes it from thresholds. When promoting a future format to public, follow the eight-step checklist in `CONTRIBUTING.md` ("Adding a new format").

### Question pipeline

Raw bank rows → `parseQuestion` → `normalizeQuestion` → `NormalizedQuestion`. Validation happens through `validateAnswer` (which also matches distractors by `errorType`). Multiple-choice rendering goes through `buildChoicePool` + `shuffleChoices`. Currency for money questions is inferred from `-USD`/`-CAD` suffixes on skill IDs in `normalizer.ts:inferCurrency` — both suffixes present throws `NormalizeError`.

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

Vitest enforces 90/90/85/90 (lines / functions / branches / statements) on `src/**/*.ts`. Re-export files (`index.ts`, `full.ts`, `helpers-only.ts`, `elements/coin-pile.ts`), `src/elements/**` (covered by browser tests), and `src/internal/future-formats.ts` are excluded.
