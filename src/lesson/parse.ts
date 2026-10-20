import { LESSON_FORMAT_VERSIONS } from './types';
import type { Lesson, LessonIndex } from './types';

/** Caps mirror the lesson-format contract (mathSkills docs/contracts/lesson-format.md). */
export const LESSON_CAPS = {
  title: 40,
  heading: 80,
  text: 240,
  tip: 160,
  cardBig: 6,
  cardWords: 40,
  cardExample: 20,
  result: 40,
  say: 300,
  cards: { min: 0, max: 4 },
  exampleSteps: { min: 2, max: 6 },
  moreHelpExamples: { min: 1, max: 3 },
  moreHelpSteps: { min: 1, max: 4 },
  operands: { min: 1, max: 3 },
  passQuestions: { min: 1, max: 5 },
  quickCheck: { min: 0, max: 3 },
  base10Numbers: { min: 1, max: 2 },
  base10Value: { min: 0, max: 9999 },
  arrayDim: { min: 1, max: 15 },
  numberLineMarks: 10,
  numberLineJumps: 10,
  columnsCarry: 12,
  columnsResult: 16,
} as const;

const SKILL_ID = /^[A-Z0-9]+(-[A-Z0-9]+)*$/;
const LANG = /^[a-z]{2}(-[a-z]{2})?$/;
const DECIMAL = /^\d+(\.\d+)?$/;
const PLACES = ['ones', 'tens', 'hundreds', 'thousands'];
const KINDS = ['base10', 'array', 'numberLine', 'columns'];
const OPS = ['+', '−', '×', 'compare'];

type Obj = Record<string, unknown>;

class Invalid extends Error {}

function fail(): never {
  throw new Invalid();
}

function obj(v: unknown, allowed: string[], required: string[]): Obj {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) fail();
  const o = v as Obj;
  for (const k of Object.keys(o)) if (!allowed.includes(k)) fail();
  for (const k of required) if (!(k in o)) fail();
  return o;
}

function str(v: unknown, max: number): string {
  if (typeof v !== 'string' || v.length === 0 || v.length > max) fail();
  return v;
}

function optStr(o: Obj, key: string, max: number): void {
  if (key in o) str(o[key], max);
}

function int(v: unknown, min: number, max: number): number {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < min || v > max) fail();
  return v;
}

function num(v: unknown): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) fail();
  return v;
}

function arr(v: unknown, min: number, max: number): unknown[] {
  if (!Array.isArray(v) || v.length < min || v.length > max) fail();
  return v;
}

function place(v: unknown): void {
  if (typeof v !== 'string' || !PLACES.includes(v)) fail();
}

function picture(v: unknown): void {
  if (v === null || typeof v !== 'object') fail();
  const kind = (v as Obj).kind;
  if (kind === 'base10') {
    const o = obj(v, ['kind', 'numbers', 'focus'], ['kind', 'numbers']);
    for (const n of arr(o.numbers, LESSON_CAPS.base10Numbers.min, LESSON_CAPS.base10Numbers.max))
      int(n, LESSON_CAPS.base10Value.min, LESSON_CAPS.base10Value.max);
    if ('focus' in o) place(o.focus);
  } else if (kind === 'array') {
    const o = obj(v, ['kind', 'rows', 'cols'], ['kind', 'rows', 'cols']);
    int(o.rows, LESSON_CAPS.arrayDim.min, LESSON_CAPS.arrayDim.max);
    int(o.cols, LESSON_CAPS.arrayDim.min, LESSON_CAPS.arrayDim.max);
  } else if (kind === 'numberLine') {
    const o = obj(v, ['kind', 'from', 'to', 'marks', 'jumps'], ['kind', 'from', 'to']);
    num(o.from);
    num(o.to);
    if ('marks' in o) for (const m of arr(o.marks, 0, LESSON_CAPS.numberLineMarks)) num(m);
    if ('jumps' in o)
      for (const j of arr(o.jumps, 0, LESSON_CAPS.numberLineJumps)) {
        const jo = obj(j, ['from', 'to'], ['from', 'to']);
        num(jo.from);
        num(jo.to);
      }
  } else if (kind === 'columns') {
    const o = obj(
      v,
      ['kind', 'op', 'numbers', 'carry', 'result', 'focus'],
      ['kind', 'op', 'numbers'],
    );
    if (typeof o.op !== 'string' || !OPS.includes(o.op)) fail();
    for (const n of arr(o.numbers, 2, 2)) {
      if (typeof n === 'string') {
        if (!DECIMAL.test(n)) fail();
      } else num(n);
    }
    optStr(o, 'carry', LESSON_CAPS.columnsCarry);
    optStr(o, 'result', LESSON_CAPS.columnsResult);
    if ('focus' in o) place(o.focus);
  } else fail();
}

function step(v: unknown): void {
  const o = obj(v, ['heading', 'text', 'picture', 'result', 'say'], ['heading', 'text']);
  str(o.heading, LESSON_CAPS.heading);
  str(o.text, LESSON_CAPS.text);
  if ('picture' in o && 'result' in o) fail();
  if ('picture' in o) picture(o.picture);
  optStr(o, 'result', LESSON_CAPS.result);
  optStr(o, 'say', LESSON_CAPS.say);
}

function example(v: unknown, steps: { min: number; max: number }): void {
  const o = obj(v, ['operands', 'steps'], ['operands', 'steps']);
  for (const n of arr(o.operands, LESSON_CAPS.operands.min, LESSON_CAPS.operands.max)) num(n);
  for (const s of arr(o.steps, steps.min, steps.max)) step(s);
}

