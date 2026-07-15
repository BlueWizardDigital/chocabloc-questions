# Word-Problem Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an optional, data-agnostic, seeded word-problem renderer that rewrites a raw question's `questionText` into a themed word problem **without changing the math**, shipped on its own tree-shakeable subpath.

**Architecture:** A data-free engine (`createWordProblemEngine(data)`) takes injected template + context data and exposes `applyWordProblem(rawRow)`. Per candidate template it runs a **math-compatibility gate** (all operands present, fraction represented, answer not revealed) before a **render** (adventure101-style pluralization). It tries themes until one renders; no compatible/renderable template → return the original row (or throw in strict mode). Sample data ships as a separate optional subpath; a `fetch` loader is provided for per-project data.

**Tech Stack:** TypeScript, Vite (multi-entry lib), Vitest, `vite-node`, size-limit. No new runtime dependencies.

---

## Design decisions locked from review

- **Compatibility ≠ resolvability.** A template is only usable if it represents ALL of the question's math: every operand placeholder present; fractions via `{fraction}` or both `{fraction_a}`+`{fraction_b}`; scalars required only when no operands/fraction define the math; `{result}` forbidden unless `opts.allowResult`. This is the core correctness gate.
- **Themes are tried, not gambled.** When no theme is requested, deterministically shuffle all themes and try until one renders. Fall back only after exhausting compatible templates × themes.
- **Difficulty degrades by nearest bucket:** `beginner→intermediate→advanced`, `intermediate→beginner→advanced`, `advanced→intermediate→beginner`. First non-empty bucket wins.
- **Skill selection scans all IDs**, choosing the first in `supportedSkills`.
- **`analyzeDataset` is static only** (structural errors + placeholder audit). It does not claim runtime renderability. Runtime renderability is proven by rendering representative rows in tests.
- **Determinism** comes from a `stableSeed` over all normalized math fields (scalars sorted), or the row `id`.

## File structure

**New (`src/word-problems/`):** `types.ts` (contract + `WordProblemError`), `rng.ts` (seeded PRNG), `extract.ts` (raw math → placeholder strings), `compat.ts` (math-compatibility gate), `parser.ts` (one template → sentence), `validate.ts` (`analyzeDataset`), `engine.ts` (orchestration), `loader.ts` (`fetch` data), `index.ts` (barrel), `sample-data.ts` (vendored JSON re-export), `data/word_templates.json`, `data/context.json`.

**New:** `scripts/word-problems/validate.ts` (CLI via vite-node), `tests/word-problems/*.test.ts`.

**Modified:** `tsconfig.json`, `vite.config.ts`, `package.json`, `.size-limit.cjs`, `vitest.config.ts`, `tests/tree-shake-test.mjs`, `README.md`, `CLAUDE.md`, `CHANGELOG.md`.

---

## Task 1: Contracts, RNG, extraction, compatibility

**Files:**
- Create: `src/word-problems/types.ts`, `src/word-problems/rng.ts`, `src/word-problems/extract.ts`, `src/word-problems/compat.ts`
- Test: `tests/word-problems/rng.test.ts`, `tests/word-problems/extract.test.ts`, `tests/word-problems/compat.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// tests/word-problems/rng.test.ts
import { describe, it, expect } from 'vitest';
import { makeRng, pick, shuffle } from '../../src/word-problems/rng';

describe('seeded rng', () => {
  it('is deterministic for a given seed', () => {
    const a = makeRng('seed-1'), b = makeRng('seed-1');
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });
  it('differs across seeds', () => {
    expect(makeRng('seed-1')()).not.toBe(makeRng('seed-2')());
  });
  it('accepts numeric seeds', () => {
    expect(makeRng(42)()).toBe(makeRng(42)());
  });
  it('pick returns a member deterministically', () => {
    const arr = ['x', 'y', 'z'];
    expect(pick(makeRng('s'), arr)).toBe(pick(makeRng('s'), arr));
    expect(arr).toContain(pick(makeRng('s'), arr));
  });
  it('pick throws on an empty array', () => {
    expect(() => pick(makeRng('s'), [])).toThrow();
  });
  it('shuffle is a deterministic permutation that does not mutate input', () => {
    const arr = [1, 2, 3, 4, 5];
    const s1 = shuffle(makeRng('s'), arr), s2 = shuffle(makeRng('s'), arr);
    expect(s1).toEqual(s2);
    expect([...s1].sort()).toEqual(arr);
    expect(arr).toEqual([1, 2, 3, 4, 5]);
  });
});
```

```ts
// tests/word-problems/extract.test.ts
import { describe, it, expect } from 'vitest';
import { extractMath } from '../../src/word-problems/extract';

describe('extractMath', () => {
  it('maps operands positionally and answer to result', () => {
    expect(extractMath({ skillId: 'ADD', operands: [23, 5], answer: 28 }))
      .toMatchObject({ a: '23', b: '5', result: '28' });
  });
  it('maps a fraction to fraction / fraction_a / fraction_b', () => {
    expect(extractMath({ skillId: 'F', fraction: [3, 4] }))
      .toMatchObject({ fraction: '3/4', fraction_a: '3', fraction_b: '4' });
  });
  it('exposes scalar fields under their own key', () => {
    expect(extractMath({ skillId: 'P', scalars: { percent: 25, whole: 80 } }))
      .toMatchObject({ percent: '25', whole: '80' });
  });
  it('does not let scalars clobber positional keys', () => {
    expect(extractMath({ skillId: 'X', operands: [1, 2], scalars: { a: 999 } }).a).toBe('1');
  });
  it('omits absent inputs', () => {
    expect(extractMath({ skillId: 'X' })).toEqual({});
  });
});
```

