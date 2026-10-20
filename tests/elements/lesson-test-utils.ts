// Shared by the Intro and Check browser tests. Not a test file itself (wtr runs *.browser.test.ts only).
import type { ChocaLesson } from '../../src/lesson/index';
import type { AnswerValue, NormalizedQuestion, ValidationResult } from '../../src/types';

export type Detail = Record<string, unknown>;

const cleanups: (() => void)[] = [];

/** Runs every cleanup registered by mount() and listen(); call it in afterEach. */
export function cleanup(): void {
  cleanups.splice(0).reverse().forEach((fn) => fn());
}

export function holder(): HTMLElement {
  const box = document.createElement('div');
  document.body.appendChild(box);
  cleanups.push(() => box.remove());
  return box;
}

export function mount(): ChocaLesson {
  const el = document.createElement('chocabloc-lesson') as ChocaLesson;
  holder().appendChild(el);
  return el;
}

export function listen(type: string): Detail[] {
  const got: Detail[] = [];
  const fn = (e: Event) => got.push((e as CustomEvent<Detail>).detail);
  document.addEventListener(type, fn);
  cleanups.push(() => document.removeEventListener(type, fn));
  return got;
}

export const root = (el: ChocaLesson): ShadowRoot => el.shadowRoot as ShadowRoot;
export const part = (el: ChocaLesson, name: string): HTMLElement | null =>
  root(el).querySelector<HTMLElement>(`[part~="${name}"]`);
export const parts = (el: ChocaLesson, name: string): HTMLElement[] =>
  Array.from(root(el).querySelectorAll<HTMLElement>(`[part~="${name}"]`));
export const heading = (el: ChocaLesson): string | null | undefined => part(el, 'heading')?.textContent;
export const feedback = (el: ChocaLesson): string => part(el, 'feedback')?.textContent ?? '';

/** Every non-empty text the live region shows, in order, however briefly. */
export function feedbackLog(el: ChocaLesson): string[] {
  const log: string[] = [];
  const region = part(el, 'feedback');
  if (!region) throw new Error('no feedback region');
  const mo = new MutationObserver(() => {
    const text = region.textContent ?? '';
    if (text) log.push(text);
  });
  mo.observe(region, { childList: true, characterData: true, subtree: true });
  cleanups.push(() => mo.disconnect());
  return log;
}
const buttons = (el: ChocaLesson): HTMLButtonElement[] => Array.from(root(el).querySelectorAll('button'));
/** Labels of the buttons a kid can see. */
export const labels = (el: ChocaLesson): string[] =>
  buttons(el)
    .filter((b) => !b.hidden)
    .map((b) => (b.textContent ?? '').trim());

/** A visible button by its label. */
export function button(el: ChocaLesson, label: string): HTMLButtonElement {
  const b = buttons(el).find((x) => !x.hidden && (x.textContent ?? '').trim() === label);
  if (!b) throw new Error(`no visible "${label}" button; have ${JSON.stringify(labels(el))}`);
  return b;
}

/** Any button by its label, hidden or not. */
export function anyButton(el: ChocaLesson, label: string): HTMLButtonElement | undefined {
  return buttons(el).find((x) => (x.textContent ?? '').trim() === label);
}

type QuestionEl = HTMLElement & { question: NormalizedQuestion | null };

export const questionEl = (el: ChocaLesson): QuestionEl | null =>
  root(el).querySelector('chocabloc-question') as QuestionEl | null;

/** The id of the question on screen, or null. */
export const questionId = (el: ChocaLesson): string | null => questionEl(el)?.question?.id ?? null;

/** Taps a choice inside <chocabloc-question>, found by its label. */
export function choose(el: ChocaLesson, label: string): void {
  const pad = questionEl(el)?.shadowRoot?.querySelector('choca-choice-pad');
  const choices = Array.from(pad?.shadowRoot?.querySelectorAll<HTMLButtonElement>('button') ?? []);
  const b = choices.find((c) => (c.textContent ?? '').trim() === label);
  if (!b) throw new Error(`no "${label}" choice; have ${JSON.stringify(choices.map((c) => c.textContent))}`);
  b.click();
}

export const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

