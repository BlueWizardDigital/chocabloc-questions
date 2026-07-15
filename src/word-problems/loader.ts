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
