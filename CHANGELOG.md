# Changelog

All notable changes to chocabloc-questions are documented here.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

_No unreleased changes._

## [0.6.0-beta.9] — 2026-08-17

### Added

- **The library now owns the host protocol and architecture docs.** `docs/host-protocol.md`
  (the full `chocabloc:*` contract), `docs/architecture.md` (how host / bridge / `/host`
  facade / game fit together, and who holds security) and `docs/MIGRATING-A-GAME.md` moved
  here from the game template. They describe *this library's* contract rather than any one
  game's implementation of it, so they now version with the pin: a game on a given tag reads
  that tag's protocol doc. The template keeps stubs at both paths, so existing references
  still resolve.
- The move corrected drift the template had accumulated: `architecture.md` §7 was a spec for
  lifting the host glue out of the template and into this library, which shipped in
  `v0.6.0-beta.5` — so §1, §4 and §5 still described a `src/kit/` layout that no longer
  matched. They now describe the `chocabloc-questions/host` entrypoint that actually does
  the work.

### Fixed

- **The contract docs are now included in the published package.** `files[]` excluded
  `docs/`, so `node_modules/chocabloc-questions/docs/` did not exist and the package-relative
  paths consumers are pointed at would not have resolved at any tag. The three contract docs
  are listed explicitly, keeping the internal `docs/superpowers/` plans and specs out of
  every consumer's install.

## [0.6.0-beta.8] — 2026-07-17

### Fixed

- **Text-format (choices-only) stem was invisible inside a light-colored host
  container.** `ChocablocQuestion`'s `text`-format fallback render path never
  pinned a text `color`, so the stem inherited the surrounding cascade — e.g. a
  host "Try Again" modal that set a near-white content color made the stem
  disappear, while the choice pad (its own shadow root already pins `--cq-text`)
  stayed readable. The fallback `:host` now sets `color: var(--cq-text, #222)`,
  matching every other format element. Hosts can still override via `--cq-text`.

## [0.6.0-beta.7] — 2026-07-15

### Added
- **Word-problem support (optional, tree-shakeable).** New `chocabloc-questions/word-problems`
  subpath: `createWordProblemEngine(data).applyWordProblem(rawRow)` rewrites a raw question's
  `questionText` into a themed, seeded word problem without changing the math. A compatibility
  gate rejects any template that would drop an operand or reveal the answer, so numbers, answer,
  distractors, skill, and format always pass through untouched. Data is injected and agnostic —
  bring your own templates + context, or import `chocabloc-questions/word-problems/sample-data`.
  `loadWordProblemData()` fetches per-project data by URL. No compatible template → the original
  question is returned unchanged (or `strict: true` throws `WordProblemError`). `analyzeDataset()`
  and `npm run wp:validate` statically check a dataset.

## [0.6.0-beta.6] — 2026-07-09

### Added