```ts
// tests/word-problems/compat.test.ts
import { describe, it, expect } from 'vitest';
import { templateCompatibility } from '../../src/word-problems/compat';

describe('templateCompatibility', () => {
  it('requires every operand placeholder', () => {
    const r = templateCompatibility('{name} has {a} apples.', { skillId: 'X', operands: [23, 5] });
    expect(r.ok).toBe(false);
    expect(r.missing).toContain('b');
  });
  it('passes when all operands are present', () => {
    expect(templateCompatibility('{a} + {b}', { skillId: 'X', operands: [1, 2] }).ok).toBe(true);
  });
  it('forbids {result} by default and reports it', () => {
    const r = templateCompatibility('{a} + {b} = {result}', { skillId: 'X', operands: [1, 2] });
    expect(r.ok).toBe(false);
    expect(r.exposesResult).toBe(true);
  });
  it('allows {result} when opted in', () => {
    expect(templateCompatibility('{a}+{b}={result}', { skillId: 'X', operands: [1, 2] }, { allowResult: true }).ok).toBe(true);
  });
  it('accepts a fraction via {fraction} or both parts, not one part', () => {
    expect(templateCompatibility('{fraction} of it', { skillId: 'X', fraction: [3, 4] }).ok).toBe(true);
    expect(templateCompatibility('{fraction_a}/{fraction_b}', { skillId: 'X', fraction: [3, 4] }).ok).toBe(true);
    expect(templateCompatibility('just {fraction_a}', { skillId: 'X', fraction: [3, 4] }).ok).toBe(false);
  });
  it('requires scalars only when no operands/fraction define the math', () => {
    expect(templateCompatibility('{percent}% of {whole}', { skillId: 'X', scalars: { percent: 25, whole: 80 } }).ok).toBe(true);
    expect(templateCompatibility('{percent}% only', { skillId: 'X', scalars: { percent: 25, whole: 80 } }).ok).toBe(false);
    expect(templateCompatibility('{a} and {b}', { skillId: 'X', operands: [1, 2], scalars: { extra: 9 } }).ok).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/word-problems/rng.test.ts tests/word-problems/extract.test.ts tests/word-problems/compat.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Write the implementations**

```ts
// src/word-problems/types.ts

/** A template is a plain string, or an object restricting it to certain themes. */
export type Template = string | { template: string; themes?: string[] };

export interface DifficultyTemplates {
  beginner?: Template[];
  intermediate?: Template[];
  advanced?: Template[];
}

/** skillId -> difficulty -> templates. Keys are data, never hard-coded. */
export type TemplateMap = Record<string, DifficultyTemplates>;

/** Vocab. Structure follows the shared FORMAT; the VALUES are all data. */
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
  /** Deterministic selection. Default: the row id, else a hash of the math. */
  seed?: number | string;
  /** Default: mapped from grade, else 'intermediate'. */
  difficulty?: Difficulty;
  /** Any theme key present in context. Default: try all themes (seeded order). */
  theme?: string;
  /** No compatible/renderable template -> throw instead of falling back. */
  strict?: boolean;
  /** Permit a template to include {result} (reveals the answer). Default: false. */
  allowResult?: boolean;
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

/** Static analysis of a dataset — NOT a claim about runtime renderability. */
export interface SkillAnalysis {
  skillId: string;
  /** Keys that are neither math nor a context pool — possible scalars or typos. */
  unrecognizedPlaceholders: string[];
  /** True if any template references {result} (would reveal the answer). */
  exposesResult: boolean;
}

export interface DatasetAnalysis {
  ok: boolean;            // false only when there are structural errors
  total: number;
  errors: string[];       // structural (hard) problems
  skills: SkillAnalysis[];
}

export interface WordProblemEngine {
  /** Reword a raw row's questionText, preserving its type. Original on fallback. */
  applyWordProblem<T>(rawRow: T, opts?: WordProblemOptions): T;
  generateStem(input: MathInput, opts?: WordProblemOptions): string | null;
  readonly supportedSkills: ReadonlySet<string>;
}

export class WordProblemError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WordProblemError';
  }
}
```

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

/** Pick a member. Throws on empty input — callers must guarantee non-empty. */
export function pick<T>(rng: Rng, arr: readonly T[]): T {
  if (arr.length === 0) throw new Error('word-problems: pick() called on an empty array');
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

```ts
// src/word-problems/extract.ts
import type { MathInput } from './types';

export const LETTERS = ['a', 'b', 'c', 'd', 'e', 'f'] as const;

