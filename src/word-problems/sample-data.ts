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
