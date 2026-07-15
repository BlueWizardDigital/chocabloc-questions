# Word-Problem Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an optional, data-agnostic, seeded word-problem renderer that rewrites a raw question's `questionText` into a themed word problem without changing the math, shipped on its own tree-shakeable subpath.

**Architecture:** A data-free engine (`createWordProblemEngine(data)`) takes injected template + context data and exposes `applyWordProblem(rawRow)`. It extracts numbers from the raw row, seed-selects a template, and fills placeholders with adventure101-style pluralization. No compatible template → return the original row (or throw in strict mode). Sample data ships as a separate optional subpath; a `fetch` loader is provided for per-project data.

**Tech Stack:** TypeScript, Vite (multi-entry lib), Vitest, size-limit. No new runtime dependencies.

---

## File structure

**New (`src/word-problems/`):**
- `types.ts` — all types + `WordProblemError`. One responsibility: the contract.
- `rng.ts` — seeded PRNG + `pick`/`shuffle`. Deterministic randomness only.
- `extract.ts` — raw math values → placeholder strings. No template knowledge.
- `parser.ts` — one template string → filled sentence (pluralization, `{~}`, guard). No row/engine knowledge.
- `validate.ts` — dataset → `CoverageReport`. Shared by the engine and CLI.
- `engine.ts` — wires the above into `createWordProblemEngine`. The only stateful/orchestration file.
- `loader.ts` — `fetch` data by URL. Browser-only concern, isolated.
- `index.ts` — barrel (the `word-problems` entry). Re-export only.
- `sample-data.ts` — imports vendored JSON, re-exports typed constants (the `sample-data` entry).
- `data/word_templates.json`, `data/context.json` — vendored snapshots.

**New (`scripts/word-problems/`):**
- `validate.mjs` — thin CLI over `validate.ts` logic.

**New (`tests/word-problems/`):**
- `rng.test.ts`, `extract.test.ts`, `parser.test.ts`, `validate.test.ts`, `engine.test.ts`, `loader.test.ts`, `sample-data.test.ts`, `unchanged-normalize.test.ts`.

**Modified:** `tsconfig.json`, `vite.config.ts`, `package.json`, `.size-limit.cjs`, `vitest.config.ts`, `tests/tree-shake-test.mjs`, `README.md`, `CLAUDE.md`, `CHANGELOG.md`.

---

## Task 1: Types + error

**Files:**
- Create: `src/word-problems/types.ts`
- Test: `tests/word-problems/types.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/word-problems/types.test.ts
import { describe, it, expect } from 'vitest';
import { WordProblemError } from '../../src/word-problems/types';

describe('WordProblemError', () => {
  it('is an Error with a stable name', () => {
    const e = new WordProblemError('no template for FOO');
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe('WordProblemError');
    expect(e.message).toBe('no template for FOO');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/word-problems/types.test.ts`
Expected: FAIL — cannot find module `types`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/word-problems/types.ts

/** A template is a plain string, or an object restricting it to certain themes. */
export type Template =
  | string
  | { template: string; themes?: string[]; complexity?: string[] };

export interface DifficultyTemplates {
  beginner?: Template[];
  intermediate?: Template[];
  advanced?: Template[];
}

/** skillId -> difficulty -> templates. Keys are data, never hard-coded. */
export type TemplateMap = Record<string, DifficultyTemplates>;

/**
 * Context vocab. Structure follows the shared template FORMAT (themes,
 * characters, verbs, question_phrases); the VALUES are all data.
 */
export interface ContextData {
  themes?: Record<string, Record<string, string[]>>;
  characters?: Record<string, string[]>;
  verbs?: Record<string, Record<string, string[]>>;
  question_phrases?: Record<string, string[]>;
  [extra: string]: unknown;
}

export interface WordProblemData {
  templates: TemplateMap;
  context: ContextData;
}

export type Difficulty = 'beginner' | 'intermediate' | 'advanced';

export interface WordProblemOptions {
  /** Deterministic selection. Default: derived from the question id. */
  seed?: number | string;
  /** Default: mapped from grade, else 'intermediate'. */
  difficulty?: Difficulty;
  /** Any theme key present in context. Default: seeded pick. */
  theme?: string;
  /** No compatible template -> throw instead of falling back. */
  strict?: boolean;
}

/** Normalized math inputs for one question, independent of raw row shape. */
export interface MathInput {
  skillId: string;
  operands?: number[];
  fraction?: [number, number];
  answer?: unknown;
  operation?: string;
  /** Any other primitive content field, keyed by its own name. */
  scalars?: Record<string, number | string>;
  gradeBand?: string;
  gradeLevel?: number;
}

export interface SkillCoverage {
  skillId: string;
  renders: boolean;
  /** Present when renders === false, or when placeholders look suspect. */
  reason?: string;
}

export interface CoverageReport {
  ok: boolean;               // false when there are structural errors
  total: number;
  rendering: number;
  fallingBack: number;
  skills: SkillCoverage[];
  errors: string[];          // structural problems (hard failures)
}

export interface WordProblemEngine {
  applyWordProblem(rawRow: unknown, opts?: WordProblemOptions): unknown;
  generateStem(input: MathInput, opts?: WordProblemOptions): string | null;
  coverage(): CoverageReport;
  readonly supportedSkills: ReadonlySet<string>;
}

export class WordProblemError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WordProblemError';
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/word-problems/types.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/word-problems/types.ts tests/word-problems/types.test.ts
git commit -m "feat(word-problems): add types and WordProblemError"
```

---

## Task 2: Seeded RNG

**Files:**
- Create: `src/word-problems/rng.ts`
- Test: `tests/word-problems/rng.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/word-problems/rng.test.ts
import { describe, it, expect } from 'vitest';
import { makeRng, pick, shuffle } from '../../src/word-problems/rng';