/** Build the math placeholder map for a question. All values are strings. */
export function extractMath(input: MathInput): Record<string, string> {
  const out: Record<string, string> = {};

  (input.operands ?? []).forEach((v, i) => {
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

```ts
// src/word-problems/compat.ts
import { LETTERS } from './extract';
import type { MathInput } from './types';

const PLACEHOLDER = /\{([a-z_0-9]+)\}/gi;

export interface Compatibility {
  ok: boolean;
  missing: string[];      // required math placeholders the template omits
  exposesResult: boolean; // template reveals the answer via {result}
}

function placeholderSet(text: string): Set<string> {
  const s = new Set<string>();
  for (const m of text.matchAll(PLACEHOLDER)) s.add(m[1] as string);
  return s;
}

/**
 * Does this template represent ALL of the question's math? Run BEFORE rendering.
 * Prevents silently dropping an operand or revealing the answer.
 */
export function templateCompatibility(
  text: string,
  input: MathInput,
  opts: { allowResult?: boolean } = {},
): Compatibility {
  const ph = placeholderSet(text);
  const missing: string[] = [];

  const ops = input.operands ?? [];
  ops.forEach((_, i) => {
    const k = LETTERS[i];
    if (k && !ph.has(k)) missing.push(k);
  });

  if (input.fraction) {
    const hasFrac = ph.has('fraction') || (ph.has('fraction_a') && ph.has('fraction_b'));
    if (!hasFrac) missing.push('fraction');
  }

  // Scalars carry the math only when there are no operands/fraction to define it.
  if (ops.length === 0 && !input.fraction) {
    for (const k of Object.keys(input.scalars ?? {})) if (!ph.has(k)) missing.push(k);
  }

  const exposesResult = ph.has('result') && !opts.allowResult;
  return { ok: missing.length === 0 && !exposesResult, missing, exposesResult };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/word-problems/rng.test.ts tests/word-problems/extract.test.ts tests/word-problems/compat.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/word-problems/types.ts src/word-problems/rng.ts src/word-problems/extract.ts src/word-problems/compat.ts tests/word-problems/rng.test.ts tests/word-problems/extract.test.ts tests/word-problems/compat.test.ts
git commit -m "feat(word-problems): contracts, seeded rng, extractor, math-compatibility gate"
```

---

## Task 2: Rendering + static validation

**Files:**
- Create: `src/word-problems/parser.ts`, `src/word-problems/validate.ts`
- Test: `tests/word-problems/parser.test.ts`, `tests/word-problems/validate.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// tests/word-problems/parser.test.ts
import { describe, it, expect } from 'vitest';
import { renderTemplate, pluralCount, slash, selectForTheme } from '../../src/word-problems/parser';
import { makeRng } from '../../src/word-problems/rng';
import type { ContextData } from '../../src/word-problems/types';

// Single-element pools -> output is independent of RNG selection.
const ctx: ContextData = {
  themes: { cave: { item: ['gem/gems'], location: ['cavern/caverns'] } },
  characters: { names: ['Emma'] },
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
  it('picks singular vs plural, passes non-slash through', () => {
    expect(slash('gem/gems', 1)).toBe('gem');
    expect(slash('gem/gems', 3)).toBe('gems');
    expect(slash('fish', 3)).toBe('fish');
  });
});

describe('selectForTheme', () => {
  it('prefers theme-specific templates over universal ones', () => {
    const list = ['universal', { template: 'cave-only', themes: ['cave'] }];
    expect(selectForTheme(list, 'cave')).toEqual([{ template: 'cave-only', themes: ['cave'] }]);
    expect(selectForTheme(list, 'forest')).toEqual(['universal']);
  });
});

describe('renderTemplate', () => {
  it('fills math + context and agrees in number', () => {
    expect(renderTemplate('{name} {verb_gain} {a} {item}. {question_total}', { a: '5' }, ctx, 'cave', 'addition', makeRng('s')))
      .toBe('Emma found 5 gems. How many in all?');
  });
  it('uses the singular form after 1', () => {
    expect(renderTemplate('{a} {item}', { a: '1' }, ctx, 'cave', 'addition', makeRng('s'))).toBe('1 gem');
  });
  it('resolves {~singular/plural} by preceding number', () => {
    expect(renderTemplate('{a} {~group/groups}', { a: '1' }, ctx, 'cave', 'addition', makeRng('s'))).toBe('1 group');
  });
  it('returns null when a placeholder cannot be resolved (guard)', () => {
    expect(renderTemplate('{a} {c} {item}', { a: '5' }, ctx, 'cave', 'addition', makeRng('s'))).toBeNull();
  });
  it('returns null when the theme lacks the needed vocab', () => {
    expect(renderTemplate('{item}', {}, ctx, 'nonexistent', 'addition', makeRng('s'))).toBeNull();
  });
  it('draws distinct values for repeated keys and supports exact character keys', () => {
    const ctx2: ContextData = {
      themes: { cave: { item: ['gem/gems', 'ruby/rubies'] } },
      characters: { hero: ['Zed'] }, // exact key, no trailing 's'
    };
    const out = renderTemplate('{hero}: {item} and {item2}', {}, ctx2, 'cave', undefined, makeRng('s'));
    expect(out).toMatch(/^Zed: /);
    const [i1, i2] = (out as string).split(': ')[1]!.split(' and ');
    expect(i1).not.toBe(i2); // {item} and {item2} resolve to different pool entries
  });
});
```

```ts
// tests/word-problems/validate.test.ts
import { describe, it, expect } from 'vitest';
import { analyzeDataset } from '../../src/word-problems/validate';
import type { WordProblemData } from '../../src/word-problems/types';

const context = {
  themes: { cave: { item: ['gem/gems'] } },
  characters: { names: ['Emma'] },
  question_phrases: { total: ['How many?'] },
};

describe('analyzeDataset', () => {
  it('has no structural errors for good data', () => {
    const data: WordProblemData = { templates: { ADD: { beginner: ['{a} {item}. {question_total}'] } }, context };
    const r = analyzeDataset(data);
    expect(r.ok).toBe(true);
    expect(r.total).toBe(1);
  });
  it('lists unrecognized placeholders (possible typos) without failing', () => {
    const data: WordProblemData = { templates: { ADD: { beginner: ['{a} {iten}'] } }, context };
    const r = analyzeDataset(data);
    expect(r.ok).toBe(true);
    expect(r.skills[0]?.unrecognizedPlaceholders).toContain('iten');
  });
  it('flags a template that exposes {result}', () => {
    const data: WordProblemData = { templates: { ADD: { beginner: ['{a}+{b}={result}'] } }, context };
    expect(analyzeDataset(data).skills[0]?.exposesResult).toBe(true);
  });
  it('reports a structural error for double braces', () => {
    const data: WordProblemData = { templates: { ADD: { beginner: ['{{a}} {item}'] } }, context };
    const r = analyzeDataset(data);
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toContain('ADD');
  });
  it('reports a structural error when a difficulty is not an array', () => {
    const data = { templates: { ADD: { beginner: 'oops' } }, context } as unknown as WordProblemData;
    expect(analyzeDataset(data).ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/word-problems/parser.test.ts tests/word-problems/validate.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Write the implementations**

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

export function templateText(t: Template): string {
  return typeof t === 'string' ? t : t.template;
}

/** Theme-specific templates replace universal ones when present for a theme. */
export function selectForTheme(list: Template[], theme: string): Template[] {
  const themed = list.filter(
    (t): t is Exclude<Template, string> => typeof t !== 'string' && !!t.themes?.includes(theme),
  );
  if (themed.length) return themed;
  return list.filter((t) => typeof t === 'string' || !t.themes || t.themes.length === 0);
}

/** Resolve a context placeholder from injected data; null when no pool exists. */
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

/** Fill one template; null when any placeholder is left unresolved. */
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

  // Pass 2: context placeholders, singular/plural from the preceding number.
  const used = new Map<string, Set<string>>();
  text = text.replace(PLACEHOLDER, (m, key: string, offset: number, full: string) => {
    const val = resolveContext(key, ctx, theme, operation, rng, used);
    return val == null ? m : slash(val, pluralCount(full.slice(0, offset)));
  });

  // Pass 3: inline {~singular/plural} markers.
  text = text.replace(MARKER, (_m, s: string, p: string, offset: number, full: string) =>
    pluralCount(full.slice(0, offset)) === 1 ? s : p,
  );

  text = text.replace(/\s+/g, ' ').trim();

  if (/\{[^}]*\}/.test(text)) return null; // guard: leftover placeholder -> reject
  return text;
}
```

```ts
// src/word-problems/validate.ts
import type {
  ContextData,
  DatasetAnalysis,
  Difficulty,
  SkillAnalysis,
  Template,
  WordProblemData,
} from './types';
import { templateText } from './parser';

const DIFFICULTIES: Difficulty[] = ['beginner', 'intermediate', 'advanced'];
const PLACEHOLDER = /\{([a-z_0-9]+)\}/gi;
const MATH = new Set(['a', 'b', 'c', 'd', 'e', 'f', 'result', 'fraction', 'fraction_a', 'fraction_b']);

function contextHasPool(base: string, ctx: ContextData): boolean {
  if (ctx.characters && (Array.isArray(ctx.characters[base]) || Array.isArray(ctx.characters[base + 's']))) return true;
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

/**
 * STATIC analysis only: structural errors (hard) + a placeholder audit. It does
 * NOT prove runtime renderability — a key that is neither math nor a context
 * pool is treated as a possible scalar and merely listed for review.
 */
export function analyzeDataset(data: WordProblemData): DatasetAnalysis {
  const errors: string[] = [];
  const skills: SkillAnalysis[] = [];
  const ctx = data.context ?? {};

  for (const [skillId, byDifficulty] of Object.entries(data.templates ?? {})) {
    const unrecognized = new Set<string>();
    let exposesResult = false;

    for (const diff of DIFFICULTIES) {
      const list = byDifficulty[diff];
      if (list === undefined) continue;
      if (!Array.isArray(list)) {
        errors.push(`${skillId}.${diff}: expected an array of templates`);
        continue;
      }
      for (const tpl of list) {
        if (typeof tpl !== 'string' && (typeof tpl !== 'object' || tpl === null || typeof (tpl as Template & object).template !== 'string')) {
          errors.push(`${skillId}.${diff}: template must be a string or { template }`);
          continue;
        }
        const text = templateText(tpl);
        if (text.includes('{{') || text.includes('}}')) {
          errors.push(`${skillId}.${diff}: double braces in "${text.slice(0, 40)}"`);
        }
        for (const match of text.matchAll(PLACEHOLDER)) {
          const key = match[1] as string;
          const base = key.replace(/\d+$/, '');
          if (base === 'result') exposesResult = true;
          if (MATH.has(base) || contextHasPool(base, ctx)) continue;
          unrecognized.add(key);
        }
      }
    }

    skills.push({ skillId, unrecognizedPlaceholders: [...unrecognized], exposesResult });
  }

  return { ok: errors.length === 0, total: skills.length, errors, skills };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/word-problems/parser.test.ts tests/word-problems/validate.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/word-problems/parser.ts src/word-problems/validate.ts tests/word-problems/parser.test.ts tests/word-problems/validate.test.ts
git commit -m "feat(word-problems): template renderer + static dataset analysis"
```

---

## Task 3: Engine + loader

**Files:**
- Create: `src/word-problems/engine.ts`, `src/word-problems/loader.ts`
- Test: `tests/word-problems/engine.test.ts`, `tests/word-problems/loader.test.ts`

- [ ] **Step 1: Write the failing tests**

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
    'FRAC-X': { intermediate: ['{name} used {fraction} of the {item}. {question_total}'] },
    'DROP-B': { intermediate: ['{name} has {a} {item}. {question_total}'] }, // omits {b} -> incompatible
  },
  context: {
    themes: { cave: { item: ['gem/gems'] } },
    characters: { names: ['Emma'] },
    verbs: { addition: { gain: ['found'] } },
    question_phrases: { total: ['How many in all?'] },
  },
};
const engine = () => createWordProblemEngine(data);

describe('createWordProblemEngine', () => {
  it('rewrites questionText and preserves everything else', () => {
    const row = {
      id: 'ADD-X-1', skill_ids: ['ADD-X'], format: 'addition',
      content: { operands: [23, 5], operation: 'addition' }, answer: '28',
      distractors: [{ value: '27', error_type: 'off-by-1' }], questionText: '23 + 5 = ?',
    };
    const out = engine().applyWordProblem(row, { difficulty: 'intermediate', theme: 'cave' });
    expect(out.questionText).not.toBe('23 + 5 = ?');
    expect(out.questionText).toContain('23');
    expect(out.questionText).toContain('5');
    expect(out.answer).toBe('28');
    expect(out.content).toEqual(row.content);
    expect(out.distractors).toEqual(row.distractors);
    expect(out.skill_ids).toEqual(['ADD-X']);
  });

  it('is deterministic for the same row + seed', () => {
    const row = { id: 'ADD-X-1', skill_ids: ['ADD-X'], content: { operands: [4, 5] }, answer: 9 };
    expect(engine().applyWordProblem(row).questionText).toBe(engine().applyWordProblem(row).questionText);
  });

  it('rejects a template that drops an operand (compatibility gate)', () => {
    const row = { id: 'd1', skill_ids: ['DROP-B'], content: { operands: [7, 2] }, answer: 9 };
    expect(engine().applyWordProblem(row)).toBe(row); // no compatible template -> original
    expect(() => engine().applyWordProblem(row, { strict: true })).toThrow(WordProblemError);
  });

  it('renders fraction questions (covers fraction + scalar extraction)', () => {
    // `note` is an incidental scalar: extracted, but not required because a fraction defines the math.
    const row = { id: 'f1', skill_ids: ['FRAC-X'], content: { fraction: [3, 4], note: 'x' } };
    const out = engine().applyWordProblem(row, { difficulty: 'intermediate', theme: 'cave' });
    expect(out.questionText).toContain('3/4');
  });

  it('falls back / throws for an unknown skill', () => {
    const row = { id: 'z', skill_ids: ['NO-SUCH-SKILL'], content: { operands: [1, 2] }, answer: 3 };
    expect(engine().applyWordProblem(row)).toBe(row);
    expect(() => engine().applyWordProblem(row, { strict: true })).toThrow(WordProblemError);
  });

  it('picks the first supported skill id among several', () => {
    const row = { id: 'm', skill_ids: ['UNSUPPORTED', 'ADD-X'], content: { operands: [1, 2] }, answer: 3 };
    const out = engine().applyWordProblem(row, { theme: 'cave' });
    expect(out.questionText).toContain('1');
  });

  it('maps grade to difficulty when none is passed', () => {
    const e = engine();
    expect(e.generateStem({ skillId: 'ADD-X', operands: [1, 2], answer: 3, gradeBand: 'sprout' }, { theme: 'cave' })).toContain('1');
    expect(e.generateStem({ skillId: 'ADD-X', operands: [1, 2], answer: 3, gradeLevel: 6 }, { theme: 'cave' })).toContain('Emma');
  });

  it('degrades to the nearest difficulty bucket', () => {
    // FRAC-X only has intermediate; a beginner request still renders.
    const row = { id: 'f2', skill_ids: ['FRAC-X'], content: { fraction: [1, 2] } };
    expect(engine().applyWordProblem(row, { difficulty: 'beginner', theme: 'cave' }).questionText).toContain('1/2');
  });

  it('returns non-object inputs unchanged and exposes supportedSkills', () => {
    expect(engine().applyWordProblem(null)).toBe(null);
    expect(engine().supportedSkills.has('ADD-X')).toBe(true);
  });
});
```

```ts
// tests/word-problems/loader.test.ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { loadWordProblemData, RECOMMENDED_TEMPLATES_PATH, RECOMMENDED_CONTEXT_PATH } from '../../src/word-problems/loader';

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
    vi.stubGlobal('fetch', vi.fn(async (u: string) => { urls.push(u); return { ok: true, json: async () => ({}) } as Response; }));
    await loadWordProblemData({ templatesUrl: '/t.json', contextUrl: '/c.json' });
    expect(urls.sort()).toEqual(['/c.json', '/t.json']);
  });

  it('throws a clear error on a failed fetch', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404 } as Response)));
    await expect(loadWordProblemData()).rejects.toThrow(/404/);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/word-problems/engine.test.ts tests/word-problems/loader.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Write the implementations**

