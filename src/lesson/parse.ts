import { LESSON_FORMAT_VERSIONS } from './types';
import type { Lesson, LessonIndex } from './types';

/** Caps mirror the lesson-format contract (mathSkills docs/contracts/lesson-format.md). */
const CAP_title = 40;
const CAP_heading = 80;
const CAP_text = 240;
const CAP_tip = 160;
const CAP_cardBig = 6;
const CAP_cardWords = 40;
const CAP_cardExample = 20;
const CAP_result = 40;
const CAP_say = 300;
const CAP_young = 60;
const CAP_cards = { min: 0, max: 4 };
const CAP_exampleSteps = { min: 2, max: 6 };
const CAP_moreHelpExamples = { min: 1, max: 3 };
const CAP_moreHelpSteps = { min: 1, max: 4 };
const CAP_operands = { min: 1, max: 3 };
const CAP_passQuestions = { min: 1, max: 5 };
const CAP_quickCheck = { min: 0, max: 3 };
const CAP_base10Numbers = { min: 1, max: 2 };
const CAP_base10Value = { min: 0, max: 9999 };
const CAP_arrayDim = { min: 1, max: 15 };
const CAP_numberLineMarks = 10;
const CAP_numberLineJumps = 10;
const CAP_columnsCarry = 12;
const CAP_columnsResult = 16;

const SKILL_ID = /^[A-Z0-9]+(-[A-Z0-9]+)*$/;
const SKILL_GRADE = /^(K|[1-8])$/;
const LANG = /^[a-z]{2}(-[a-z]{2})?$/;
const DECIMAL = /^\d+(\.\d+)?$/;
const PLACES = ['ones', 'tens', 'hundreds', 'thousands'];
const KINDS = ['base10', 'array', 'count', 'numberLine', 'columns'];
const PLACEHOLDERS = /\{[abc]\}/g;
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
  // Caps count code points, like the mathSkills checks (Python len()), not UTF-16 units.
  if (typeof v !== 'string' || v.length === 0 || Array.from(v).length > max) fail();
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
    for (const n of arr(o.numbers, CAP_base10Numbers.min, CAP_base10Numbers.max))
      int(n, CAP_base10Value.min, CAP_base10Value.max);
    if ('focus' in o) place(o.focus);
  } else if (kind === 'array') {
    const o = obj(v, ['kind', 'rows', 'cols'], ['kind', 'rows', 'cols']);
    int(o.rows, CAP_arrayDim.min, CAP_arrayDim.max);
    int(o.cols, CAP_arrayDim.min, CAP_arrayDim.max);
  } else if (kind === 'count') {
    const o = obj(v, ['kind', 'groups', 'takeAway', 'empty', 'apart'], ['kind', 'groups']);
    const groups = arr(o.groups, 1, 3);
    const sum = groups.reduce<number>((t, n) => t + int(n, 0, 20), 0);
    if ('apart' in o) {
      if (o.apart !== true || groups.length !== 2 || 'takeAway' in o || 'empty' in o) fail();
    } else {
      if ('takeAway' in o) {
        if ('empty' in o) fail();
        int(o.takeAway, 1, sum);
      }
      const total = sum + ('empty' in o ? int(o.empty, 1, 20) : 0);
      if (total < 1 || total > 20) fail();
    }
  } else if (kind === 'numberLine') {
    const o = obj(v, ['kind', 'from', 'to', 'marks', 'jumps'], ['kind', 'from', 'to']);
    num(o.from);
    num(o.to);
    if ('marks' in o) for (const m of arr(o.marks, 0, CAP_numberLineMarks)) num(m);
    if ('jumps' in o)
      for (const j of arr(o.jumps, 0, CAP_numberLineJumps)) {
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
    optStr(o, 'carry', CAP_columnsCarry);
    optStr(o, 'result', CAP_columnsResult);
    if ('focus' in o) place(o.focus);
  } else fail();
}