describe('seeded rng', () => {
  it('is deterministic for a given seed', () => {
    const a = makeRng('seed-1');
    const b = makeRng('seed-1');
    const seqA = [a(), a(), a()];
    const seqB = [b(), b(), b()];
    expect(seqA).toEqual(seqB);
  });

  it('differs across seeds', () => {
    const a = makeRng('seed-1');
    const b = makeRng('seed-2');
    expect(a()).not.toBe(b());
  });

  it('accepts numeric seeds', () => {
    expect(makeRng(42)()).toBe(makeRng(42)());
  });

  it('pick returns a member and is deterministic', () => {
    const arr = ['x', 'y', 'z'];
    expect(makeRng('s') && pick(makeRng('s'), arr)).toBe(pick(makeRng('s'), arr));
    expect(arr).toContain(pick(makeRng('s'), arr));
  });

  it('shuffle is a deterministic permutation', () => {
    const arr = [1, 2, 3, 4, 5];
    const s1 = shuffle(makeRng('s'), arr);
    const s2 = shuffle(makeRng('s'), arr);
    expect(s1).toEqual(s2);
    expect([...s1].sort()).toEqual(arr);
    expect(arr).toEqual([1, 2, 3, 4, 5]); // input not mutated
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/word-problems/rng.test.ts`
Expected: FAIL — cannot find module `rng`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/word-problems/rng.ts

export type Rng = () => number;

/** FNV-1a hash so string and number seeds both give a stable 32-bit seed. */
export function hashSeed(seed: string | number): number {
  const s = String(seed);
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** mulberry32 — small, fast, deterministic PRNG in [0, 1). */
export function makeRng(seed: string | number): Rng {
  let a = hashSeed(seed);
  return function next(): number {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pick<T>(rng: Rng, arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length)] as T;
}

/** Fisher–Yates on a copy; original untouched. */
export function shuffle<T>(rng: Rng, arr: readonly T[]): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j] as T, out[i] as T];
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/word-problems/rng.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/word-problems/rng.ts tests/word-problems/rng.test.ts
git commit -m "feat(word-problems): add seeded PRNG (mulberry32)"
```

---

## Task 3: Math extractor

**Files:**
- Create: `src/word-problems/extract.ts`
- Test: `tests/word-problems/extract.test.ts`

The extractor is generic: operands become `{a} {b} {c}…`, `answer` becomes `{result}`, `fraction` becomes `{fraction}`/`{fraction_a}`/`{fraction_b}`, and every other primitive scalar becomes a placeholder of its own key name. No skill list.

- [ ] **Step 1: Write the failing test**

```ts
// tests/word-problems/extract.test.ts
import { describe, it, expect } from 'vitest';
import { extractMath } from '../../src/word-problems/extract';

describe('extractMath', () => {
  it('maps operands positionally and answer to result', () => {
    const m = extractMath({ skillId: 'ADD', operands: [23, 5], answer: 28 });
    expect(m).toMatchObject({ a: '23', b: '5', result: '28' });
  });

  it('maps a fraction to fraction / fraction_a / fraction_b', () => {
    const m = extractMath({ skillId: 'FRAC', fraction: [3, 4] });
    expect(m).toMatchObject({ fraction: '3/4', fraction_a: '3', fraction_b: '4' });
  });

  it('exposes arbitrary scalar content fields under their own key', () => {
    const m = extractMath({ skillId: 'PCT', scalars: { percent: 25, whole: 80 } });
    expect(m).toMatchObject({ percent: '25', whole: '80' });
  });

  it('does not let scalars clobber positional/answer keys', () => {
    const m = extractMath({ skillId: 'X', operands: [1, 2], scalars: { a: 999 } });
    expect(m.a).toBe('1');
  });

  it('omits absent inputs', () => {
    const m = extractMath({ skillId: 'X' });
    expect(m).toEqual({});
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/word-problems/extract.test.ts`
Expected: FAIL — cannot find module `extract`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/word-problems/extract.ts
import type { MathInput } from './types';

const LETTERS = ['a', 'b', 'c', 'd', 'e', 'f'] as const;

/** Build the math placeholder map for a question. All values are strings. */
export function extractMath(input: MathInput): Record<string, string> {
  const out: Record<string, string> = {};

  const ops = input.operands ?? [];
  ops.forEach((v, i) => {
    const key = LETTERS[i];
    if (key) out[key] = String(v);
  });

  if (input.answer !== undefined && input.answer !== null && input.answer !== '') {
    out.result = String(input.answer);
  }

  if (input.fraction) {
    out.fraction = `${input.fraction[0]}/${input.fraction[1]}`;
    out.fraction_a = String(input.fraction[0]);
    out.fraction_b = String(input.fraction[1]);
  }

  for (const [k, v] of Object.entries(input.scalars ?? {})) {
    if (!(k in out)) out[k] = String(v);
  }

  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/word-problems/extract.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/word-problems/extract.ts tests/word-problems/extract.test.ts
git commit -m "feat(word-problems): add generic math extractor"
```

---

## Task 4: Template renderer (parser)

**Files:**
- Create: `src/word-problems/parser.ts`
- Test: `tests/word-problems/parser.test.ts`

Ported from adventure101: fill math placeholders first (so numbers are literal), then context placeholders with singular/plural chosen from the nearest preceding number/keyword, then `{~sing/plur}` markers, then a guard that rejects any template left with unresolved `{…}`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/word-problems/parser.test.ts
import { describe, it, expect } from 'vitest';
import { renderTemplate, pluralCount, slash } from '../../src/word-problems/parser';
import { makeRng } from '../../src/word-problems/rng';
import type { ContextData } from '../../src/word-problems/types';

const ctx: ContextData = {
  themes: { cave: { item: ['gem/gems'], location: ['cavern/caverns'] } },
  characters: { names: ['Emma', 'Liam'] },
  verbs: { addition: { gain: ['found'] } },
  question_phrases: { total: ['How many in all?'] },
};

describe('pluralCount', () => {
  it('is singular after 1 / a / the', () => {
    expect(pluralCount('there is 1 ')).toBe(1);
    expect(pluralCount('in the ')).toBe(1);
    expect(pluralCount('a ')).toBe(1);
  });
  it('is the count after a number > 1', () => {
    expect(pluralCount('found 5 ')).toBe(5);
  });
  it('defaults to plural', () => {
    expect(pluralCount('some ')).toBe(2);
  });
});

describe('slash', () => {
  it('picks singular vs plural', () => {
    expect(slash('gem/gems', 1)).toBe('gem');
    expect(slash('gem/gems', 3)).toBe('gems');
    expect(slash('fish', 3)).toBe('fish');
  });
});

describe('renderTemplate', () => {
  it('fills math + context and agrees in number', () => {
    const out = renderTemplate(
      '{name} {verb_gain} {a} {item}. {question_total}',
      { a: '5' },
      ctx,
      'cave',
      'addition',
      makeRng('s'),
    );
    expect(out).toBe('Emma found 5 gems. How many in all?');
  });

  it('uses singular form after 1', () => {
    const out = renderTemplate('{a} {item}', { a: '1' }, ctx, 'cave', 'addition', makeRng('s'));
    expect(out).toBe('1 gem');
  });

  it('resolves {~singular/plural} by preceding number', () => {
    const out = renderTemplate('{a} {~group/groups}', { a: '1' }, ctx, 'cave', 'addition', makeRng('s'));
    expect(out).toBe('1 group');
  });

  it('returns null when a placeholder cannot be resolved (guard)', () => {
    const out = renderTemplate('{a} {c} {item}', { a: '5' }, ctx, 'cave', 'addition', makeRng('s'));
    expect(out).toBeNull();
  });

  it('returns null when the theme lacks the needed vocab', () => {
    const out = renderTemplate('{item}', {}, ctx, 'nonexistent', 'addition', makeRng('s'));
    expect(out).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/word-problems/parser.test.ts`
Expected: FAIL — cannot find module `parser`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/word-problems/parser.ts
import type { ContextData, Template } from './types';
import { pick, type Rng } from './rng';

const PLACEHOLDER = /\{([a-z_0-9]+)\}/gi;
const MARKER = /\{~([^/}]+)\/([^}]+)\}/g;
const SINGULAR_WORDS = new Set(['a', 'an', 'each', 'every', 'the', 'one', '1']);

/** Nearest preceding number wins; else a singular keyword; else plural (2). */
export function pluralCount(before: string): number {
  const tokens = before.toLowerCase().split(/\s+/).filter(Boolean);
  for (let i = tokens.length - 1; i >= 0; i--) {
    const t = (tokens[i] as string).replace(/[^\w-]/g, '');
    if (/^-?\d+$/.test(t)) return Math.abs(parseInt(t, 10));
    if (SINGULAR_WORDS.has(t)) return 1;
  }
  return 2;
}

/** "gem/gems" -> singular if count === 1, else plural. No slash -> unchanged. */
export function slash(value: string, count: number): string {
  if (!value.includes('/')) return value;
  const parts = value.split('/');
  return count === 1 ? (parts[0] as string) : (parts[1] as string);
}

/** Which templates apply to a theme: theme-specific replace universal when present. */
export function selectForTheme(list: Template[], theme: string): Template[] {
  const themed = list.filter(
    (t): t is Exclude<Template, string> => typeof t !== 'string' && !!t.themes?.includes(theme),
  );
  if (themed.length) return themed;
  return list.filter((t) => typeof t === 'string' || !t.themes || t.themes.length === 0);
}

function templateText(t: Template): string {
  return typeof t === 'string' ? t : t.template;
}

/**
 * Resolve a context placeholder from the injected data. Knows the shared FORMAT
 * conventions (themes / characters / verbs / question_phrases) but reads all
 * VALUES from data. Returns null when no pool exists for the key.
 */
function resolveContext(
  key: string,
  ctx: ContextData,
  theme: string,
  operation: string | undefined,
  rng: Rng,
  used: Map<string, Set<string>>,
): string | null {
  const base = key.replace(/\d+$/, ''); // name2 -> name
  let pool: string[] | undefined;

  const themeVocab = ctx.themes?.[theme];
  if (themeVocab && Array.isArray(themeVocab[base]) && themeVocab[base]!.length) {
    pool = themeVocab[base];
  } else if (ctx.characters && Array.isArray(ctx.characters[base])) {
    pool = ctx.characters[base];
  } else if (ctx.characters && Array.isArray(ctx.characters[base + 's'])) {
    pool = ctx.characters[base + 's'];
  } else if (base.startsWith('verb_') && operation && ctx.verbs?.[operation]) {
    const sub = base.slice('verb_'.length);
    if (Array.isArray(ctx.verbs[operation]![sub])) pool = ctx.verbs[operation]![sub];
  } else if (base.startsWith('question_') && ctx.question_phrases) {
    const t = base.slice('question_'.length);
    if (Array.isArray(ctx.question_phrases[t])) pool = ctx.question_phrases[t];
  }

  if (!pool || !pool.length) return null;

  const usedSet = used.get(base) ?? new Set<string>();
  const avail = pool.filter((v) => !usedSet.has(v));
  const choice = pick(rng, avail.length ? avail : pool);
  usedSet.add(choice);
  used.set(base, usedSet);
  return choice;
}

/**
 * Fill one template. Returns the finished sentence, or null when any placeholder
 * is left unresolved (caller then tries the next template or falls back).
 */
export function renderTemplate(
  tpl: Template,
  math: Record<string, string>,
  ctx: ContextData,
  theme: string,
  operation: string | undefined,
  rng: Rng,
): string | null {
  let text = templateText(tpl);

  // Pass 1: math placeholders (numbers become literal for count detection).
  text = text.replace(PLACEHOLDER, (m, key: string) => (key in math ? (math[key] as string) : m));

  // Pass 2: context placeholders, with singular/plural from preceding number.
  const used = new Map<string, Set<string>>();
  text = text.replace(PLACEHOLDER, (m, key: string, offset: number, full: string) => {
    const val = resolveContext(key, ctx, theme, operation, rng, used);
    if (val == null) return m;
    return slash(val, pluralCount(full.slice(0, offset)));
  });

  // Pass 3: inline {~singular/plural} markers.
  text = text.replace(MARKER, (_m, s: string, p: string, offset: number, full: string) =>
    pluralCount(full.slice(0, offset)) === 1 ? s : p,
  );

  // Cleanup.
  text = text.replace(/\s+/g, ' ').trim();

  // Guard: reject anything with a leftover placeholder.
  if (/\{[^}]*\}/.test(text)) return null;
  return text;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/word-problems/parser.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/word-problems/parser.ts tests/word-problems/parser.test.ts
git commit -m "feat(word-problems): add template renderer with pluralization + guard"
```

---

## Task 5: Dataset validator

**Files:**
- Create: `src/word-problems/validate.ts`
- Test: `tests/word-problems/validate.test.ts`

Structural errors are hard failures (`ok: false`). Each skill is reported as rendering or falling back, where "renders" means every placeholder in at least one template is a known math placeholder or has a context pool.

- [ ] **Step 1: Write the failing test**

```ts
// tests/word-problems/validate.test.ts
import { describe, it, expect } from 'vitest';
import { validateWordProblemData } from '../../src/word-problems/validate';
import type { WordProblemData } from '../../src/word-problems/types';

const context = {
  themes: { cave: { item: ['gem/gems'] } },
  characters: { names: ['Emma'] },
  question_phrases: { total: ['How many?'] },
};

describe('validateWordProblemData', () => {
  it('marks a skill as rendering when all placeholders are known', () => {
    const data: WordProblemData = {
      templates: { ADD: { beginner: ['{a} {item}. {question_total}'] } },
      context,
    };
    const r = validateWordProblemData(data);
    expect(r.ok).toBe(true);
    expect(r.rendering).toBe(1);
    expect(r.skills[0]).toMatchObject({ skillId: 'ADD', renders: true });
  });

  it('flags an unknown placeholder as falling back', () => {
    const data: WordProblemData = {
      templates: { ADD: { beginner: ['{a} {iten}'] } }, // typo: iten
      context,
    };
    const r = validateWordProblemData(data);
    expect(r.fallingBack).toBe(1);
    expect(r.skills[0]?.reason).toContain('iten');
  });

  it('reports a structural error for double braces', () => {
    const data: WordProblemData = {
      templates: { ADD: { beginner: ['{{a}} {item}'] } },
      context,
    };
    const r = validateWordProblemData(data);
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toContain('ADD');
  });

  it('reports a structural error when a difficulty is not an array', () => {
    const data = {
      templates: { ADD: { beginner: 'oops' } },
      context,
    } as unknown as WordProblemData;
    const r = validateWordProblemData(data);
    expect(r.ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/word-problems/validate.test.ts`
Expected: FAIL — cannot find module `validate`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/word-problems/validate.ts
import type {
  ContextData,
  CoverageReport,
  Difficulty,
  SkillCoverage,
  Template,
  WordProblemData,
} from './types';

const DIFFICULTIES: Difficulty[] = ['beginner', 'intermediate', 'advanced'];
const PLACEHOLDER = /\{([a-z_0-9]+)\}/gi;
// Math placeholders the extractor can always produce (positional + fraction).
const MATH = new Set(['a', 'b', 'c', 'd', 'e', 'f', 'result', 'fraction', 'fraction_a', 'fraction_b']);

function templateText(t: Template): string {
  return typeof t === 'string' ? t : t.template;
}

/** A key is recognized if it is a math placeholder or has any context pool. */
function contextHasPool(base: string, ctx: ContextData): boolean {
  if (ctx.characters && (Array.isArray(ctx.characters[base]) || Array.isArray(ctx.characters[base + 's'])))
    return true;
  if (base.startsWith('verb_') && ctx.verbs) {
    const sub = base.slice('verb_'.length);
    for (const op of Object.values(ctx.verbs)) if (Array.isArray(op?.[sub])) return true;
  }
  if (base.startsWith('question_') && ctx.question_phrases) {
    if (Array.isArray(ctx.question_phrases[base.slice('question_'.length)])) return true;
  }
  for (const theme of Object.values(ctx.themes ?? {})) if (Array.isArray(theme?.[base])) return true;
  return false;
}

function unknownPlaceholders(text: string, ctx: ContextData): string[] {
  const bad: string[] = [];
  for (const match of text.matchAll(PLACEHOLDER)) {
    const key = match[1] as string;
    const base = key.replace(/\d+$/, '');
    // Anything not math and not a context pool is treated as a scalar the
    // extractor MIGHT provide; only truly unresolvable-looking keys are flagged.
    if (MATH.has(base) || contextHasPool(base, ctx)) continue;
    if (/^scalar_/.test(base)) continue; // reserved escape hatch, never flagged
    bad.push(key);
  }
  return bad;
}

export function validateWordProblemData(data: WordProblemData): CoverageReport {
  const errors: string[] = [];
  const skills: SkillCoverage[] = [];
  const ctx = data.context ?? {};
  const entries = Object.entries(data.templates ?? {});

  for (const [skillId, byDifficulty] of entries) {
    let renders = false;
    const reasons = new Set<string>();

    for (const diff of DIFFICULTIES) {
      const list = byDifficulty[diff];
      if (list === undefined) continue;
      if (!Array.isArray(list)) {
        errors.push(`${skillId}.${diff}: expected an array of templates`);
        continue;
      }
      for (const tpl of list) {
        if (typeof tpl !== 'string' && (typeof tpl !== 'object' || tpl === null || typeof tpl.template !== 'string')) {
          errors.push(`${skillId}.${diff}: template must be a string or { template }`);
          continue;
        }
        const text = templateText(tpl);
        if (text.includes('{{') || text.includes('}}')) {
          errors.push(`${skillId}.${diff}: double braces in "${text.slice(0, 40)}"`);
        }
        const bad = unknownPlaceholders(text, ctx);
        if (bad.length === 0) renders = true;
        else bad.forEach((b) => reasons.add(b));
      }
    }

    skills.push(
      renders
        ? { skillId, renders: true }
        : { skillId, renders: false, reason: `unknown placeholders: ${[...reasons].join(', ') || 'none defined'}` },
    );
  }

  const rendering = skills.filter((s) => s.renders).length;
  return {
    ok: errors.length === 0,
    total: skills.length,
    rendering,
    fallingBack: skills.length - rendering,
    skills,
    errors,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/word-problems/validate.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/word-problems/validate.ts tests/word-problems/validate.test.ts
git commit -m "feat(word-problems): add dataset validator + coverage report"
```

---

## Task 6: Engine

**Files:**
- Create: `src/word-problems/engine.ts`
- Test: `tests/word-problems/engine.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/word-problems/engine.test.ts
import { describe, it, expect } from 'vitest';
import { createWordProblemEngine } from '../../src/word-problems/engine';
import { WordProblemError, type WordProblemData } from '../../src/word-problems/types';

const data: WordProblemData = {
  templates: {
    'ADD-X': {
      beginner: ['{a} {item} plus {b}. {question_total}'],
      intermediate: ['{name} has {a} {item}. Finds {b} more. {question_total}'],
      advanced: ['{name} counted {a} {item}, then {b} more. {question_total}'],
    },
  },
  context: {
    themes: { cave: { item: ['gem/gems'] } },
    characters: { names: ['Emma'] },
    question_phrases: { total: ['How many in all?'] },
  },
};

function engine() {
  return createWordProblemEngine(data);
}

describe('createWordProblemEngine', () => {
  it('rewrites questionText and preserves everything else', () => {
    const row = {
      id: 'ADD-X-1',
      skill_ids: ['ADD-X'],
      format: 'addition',
      content: { operands: [23, 5], operation: 'addition' },
      answer: '28',
      distractors: [{ value: '27', error_type: 'off-by-1' }],
      questionText: '23 + 5 = ?',
    };
    const out = engine().applyWordProblem(row, { difficulty: 'intermediate', theme: 'cave' }) as typeof row;
    expect(out.questionText).not.toBe('23 + 5 = ?');
    expect(out.questionText).toContain('23');
    expect(out.questionText).toContain('5');
    // untouched:
    expect(out.answer).toBe('28');
    expect(out.content).toEqual(row.content);
    expect(out.distractors).toEqual(row.distractors);
    expect(out.skill_ids).toEqual(['ADD-X']);
  });

  it('is deterministic for the same row + seed', () => {
    const row = { id: 'ADD-X-1', skill_ids: ['ADD-X'], content: { operands: [4, 5] }, answer: 9 };
    const a = engine().applyWordProblem(row, { theme: 'cave' }) as { questionText: string };
    const b = engine().applyWordProblem(row, { theme: 'cave' }) as { questionText: string };
    expect(a.questionText).toBe(b.questionText);
  });

  it('falls back to the original row when no template matches', () => {
    const row = { id: 'Z-1', skill_ids: ['NO-SUCH-SKILL'], content: { operands: [1, 2] }, answer: 3 };
    const out = engine().applyWordProblem(row);
    expect(out).toBe(row);
  });

  it('throws in strict mode when no template matches', () => {
    const row = { id: 'Z-1', skill_ids: ['NO-SUCH-SKILL'], content: { operands: [1, 2] }, answer: 3 };
    expect(() => engine().applyWordProblem(row, { strict: true })).toThrow(WordProblemError);
  });

  it('returns the input unchanged for non-object rows', () => {
    expect(engine().applyWordProblem(null)).toBe(null);
  });

  it('generateStem returns null (non-strict) for an unknown skill', () => {
    expect(engine().generateStem({ skillId: 'NOPE' })).toBeNull();
  });

  it('maps grade to difficulty when none is passed', () => {
    const e = engine();
    const sprout = e.generateStem(
      { skillId: 'ADD-X', operands: [1, 2], answer: 3, gradeBand: 'sprout' },
      { theme: 'cave' },
    );
    const thunder = e.generateStem(
      { skillId: 'ADD-X', operands: [1, 2], answer: 3, gradeLevel: 6 },
      { theme: 'cave' },
    );
    expect(sprout).toContain('1'); // beginner template used
    expect(thunder).toContain('Emma'); // advanced template used
  });

  it('exposes supportedSkills and coverage', () => {
    const e = engine();
    expect(e.supportedSkills.has('ADD-X')).toBe(true);
    expect(e.coverage().total).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/word-problems/engine.test.ts`
Expected: FAIL — cannot find module `engine`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/word-problems/engine.ts
import type {
  CoverageReport,
  Difficulty,
  MathInput,
  Template,
  WordProblemData,
  WordProblemEngine,
  WordProblemOptions,
} from './types';
import { WordProblemError } from './types';
import { extractMath } from './extract';
import { renderTemplate, selectForTheme } from './parser';
import { validateWordProblemData } from './validate';
import { makeRng, pick, shuffle } from './rng';

const DIFFICULTIES: Difficulty[] = ['beginner', 'intermediate', 'advanced'];

function difficultyFromGrade(input: MathInput): Difficulty {
  const { gradeBand, gradeLevel } = input;
  if (gradeBand === 'sprout' || (typeof gradeLevel === 'number' && gradeLevel <= 2)) return 'beginner';
  if (gradeBand === 'thunder' || (typeof gradeLevel === 'number' && gradeLevel >= 6)) return 'advanced';
  return 'intermediate';
}

function rowToMathInput(row: Record<string, unknown>, skillId: string): MathInput {
  const content = (typeof row.content === 'object' && row.content !== null
    ? (row.content as Record<string, unknown>)
    : {}) as Record<string, unknown>;

  const opsRaw = content.operands;
  const operands = Array.isArray(opsRaw) && opsRaw.every((n) => typeof n === 'number')
    ? (opsRaw as number[])
    : undefined;

  const frRaw = content.fraction;
  const fraction = Array.isArray(frRaw) && frRaw.length === 2 && frRaw.every((n) => typeof n === 'number')
    ? ([frRaw[0], frRaw[1]] as [number, number])
    : undefined;

  const scalars: Record<string, number | string> = {};
  for (const [k, v] of Object.entries(content)) {
    if (k === 'operands' || k === 'fraction') continue;
    if (typeof v === 'number' || typeof v === 'string') scalars[k] = v;
  }

  const grade = row.gradeLevel ?? row.grade;
  return {
    skillId,
    ...(operands ? { operands } : {}),
    ...(fraction ? { fraction } : {}),
    answer: row.answer,
    ...(typeof content.operation === 'string' ? { operation: content.operation } : {}),
    scalars,
    ...(typeof row.gradeBand === 'string' ? { gradeBand: row.gradeBand } : {}),
    ...(typeof grade === 'number' ? { gradeLevel: grade } : {}),
  };
}

function firstSkillId(row: Record<string, unknown>): string | undefined {
  const ids = Array.isArray(row.skill_ids) ? row.skill_ids
    : Array.isArray(row.skillIds) ? row.skillIds
    : [];
  return typeof ids[0] === 'string' ? ids[0] : undefined;
}

export function createWordProblemEngine(data: WordProblemData): WordProblemEngine {
  const templates = data.templates ?? {};
  const context = data.context ?? {};
  const supportedSkills: ReadonlySet<string> = new Set(Object.keys(templates));

  function fail(opts: WordProblemOptions, message: string): null {
    if (opts.strict) throw new WordProblemError(message);
    return null;
  }

  function generateStem(input: MathInput, opts: WordProblemOptions = {}): string | null {
    const byDifficulty = templates[input.skillId];
    if (!byDifficulty) return fail(opts, `no templates for skill ${input.skillId}`);

    const difficulty = opts.difficulty ?? difficultyFromGrade(input);
    const list = byDifficulty[difficulty];
    if (!list || !list.length) return fail(opts, `no ${difficulty} templates for ${input.skillId}`);

    const seed = opts.seed ?? `${input.skillId}:${(input.operands ?? []).join(',')}`;
    const rng = makeRng(seed);

    const themes = Object.keys(context.themes ?? {});
    const theme = opts.theme ?? (themes.length ? pick(rng, themes) : '');

    const math = extractMath(input);
    const candidates: Template[] = shuffle(rng, selectForTheme(list, theme));
    for (const tpl of candidates) {
      const out = renderTemplate(tpl, math, context, theme, input.operation, rng);
      if (out) return out;
    }
    return fail(opts, `no renderable template for ${input.skillId} (${difficulty})`);
  }

  function applyWordProblem(rawRow: unknown, opts: WordProblemOptions = {}): unknown {
    if (!rawRow || typeof rawRow !== 'object') return rawRow;
    const row = rawRow as Record<string, unknown>;
    const skillId = firstSkillId(row);
    if (!skillId) {
      if (opts.strict) throw new WordProblemError('row has no skill id');
      return rawRow;
    }
    const input = rowToMathInput(row, skillId);
    const seed = opts.seed ?? (typeof row.id === 'string' ? row.id
      : typeof row.question_id === 'string' ? row.question_id
      : skillId);
    const stem = generateStem(input, { ...opts, seed });
    if (stem == null) return rawRow; // strict already threw inside generateStem
    return { ...row, questionText: stem };
  }

  function coverage(): CoverageReport {
    return validateWordProblemData(data);
  }

  return { applyWordProblem, generateStem, coverage, supportedSkills };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/word-problems/engine.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/word-problems/engine.ts tests/word-problems/engine.test.ts
git commit -m "feat(word-problems): add engine (apply/generate/coverage, fallback + strict)"
```

---

## Task 7: Loader

**Files:**
- Create: `src/word-problems/loader.ts`
- Test: `tests/word-problems/loader.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/word-problems/loader.test.ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  loadWordProblemData,
  RECOMMENDED_TEMPLATES_PATH,
  RECOMMENDED_CONTEXT_PATH,
} from '../../src/word-problems/loader';

afterEach(() => vi.unstubAllGlobals());

describe('loadWordProblemData', () => {
  it('fetches the recommended paths by default and returns data', async () => {
    const urls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (u: string) => {
      urls.push(u);
      const body = u.includes('templates') ? { ADD: { beginner: ['{a}'] } } : { themes: {} };
      return { ok: true, json: async () => body } as Response;
    }));

    const data = await loadWordProblemData();
    expect(urls).toEqual([RECOMMENDED_TEMPLATES_PATH, RECOMMENDED_CONTEXT_PATH]);
    expect(data.templates).toHaveProperty('ADD');
    expect(data.context).toHaveProperty('themes');
  });

  it('uses custom urls when given', async () => {
    const urls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (u: string) => {
      urls.push(u);
      return { ok: true, json: async () => ({}) } as Response;
    }));
    await loadWordProblemData({ templatesUrl: '/t.json', contextUrl: '/c.json' });
    expect(urls).toEqual(['/t.json', '/c.json']);
  });

  it('throws a clear error on a failed fetch', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404 } as Response)));
    await expect(loadWordProblemData()).rejects.toThrow(/404/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/word-problems/loader.test.ts`
Expected: FAIL — cannot find module `loader`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/word-problems/loader.ts
import type { ContextData, TemplateMap, WordProblemData } from './types';

/** Conventional locations a project can serve its data from. Override as needed. */
export const RECOMMENDED_TEMPLATES_PATH = '/word-problems/word_templates.json';
export const RECOMMENDED_CONTEXT_PATH = '/word-problems/context.json';

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`word-problems: failed to load ${url} (${res.status})`);
  return (await res.json()) as T;
}

/**
 * Load templates + context by URL (browser-safe; no filesystem). Defaults to the
 * recommended paths. Feed the result to createWordProblemEngine().
 */
export async function loadWordProblemData(opts: {
  templatesUrl?: string;
  contextUrl?: string;
} = {}): Promise<WordProblemData> {
  const templatesUrl = opts.templatesUrl ?? RECOMMENDED_TEMPLATES_PATH;
  const contextUrl = opts.contextUrl ?? RECOMMENDED_CONTEXT_PATH;
  const templates = await fetchJson<TemplateMap>(templatesUrl);
  const context = await fetchJson<ContextData>(contextUrl);
  return { templates, context };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/word-problems/loader.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/word-problems/loader.ts tests/word-problems/loader.test.ts
git commit -m "feat(word-problems): add fetch-based data loader + recommended paths"
```

---

## Task 8: Barrel, vendored data, sample-data entry, tsconfig

**Files:**
- Create: `src/word-problems/index.ts`
- Create: `src/word-problems/sample-data.ts`
- Create: `src/word-problems/data/word_templates.json` (copied)
- Create: `src/word-problems/data/context.json` (copied)
- Modify: `tsconfig.json`
- Test: `tests/word-problems/sample-data.test.ts`

- [ ] **Step 1: Vendor the data files**

Run:

```bash
mkdir -p src/word-problems/data
cp /Users/davidbrabbins/Documents/Bluewizard/Education/mathSkills/data/templates/word_templates.json src/word-problems/data/word_templates.json
cp /Users/davidbrabbins/Documents/Bluewizard/Education/mathSkills/data/templates/context.json src/word-problems/data/context.json
```

Expected: two JSON files exist under `src/word-problems/data/`.

- [ ] **Step 2: Enable JSON imports in tsconfig**

Modify `tsconfig.json` — add `"resolveJsonModule": true` inside `compilerOptions` (e.g. after `"esModuleInterop": true,`):

```json
    "esModuleInterop": true,
    "resolveJsonModule": true,
```

- [ ] **Step 3: Write the failing test**

```ts
// tests/word-problems/sample-data.test.ts
import { describe, it, expect } from 'vitest';
import { sampleTemplates, sampleContext } from '../../src/word-problems/sample-data';
import { validateWordProblemData } from '../../src/word-problems/validate';
import { createWordProblemEngine } from '../../src/word-problems/engine';

describe('bundled sample data', () => {
  it('is structurally valid (no hard errors)', () => {
    const report = validateWordProblemData({ templates: sampleTemplates, context: sampleContext });
    expect(report.ok).toBe(true);
    expect(report.total).toBeGreaterThan(50);
  });

  it('renders a real addition word problem deterministically', () => {
    const engine = createWordProblemEngine({ templates: sampleTemplates, context: sampleContext });
    const row = {
      id: 'ADD-WITHIN-10-x',
      skill_ids: ['ADD-WITHIN-10'],
      content: { operands: [5, 3], operation: 'addition' },
      answer: 8,
    };
    const out = engine.applyWordProblem(row, { difficulty: 'intermediate' }) as { questionText: string };
    expect(out.questionText).toContain('5');
    expect(out.questionText).toContain('3');
    const again = engine.applyWordProblem(row, { difficulty: 'intermediate' }) as { questionText: string };
    expect(out.questionText).toBe(again.questionText);
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npx vitest run tests/word-problems/sample-data.test.ts`
Expected: FAIL — cannot find module `sample-data`.

- [ ] **Step 5: Write the barrel + sample-data module**

```ts
// src/word-problems/index.ts
export { createWordProblemEngine } from './engine';
export { validateWordProblemData } from './validate';
export {
  loadWordProblemData,
  RECOMMENDED_TEMPLATES_PATH,
  RECOMMENDED_CONTEXT_PATH,
} from './loader';
export { WordProblemError } from './types';
export type {
  WordProblemData,
  WordProblemOptions,
  WordProblemEngine,
  TemplateMap,
  ContextData,
  Template,
  DifficultyTemplates,
  Difficulty,
  MathInput,
  CoverageReport,
  SkillCoverage,
} from './types';
```

```ts
// src/word-problems/sample-data.ts
// Optional bundled dataset. Imported ONLY via chocabloc-questions/word-problems/sample-data
// so it never ships unless explicitly imported. Source: mathSkills templates (vendored copy).
import templatesJson from './data/word_templates.json';
import contextJson from './data/context.json';
import type { ContextData, TemplateMap } from './types';

// word_templates.json carries a "_meta" block; strip it so it isn't treated as a skill.
const { _meta, ...templates } = templatesJson as unknown as Record<string, unknown>;
void _meta;

export const sampleTemplates = templates as unknown as TemplateMap;
export const sampleContext = contextJson as unknown as ContextData;
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run tests/word-problems/sample-data.test.ts`
Expected: PASS.

- [ ] **Step 7: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add src/word-problems/index.ts src/word-problems/sample-data.ts src/word-problems/data tsconfig.json tests/word-problems/sample-data.test.ts
git commit -m "feat(word-problems): add barrel, vendored sample data, JSON imports"
```

---

## Task 9: Build wiring (Vite entries, exports, size-limit, coverage excludes)

**Files:**
- Modify: `vite.config.ts:21-30`
- Modify: `package.json` (exports, scripts)
- Modify: `.size-limit.cjs`
- Modify: `vitest.config.ts` (coverage excludes)
- Create: `scripts/word-problems/validate.mjs`

- [ ] **Step 1: Add the two Vite entries**

In `vite.config.ts`, inside `build.lib.entry`, add these two lines after the existing `'elements/whiteboard'` entry:

```ts
        'elements/whiteboard': resolve(__dirname, 'src/elements/whiteboard.ts'),
        'word-problems/index': resolve(__dirname, 'src/word-problems/index.ts'),
        'word-problems/sample-data': resolve(__dirname, 'src/word-problems/sample-data.ts'),
```

- [ ] **Step 2: Add the exports (do NOT add to `sideEffects`)**

In `package.json`, add to `exports` after the `"./host"` block:

```json
    "./word-problems": {
      "types": "./dist/word-problems/index.d.ts",
      "import": "./dist/word-problems/index.mjs"
    },
    "./word-problems/sample-data": {
      "types": "./dist/word-problems/sample-data.d.ts",
      "import": "./dist/word-problems/sample-data.mjs"
    },
```

Add to `scripts`:

```json
    "wp:validate": "node scripts/word-problems/validate.mjs",
```

Leave `sideEffects` untouched — the word-problems modules are pure, so their absence from the list keeps them tree-shakeable.

- [ ] **Step 3: Add the size budget**

In `.size-limit.cjs`, add an object to the array (after the `full` entry):

```js
  {
    name: 'word-problems engine (no data)',
    path: 'dist/word-problems/index.mjs',
    limit: '8 KB',
    gzip: true,
  },
```

- [ ] **Step 4: Exclude re-export-only files from coverage**

In `vitest.config.ts`, add to `coverage.exclude`:

```ts
        'src/helpers-only.ts',              // re-export only
        'src/word-problems/index.ts',       // re-export only
        'src/word-problems/sample-data.ts', // re-export of vendored JSON
```

- [ ] **Step 5: Write the CLI validator**

```js
// scripts/word-problems/validate.mjs
// Validate a word-problem dataset and print a coverage report.
// Usage: node scripts/word-problems/validate.mjs [templates.json] [context.json]
// Defaults to the vendored sample data. Exits non-zero on structural errors.
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { validateWordProblemData } from '../../src/word-problems/validate.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = resolve(__dirname, '../../src/word-problems/data');

const templatesPath = process.argv[2] ?? resolve(dataDir, 'word_templates.json');
const contextPath = process.argv[3] ?? resolve(dataDir, 'context.json');

const raw = JSON.parse(readFileSync(templatesPath, 'utf8'));
delete raw._meta;
const context = JSON.parse(readFileSync(contextPath, 'utf8'));

const report = validateWordProblemData({ templates: raw, context });

console.log(`skills: ${report.total}  rendering: ${report.rendering}  falling back: ${report.fallingBack}`);
for (const s of report.skills.filter((s) => !s.renders)) {
  console.log(`  ⚠ ${s.skillId} — ${s.reason}`);
}
if (report.errors.length) {
  console.error(`\n${report.errors.length} structural error(s):`);
  for (const e of report.errors) console.error(`  ✗ ${e}`);
  process.exit(1);
}
console.log('\nOK: no structural errors.');
```

Note: run it with a TypeScript-aware loader, e.g. `npx vite-node scripts/word-problems/validate.mjs`, since it imports a `.ts` module. If that is inconvenient in CI, this step is optional — the same logic is covered by `tests/word-problems/sample-data.test.ts`.

- [ ] **Step 6: Build and check sizes**

Run: `npm run build && npm run size`
Expected: build emits `dist/word-problems/index.mjs` and `dist/word-problems/sample-data.mjs`; size check passes with the engine bundle under 8 KB gz.

- [ ] **Step 7: Commit**

```bash
git add vite.config.ts package.json .size-limit.cjs vitest.config.ts scripts/word-problems/validate.mjs
git commit -m "build(word-problems): wire vite entries, exports, size budget, CLI validator"
```

---

## Task 10: Tree-shake proof + unchanged-behavior test

**Files:**
- Modify: `tests/tree-shake-test.mjs`
- Create: `tests/word-problems/unchanged-normalize.test.ts`

- [ ] **Step 1: Write the unchanged-behavior test**

```ts
// tests/word-problems/unchanged-normalize.test.ts
import { describe, it, expect } from 'vitest';
import { normalizeQuestion } from '../../src/helpers/normalizer';
// Importing the engine must not change normalize behavior in any way.
import { createWordProblemEngine } from '../../src/word-problems/engine';

describe('word-problems import does not affect normalization', () => {
  it('normalizeQuestion output is unchanged whether or not the engine is imported', () => {
    void createWordProblemEngine; // reference the import so it is not elided
    const row = {
      id: 'ADD-1',
      skill_ids: ['ADD-WITHIN-10'],
      format: 'addition',
      content: { operands: [5, 3], operation: 'addition' },
      answer: 8,
      distractors: [{ value: 7, error_type: 'off-by-1' }],
    };
    const q = normalizeQuestion(row);
    expect(q).toMatchObject({
      id: 'ADD-1',
      format: 'text',
      content: { stem: '5 + 3 = ?' },
      answer: 8,
    });
  });

  it('applyWordProblem never mutates the input row', () => {
    const engine = createWordProblemEngine({
      templates: { 'ADD-WITHIN-10': { intermediate: ['{a} plus {b}. How many?'] } },
      context: {},
    });
    const row = { id: 'x', skill_ids: ['ADD-WITHIN-10'], content: { operands: [5, 3] }, answer: 8 };
    const snapshot = JSON.stringify(row);
    engine.applyWordProblem(row, { difficulty: 'intermediate' });
    expect(JSON.stringify(row)).toBe(snapshot);
  });
});
```

- [ ] **Step 2: Run it**

Run: `npx vitest run tests/word-problems/unchanged-normalize.test.ts`
Expected: PASS.

- [ ] **Step 3: Extend the tree-shake proof**

In `tests/tree-shake-test.mjs`, add `'createWordProblemEngine'` to the `leaks` array so a helpers-only import is proven not to pull word-problem code:

```js
const leaks = [
  'customElements.define',
  'shadowRoot',
  'attachShadow',
  'chocabloc-question',
  'choca-coin-pile',
  'choca-canvas-question',
  'createWordProblemEngine',
];
```

Then, before the final `rmSync(tmpDir, ...)` at the end of the file, add a second check proving the engine bundle carries no sample data:

```js
// --- Prove the engine bundle does NOT include the sample dataset ---
writeFileSync(resolve(tmpDir, 'wp-entry.js'), `
  import { createWordProblemEngine } from '../dist/word-problems/index.mjs';
  console.log(createWordProblemEngine);
`);

const wpResult = await build({
  root: tmpDir,
  logLevel: 'silent',
  build: {
    write: true,
    outDir: resolve(tmpDir, 'wp-out'),
    lib: { entry: resolve(tmpDir, 'wp-entry.js'), formats: ['es'] },
    minify: false,
    rollupOptions: { external: [] },
  },
});

const wpCode = (wpResult.output || wpResult[0]?.output || []).map(o => o.code || '').join('\n');
const dataSentinel = 'catacomb'; // a theme name present only in the sample dataset
if (wpCode.includes(dataSentinel)) {
  console.error(`FAIL: word-problems engine bundle leaked sample data ("${dataSentinel}").`);
  rmSync(tmpDir, { recursive: true, force: true });
  process.exit(1);
}
console.log('PASS: word-problems engine bundle carries no sample data.');
```

- [ ] **Step 4: Build then run the tree-shake proof**

Run: `npm run build && node tests/tree-shake-test.mjs`
Expected: both `PASS:` lines print; exit 0.

- [ ] **Step 5: Commit**

```bash
git add tests/tree-shake-test.mjs tests/word-problems/unchanged-normalize.test.ts
git commit -m "test(word-problems): prove tree-shaking + unchanged normalization"
```

---

## Task 11: Docs + full CI

**Files:**
- Modify: `README.md`
- Modify: `CLAUDE.md`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: CHANGELOG entry**

Add under the `## [Unreleased]` heading in `CHANGELOG.md`:

```markdown
### Added
- **Word-problem support (optional, tree-shakeable).** New `chocabloc-questions/word-problems`
  subpath: `createWordProblemEngine(data)` rewrites a raw question's `questionText` into a
  themed, seeded word problem without changing the math (numbers, answer, distractors, skill,
  and format pass through untouched). Data is injected and agnostic — bring your own templates
  + context, or import the bundled sample set from `chocabloc-questions/word-problems/sample-data`.
  `loadWordProblemData()` fetches per-project data by URL. No compatible template → the original
  question is returned unchanged (or `strict: true` throws `WordProblemError`).
```

- [ ] **Step 2: README section**

Add a section to `README.md` (near the bridge/host subpath docs):

```markdown
## Word problems (optional)

`chocabloc-questions/word-problems` turns a bare math question into a themed word
problem, deterministically, without changing the math. It ships no data — you inject
your own templates + context (or import the bundled sample set).

```ts
import { createWordProblemEngine, loadWordProblemData } from 'chocabloc-questions/word-problems';

const data = await loadWordProblemData(); // or { templatesUrl, contextUrl }
const engine = createWordProblemEngine(data);

const worded = engine.applyWordProblem(rawRow, { difficulty: 'intermediate' });
// worded.questionText is a word problem; answer/content/distractors/skill_ids unchanged.
// No matching template → rawRow returned unchanged (or pass { strict: true } to throw).
```

Recommended data paths: `/word-problems/word_templates.json` and `/word-problems/context.json`
(override per project). Validate any dataset with `validateWordProblemData(data)` or
`node scripts/word-problems/validate.mjs`.
```

- [ ] **Step 3: CLAUDE.md note**

Add to `CLAUDE.md` under the host-integration / architecture area:

```markdown
### Word problems (`src/word-problems/`)

Optional, data-agnostic, seeded word-problem renderer on the `word-problems` subpath.
`createWordProblemEngine(data).applyWordProblem(rawRow)` rewrites **only** `questionText`;
it runs on the **raw row** (before `normalizeWithStem` drops `operands`). Ships no data;
`sample-data` is a separate entry. Pure/tree-shakeable — do NOT add it to `sideEffects`.
```

- [ ] **Step 4: Run the full CI gate**

Run: `npm run ci`
Expected: typecheck, lint, tests (incl. new word-problems suite), build, and size all pass.

- [ ] **Step 5: Commit**

```bash
git add README.md CLAUDE.md CHANGELOG.md
git commit -m "docs(word-problems): document subpath, recommended paths, and API"
```

---

## Self-review notes

- **Spec coverage:** engine/apply-on-raw-row (Task 6), generic extractor (Task 3), renderer with pluralization + guard (Task 4), seeded determinism (Tasks 2/6/8), validation + coverage (Task 5, CLI Task 9), fallback + strict (Task 6), three layers — engine (Task 8), loader (Task 7), sample-data (Task 8) — tree-shaking (Tasks 9/10), unchanged behavior (Task 10), docs (Task 11). All spec sections map to a task.
- **Types consistency:** `MathInput`, `WordProblemOptions`, `WordProblemData`, `CoverageReport`, `Template`, `WordProblemEngine` defined once in Task 1 and used unchanged thereafter. `renderTemplate` / `selectForTheme` / `extractMath` / `validateWordProblemData` / `makeRng` / `pick` / `shuffle` signatures match across tasks.
- **No placeholders:** every code step contains full code; every command lists expected output.

## Open risk to watch during execution

The vendored `word_templates.json` may contain templates whose placeholders the generic extractor can't satisfy for some skills — those skills fall back (expected). Run `npm run wp:validate` (or read `tests/word-problems/sample-data.test.ts` output) to see the coverage list; a large `fallingBack` count is informational, not a failure, unless `ok` is false.
```