function card(v: unknown): void {
  const o = obj(v, ['big', 'words', 'example', 'say'], ['big', 'words', 'example']);
  str(o.big, LESSON_CAPS.cardBig);
  str(o.words, LESSON_CAPS.cardWords);
  str(o.example, LESSON_CAPS.cardExample);
  optStr(o, 'say', LESSON_CAPS.say);
}

function checkLesson(v: unknown): void {
  const o = obj(
    v,
    ['formatVersion', 'lang', 'skillId', 'title', 'idea', 'example', 'afterWrong', 'moreHelp', 'pass', 'quickCheck'],
    ['formatVersion', 'lang', 'skillId', 'title', 'idea', 'example', 'afterWrong', 'moreHelp', 'pass', 'quickCheck'],
  );
  if (typeof o.lang !== 'string' || !LANG.test(o.lang)) fail();
  if (typeof o.skillId !== 'string' || !SKILL_ID.test(o.skillId)) fail();
  str(o.title, LESSON_CAPS.title);

  const idea = obj(o.idea, ['heading', 'text', 'cards', 'tip', 'picture', 'say'], ['heading', 'text']);
  str(idea.heading, LESSON_CAPS.heading);
  str(idea.text, LESSON_CAPS.text);
  if ('cards' in idea)
    for (const c of arr(idea.cards, LESSON_CAPS.cards.min, LESSON_CAPS.cards.max)) card(c);
  optStr(idea, 'tip', LESSON_CAPS.tip);
  if ('picture' in idea) picture(idea.picture);
  optStr(idea, 'say', LESSON_CAPS.say);

  example(o.example, LESSON_CAPS.exampleSteps);

  const aw = obj(o.afterWrong, ['tip', 'picture'], ['tip']);
  str(aw.tip, LESSON_CAPS.tip);
  if ('picture' in aw) {
    const p = obj(aw.picture, ['kind', 'from'], ['kind', 'from']);
    if (typeof p.kind !== 'string' || !KINDS.includes(p.kind)) fail();
    if (p.from !== 'operands' && p.from !== 'number') fail();
  }

  const mh = obj(o.moreHelp, ['skillId', 'title', 'examples'], ['skillId', 'title', 'examples']);
  if (typeof mh.skillId !== 'string' || !SKILL_ID.test(mh.skillId)) fail();
  str(mh.title, LESSON_CAPS.title);
  for (const e of arr(mh.examples, LESSON_CAPS.moreHelpExamples.min, LESSON_CAPS.moreHelpExamples.max))
    example(e, LESSON_CAPS.moreHelpSteps);

  const pass = obj(o.pass, ['questions', 'right'], ['questions', 'right']);
  const q = int(pass.questions, LESSON_CAPS.passQuestions.min, LESSON_CAPS.passQuestions.max);
  int(pass.right, 1, q);
  int(o.quickCheck, LESSON_CAPS.quickCheck.min, LESSON_CAPS.quickCheck.max);
}

function checkIndex(v: unknown): void {
  const o = obj(v, ['formatVersion', 'lang', 'lessons', 'concepts'], ['formatVersion', 'lang', 'lessons', 'concepts']);
  if (typeof o.lang !== 'string' || !LANG.test(o.lang)) fail();
  const lessons = obj(o.lessons, Object.keys(o.lessons ?? {}), []);
  for (const [id, entry] of Object.entries(lessons)) {
    if (!SKILL_ID.test(id)) fail();
    const e = obj(entry, ['standards'], ['standards']);
    for (const s of arr(e.standards, 0, Infinity)) if (typeof s !== 'string') fail();
  }
  const concepts = obj(o.concepts, Object.keys(o.concepts ?? {}), []);
  for (const ids of Object.values(concepts))
    for (const id of arr(ids, 0, Infinity)) if (typeof id !== 'string' || !SKILL_ID.test(id)) fail();
}

function versionOf(json: unknown): 'ok' | 'unsupported-version' | 'invalid' {
  if (json === null || typeof json !== 'object' || Array.isArray(json)) return 'invalid';
  const v = (json as Obj).formatVersion;
  if (typeof v !== 'number' || !LESSON_FORMAT_VERSIONS.includes(v)) return 'unsupported-version';
  return 'ok';
}

export type ParseLessonResult =
  | { ok: true; lesson: Lesson }
  | { ok: false; reason: 'unsupported-version' | 'invalid' };

export type ParseLessonIndexResult =
  | { ok: true; index: LessonIndex }
  | { ok: false; reason: 'unsupported-version' | 'invalid' };

export function parseLesson(json: unknown): ParseLessonResult {
  const ver = versionOf(json);
  if (ver !== 'ok') return { ok: false, reason: ver };
  try {
    checkLesson(json);
  } catch (e) {
    if (e instanceof Invalid) return { ok: false, reason: 'invalid' };
    throw e;
  }
  return { ok: true, lesson: json as Lesson };
}

export function parseLessonIndex(json: unknown): ParseLessonIndexResult {
  const ver = versionOf(json);
  if (ver !== 'ok') return { ok: false, reason: ver };
  try {
    checkIndex(json);
  } catch (e) {
    if (e instanceof Invalid) return { ok: false, reason: 'invalid' };
    throw e;
  }
  return { ok: true, index: json as LessonIndex };
}