```ts
// src/word-problems/engine.ts
import type {
  Difficulty, MathInput, Template, WordProblemData, WordProblemEngine, WordProblemOptions,
} from './types';
import { WordProblemError } from './types';
import { extractMath } from './extract';
import { templateCompatibility } from './compat';
import { renderTemplate, selectForTheme, templateText } from './parser';
import { makeRng, shuffle } from './rng';

const NEAREST: Record<Difficulty, Difficulty[]> = {
  beginner: ['beginner', 'intermediate', 'advanced'],
  intermediate: ['intermediate', 'beginner', 'advanced'],
  advanced: ['advanced', 'intermediate', 'beginner'],
};

function difficultyFromGrade(input: MathInput): Difficulty {
  const { gradeBand, gradeLevel } = input;
  if (gradeBand === 'sprout' || (typeof gradeLevel === 'number' && gradeLevel <= 2)) return 'beginner';
  if (gradeBand === 'thunder' || (typeof gradeLevel === 'number' && gradeLevel >= 6)) return 'advanced';
  return 'intermediate';
}

/** Stable seed over every math-relevant field (scalars sorted for stability). */
function stableSeed(input: MathInput): string {
  const scalars = Object.keys(input.scalars ?? {}).sort().map((k) => `${k}=${input.scalars![k]}`).join(',');
  return [
    input.skillId,
    (input.operands ?? []).join(','),
    input.fraction ? input.fraction.join('/') : '',
    input.answer == null ? '' : String(input.answer),
    input.operation ?? '',
    scalars,
    input.gradeBand ?? '',
    input.gradeLevel ?? '',
  ].join('|');
}

function rowToMathInput(row: Record<string, unknown>, skillId: string): MathInput {
  const content = (typeof row.content === 'object' && row.content !== null ? row.content : {}) as Record<string, unknown>;

  const opsRaw = content.operands;
  const operands = Array.isArray(opsRaw) && opsRaw.every((n) => typeof n === 'number') ? (opsRaw as number[]) : undefined;

  const frRaw = content.fraction;
  const fraction = Array.isArray(frRaw) && frRaw.length === 2 && frRaw.every((n) => typeof n === 'number')
    ? ([frRaw[0], frRaw[1]] as [number, number]) : undefined;

  const scalars: Record<string, number | string> = {};
  for (const [k, v] of Object.entries(content)) {
    if (k === 'operands' || k === 'fraction' || k === 'operation') continue;
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

function rowId(row: Record<string, unknown>): string | undefined {
  if (typeof row.id === 'string') return row.id;
  if (typeof row.question_id === 'string') return row.question_id;
  return undefined;
}

export function createWordProblemEngine(data: WordProblemData): WordProblemEngine {
  const templates = data.templates ?? {};
  const context = data.context ?? {};
  const supportedSkills: ReadonlySet<string> = new Set(Object.keys(templates));
  const themeKeys = Object.keys(context.themes ?? {});

  function fail(opts: WordProblemOptions, message: string): null {
    if (opts.strict) throw new WordProblemError(message);
    return null;
  }

  /** Nearest non-empty difficulty bucket for a skill. */
  function templatesFor(skillId: string, pref: Difficulty): Template[] {
    const byDiff = templates[skillId];
    if (!byDiff) return [];
    for (const d of NEAREST[pref]) {
      const list = byDiff[d];
      if (list && list.length) return list;
    }
    return [];
  }

  function generateStem(input: MathInput, opts: WordProblemOptions = {}): string | null {
    if (!templates[input.skillId]) return fail(opts, `no templates for skill ${input.skillId}`);

    const pref = opts.difficulty ?? difficultyFromGrade(input);
    const list = templatesFor(input.skillId, pref);
    if (!list.length) return fail(opts, `no templates in any difficulty for ${input.skillId}`);

    const rng = makeRng(opts.seed ?? stableSeed(input));
    const math = extractMath(input);

    const compatible = shuffle(rng, list).filter(
      (t) => templateCompatibility(templateText(t), input, { allowResult: opts.allowResult }).ok,
    );
    if (!compatible.length) return fail(opts, `no math-compatible template for ${input.skillId}`);

    const themesToTry = opts.theme ? [opts.theme] : themeKeys.length ? shuffle(rng, themeKeys) : [''];
    for (const tpl of compatible) {
      const forTheme = (theme: string): Template[] => selectForTheme([tpl], theme);
      for (const theme of themesToTry) {
        const chosen = forTheme(theme)[0];
        if (!chosen) continue;
        const out = renderTemplate(chosen, math, context, theme, input.operation, rng);
        if (out) return out;
      }
    }
    return fail(opts, `no renderable template for ${input.skillId}`);
  }

  function applyWordProblem<T>(rawRow: T, opts: WordProblemOptions = {}): T {
    if (!rawRow || typeof rawRow !== 'object') return rawRow;
    const row = rawRow as Record<string, unknown>;
    const ids = (Array.isArray(row.skill_ids) ? row.skill_ids : Array.isArray(row.skillIds) ? row.skillIds : [])
      .filter((x): x is string => typeof x === 'string');
    const skillId = ids.find((id) => supportedSkills.has(id)) ?? ids[0];
    if (!skillId) {
      if (opts.strict) throw new WordProblemError(`row has no usable skill id (examined: ${ids.join(', ') || 'none'})`);
      return rawRow;
    }
    const input = rowToMathInput(row, skillId);
    const seed = opts.seed ?? rowId(row) ?? stableSeed(input);
    const stem = generateStem(input, { ...opts, seed });
    if (stem == null) return rawRow; // strict already threw inside generateStem
    return { ...row, questionText: stem } as T;
  }

  return { applyWordProblem, generateStem, supportedSkills };
}
```

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
 * Load templates + context by URL (browser-safe; no filesystem). Requests run
 * concurrently. Defaults to the recommended paths. Feed the result to
 * createWordProblemEngine().
 */
