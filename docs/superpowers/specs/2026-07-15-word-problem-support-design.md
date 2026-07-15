# Optional word-problem support (data-agnostic, seeded, tree-shakeable)

**Date:** 2026-07-15
**Status:** Approved design — ready for implementation plan
**Area:** `src/word-problems/**` (new), `src/word-problems/data/**` (vendored sample), `scripts/word-problems/validate.mjs` (new), `vite.config.ts`, `package.json`, `.size-limit.cjs`, `tests/word-problems/**`, `tests/tree-shake-test.mjs`, `README.md`, `CHANGELOG.md`, `CLAUDE.md`

## Problem

We want to phrase a math question as a **word problem** ("Emma found 23 gems… 5 more… how many?") instead of the bare symbolic stem ("23 + 5 = ?"), without changing the math.

Two sibling repos already do this, each with half of what we need:

- **mathSkills** (`word_parser.py`) — renders at runtime and is **seeded** (deterministic), but its pluralization is the older version.
- **adventure101** (`generate_templates.py`) — richer **context-awareness** (singular/plural agreement, theme-specific wording), but fills at build time and is **not seeded**.

Both share one template format: a **templates** file keyed by skill ID → `beginner`/`intermediate`/`advanced` → array of sentence templates, plus a **context** file of themed vocab. Placeholders are `{a} {b} {result}` (math) and `{name} {item} {question_total}` (context); nouns use `singular/plural` slash notation; `{~sing/plur}` handles inline agreement.

We want adventure101's wording quality **plus** a seed, packaged for this browser library, **agnostic to the specific data** (other projects will supply different skills, templates, themes, and vocab).

## Constraints (locked with the requester)

1. **Optional.** Existing question generation is unchanged when the feature is not imported.
2. **Data-agnostic.** No skill IDs, theme names, placeholder names, or vocab categories are hard-coded. The engine knows only the *rules of the format*; all contents come from injected data.
3. **Per-project data.** Each project points at its own templates + context. The library **recommends** a conventional path and can **bundle a sample set**, but never depends on it.
4. **Browser-safe.** No runtime filesystem access. A "path" is either a URL fetched at runtime or a file the consumer's bundler inlines at build time. The engine only ever receives already-loaded data objects.
5. **Deterministic.** Same question + same seed → identical output, including template, variable, and theme selection.
6. **Tree-shakeable.** A consumer that does not import the feature ships none of its code or data.
7. **Correct by construction.** The transform only rewrites the question sentence. Numbers, correct answer, distractors, skill IDs, and format pass through untouched. The template never computes the answer.
8. **Fail clearly.** Invalid templates / incompatible data fail at a validation step, not silently at render time.

## Key facts about this codebase

- This library **normalizes and renders**; it does not generate questions. Raw bank row → `normalizeQuestion()` → `NormalizedQuestion` → rendered.
- For arithmetic, `normalizeWithStem()` collapses the row to `{ format:'text', content:{ stem } }` and **discards `operands`**. So a word-problem transform must run on the **raw row**, before the numbers are gone.
- Skill IDs are a **shared namespace** across all three repos (`ADD-2DIGIT-1DIGIT-NO-REGROUP`, …), so templates key directly on `skillIds[0]` with no mapping table.
- Raw rows carry `content.operands`, `content.operation`, `answer`, `skill_ids` — everything the extractor needs.

## Design

### Three optional layers

| Layer | Import | Contents | Ships when |
|---|---|---|---|
| **Engine** | `chocabloc-questions/word-problems` | data-free renderer + loader + types | you import it |
| **Loader** | (same entry) | `fetch`-based `loadWordProblemData()` + recommended paths | you call it |
| **Sample data** | `chocabloc-questions/word-problems/sample-data` | the vendored templates + context JSON | you import it |

The engine carries **zero data**. Sample data lives in its own bundle so it never ships unless explicitly imported.

### Public API

