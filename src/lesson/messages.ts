// Copy of the app's rules (client/src/lib/i18n-format.js); tests pin the same cases.
import en from './messages/en.json';

export type Translator = (key: string, vars?: Record<string, unknown>) => string | undefined;
export type Msg = (key: string, vars?: Record<string, unknown>) => string;

/** The English messages the library ships. */
export const lessonMessagesEn: Record<string, unknown> = en;

const PLURAL_CATEGORIES = new Set(['zero', 'one', 'two', 'few', 'many', 'other']);
const PLACEHOLDER = /\{([A-Za-z_$][\w$]*)\}/g;

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v);

// Object.hasOwn is Chrome 93, but the ES2019 lib has no type for it.
const hasOwn = (o: object, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k);

/** The value at a dotted key, own properties only; undefined when absent. */
export function lookup(table: unknown, key: string): unknown {
  let node: unknown = table;
  for (const part of key.split('.')) {
    if (!isPlainObject(node) || !hasOwn(node, part)) return undefined;
    node = node[part];
  }
  return node;
}

/** True for { one: "…", other: "…" }: plural categories only, "other" required. */
export function isPluralForms(value: unknown): value is Record<string, string> {
  if (!isPlainObject(value) || typeof value.other !== 'string') return false;
  return Object.entries(value).every(([k, v]) => PLURAL_CATEGORIES.has(k) && typeof v === 'string');
}

/** Replaces {name} with String(vars.name). A missing (or undefined/null) value leaves {name}. */
export function interpolate(text: string, vars?: Record<string, unknown>): string {
  if (!vars) return text;
  return text.replace(PLACEHOLDER, (m, name: string) =>
    hasOwn(vars, name) && vars[name] != null ? String(vars[name]) : m,
  );
}

/** A string as it is; plural forms by rules.select(vars.count), "other" as fallback; else undefined. */
export function selectMessage(
  value: unknown,
  vars: Record<string, unknown> | undefined,
  rules: { select(n: number): string },
): string | undefined {
  if (typeof value === 'string') return value;
  if (!isPluralForms(value)) return undefined;
  const count = vars && vars.count;
  if (typeof count !== 'number') return value.other;
  const form = value[rules.select(count)];
  return typeof form === 'string' ? form : value.other;
}

export function createMessages(opts: { translator?: Translator; lang: string }): Msg {
  const rules = new Intl.PluralRules(opts.lang);
  const warned = new Set<string>();
  return (key, vars) => {
    // A translator may answer with plural forms, as the app's tOptional does.
    const fromHost: unknown = opts.translator ? opts.translator(key, vars) : undefined;
    const template = selectMessage(fromHost, vars, rules) ?? selectMessage(lookup(lessonMessagesEn, key), vars, rules);
    if (template === undefined) {
      if (!warned.has(key)) {
        warned.add(key);
        console.warn(`[chocabloc-lesson] missing message: ${key}`);
      }
      return key;
    }
    return interpolate(template, vars);
  };
}
