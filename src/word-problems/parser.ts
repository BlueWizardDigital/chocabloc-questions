import type { ContextData, Template } from './types';
import { pick, type Rng } from './rng';

const PLACEHOLDER = /\{([a-z_0-9]+)\}/g; // lowercase-only by contract
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

  if (/[{}]/.test(text)) return null; // guard: any residual brace -> reject
  return text;
}
