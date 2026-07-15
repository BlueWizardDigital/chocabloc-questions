import type { ContextData, DatasetAnalysis, Difficulty, SkillAnalysis } from './types';

const DIFFICULTIES: Difficulty[] = ['beginner', 'intermediate', 'advanced'];
const PLACEHOLDER = /\{([a-z_0-9]+)\}/g; // lowercase-only by contract
const MATH = new Set(['a', 'b', 'c', 'd', 'e', 'f', 'result', 'fraction', 'fraction_a', 'fraction_b']);

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function templateTextOf(t: unknown): string | null {
  if (typeof t === 'string') return t;
  if (isPlainObject(t) && typeof t.template === 'string') return t.template;
  return null;
}

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

/** Malformed brace syntax the placeholder/marker patterns don't cover. */
function braceErrors(text: string): string[] {
  const errs: string[] = [];
  const opens = (text.match(/\{/g) ?? []).length;
  const closes = (text.match(/\}/g) ?? []).length;
  if (opens !== closes) errs.push('unbalanced braces');
  if (text.includes('{{') || text.includes('}}')) errs.push('double braces');
  if (/\{\s*\}/.test(text)) errs.push('empty placeholder');
  if (/\{[A-Z]/.test(text)) errs.push('uppercase placeholder (lowercase-only)');
  for (const seg of text.match(/\{[^{}]*\}/g) ?? []) {
    const isPlaceholder = /^\{[a-z_0-9]+\}$/.test(seg);
    const isMarker = /^\{~[^/{}]+\/[^{}]+\}$/.test(seg);
    if (!isPlaceholder && !isMarker) errs.push(`malformed token "${seg}"`);
  }
  return errs;
}

/**
 * STATIC analysis of a dataset (accepts unknown so the CLI can pass raw JSON).
 * Hard `errors` cover structural problems (bad shapes, malformed braces, unknown
 * template themes). `skills[]` reports each skill's `exposesResult` and the
 * placeholders that are neither math nor a context pool (possible scalars/typos).
 * It does NOT prove runtime renderability.
 */
export function analyzeDataset(data: unknown): DatasetAnalysis {
  const errors: string[] = [];
  const skills: SkillAnalysis[] = [];

  if (!isPlainObject(data)) return { ok: false, total: 0, errors: ['data must be an object'], skills };
  if (!isPlainObject(data.context)) errors.push('context must be an object');
  const ctx = (isPlainObject(data.context) ? data.context : {}) as ContextData;
  const themeNames = new Set(Object.keys(ctx.themes ?? {}));

  if (!isPlainObject(data.templates)) {
    errors.push('templates must be an object');
    return { ok: false, total: 0, errors, skills };
  }

  for (const [skillId, byDifficulty] of Object.entries(data.templates)) {
    if (!isPlainObject(byDifficulty)) {
      errors.push(`${skillId}: must be an object of difficulty -> templates`);
      continue;
    }
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
        const text = templateTextOf(tpl);
        if (text === null) {
          errors.push(`${skillId}.${diff}: template must be a string or { template }`);
          continue;
        }
        if (text.trim() === '') errors.push(`${skillId}.${diff}: empty template text`);
        for (const e of braceErrors(text)) errors.push(`${skillId}.${diff}: ${e}`);

        if (isPlainObject(tpl) && 'themes' in tpl) {
          const themes = tpl.themes;
          if (!Array.isArray(themes) || !themes.every((t) => typeof t === 'string')) {
            errors.push(`${skillId}.${diff}: template themes must be a string array`);
          } else if (themeNames.size) {
            for (const t of themes) if (!themeNames.has(t as string)) errors.push(`${skillId}.${diff}: unknown theme "${t}"`);
          }
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