```ts
// chocabloc-questions/word-problems

export interface WordProblemData {
  templates: TemplateMap;   // skillId -> { beginner: T[]; intermediate: T[]; advanced: T[] }
  context: ContextData;     // themes / characters / verbs / question_phrases — shape is loose/agnostic
}

export interface WordProblemOptions {
  seed?: number | string;                                   // default: derived from the question id (stable)
  difficulty?: 'beginner' | 'intermediate' | 'advanced';    // default: mapped from grade, else 'intermediate'
  theme?: string;                                           // any theme key present in context; default: seeded pick
  strict?: boolean;                                         // no compatible template -> throw instead of fall back
}

export interface WordProblemEngine {
  /** Reword a RAW bank row's questionText. Returns a NEW row, or the original unchanged on fallback. */
  applyWordProblem(rawRow: unknown, opts?: WordProblemOptions): unknown;
  /** Low-level: build a stem from explicit math input. null = no compatible template (non-strict). */
  generateStem(input: MathInput, opts?: WordProblemOptions): string | null;
  /** Which skills in the loaded data render vs fall back, and why. */
  coverage(): CoverageReport;
  readonly supportedSkills: ReadonlySet<string>;
}

export function createWordProblemEngine(data: WordProblemData): WordProblemEngine;

/** Validate a dataset independently of an engine (used by coverage() and the CLI). */
export function validateWordProblemData(data: WordProblemData): CoverageReport;

/** Optional fetch loader. Defaults to the recommended paths; browser-safe (no fs). */
export function loadWordProblemData(opts?: {
  templatesUrl?: string;
  contextUrl?: string;
}): Promise<WordProblemData>;

export const RECOMMENDED_TEMPLATES_PATH = '/word-problems/word_templates.json';
export const RECOMMENDED_CONTEXT_PATH  = '/word-problems/context.json';

export class WordProblemError extends Error {}   // thrown only in strict mode

export type { MathInput, TemplateMap, ContextData, CoverageReport };
```

```ts
// chocabloc-questions/word-problems/sample-data
export const sampleTemplates: TemplateMap;
export const sampleContext: ContextData;
```

Existing exports are untouched. Everything here is **additive** → a **minor** version bump.

### Data flow

```
rawRow ─▶ engine.applyWordProblem(rawRow, opts)
             │  1. skillId = rawRow.skill_ids[0]; look up templates[skillId][difficulty]
             │  2. extract math values from rawRow.content + rawRow.answer   (generic extractor)
             │  3. seededPick a template; build placeholder map (math + context)
             │  4. renderTemplate(): fill right-to-left, slash-notation + {~} pluralization
             │  5. unresolved-{…} guard: if any placeholder is left, reject → try next / fall back
             ▼
      { ...rawRow, questionText: <worded stem> }   (or the original rawRow on fallback)
             │
             ▼  (caller's existing pipeline, unchanged)
      normalizeQuestion(row) ─▶ NormalizedQuestion
```

### The generic extractor (Q2)

One extractor, tried on **every** skill. It maps standard fields onto standard math placeholders:

| Source on the raw row | Placeholder(s) |
|---|---|
| `content.operands = [a, b, c…]` | `{a}` `{b}` `{c}` … |
| `answer` | `{result}` |
| `content.fraction = [n, d]` | `{fraction}` (and `{fraction_a}`/`{fraction_b}` if present) |
| common scalars (`number`, `percent`, `whole`, `value`, `base`, `exp`, …) | `{number}` `{percent}` … |

Skills whose content does not supply what their template needs (money `coins`, `hour`/`minute`, `sequence`, `data{}`, base-10 blocks, string-only classify) can't fill their math placeholders → the **unresolved-`{…}` guard** trips → automatic fallback. Nothing is hard-coded or enumerated; the data decides per skill. New shapes can get a bespoke extractor later with no API change.

### The renderer (ported from adventure101, + seed)

`renderTemplate(template, placeholders, context, rng)`:

1. **Template select** — `rng`-seeded pick among candidates for the skill+difficulty; theme-specific templates replace universal ones when present (adventure101 rule).
2. **Fill right-to-left** — replace `{placeholder}` tokens; for each noun, choose singular/plural from the nearest preceding number/keyword.
3. **Slash notation** — `gem/gems` → correct form by count.
4. **`{~sing/plur}` markers** — resolved by nearest preceding number.
5. **Uniqueness** — repeated context keys (`{name}` vs `{name2}`, `{item}` vs `{item2}`) draw distinct values from the pool when possible.
6. **Cleanup** — collapse double spaces, trim.
7. **Guard** — if any `{…}` remains, the template is rejected.

All theme names, vocab categories, and pools are read from the injected `context` — never from constants in the code.

### Determinism (Q3 + seeding)

- A small seeded PRNG (`rng.ts`, e.g. mulberry32 with a string→seed hash) drives every choice: template, each variable, theme.
- Default seed derives from the question `id`, so a given question renders the **same** word problem every run even with no explicit seed.
- Difficulty default: map `gradeBand`/`gradeLevel` from the row when present, else `'intermediate'`; an explicit `opts.difficulty` always wins.

### Fallback (locked semantics)

- **Non-strict (default):** no compatible template, or the guard trips → `applyWordProblem` returns the **original row unchanged**; `generateStem` returns `null`.
- **Strict:** same conditions → throw `WordProblemError` with skill ID + reason. Never silently falls back.
- Existing normalize/render behavior is untouched either way.

### Validation & coverage report (Q "fail clearly")

`validateWordProblemData(data)` (shared by `engine.coverage()` and the CLI `scripts/word-problems/validate.mjs`) checks, for the **injected** dataset:

- structural shape (skill → difficulty → array; slash notation well-formed; no `{{ }}`),
- every template's placeholders are either a known math placeholder the extractor can produce for that skill's arity, or a context key present in `context`,
- returns a `CoverageReport`: per-skill `renders` ✅ / `fallsBack` ⚠️ with reasons, plus totals.

The CLI exits non-zero on structural errors so a project can gate its own data in CI. It runs on **any** dataset (agnostic), and on the vendored sample set in this repo's tests.

## Tree-shaking

- New Vite entries: `word-problems` and `word-problems/sample-data`.
- New `exports` keys `./word-problems` and `./word-problems/sample-data`. **Both stay OUT of `sideEffects`** (pure modules — no `customElements.define`, no boot).
- Template/context data is referenced only inside `sample-data`, so it lands only in that bundle. `index`, `helpers-only`, `full`, and the element bundles never reference it.
- `.size-limit.cjs`: add a budget for the engine bundle (small — code only); note the separate sample-data bundle.
- `tests/tree-shake-test.mjs`: extend to assert (a) a `helpers-only` import contains no word-problem code, and (b) importing the engine does **not** pull in the sample data.

## Backward compatibility / versioning

- Purely additive: new subpaths, no change to existing types, exports, attributes, CSS vars, or events. **Minor** bump.
- Raw rows are not a public type; `applyWordProblem` accepts `unknown` and returns `unknown` (the reworded row), so no raw-shape type is exposed.
- Docs: `README.md` gains a word-problems section (recommended path + three layers); `CLAUDE.md` notes the new entry points and the "reword before normalize" rule; `CHANGELOG.md` under `[Unreleased]`.

## Tests (map to the requested testing plan)

| Requirement | Test |
|---|---|
| Unchanged existing behavior | full suite green; explicit test that `normalizeQuestion` output is identical with and without the word-problems module imported |
| Mathematical correctness | `applyWordProblem` preserves `answer`/`content`/`distractors`/`skill_ids`; only `questionText` changes; numbers in the stem equal the operands |
| Deterministic seeded output | same seed → identical string (exact + snapshot); different seeds vary; theme/variable choices reproduce |
| Template validation | `validateWordProblemData` / CLI fails on unknown placeholder, `{{ }}`, malformed slash notation, or a math placeholder unsatisfiable for a skill's arity |
| Missing-template behavior | unmapped skill and guard-trip → default returns original row unchanged; strict throws `WordProblemError` |
| Optional code excluded from default bundle | extended `tree-shake-test.mjs` + `size-limit` prove engine/data absent from `helpers-only`/`index`, and sample data absent from the engine bundle |
| Renderer correctness | pluralization (singular after 1/a/the, plural otherwise), `{~sing/plur}`, name/item uniqueness, theme-specific override, unresolved-`{…}` guard |

## Files

**New**
- `src/word-problems/index.ts` — barrel (engine, loader, validate, paths, types, error).
- `src/word-problems/engine.ts` — `createWordProblemEngine`: `applyWordProblem`, `generateStem`, `coverage`, `supportedSkills`, fallback/strict.
- `src/word-problems/extract.ts` — generic math-value extractor.
- `src/word-problems/parser.ts` — `renderTemplate` (substitution, pluralization, `{~}`, guard).
- `src/word-problems/rng.ts` — seeded PRNG + `pick`.
- `src/word-problems/loader.ts` — `loadWordProblemData` + recommended paths.
- `src/word-problems/validate.ts` — `validateWordProblemData` (shared logic).
- `src/word-problems/types.ts` — `WordProblemData`, `TemplateMap`, `ContextData`, `WordProblemOptions`, `MathInput`, `CoverageReport`, `WordProblemError`.
- `src/word-problems/sample-data.ts` — imports vendored JSON, re-exports `sampleTemplates`/`sampleContext` (the `/sample-data` entry).
- `src/word-problems/data/word_templates.json`, `src/word-problems/data/context.json` — vendored snapshots (source: mathSkills/adventure101; refreshed by copy).
- `scripts/word-problems/validate.mjs` — CLI over `validate.ts` logic.
- `tests/word-problems/{engine,extract,parser,determinism,validate,tree-shake}.test.ts`.

**Modified**
- `vite.config.ts` — add the two entries.
- `package.json` — add the two `exports`; keep both out of `sideEffects`; add `wp:validate` script.
- `.size-limit.cjs` — engine budget.
- `tests/tree-shake-test.mjs` — exclusion assertions.
- `README.md`, `CLAUDE.md`, `CHANGELOG.md` — docs + `[Unreleased]` entry.

## Out of scope

- Bespoke extractors for money/time/pattern/data-graph/base-10 (they fall back; add later).
- Authoring/editing tooling for templates (the reference repos own that).
- Server-side or build-time pre-filling of stems.
- Changing how questions are generated or normalized.
```
