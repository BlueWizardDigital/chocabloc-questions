# Word-problem coverage — which skills get worded, and why some don't

**Bottom line:** word problems are applied per-skill, opt-in *by the data*. A question is only reworded when **(1)** the loaded template dataset has a template for its `skill_id` **and (2)** the generic extractor can turn that question's `content` into the math placeholders the template needs. When either is missing, the question **falls back** and renders normally (its original stem). That fallback is deliberate and safe — not a bug or an oversight.

This note explains what falls back in the **bundled sample dataset** (`chocabloc-questions/word-problems/sample-data`, sourced from the mathSkills templates) and why. Your own dataset may differ — see "Check your own data" below.

## When does a question get a word problem?

Both must be true:

1. **A template exists** for the `skill_id` in the loaded `templates` map, at some difficulty.
2. **The math is extractable.** The v1 extractor is generic and reads only:
   - `content.operands` → `{a} {b} {c} …` (arithmetic)
   - `content.fraction` → `{fraction}` / `{fraction_a}` / `{fraction_b}`
   - `answer` → `{result}` (and `{result}` is **rejected** in a template unless you pass `{ allowResult: true }`, so the answer isn't given away)
   - other **numeric** primitive `content` fields → a placeholder of the same name (e.g. `content.percent` → `{percent}`)

   The compatibility gate then requires **every** operand to appear and refuses to drop any, so a template that doesn't fit the question's numbers is skipped.

If no compatible template renders, `applyWordProblem` returns the row unchanged (or throws in `strict` mode).

## By the numbers — bundled sample dataset

Template set: **141 skills.**

| Category | Count | Behavior |
|---|---:|---|
| Operand templates (`{a}`/`{b}`) | 82 | Word out of the box for add/sub/mult/div-shaped rows |
| Fraction templates (`{fraction}`) | 6 | Word for fraction rows |
| Need a named numeric scalar | 34 | Word **only if** the row carries a numeric `content` field named like the placeholder (e.g. `{percent}`, `{value}`) |
| Templates only expose `{result}` | 2 | Rejected by default (would reveal the answer); need `allowResult` |
| Empty template set | 17 | No templates authored → always fall back |

Cross-referenced against the question bank (`scripts/db-snapshot/skills.json`, **192 skills**): **139 have a template, 53 have none.** The no-template skills are almost entirely two families:

- **Geometry — 31 skills** (`GEOM-*`)
- **Money — 20 skills** (`MONEY-*`)
- plus 2 one-offs (`MULT-*`, `ODD-*`)

## What falls back, and why

1. **Geometry & money (the big buckets).** Two reasons stack:
   - The mathSkills template set has **no word-problem templates** for most `GEOM-*` / `MONEY-*` skills.
   - Even if it did, their `content` isn't operand-shaped — money uses a `coins` object, geometry uses shapes/radii/angles — so the generic extractor has no `{a}`/`{b}` to supply. A bespoke per-family extractor would be needed.
   This is the deliberate v1 boundary. Word problems for "a 90° angle" or "count these coins" are also awkward, so deferring them is a scope choice, not a gap we forgot.

2. **Empty template sets (17 skills).** The dataset has the skill key but no authored templates yet. Purely a content/authoring gap — add templates and they word, no code change.

3. **Scalar-conditional skills (34).** Templates for algebra, unit conversions, exponents, order-of-operations, absolute value, decimal/percent conversions, circle area/circumference, etc. use placeholders like `{value}`, `{percent}`, `{expression}`, `{shape}`. They word **only** when the question's `content` supplies a matching **numeric** field. Where the "math" is a string (`{expression}` for algebra, unit labels for conversions), v1's numeric-only extractor can't fill it, so those fall back.

4. **`{result}`-only templates (2).** Rejected on purpose — a template that puts the answer in the sentence would give it away. Opt in with `allowResult` if you want it.

## Why it was scoped this way (v1)

We chose **one generic extractor + fall back on anything it can't identify**, rather than a bespoke extractor per format. That covers the large arithmetic/fraction/numeric-scalar majority with almost no special-casing, keeps the engine data-agnostic, and makes every unsupported case degrade safely to the original question. Money, geometry, time, patterns, data-graphs, and base-10 blocks were explicitly deferred (see `docs/superpowers/specs/2026-07-15-word-problem-support-design.md` → "Out of scope").

## Check your own data

Coverage depends on the dataset you load. Run the static analyzer over any dataset:

```bash
npm run wp:validate                    # bundled sample data
npm run wp:validate -- templates.json context.json   # your files
```

It reports structural errors, templates that expose `{result}`, and per-skill "unrecognized placeholders" (keys that are neither math nor a context pool — i.e. scalars the row must supply, or typos). The same logic is available programmatically as `analyzeDataset(data)`.

## Adding a family later

Supporting money/geometry/etc. is an additive change with **no public API change**: teach `rowToMathInput` (in `src/word-problems/engine.ts`) how to pull that format's numbers out of its `content` shape, and author templates for those skills. Everything downstream (compat gate, renderer, fallback) already works.