function step(v: unknown): void {
  const o = obj(v, ['heading', 'text', 'picture', 'result', 'say', 'young'], ['heading', 'text']);
  str(o.heading, CAP_heading);
  str(o.text, CAP_text);
  if ('picture' in o && 'result' in o) fail();
  if ('picture' in o) picture(o.picture);
  if ('young' in o) {
    // Only {a}, {b} and {c}, and only on a picture of animals: a count, or an array (whose one animal is {a}).
    const kind = (o.picture as Obj | undefined)?.kind;
    const young = str(o.young, CAP_young);
    if (young.trim() === '') fail();
    if ((kind !== 'count' && kind !== 'array') || /[{}]/.test(young.replace(PLACEHOLDERS, ''))) fail();
    // A placeholder needs its group: {b} a second group, {c} a third, and an array has only {a}.
    const groups = kind === 'count' ? ((o.picture as Obj).groups as unknown[]).length : 1;
    for (const m of young.match(PLACEHOLDERS) ?? []) if (m.charCodeAt(1) - 97 >= groups) fail();
  }
  optStr(o, 'result', CAP_result);
  optStr(o, 'say', CAP_say);
}

function example(v: unknown, steps: { min: number; max: number }): void {
  const o = obj(v, ['operands', 'steps'], ['operands', 'steps']);
  for (const n of arr(o.operands, CAP_operands.min, CAP_operands.max)) num(n);
  for (const s of arr(o.steps, steps.min, steps.max)) step(s);
}

function card(v: unknown): void {
  const o = obj(v, ['big', 'words', 'example', 'say'], ['big', 'words', 'example']);
  str(o.big, CAP_cardBig);
  str(o.words, CAP_cardWords);
  str(o.example, CAP_cardExample);
  optStr(o, 'say', CAP_say);
}

function checkLesson(v: unknown): void {
  const o = obj(
    v,
    ['formatVersion', 'lang', 'skillId', 'skillGrade', 'title', 'idea', 'example', 'afterWrong', 'moreHelp', 'pass', 'quickCheck'],
    ['formatVersion', 'lang', 'skillId', 'skillGrade', 'title', 'idea', 'example', 'afterWrong', 'moreHelp', 'pass', 'quickCheck'],
  );
  if (typeof o.lang !== 'string' || !LANG.test(o.lang)) fail();
  if (typeof o.skillId !== 'string' || !SKILL_ID.test(o.skillId)) fail();
  if (typeof o.skillGrade !== 'string' || !SKILL_GRADE.test(o.skillGrade)) fail();
  str(o.title, CAP_title);

  const idea = obj(o.idea, ['heading', 'text', 'cards', 'tip', 'picture', 'say'], ['heading', 'text']);
  str(idea.heading, CAP_heading);
  str(idea.text, CAP_text);
  if ('cards' in idea)
    for (const c of arr(idea.cards, CAP_cards.min, CAP_cards.max)) card(c);
  optStr(idea, 'tip', CAP_tip);
  if ('picture' in idea) picture(idea.picture);
  optStr(idea, 'say', CAP_say);

  example(o.example, CAP_exampleSteps);

  const aw = obj(o.afterWrong, ['tip', 'picture'], ['tip']);
  str(aw.tip, CAP_tip);
  if ('picture' in aw) {
    const p = obj(aw.picture, ['kind', 'from'], ['kind', 'from']);
    if (typeof p.kind !== 'string' || !KINDS.includes(p.kind)) fail();
    if (p.from !== 'operands' && p.from !== 'number') fail();
  }

  const mh = obj(o.moreHelp, ['skillId', 'title', 'examples'], ['skillId', 'title', 'examples']);
  if (typeof mh.skillId !== 'string' || !SKILL_ID.test(mh.skillId)) fail();
  str(mh.title, CAP_title);
  for (const e of arr(mh.examples, CAP_moreHelpExamples.min, CAP_moreHelpExamples.max))
    example(e, CAP_moreHelpSteps);

  const pass = obj(o.pass, ['questions', 'right'], ['questions', 'right']);
  const q = int(pass.questions, CAP_passQuestions.min, CAP_passQuestions.max);
  int(pass.right, 1, q);
  int(o.quickCheck, CAP_quickCheck.min, CAP_quickCheck.max);
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
