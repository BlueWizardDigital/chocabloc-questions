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
  const operands = Array.isArray(opsRaw) && opsRaw.every((n) => Number.isFinite(n)) ? (opsRaw as number[]) : undefined;

  const frRaw = content.fraction;
  const fraction = Array.isArray(frRaw) && frRaw.length === 2 && frRaw.every((n) => Number.isFinite(n))
    ? ([frRaw[0], frRaw[1]] as [number, number]) : undefined;

  // v1: numeric primitives only. String content fields are too often incidental
  // (units, labels) to treat as required math; add a per-consumer adapter later.
  const scalars: Record<string, number> = {};
  for (const [k, v] of Object.entries(content)) {
    if (k === 'operands' || k === 'fraction') continue;
    if (typeof v === 'number' && Number.isFinite(v)) scalars[k] = v;
  }

  // Operation drives verb pools. Prefer content.operation; fall back to row.format.
  const operation =
    typeof content.operation === 'string' ? content.operation
    : typeof row.format === 'string' ? row.format
    : undefined;

  const grade = row.gradeLevel ?? row.grade;
  return {
    skillId,
    ...(operands ? { operands } : {}),
    ...(fraction ? { fraction } : {}),
    answer: row.answer,
    ...(operation ? { operation } : {}),
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

    if (opts.theme && themeKeys.length && !themeKeys.includes(opts.theme)) {
      return fail(opts, `unknown theme "${opts.theme}"`);
    }

    const rng = makeRng(opts.seed ?? stableSeed(input));
    const math = extractMath(input);

    const compatible = list.filter(
      // `?? false` satisfies exactOptionalPropertyTypes; compat treats both the same.
      (t) => templateCompatibility(templateText(t), input, { allowResult: opts.allowResult ?? false }).ok,
    );
    if (!compatible.length) return fail(opts, `no math-compatible template for ${input.skillId}`);

    // Theme-first so theme-specific templates take precedence over universal ones.
    const themesToTry = opts.theme ? [opts.theme] : themeKeys.length ? shuffle(rng, themeKeys) : [''];
    for (const theme of themesToTry) {
      for (const tpl of shuffle(rng, selectForTheme(compatible, theme))) {
        const out = renderTemplate(tpl, math, context, theme, input.operation, rng);
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
    // id-seeded so a given question always rewords identically; assumes row ids are unique
    const seed = opts.seed ?? rowId(row) ?? stableSeed(input);
    const stem = generateStem(input, { ...opts, seed });
    if (stem == null) return rawRow; // strict already threw inside generateStem
    return { ...row, questionText: stem } as T;
  }

  return { applyWordProblem, generateStem, supportedSkills };
}