- **Concept channel (grade-tiered, open-ended game content).** A concept is NOT
  a question — it carries game-loop *rules* (`archetype` + `params` + `validity`
  + `seeds`) the game consumes to generate and client-side-validate its own
  rounds. New bridge + host-kit surface:
  - `bridge.requestConcept(opts?)` — resolve the grade-appropriate concept for
    this game over the host's `chocabloc:concept:request` / `:deliver` channel
    (host-pinned gameId; the endpoint takes NO client grade — the server resolves
    it from the session). Same-origin relative-fetch fallback for host-less
    deployments. Returns `ResolvedConcept | null` (null on standalone / timeout /
    `NO_CONCEPT`; never throws).
  - `bridge.reportConceptSession(payload)` — report a play-session over the
    `chocabloc:concept-session:report` / `:deliver` channel and get back the
    rolled-up `progress` block. Host pins the conceptId + gameId (an iframe can't
    report against another game's concept). NO fetch fallback — the write needs
    the host's CSRF/session. Returns `ConceptProgress | null`.
  - Host-kit: `requestGameConcept()` + fail-safe `reportConceptSession()`.
  - Types exported from `chocabloc-questions/bridge` + `/host`:
    `RequestConceptOptions`, `ResolvedConcept`, `ConceptResolvedMeta`,
    `ConceptSessionPayload`, `ConceptProgress`.

## [0.6.0-beta.5] — 2026-06-29

### Added

- `chocabloc-questions/host` — new framework-free **host-kit** entrypoint that
  wraps the bridge with the glue every game needs: `hostContext` /
  `whenHostReady` / `notifyStarted` (safe boot, standalone-synthesized),
  `reportAttempt` / `reportScore` / `notifySave` (fail-safe progress reporting —
  telemetry never crashes the game), `checkAnswer` (local compare vs F6 server
  validation; a missing validator or transport failure never counts as correct),
  and `requestBankQuestions` / `requestNextBankQuestion` / `loadQuestions` (bulk
  + adaptive-single fetch, plus a bank → fixture → generate loader with the
  fixture/generator injected per game). Lets games consume the host glue as a
  versioned dependency instead of copying it per-game. Import-safe without a
  `window`.

### Changed

- `normalizeQuestion` now preserves the F6 `answerToken` on the normalized
  question (added optional `answerToken?: string` to `BaseQuestion`; reads the
  `answerToken` / `answer_token` wire keys). The lib still does **not** consume
  it (its built-in validator returns `correct:false` — a host validator is
  required); preserving it lets consumers (e.g. `chocabloc-questions/host`)
  forward graded attempts instead of silently dropping the token. Absent/empty →
  omitted; never affects row validity. Additive optional field.

### Fixed

- `chocabloc-questions/bridge` is now safe to `import` without a `window` (node
  tests, SSR, and the new `./host` entrypoint). Its message-listener
  registration and boot handshake are deferred behind a `typeof window` guard;
  the in-handler security gates (`e.source === window.parent`, origin check) are
  unchanged — only listener registration is now conditional.

## [0.6.0-beta.4] — 2026-06-24

### Added

- `bridge.requestQuestions(opts)` — bulk question batch over the host's
  `chocabloc:questions:request` channel (host-pinned gameId) with a same-origin
  relative-fetch fallback for host-less same-origin deployments. Returns the
  canonical questions array verbatim, or `[]` on any failure (never throws).
- `RequestQuestionsOptions` type exported from `chocabloc-questions/bridge`
  (`count` / `recipe` / `grade` / `gameId`). Note bulk uses `recipe` while the
  adaptive path uses `recipeSlug`, matching the host's `fetchGameQuestions`
  contract.
- `gameId` option on `requestNextQuestion` / `requestQuestions` — used **only**
  by the no-host fetch fallback. When embedded, the host pins the gameId and any
  caller-supplied `gameId` is ignored.

### Fixed

- `bridge.requestNextQuestion` hardcoded the `monkey-money` gameId, so every
  non-money game fetched monkey-money's question bank. It now routes through the
  host postMessage channel (`chocabloc:questions:request` → `:deliver`, host
  pins gameId) when embedded, and a same-origin relative fetch
  (`/api/v1/games/:gameId/questions/next`) when given a `gameId` with no host.
  Games no longer need to hand-roll a custom question bridge.

## [0.6.0-beta.3] — 2026-06-11

### Added

- `./elements/whiteboard` — public side-effect export that registers the
  standalone `<choca-whiteboard>` scratchpad element. Additive; no existing
  export changed.

## [0.6.0-beta.2] — 2026-06-03

### Added

- **7 visual geometry format renderers** in `ChocaCanvasQuestion`:
  `geometry_face_identify`, `geometry_identify`, `geometry_symmetry`,
  `geometry_classify_triangle`, `geometry_volume`, `geometry_surface_area`,
  `geometry_circle_convert`. These formats previously rendered as text-only
  despite carrying visual data (`image_type`, `shape`). Now render canvas
  diagrams matching the question's visual intent.
- `drawLabeled3D` — 3D shapes with dimension labels (for volume/surface area)
- `drawFaceHighlight` — 3D shape with highlighted face (for face identify)
- `drawSymmetryLines` — 2D shape with symmetry line overlay
- 7 new normalizer functions and `FORMAT_NORMALIZERS` entries
- 7 new TypeScript content + question types exported from `helpers-only`

### Changed

- Removed 7 formats from `STEM_FORMATS` — they now route through dedicated
  normalizers that preserve `imageType` and structured content instead of
  stripping them to text-only.

## [0.6.0-beta.1] — 2026-06-03

### Added

- **Stacked math template overlay** in `<choca-whiteboard>` — column-aligned
  scratchpad layout for addition and subtraction.

### Fixed

- `<choca-whiteboard>` now re-attaches its cached tool panel after a shadow-DOM
  rebuild in `_render()` (the cached panel had kept a stale `parentNode`).

## [0.5.0] — 2026-06-02

Graduates the `chocabloc-questions/bridge` line to a stable release. No code
changes since `0.5.0-beta.2`.

## [0.5.0-beta.2] — 2026-06-02

### Security

- **P0 — parent-side origin check.** The bridge now rejects any message whose
  `e.origin` doesn't match `window.location.origin`, closing a defense-in-depth
  gap if the iframe sandbox is ever tightened to a null origin.
- **P0 — choices-only "fail-not-wrong".** When a canonical question has no
  `answer` field and the host validator rejects / is unavailable, the pad no
  longer falls through to the built-in helper (which marks every pick wrong
  because `answer` is undefined). It dispatches `chocabloc-validation-unavailable`
  and leaves the pad enabled so the host can render a retry UX — preventing silent
  mass-wrong-marking during a `/answer/validate` outage. Applied in both the
  choice-pad (`shared-pad.ts`) and input-mode (`ChocablocQuestion.ts`) paths.
- **P1 — attempt-token forwarding.** `AttemptPayload` gains an optional
  `answerToken` that `bridge.attempt()` forwards so the host can re-derive
  `is_correct` server-side, closing the `chocabloc:attempt` cheat channel.

## [0.5.0-beta.1] — 2026-06-02

### Fixed

- Normalizer coerces a numeric-string money `answer` (e.g. `"5"`) to a number so
  money-format validation compares correctly.

## [0.5.0-beta.0] — 2026-06-02

### Added

- **`chocabloc-questions/bridge` subpath** — the postMessage host channel, a 1:1
  TypeScript port of Monkey Money's `chocablocBridge.js` into `src/bridge.ts`.
  Phase 1.5 security invariants preserved verbatim (source check, parent-origin
  capture-after-gate, explicit switch allow-list, 2s standalone timeout). Adds
  the `./bridge` subpath export.
- `bridge.validateAnswer()` — F6 host-validation proxy.
- `bridge.attachValidator()` — convenience sugar for wiring the element's
  `validateAnswer` hook.
- Bridge test suite (Phase 2).

## [0.4.0-beta.0] — 2026-06-01

Pre-release for chocabloc's Phase F6 stage 5 (server-validated question delivery). The lib now accepts a new "choices-only" wire shape that lets a server emit pre-shuffled choice values WITHOUT shipping the correct `answer` field or per-distractor metadata. Builds on v0.3.0's `validateAnswer` hook — a host MUST wire that hook for choices-only questions, since the built-in client validator can't determine correctness without `answer`.

### Added

- **`BaseQuestion.choices?: { value: AnswerValue }[]`** — optional, server-emitted choice pool. When present, `buildChoicePool` returns these entries verbatim (all `correct: false`); the lib does not shuffle, dedupe, or relabel. Server is the source of truth for pool composition + ordering.
- **`normalizeQuestion` accepts the choices-only shape for any format**. When `choices` is in the input, the per-format normalizer is bypassed entirely — no per-format `answer` / `distractors` validation runs. Malformed choice entries (non-object, missing `value`, non-AnswerValue `value`) are dropped silently so a partial server glitch degrades to fewer choices rather than a blank screen.
- **`validateLocal` returns `{correct: false, distractorMatched: null, expected: undefined}`** when `question.answer` is missing, with a one-time `console.warn` per call to surface the misconfiguration. Hosts MUST set `validateAnswer` to determine correctness in choices-only mode.

### Changed (breaking type-shape)

- **`MoneyQuestion.answer`, `TextOnlyQuestion.answer`, `VisualQuestion<>.answer` are now optional.** Same for `distractors`. Existing consumers reading these fields without an `undefined` guard need to add one. The legacy shape (server emits both `answer + distractors`) continues to work end-to-end; only TypeScript projects with `strict` mode see the breaking surface.

### Tests

- New `tests/helpers/choices-only.test.ts` — 8 cases covering normalize, buildChoicePool fallback, validate fail-safe warning.

### Migration

Server emits the new shape:

```json
{
  "id": "Q-001",
  "format": "multiplication",
  "imageType": "array",
  "skillIds": ["MULT-SINGLE-3X"],
  "questionText": "What is 3 x 4?",
  "content": { "operands": [3, 4] },
  "choices": [{ "value": 12 }, { "value": 7 }, { "value": 11 }, { "value": 15 }],
  "answerToken": "..."
}
```

Wire the host validator on the element:

```ts
el.validateAnswer = async (q, sa) => {
  const res = await fetch('/api/v1/answer/validate', {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrf },
    body: JSON.stringify({ answerToken: q.answerToken, studentAnswer: sa }),
  }).then(r => r.json());
  return {
    correct: res.isCorrect, expected: res.expected,
    distractorMatched: res.distractorMatched, skillTags: q.skillIds,
  };
};
```

Review-mode painting in choices-only mode: the lib won't paint the correct choice green (no `answer` to compare against). Use the `expected` field returned in the `answered` event detail for custom post-pick feedback.

---

## [0.3.0-beta.0] — 2026-06-01

Pre-release for chocabloc's Phase F6 (server-side answer validation). Adds an opt-in host-provided validator hook so a chocabloc host can route validation through `POST /api/v1/answer/validate` without forking the element. Default behavior unchanged — every existing consumer keeps working with no flag flip.

### Added

- **`<chocabloc-question>` `validateAnswer` property** (`ValidateAnswer` type exported from `chocabloc-questions`). When set, replaces the built-in client-side compare for every MC pick and every input-mode submission. Same `Promise<ValidationResult>` contract as the built-in `validateAnswer` helper. Host is responsible for preserving the existing `answered` event-detail shape so analytics + review-mode painting don't need to branch.
- Forwarding: when the host assigns `validateAnswer` to the root element, the dispatcher copies the function reference to whatever inner format element renders (`<choca-coin-pile>`, `<choca-canvas-question>`, `<choca-table-question>`, `<choca-pattern-question>`, `<choca-number-line-question>`). `shared-pad.handlePick` reads it off the immediate host — no shadow-DOM hops required.
- `ValidateAnswer` type export in `src/types.ts`.

### Tests

- New `tests/elements/host-validate.browser.test.ts` — 4 cases covering MC pick with host validator, fallback to built-in when absent, validator forwarding to inner format elements, input-mode submissions.

### Migration

No required migration. Existing consumers continue to use the built-in client-validate path. To opt into server-validate:

```ts
import 'chocabloc-questions/full';
const el = document.querySelector('chocabloc-question') as HTMLElement & {
  validateAnswer?: (q, sa) => Promise<{ correct, expected?, distractorMatched? }>;
};
el.validateAnswer = async (q, sa) => {
  const res = await fetch('/api/v1/answer/validate', {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrf },
    body: JSON.stringify({ answerToken: q.answerToken, studentAnswer: sa }),
  }).then(r => r.json());
  return {
    correct: res.isCorrect,
    expected: res.expected,
    distractorMatched: res.distractorMatched,
    skillTags: q.skillIds,
  };
};
```

`answerToken` ships on the canonical wire shape (chocabloc server v0.2.0+ when called with a user session).

---

## [0.2.0] — 2026-05-29

This release graduates the lib from alpha. Input contract conforms to the canonical chocabloc DB question shape — no shim adapters required by consumers. Monkey Money, brainbites, and assignment surfaces all consume the same spec. Includes the full 99-format mathSkills expansion that landed on `feat/mathskills-full-coverage`.

### BREAKING CHANGES

- **`BaseQuestion.prompt` renamed to `questionText`** to match canonical chocabloc DB question shape (mirrors `questions.question_text` column). `questionText` is now required (was optional). Migrate consumers: replace `question.prompt` reads with `question.questionText`.
- **`normalizeQuestion()` throws on `correctIndex` input.** Legacy bank-row shape (`{ id, prompt, choices, correctIndex, choiceMeta }`) is no longer accepted. Pass `answer` + `distractors` and let the lib build choices internally via `choice-builder`.
- **Legacy fallback chain in `extractBase` removed.** Now reads ONLY `questionText`. Removed silent reads of `prompt`, `content.question`, `content.prompt`. Rows lacking `questionText` ship empty string; format-specific normalizers may compute a stem via `buildStem()`.

### Added

- **`<chocabloc-question answer-mode="review">`** — read-only display with correct-answer highlight. All choice buttons disabled (`aria-disabled="true"`, `tabIndex=-1`). Pointer events suppressed.
- **`student-answer` attribute** on `<chocabloc-question>` — string-coerced comparison against `answer` and `distractor.value`. Per PC-3, the underlying `choiceValue()` helper extracts `.value` from object-shaped choices so `"5"` correctly matches numeric `5` (no `"[object Object]"` stringify trap).
- **Review-mode forwarding** through dispatcher (`ChocablocQuestion._passAttrs`) → visual wrappers → `<choca-choice-pad>` via `shared-pad.syncChoicePad`. All 5 visual wrappers observe `student-answer`.
- **New parts:** `choice-correct`, `choice-wrong`, `choice-other`.
- **New theming vars:** `--cq-choice-correct-border` (default `#10b981`), `--cq-choice-wrong-border` (default `#ef4444`), `--cq-choice-disabled-opacity` (default `0.5`).
- **`sideEffects` field** in `package.json` — enables consumer bundlers to
  tree-shake unused exports from `helpers-only` and `index` entry points.
  Side-effectful entries (`full`, `coin-pile`, `canvas-question`) are listed
  explicitly so `customElements.define()` calls are preserved.
- **Tree-shake verification script** at `tests/tree-shake-test.mjs` — builds
  a helpers-only import via Vite and asserts no Web Component code leaks into
  the output.
- **`base10_blocks` format** — full pipeline: types, normalizer, canvas renderer,
  CSS custom properties. Handles 4 DB operations (`base10_count`, `base10_block_count`,
  `base10_regroup`, `base10_compare`) under single normalized `format: 'base10_blocks'`.
  Thousands cubes render with 3D faces; place highlighting (pink stroke) for
  `base10_block_count`; side-by-side comparison layout for `base10_compare`;
  auto-scaling to fit canvas.
- **CSS vars for base10 block colors**: `--cq-b10-ones`, `--cq-b10-tens`,
  `--cq-b10-hundreds`, `--cq-b10-thousands`, `--cq-b10-stroke`.
- `base10_blocks` added to DB snapshot script and vanilla HTML example.

### Changed

- `NormalizedQuestion` union expanded to 20 formats.
- Coin-pile size budget bumped 16 → 17 KB (shared normalizer growth via dispatcher).

### Removed

- `prompt` field from public types (renamed to `questionText`).
- `correctIndex` input path on `normalizeQuestion()`.
- Legacy fallback reads (`prompt`, `content.question`, `content.prompt`) in `extractBase`.

### Internal

- `<chocabloc-question answer-mode="X">` public API translates to internal `<choca-choice-pad mode="X">`. Consumers should not read child `mode` directly; the public surface is the parent attribute.

### Tests

- 204 unit specs passing (Vitest), including 2 new `correctIndex` rejection specs.
- 111 browser specs passing (web-test-runner + Playwright Chromium), including 10 new `review-mode` specs covering correct/wrong marking, PC-3 string-vs-number coercion, PC-3 object-shape choice handling, full aria-disabled coverage, student-answer absent fallback, and per-wrapper forwarding.
- Smoke test: **21,415/21,415 real mathSkills bank questions normalize, 0 malformed.**

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
