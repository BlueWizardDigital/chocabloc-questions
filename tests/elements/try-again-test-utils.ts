// Gets a lesson to Try again, for the strategy-help browser tests. Not a test file itself (wtr runs *.browser.test.ts only).
import { expect } from '@esm-bundle/chai';
import type { ChocaLesson, Lesson, NormalizedQuestion } from '../../src/lesson/index';
import type { ChocaHelp } from '../../src/help/index';
import type { ValidationResult } from '../../src/types';
import { button, fakeHost, heading, labels, mount, part, questionEl, questionId, until } from './lesson-test-utils';
import type { FakeHost } from './lesson-test-utils';

export const TIP = 'Count the tens first. If the tens match, look at the ones.';
export const WRONG: ValidationResult = { correct: false, expected: 56 };
export const ANSWER_LINE = 'The answer is';

let fixture: Lesson;

/** Call it in `before`. */
export async function loadLessonFixture(): Promise<void> {
  const res = await fetch(new URL('../fixtures/lesson-compare-100.json', import.meta.url));
  fixture = (await res.json()) as Lesson;
}

export function lessonFor(retrySkill: string, skillId = 'MULT-FACTS-6-10', skillGrade = '5'): Lesson {
  const l = JSON.parse(JSON.stringify(fixture)) as Lesson;
  l.skillId = skillId;
  l.skillGrade = skillGrade;
  l.moreHelp.skillId = retrySkill;
  return l;
}

/** A fact as the bank sends it: choices-only, with a token, and its numbers in content.operands. */
export function fq(id: string, x: number, y: number, op: 'multiplication' | 'division' = 'multiplication'): NormalizedQuestion {
  return {
    id,
    format: op,
    skillIds: [op === 'division' ? 'DIV-BASIC-DIVISION-FACTS' : 'MULT-FACTS-0-5'],
    questionText: `${x} ${op === 'division' ? '÷' : '×'} ${y} = ?`,
    content: { operands: [x, y], operation: op },
    choices: [{ value: 10 }, { value: 20 }, { value: 30 }, { value: 40 }],
    difficulty: 'easy',
    answerToken: `token-${id}`,
  } as unknown as NormalizedQuestion;
}

export const threeFacts = (): NormalizedQuestion[] => [fq('e1', 7, 8), fq('e2', 6, 7), fq('e3', 4, 6)];
export const shown = (el: ChocaLesson, id: string): Promise<void> => until(() => questionId(el) === id, `question ${id} on screen`);

/** Taps a choice, however the question draws them. */
async function tapChoice(el: ChocaLesson, label = '10'): Promise<void> {
  const pad = (): ShadowRoot | null | undefined => {
    const q = questionEl(el)?.shadowRoot;
    const scope = q?.querySelector('choca-canvas-question')?.shadowRoot ?? q;
    return scope?.querySelector('choca-choice-pad')?.shadowRoot;
  };
  await until(() => !!pad()?.querySelector('button'), 'the choices');
  const b = Array.from(pad()!.querySelectorAll('button')).find((c) => (c.textContent ?? '').trim() === label);
  if (!b) throw new Error(`no "${label}" choice`);
  b.click();
}

export async function answer(el: ChocaLesson, host: FakeHost, id: string, verdict: ValidationResult): Promise<void> {
  await shown(el, id);
  await tapChoice(el);
  host.last.reply.resolve(verdict);
}

export async function right(el: ChocaLesson, host: FakeHost, id: string): Promise<void> {
  await answer(el, host, id, { correct: true });
  await until(() => questionId(el) !== id, `moved on from ${id}`);
}

export const whyShown = (el: ChocaLesson): Promise<void> => until(() => part(el, 'why') !== null, 'the why card');

async function miss(el: ChocaLesson, host: FakeHost, id: string): Promise<void> {
  await answer(el, host, id, WRONG);
  await whyShown(el);
  button(el, 'Got it').click();
  await until(() => questionId(el) !== id, `moved on from ${id}`);
}

export async function walk(el: ChocaLesson, steps: { heading: string }[]): Promise<void> {
  await until(() => heading(el) === steps[0]!.heading, `"${steps[0]!.heading}"`);
  for (let i = 0; i < steps.length; i++) button(el, 'Next').click();
}

export function start(lesson: Lesson, again: NormalizedQuestion[], setup: (el: ChocaLesson) => void): { el: ChocaLesson; host: FakeHost } {
  const first = [fq('q1', 2, 3), fq('q2', 2, 4), fq('q3', 2, 5), fq('q4', 2, 6), fq('q5', 2, 7)];
  const host = fakeHost([first, again]);
  const el = mount();
  setup(el);
  el.getQuestions = host.getQuestions;
  el.validateAnswer = host.validateAnswer;
  el.mode = 'intro';
  el.lesson = lesson;
  button(el, 'Next').click();
  return { el, host };
}

/** Fails Your turn, walks the more examples, and stops on Try again's first question. */
export async function atTryAgain(
  lesson: Lesson,
  again: NormalizedQuestion[] = threeFacts(),
  setup: (el: ChocaLesson) => void = () => undefined,
): Promise<{ el: ChocaLesson; host: FakeHost }> {
  const { el, host } = start(lesson, again, setup);
  await right(el, host, 'q1');
  await right(el, host, 'q2');
  await walk(el, lesson.example.steps);
  await right(el, host, 'q3');
  await miss(el, host, 'q4');
  await miss(el, host, 'q5');
  for (const ex of lesson.moreHelp.examples) await walk(el, ex.steps);
  await shown(el, again[0]!.id);
  expect(heading(el)).to.equal('Try again');
  return { el, host };
}

export const helpOf = (el: ChocaLesson): ChocaHelp | null =>
  (part(el, 'why')?.querySelector('chocabloc-help') as ChocaHelp | null | undefined) ?? null;

export async function helpShown(el: ChocaLesson): Promise<ChocaHelp> {
  await until(() => helpOf(el) !== null, 'the help panel');
  return helpOf(el)!;
}

/** The wrong-answer card as it was before help: the tip, the picture, the answer line, no panel. */
export function expectLessonCard(el: ChocaLesson): void {
  expect(helpOf(el) === null, 'no help panel').to.equal(true);
  expect(part(el, 'tip')?.textContent).to.equal(TIP);
  expect(part(el, 'why')?.querySelector('[part~="picture"]') != null, 'the lesson picture').to.equal(true);
  expect(part(el, 'why')?.textContent).to.include(`${ANSWER_LINE} 56`);
  expect(labels(el)).to.include('Got it');
}
