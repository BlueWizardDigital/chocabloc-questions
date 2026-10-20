export const LESSON_FORMAT_VERSIONS: readonly number[] = [1];

export type Place = 'ones' | 'tens' | 'hundreds' | 'thousands';

export type LessonPicture =
  | { kind: 'base10'; numbers: number[]; focus?: Place }
  | { kind: 'array'; rows: number; cols: number }
  | {
      kind: 'numberLine';
      from: number;
      to: number;
      marks?: number[];
      jumps?: { from: number; to: number }[];
    }
  | {
      kind: 'columns';
      op: '+' | '−' | '×' | 'compare';
      numbers: [number | string, number | string];
      carry?: string;
      result?: string;
      focus?: Place;
    };

export type FromQuestionPicture = { kind: LessonPicture['kind']; from: 'operands' | 'number' };

export interface LessonStep {
  heading: string;
  text: string;
  picture?: LessonPicture;
  result?: string;
  say?: string;
}

export interface WorkedExample {
  operands: number[];
  steps: LessonStep[];
}

export interface IdeaCard {
  big: string;
  words: string;
  example: string;
  say?: string;
}

export interface Lesson {
  formatVersion: 1;
  lang: string;
  skillId: string;
  title: string;
  idea: {
    heading: string;
    text: string;
    cards?: IdeaCard[];
    tip?: string;
    picture?: LessonPicture;
    say?: string;
  };
  example: WorkedExample;
  afterWrong: { tip: string; picture?: FromQuestionPicture };
  moreHelp: { skillId: string; title: string; examples: WorkedExample[] };
  pass: { questions: number; right: number };
  quickCheck: number;
}

export interface LessonIndex {
  formatVersion: 1;
  lang: string;
  lessons: Record<string, { standards: string[] }>;
  concepts: Record<string, string[]>;
}

export type LessonLoadFailure = 'not-found' | 'unsupported-version' | 'invalid' | 'network';