export async function loadWordProblemData(
  opts: { templatesUrl?: string; contextUrl?: string } = {},
): Promise<WordProblemData> {
  const templatesUrl = opts.templatesUrl ?? RECOMMENDED_TEMPLATES_PATH;
  const contextUrl = opts.contextUrl ?? RECOMMENDED_CONTEXT_PATH;
  const [templates, context] = await Promise.all([
    fetchJson<TemplateMap>(templatesUrl),
    fetchJson<ContextData>(contextUrl),
  ]);
  return { templates, context };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/word-problems/engine.test.ts tests/word-problems/loader.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/word-problems/engine.ts src/word-problems/loader.ts tests/word-problems/engine.test.ts tests/word-problems/loader.test.ts
git commit -m "feat(word-problems): engine (compat gate, theme iteration, difficulty fallback) + loader"
```

---

## Task 4: Packaging + sample data + CLI

**Files:**
- Create: `src/word-problems/index.ts`, `src/word-problems/sample-data.ts`, `src/word-problems/data/word_templates.json`, `src/word-problems/data/context.json`, `scripts/word-problems/validate.ts`
- Modify: `tsconfig.json`, `vite.config.ts:21-30`, `package.json`, `.size-limit.cjs`, `vitest.config.ts`
- Test: `tests/word-problems/sample-data.test.ts`

- [ ] **Step 1: Vendor the data + enable JSON imports**

Run:

```bash
mkdir -p src/word-problems/data scripts/word-problems
cp /Users/davidbrabbins/Documents/Bluewizard/Education/mathSkills/data/templates/word_templates.json src/word-problems/data/word_templates.json
cp /Users/davidbrabbins/Documents/Bluewizard/Education/mathSkills/data/templates/context.json src/word-problems/data/context.json
```

In `tsconfig.json`, add inside `compilerOptions` (after `"esModuleInterop": true,`):

```json
    "esModuleInterop": true,
    "resolveJsonModule": true,
```

- [ ] **Step 2: Write the failing test**

```ts
// tests/word-problems/sample-data.test.ts
import { describe, it, expect } from 'vitest';
import { sampleTemplates, sampleContext } from '../../src/word-problems/sample-data';
import { analyzeDataset } from '../../src/word-problems/validate';
import { createWordProblemEngine } from '../../src/word-problems/engine';

const REPRESENTATIVE = [
  { id: 'a1', skill_ids: ['ADD-WITHIN-10'], content: { operands: [5, 3], operation: 'addition' }, answer: 8 },
  { id: 'a2', skill_ids: ['ADD-2DIGIT-1DIGIT-NO-REGROUP'], content: { operands: [23, 5], operation: 'addition' }, answer: 28 },
];

describe('bundled sample data', () => {
  it('excludes _meta and is structurally valid', () => {
    expect(sampleTemplates).not.toHaveProperty('_meta');
    const report = analyzeDataset({ templates: sampleTemplates, context: sampleContext });
    expect(report.ok).toBe(true);
    expect(report.total).toBeGreaterThan(50);
  });

  it('renders representative skills with all operands and no leftover placeholders', () => {
    const engine = createWordProblemEngine({ templates: sampleTemplates, context: sampleContext });
    for (const row of REPRESENTATIVE) {
      const out = engine.applyWordProblem(row, { difficulty: 'intermediate' });
      expect(out.questionText, `${row.skill_ids[0]} should render`).toBeDefined();
      expect(out.questionText).not.toMatch(/[{}]/);
      expect(out.questionText).toContain(String(row.content.operands[0]));
      expect(out.questionText).toContain(String(row.content.operands[1]));
      // determinism:
      expect(engine.applyWordProblem(row, { difficulty: 'intermediate' }).questionText).toBe(out.questionText);
    }
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/word-problems/sample-data.test.ts`
Expected: FAIL — `sample-data` module not found.

- [ ] **Step 4: Write barrel, sample-data, CLI**

```ts
// src/word-problems/index.ts
export { createWordProblemEngine } from './engine';
export { analyzeDataset } from './validate';
export { loadWordProblemData, RECOMMENDED_TEMPLATES_PATH, RECOMMENDED_CONTEXT_PATH } from './loader';
export { WordProblemError } from './types';
export type {
  WordProblemData, WordProblemOptions, WordProblemEngine, TemplateMap, ContextData,
  Template, DifficultyTemplates, Difficulty, MathInput, DatasetAnalysis, SkillAnalysis,
} from './types';
```

```ts
// src/word-problems/sample-data.ts
// Optional bundled dataset. Imported ONLY via chocabloc-questions/word-problems/sample-data
// so it never ships unless explicitly imported. Source: mathSkills templates (vendored copy).
import templatesJson from './data/word_templates.json';
import contextJson from './data/context.json';
import type { ContextData, TemplateMap } from './types';

// word_templates.json carries a "_meta" block; strip it so it isn't a skill key.
const { _meta: _ignored, ...templates } = templatesJson as unknown as Record<string, unknown>;
void _ignored;

export const sampleTemplates = templates as unknown as TemplateMap;
export const sampleContext = contextJson as unknown as ContextData;
```

```ts
// scripts/word-problems/validate.ts
// Validate a word-problem dataset and print a static analysis.
// Run: npm run wp:validate            (uses vendored sample data)
//      npm run wp:validate -- t.json c.json
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { analyzeDataset } from '../../src/word-problems/validate';

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = resolve(here, '../../src/word-problems/data');
const templatesPath = process.argv[2] ?? resolve(dataDir, 'word_templates.json');
const contextPath = process.argv[3] ?? resolve(dataDir, 'context.json');

const rawTemplates = JSON.parse(readFileSync(templatesPath, 'utf8')) as Record<string, unknown>;
delete rawTemplates._meta;
const context = JSON.parse(readFileSync(contextPath, 'utf8'));

const report = analyzeDataset({ templates: rawTemplates as never, context });
const withResult = report.skills.filter((s) => s.exposesResult);
const withUnknown = report.skills.filter((s) => s.unrecognizedPlaceholders.length);

console.log(`skills: ${report.total}`);
console.log(`templates exposing {result}: ${withResult.length}`);
console.log(`skills with unrecognized placeholders: ${withUnknown.length}`);
for (const s of withUnknown.slice(0, 20)) {
  console.log(`  ? ${s.skillId}: ${s.unrecognizedPlaceholders.join(', ')}`);
}
if (!report.ok) {
  console.error(`\n${report.errors.length} structural error(s):`);
  for (const e of report.errors) console.error(`  ✗ ${e}`);
  process.exit(1);
}
console.log('\nOK: no structural errors.');
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/word-problems/sample-data.test.ts`
Expected: PASS.

- [ ] **Step 6: Wire the build**

In `vite.config.ts`, inside `build.lib.entry`, after the `'elements/whiteboard'` line, add:

```ts
        'elements/whiteboard': resolve(__dirname, 'src/elements/whiteboard.ts'),
        'word-problems/index': resolve(__dirname, 'src/word-problems/index.ts'),
        'word-problems/sample-data': resolve(__dirname, 'src/word-problems/sample-data.ts'),
```

In `package.json` `exports`, after the `"./host"` block, add (do NOT touch `sideEffects` — these modules are pure and must stay tree-shakeable):

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

In `package.json` `scripts`, add:

```json
    "wp:validate": "vite-node scripts/word-problems/validate.ts",
```

In `.size-limit.cjs`, add after the `full` entry (engine bundle carries NO data — this is the primary tree-shake proof):

```js
  {
    name: 'word-problems engine (no data)',
    path: 'dist/word-problems/index.mjs',
    limit: '8 KB',
    gzip: true,
  },
```

In `vitest.config.ts` `coverage.exclude`, add the re-export-only files:

```ts
        'src/helpers-only.ts',              // re-export only
        'src/word-problems/index.ts',       // re-export only
        'src/word-problems/sample-data.ts', // re-export of vendored JSON
```

- [ ] **Step 7: Typecheck, build, size**

Run: `npm run typecheck && npm run build && npm run size`
Expected: emits `dist/word-problems/index.mjs` + `dist/word-problems/sample-data.mjs`; engine bundle under 8 KB gz.

- [ ] **Step 8: Run the CLI**

Run: `npm run wp:validate`
Expected: prints skill counts and "OK: no structural errors." (exit 0).

- [ ] **Step 9: Commit**

```bash
git add src/word-problems/index.ts src/word-problems/sample-data.ts src/word-problems/data scripts/word-problems/validate.ts tsconfig.json vite.config.ts package.json .size-limit.cjs vitest.config.ts tests/word-problems/sample-data.test.ts
git commit -m "build(word-problems): barrel, sample data, vite entries, exports, CLI validator"
```

---

## Task 5: Tree-shake proof, unchanged-behavior, docs, CI

**Files:**
- Create: `tests/word-problems/unchanged-normalize.test.ts`
- Modify: `tests/tree-shake-test.mjs`, `README.md`, `CLAUDE.md`, `CHANGELOG.md`

- [ ] **Step 1: Write the unchanged-behavior test**

```ts
// tests/word-problems/unchanged-normalize.test.ts
import { describe, it, expect } from 'vitest';
import { normalizeQuestion } from '../../src/helpers/normalizer';
import { createWordProblemEngine } from '../../src/word-problems/engine';

describe('word-problems does not affect normalization', () => {
  it('normalizeQuestion output is unchanged with the engine imported', () => {
    void createWordProblemEngine;
    const q = normalizeQuestion({
      id: 'ADD-1', skill_ids: ['ADD-WITHIN-10'], format: 'addition',
      content: { operands: [5, 3], operation: 'addition' }, answer: 8,
      distractors: [{ value: 7, error_type: 'off-by-1' }],
    });
    expect(q).toMatchObject({ id: 'ADD-1', format: 'text', content: { stem: '5 + 3 = ?' }, answer: 8 });
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

In `tests/tree-shake-test.mjs`, add `'createWordProblemEngine'` to the `leaks` array:

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

Then, immediately before the final `rmSync(tmpDir, { recursive: true, force: true });` line, add a second build proving the engine bundle carries no sample data (size-limit is the primary proof; these sentinels are a backstop):

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
const dataSentinels = ['catacomb', 'docks', 'mountain', 'ADD-2DIGIT-1DIGIT-NO-REGROUP'];
const leaked = dataSentinels.filter(s => wpCode.includes(s));
if (leaked.length) {
  console.error(`FAIL: word-problems engine bundle leaked sample data: ${leaked.join(', ')}`);
  rmSync(tmpDir, { recursive: true, force: true });
  process.exit(1);
}
console.log('PASS: word-problems engine bundle carries no sample data.');
```

- [ ] **Step 4: Build then run the tree-shake proof**

Run: `npm run build && node tests/tree-shake-test.mjs`
Expected: both `PASS:` lines print; exit 0.

- [ ] **Step 5: Docs**

Add under `## [Unreleased]` in `CHANGELOG.md`:

```markdown
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
```

Add a section to `README.md` (near the bridge/host subpath docs):

````markdown
## Word problems (optional)

`chocabloc-questions/word-problems` turns a bare math question into a themed word
problem, deterministically, **without changing the math**. It ships no data — inject
your own templates + context (or import the bundled sample set).

```ts
import { createWordProblemEngine, loadWordProblemData } from 'chocabloc-questions/word-problems';

const data = await loadWordProblemData(); // or { templatesUrl, contextUrl }
const engine = createWordProblemEngine(data);

const worded = engine.applyWordProblem(rawRow, { difficulty: 'intermediate' });
// worded.questionText is a word problem; answer/content/distractors/skill_ids unchanged.
// A template that would drop an operand or expose the answer is rejected.
// No usable template → rawRow returned unchanged (or pass { strict: true } to throw).
```

Recommended data paths: `/word-problems/word_templates.json` and `/word-problems/context.json`
(override per project). Statically check any dataset with `analyzeDataset(data)` or
`npm run wp:validate`.
````

Add to `CLAUDE.md` under the host-integration / architecture area:

```markdown
### Word problems (`src/word-problems/`)

Optional, data-agnostic, seeded word-problem renderer on the `word-problems` subpath.
`createWordProblemEngine(data).applyWordProblem(rawRow)` rewrites **only** `questionText`;
it runs on the **raw row** (before `normalizeWithStem` drops `operands`). A `templateCompatibility`
gate rejects templates that drop an operand or expose `{result}`. Ships no data; `sample-data`
is a separate entry. Pure/tree-shakeable — do NOT add it to `sideEffects`.
```

- [ ] **Step 6: Run the full CI gate**

Run: `npm run ci`
Expected: typecheck, lint, tests (incl. word-problems suite), build, and size all pass.

- [ ] **Step 7: Commit**

```bash
git add tests/tree-shake-test.mjs tests/word-problems/unchanged-normalize.test.ts README.md CLAUDE.md CHANGELOG.md
git commit -m "test+docs(word-problems): tree-shake proof, unchanged normalization, docs"
```

---

## Self-review notes

- **Review fixes:** compat gate (Task 1 `compat.ts` + Task 3 wiring), fixed parser test with single-name fixtures (Task 2), `vite-node` CLI (Task 4), `analyzeDataset` static rename + scalar-tolerant audit (Task 2), theme iteration (Task 3 `generateStem`), multi skill-id (Task 3 `applyWordProblem`), `complexity` removed from `Template` (Task 1), nearest-difficulty fallback (Task 3 `NEAREST`/`templatesFor`), stronger sample-data gate (Task 4), `pick` throws on empty (Task 1), `stableSeed` over all fields (Task 3), multi-sentinel + size-limit primary (Task 5), `Promise.all` loader (Task 3), generic `applyWordProblem<T>` (Task 1). Scope cut to 5 tasks.
- **Spec coverage:** raw-row transform, generic extractor, renderer + guard, seeded determinism, validation, fallback + strict, three layers, tree-shaking, unchanged behavior, docs — all mapped.
- **Type consistency:** `MathInput`, `WordProblemOptions` (with `allowResult`), `WordProblemData`, `DatasetAnalysis`/`SkillAnalysis`, `Template` (no `complexity`), `WordProblemEngine` (generic `applyWordProblem`, no `coverage`) defined once in Task 1; `templateCompatibility`, `templateText`, `selectForTheme`, `renderTemplate`, `analyzeDataset`, `extractMath`, `makeRng`/`pick`/`shuffle` signatures match across tasks.
- **No placeholders:** every code step has full code; every command lists expected output.

## Open risk to watch during execution

Some vendored templates reference placeholders the extractor can't satisfy for a given skill (or only one operand). Those candidates are rejected by the compatibility gate and the skill falls back — expected and safe. Run `npm run wp:validate` to see `{result}` exposure and unrecognized-placeholder counts; a large fallback count is informational, not a failure, unless `analyzeDataset(...).ok` is false.
```
