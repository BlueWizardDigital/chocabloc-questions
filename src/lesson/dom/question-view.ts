// One practice question: <chocabloc-question> behind the answer guard, with
// "I'm not sure yet", Check again, and the feedback or why card that follows.
// Part of the lazy practice chunk: it names the question element by its tag
// only (practice.ts registers it) and takes Help's helpers from the shell.
import { normalizeQuestion } from '../../helpers/normalizer';
import type { NormalizedQuestion, ValidateAnswer } from '../../types';
import { dedupe } from '../flow';
import type { Outcome } from '../flow';
import { createAnswerGuard } from '../guard';
import type { GuardState } from '../guard';
import { pictureFromQuestion } from '../from-question';
import type { Lesson } from '../types';
import type { Chip, LessonShell, Screen } from './screens';

/** The pause on "Yes!" or "Thanks!" before the next screen. Tests set it to 0. */
export const timing = { advanceMs: 900 };

/** A host's question, and the same question as <chocabloc-question> takes it. */
export interface Item {
  /** As the host gave it: what lesson-answer reports, and where the why card finds its numbers. */
  q: NormalizedQuestion;
  /** Normalized. The same object goes to the guard and to the element, so the guard knows its own question. */
  shown: NormalizedQuestion;
}

/**
 * The questions in `batch` that can be shown, minus ids already in `seen` and
 * repeats within the batch, in order. normalizeQuestion keeps `answerToken` and
 * accepts a question that is already normalized; one it can't read is skipped.
 */
export function prepare(batch: unknown, seen: ReadonlySet<string>): Item[] {
  const hostsOwn = new Map<NormalizedQuestion, NormalizedQuestion>();
  const shown: NormalizedQuestion[] = [];
  for (const q of Array.isArray(batch) ? (batch as NormalizedQuestion[]) : []) {
    let n: NormalizedQuestion | null = null;
    try {
      n = normalizeQuestion(q, { onMalformed: (r) => console.warn('[chocabloc-lesson] skipped a question:', r.reason) });
    } catch (err) {
      console.warn('[chocabloc-lesson] skipped a question that could not be shown:', err);
    }
    if (n) {
      hostsOwn.set(n, q);
      shown.push(n);
    }
  }
  return dedupe(shown, seen).map((n) => ({ q: hostsOwn.get(n)!, shown: n }));
}

export type AnswerStep = 'quickCheck' | 'yourTurn' | 'tryAgain' | 'check';

export interface AskOptions {
  shell: LessonShell;
  item: Item;
  validate: ValidateAnswer;
  step: AnswerStep;
  /** The skill lesson-answer reports. */
  skillId: string;
  heading: string;
  chips?: Chip[] | undefined;
  /** Intro: the why card after a wrong or unsure answer. Left out (Check), the answer is never shown. */
  afterWrong?: Lesson['afterWrong'] | undefined;
}

export interface Asking {
  /** Settles when the kid moves on, with the outcome lesson-answer reported. */
  done: Promise<Outcome>;
  dispose(): void;
}

type QuestionElement = HTMLElement & { question: NormalizedQuestion; validateAnswer: ValidateAnswer | undefined };

/** The prompt, for Read to me. */
const promptOf = (q: NormalizedQuestion): string => (q.format === 'text' ? q.content.stem : q.questionText);

/**
 * Shows one question and reports one answer for it. The first answer (or
 * "I'm not sure yet") is the only one: the guard keeps any later tap from the
 * host, `inert` keeps the choices still from then on, and a check that fails
 * keeps that first answer for Check again.
 */
export function ask(o: AskOptions): Asking {
  const { shell, item, step, skillId } = o;
  const { msg } = shell;
  const { h, renderPicture, spoken } = shell.kit;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let outcome: Outcome = 'unsure';
  let finish!: (out: Outcome) => void;
  const done = new Promise<Outcome>((resolve) => {
    finish = (out) => {
      // "Yes!" was announced while it showed; the next screen starts clean.
      shell.feedback('');
      resolve(out);
    };
  });

  const el = document.createElement('chocabloc-question') as QuestionElement;
  el.style.alignSelf = 'stretch';
  const screen: Screen = {
    step,
    chips: o.chips,
    heading: o.heading,
    body: el,
    say: spoken(msg, promptOf(item.shown)),
    feedback: '',
    actions: [
      { label: msg('notSure'), run: () => guard.unsure() },
      { label: msg('checkAgain'), primary: true, run: () => guard.checkAgain() },
      { label: msg('gotIt'), primary: true, run: () => finish(outcome) },
    ],
  };
  let buttons: HTMLButtonElement[] = [];

  const onState = (s: GuardState): void => {
    // From the first answer on, nothing in the question can be tapped.
    el.inert = s !== 'waiting';
    const [unsure, again] = buttons;
    if (unsure) {
      unsure.disabled = s !== 'waiting';
      unsure.hidden = s === 'done';
    }
    if (again) again.hidden = s !== 'failed';
  };

  const guard = createAnswerGuard({
    question: item.shown,
    host: o.validate,
    onState,
    onResult(r) {
      outcome = r.outcome;
      shell.emit('lesson-answer', { step, skillId, question: item.q, studentAnswer: r.studentAnswer, outcome: r.outcome });
      if (o.afterWrong && r.outcome !== 'right') {
        whyCard(o.afterWrong, r.expected);
        return;
      }
      shell.feedback(r.outcome === 'right' ? msg('feedback.right') : msg('feedback.checkThanks'));
      timer = setTimeout(() => finish(r.outcome), timing.advanceMs);
    },
    onFailed(err) {
      console.warn('[chocabloc-lesson] could not check the answer:', err);
      shell.feedback(msg('feedback.couldNotCheck'));
      shell.emit('lesson-error', { reason: 'validation-unavailable' });
      buttons[1]?.focus();
    },
  });

  /** The question's own numbers drawn as the lesson's picture, the tip, and the answer when the host sent it. */
  const whyCard = (afterWrong: Lesson['afterWrong'], expected: unknown): void => {
    const card = h('div', 'why');
    card.tabIndex = -1;
    const pic = afterWrong.picture ? pictureFromQuestion(afterWrong.picture, item.q) : null;
    if (pic) card.append(renderPicture(pic, msg, shell.lang));
    card.append(h('p', 'tip', undefined, afterWrong.tip));
    // `== null`, never truthiness: 0 is an answer.
    const answer = expected == null ? undefined : msg('feedback.answerIs', { answer: expected });
    if (answer != null) card.append(h('p', 'text', undefined, answer));
    el.after(card);
    screen.say = spoken(msg, afterWrong.tip, answer);
    const gotIt = buttons[2];
    if (gotIt) gotIt.hidden = false;
    card.focus();
  };

  // The validator first, so the element never holds this question without it.
  el.validateAnswer = guard.validator;
  el.question = item.shown;
  buttons = shell.show(screen);
  const [, again, gotIt] = buttons;
  if (again) again.hidden = true;
  if (gotIt) gotIt.hidden = true;

  return {
    done,
    dispose() {
      clearTimeout(timer);
      guard.dispose();
    },
  };
}
