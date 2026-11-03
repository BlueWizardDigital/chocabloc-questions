import type { ContextData, Template } from './types';
import { pick, type Rng } from './rng';

const PLACEHOLDER = /\{([a-z_0-9]+)\}/g; // lowercase-only by contract
const MARKER = /\{~([^/}]+)\/([^}]+)\}/g;
const NEXT_PLACEHOLDER = /^\s*\{([a-z_0-9]+)\}/; // lookahead for an apposed name slot
const SINGULAR_WORDS = new Set(['a', 'an', 'each', 'every', 'the', 'one', '1']);
// U+E000 (private use) flags a slot value that opens with a vowel sound, so the article before
// it can become "an". Built from its code point so no invisible character sits in this file.
const AN_MARK = String.fromCharCode(0xe000);
// "a"/"A" right before a flagged slot. Group 1 tells a sentence-opening "A" from a label ("Point A").
const ARTICLE_BEFORE_MARK = new RegExp(`(^|[.!?]["')\\]]?\\s+|\\s)(a|A)(\\s+)${AN_MARK}`, 'g');
// Vowel letter, consonant sound: "a unicorn", "a uniform", "a one-eyed troll", "a eulogy".
const VOWEL_LETTER_CONSONANT_SOUND = /^(uni|use|usu|uti|eu|one|once)/i;
// Silent h: "an hour", "an honest guide", "an heir".
const SILENT_H = /^(hour|honest|honou?r|heir)/i;

/**
 * Nearest cue in the same sentence wins: a number gives its count (a decimal is plural), a
 * singular keyword gives 1, "of" and "many" give plural ("a group of {x}", "how many {x}").
 * No cue: plural (2).
 */
export function pluralCount(before: string): number {
  // Cues do not carry across a sentence boundary: "... 1 more. How many {item}" is plural.
  // A "." between digits is a decimal point, not a sentence end ("0.1 kilograms").
  const masked = before.replace(/(\d)\.(?=\d)/g, '$1#'); // same length, so its index fits `before`
  const clause = before.slice(masked.search(/[^.!?]*$/));
  const tokens = clause.toLowerCase().split(/\s+/).filter(Boolean);
  for (let i = tokens.length - 1; i >= 0; i--) {
    if (/^\W*-?\d*\.\d+\W*$/.test(tokens[i] as string)) return 2; // "0.1", "3.1", "1.0", "$0.01"
    const t = (tokens[i] as string).replace(/[^\w-]/g, '');
    if (/^-?\d+$/.test(t)) return Math.abs(parseInt(t, 10));
    if (SINGULAR_WORDS.has(t)) return 1;
    if (t === 'of' || t === 'many') return 2;
  }
  return 2;
}