/** Waits until `cond` holds, polling; fails with `what` instead of hanging. */
export async function until(cond: () => boolean, what: string, ms = 3000): Promise<void> {
  const end = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > end) throw new Error(`timed out waiting for: ${what}`);
    await new Promise((r) => setTimeout(r, 5));
  }
}

/** Lets promise callbacks run, but no timer: a screen waiting on one is still up after this. */
export async function microtasks(): Promise<void> {
  for (let i = 0; i < 20; i++) await Promise.resolve();
}

/** Takes over console.warn and console.error for this test, so the run prints nothing; restored in cleanup(). */
export function captureConsole(): { warn: unknown[][]; error: unknown[][] } {
  const got = { warn: [] as unknown[][], error: [] as unknown[][] };
  const { warn, error } = console;
  console.warn = (...args: unknown[]) => got.warn.push(args);
  console.error = (...args: unknown[]) => got.error.push(args);
  cleanups.push(() => Object.assign(console, { warn, error }));
  return got;
}

/** The first argument of each captured console call. */
export const firstArgs = (calls: unknown[][]): string[] => calls.map((c) => String(c[0]));

/** All text under a node, its shadow roots included, at any depth. */
export function deepText(node: Node): string {
  let text = node.nodeType === Node.TEXT_NODE ? node.textContent ?? '' : '';
  const shadow = node instanceof Element ? node.shadowRoot : null;
  if (shadow) text += deepText(shadow);
  node.childNodes.forEach((c) => (text += deepText(c)));
  return text;
}

export interface Deferred<T> {
  promise: Promise<T>;
  resolve(v: T): void;
  reject(e: unknown): void;
}

export function deferred<T>(): Deferred<T> {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

export interface Check {
  question: NormalizedQuestion;
  answer: AnswerValue;
  reply: Deferred<ValidationResult>;
}

export interface FakeHost {
  calls: [string, number, string[]][];
  checks: Check[];
  getQuestions(skillId: string, count: number, excludeIds: string[]): Promise<NormalizedQuestion[]>;
  validateAnswer(question: NormalizedQuestion, answer: AnswerValue): Promise<ValidationResult>;
  readonly last: Check;
}

/**
 * A host with a recording getQuestions (each call takes the next batch; an
 * Error rejects) and a validator whose replies the test releases by hand.
 */
export function fakeHost(batches: (NormalizedQuestion[] | Error)[] = []): FakeHost {
  const calls: [string, number, string[]][] = [];
  const checks: Check[] = [];
  return {
    calls,
    checks,
    getQuestions(skillId: string, count: number, excludeIds: string[]): Promise<NormalizedQuestion[]> {
      calls.push([skillId, count, [...excludeIds]]);
      const b = batches.shift() ?? [];
      return b instanceof Error ? Promise.reject(b) : Promise.resolve(b);
    },
    validateAnswer(question: NormalizedQuestion, answer: AnswerValue): Promise<ValidationResult> {
      const reply = deferred<ValidationResult>();
      checks.push({ question, answer, reply });
      return reply.promise;
    },
    /** The latest check. */
    get last(): Check {
      const c = checks[checks.length - 1];
      if (!c) throw new Error('no check was sent');
      return c;
    },
  };
}

/**
 * A comparison question as the server sends it: choices-only, with a token
 * (tests/fixtures/server-emission-choices-only.json). `operands: null` leaves
 * the numbers out.
 */
export function cmp(
  id: string,
  operands: [number, number] | null,
  skillId = 'COMPARE-NUMBERS-WITHIN-100',
): NormalizedQuestion {
  return {
    id,
    format: 'comparison',
    skillIds: [skillId],
    questionText: operands ? `Which sign goes in the box? ${operands[0]} ☐ ${operands[1]}` : 'Which sign means less than?',
    content: operands ? { operands, operation: 'comparison' } : { operation: 'comparison' },
    choices: [{ value: '<' }, { value: '>' }, { value: '=' }],
    difficulty: 'easy',
    answerToken: `token-${id}`,
  } as unknown as NormalizedQuestion;
}

/** Answer details as [step, question id, studentAnswer, outcome]. */
export const answerRows = (answers: Detail[]): unknown[][] =>
  answers.map((a) => [a.step, (a.question as { id: string }).id, a.studentAnswer, a.outcome]);
