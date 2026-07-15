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
  ok: boolean; // false only when there are structural errors
  total: number;
  errors: string[]; // structural (hard) problems
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