/** Does this value take "an"? By sound: a vowel letter or a silent h, minus "you" and "w" sounds. */
function opensWithVowelSound(value: string): boolean {
  if (SILENT_H.test(value)) return true;
  return /^[aeiou]/i.test(value) && !VOWEL_LETTER_CONSONANT_SOUND.test(value);
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

/**
 * Keys whose pool IS the character-name list, plus the pool key itself, so a
 * template may use any spelling the data provides rather than a hard-coded "name".
 */
function personNameBases(ctx: ContextData): Set<string> {
  const names = ctx.characters?.names;
  const out = new Set<string>();
  if (!Array.isArray(names)) return out;
  for (const [k, v] of Object.entries(ctx.characters ?? {})) {
    if (v !== names) continue;
    out.add(k);
    out.add(k.replace(/s$/, '')); // resolveContext reaches "names" via the base "name"
  }
  return out;
}

/** Theme-specific templates replace universal ones when present for a theme. */
export function selectForTheme(list: Template[], theme: string): Template[] {
  const themed = list.filter(
    (t): t is Exclude<Template, string> => typeof t !== 'string' && !!t.themes?.includes(theme),
  );
  if (themed.length) return themed;
  return list.filter((t) => typeof t === 'string' || !t.themes || t.themes.length === 0);
}

/**
 * Resolve a context placeholder from injected data; null when no pool exists, or when `accept`
 * turns down every value in it.
 */
function resolveContext(
  key: string,
  ctx: ContextData,
  theme: string,
  operation: string | undefined,
  rng: Rng,
  used: Map<string, Set<string>>,
  chosen: Map<string, string>,
  accept?: (value: string) => boolean,
): string | null {
  // The same placeholder twice in one template is the same thing twice.
  const prior = chosen.get(key);
  if (prior !== undefined) return prior;

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

  // Distinct keys sharing a base ({item} vs {item2}) still prefer distinct words.
  const usedSet = used.get(base) ?? new Set<string>();
  const avail = pool.filter((v) => !usedSet.has(v));
  let choice = pick(rng, avail.length ? avail : pool);
  if (accept && !accept(choice)) {
    // Draw again from the values that fit. The first draw is kept when it fits, so a pool
    // whose values all fit picks exactly what it picked before.
    const ok = pool.filter(accept);
    if (!ok.length) return null;
    const okAvail = ok.filter((v) => !usedSet.has(v));
    choice = pick(rng, okAvail.length ? okAvail : ok);
  }
  usedSet.add(choice);
  used.set(base, usedSet);
  chosen.set(key, choice);
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
  // Slots the story itself binds. A question phrase may name only these, so it never brings in
  // a new name or object, and never shows {result} unless the template already does.
  const storyKeys = new Set<string>();
  for (const m of text.matchAll(PLACEHOLDER)) if (!(m[1] as string).startsWith('question_')) storyKeys.add(m[1] as string);
  const phraseFits = (phrase: string): boolean => [...phrase.matchAll(PLACEHOLDER)].every((m) => storyKeys.has(m[1] as string));

  // Pass 1: math placeholders (numbers become literal for count detection).
  text = text.replace(PLACEHOLDER, (m, key: string) => (key in math ? (math[key] as string) : m));

  // Pass 2: context placeholders, singular/plural from the preceding number.
  const used = new Map<string, Set<string>>();
  const chosen = new Map<string, string>();
  const nameBases = personNameBases(ctx);
  /** A value for one slot: inflected for the text before it, flagged when it takes "an". */
  const inflect = (val: string, count: number): string => {
    const out = slash(val, count);
    return opensWithVowelSound(out) ? AN_MARK + out : out;
  };
  /** Fill the slots inside a question phrase with the words the story bound. */
  const fillPhrase = (phrase: string, before: string): string =>
    phrase.replace(PLACEHOLDER, (m, k: string, off: number) => {
      const v = k in math ? (math[k] as string) : resolveContext(k, ctx, theme, operation, rng, used, chosen);
      return v == null ? m : inflect(v, pluralCount(before + phrase.slice(0, off)));
    });
  text = text.replace(PLACEHOLDER, (m, key: string, offset: number, full: string) => {
    const isPhrase = key.startsWith('question_');
    const val = resolveContext(key, ctx, theme, operation, rng, used, chosen, isPhrase ? phraseFits : undefined);
    if (val == null) return m;
    // A slot sitting directly before a person's name is a title in apposition
    // ("guide Evelyn"), which is singular whatever the sentence counts.
    const ahead = NEXT_PLACEHOLDER.exec(full.slice(offset + m.length));
    const isTitle = ahead != null && nameBases.has((ahead[1] as string).replace(/\d+$/, ''));
    const before = full.slice(0, offset);
    if (!isPhrase) return inflect(val, isTitle ? 1 : pluralCount(before));
    // Question phrases are written to open a sentence; after a comma they continue one
    // ("After giving 405 to Harper, what is left over?"). Lower-case before filling, so a
    // phrase that opens with a name keeps its capital.
    let phrase = slash(val, pluralCount(before));
    if (/,\s*$/.test(before)) phrase = phrase.charAt(0).toLowerCase() + phrase.slice(1);
    return fillPhrase(phrase, before);
  });
  // "a alcove" -> "an alcove". Only an article written directly before a slot changes, and a
  // capital "A" only where it opens a sentence.
  text = text
    .replace(ARTICLE_BEFORE_MARK, (m, pre: string, art: string, gap: string) =>
      art === 'A' && /^\s+$/.test(pre) ? m : `${pre}${art}n${gap}`,
    )
    .split(AN_MARK)
    .join('');

  // Pass 3: inline {~singular/plural} markers.
  text = text.replace(MARKER, (_m, s: string, p: string, offset: number, full: string) =>
    pluralCount(full.slice(0, offset)) === 1 ? s : p,
  );

  text = text.replace(/\s+/g, ' ').trim();

  if (/[{}]/.test(text)) return null; // guard: any residual brace -> reject
  return text;
}
