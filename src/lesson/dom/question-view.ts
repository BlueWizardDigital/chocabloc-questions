// One practice question: <chocabloc-question> behind the answer guard, with
// "I'm not sure yet", Check again, and the feedback or why card that follows.
// Part of the lazy practice chunk: it names the question element by its tag
// only (practice.ts registers it) and takes Help's helpers from the shell.
import { familyForSkill } from '../../help/catalog';
import { helpFactFromQuestion } from '../../help/from-question';
import type { HelpFact } from '../../help/types';
import { normalizeQuestion } from '../../helpers/normalizer';
import type { HelpFamily, HelpRecord, NormalizedQuestion, ValidateAnswer } from '../../types';
import { dedupe } from '../flow';
import type { Outcome } from '../flow';
import { createAnswerGuard } from '../guard';
import type { GuardState } from '../guard';
import { pictureFromQuestion } from '../from-question';
import type { Lesson } from '../types';
import { QUESTION_LOOK_CSS } from './question-look';
import type { Chip, LessonShell, PracticeHost, Screen } from './screens';

/** The pause on "Yes!" or "Thanks!" before the next screen. Tests set it to 0. */
export const timing = { advanceMs: 900 };

type HelpCode = typeof import('../../help/index');

/**
 * How Try again loads strategy help. It lives here, not on the shell, so nothing of it reaches
 * dist/lesson.mjs. Not public; a test swaps `load` to see it fail, arrive late or to count requests.
 */
export const helpChunk = { load: (): Promise<HelpCode> => import('../../help/index') };

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
 * accepts a question that is already normalized; one it can't read is skipped
 * with a warning, so it counts as not arrived. So is one that carries an `answer`
 * or has no `answerToken`: the player only takes choices-only questions the server
 * checks, never one that hands the answer to the page. Callers treat a batch that is
 * not a list as a failed fetch.
 */
export function prepare(batch: readonly NormalizedQuestion[], seen: ReadonlySet<string>): Item[] {
  const hostsOwn = new Map<NormalizedQuestion, NormalizedQuestion>();
  const shown: NormalizedQuestion[] = [];
  for (const q of batch) {
    let n: NormalizedQuestion | null = null;
    try {
      n = normalizeQuestion(q, { onMalformed: (r) => console.warn('[chocabloc-lesson] skipped a question:', r.reason) });
    } catch (err) {
      console.warn('[chocabloc-lesson] skipped a question that could not be shown:', err);
    }
    if (n && ((q as { answer?: unknown }).answer != null || (n as { answer?: unknown }).answer != null)) {
      console.warn('[chocabloc-lesson] skipped a question that carries its answer:', n.id);
      n = null;
    } else if (n && !(n as { answerToken?: unknown }).answerToken) {
      console.warn('[chocabloc-lesson] skipped a question with no answerToken:', n.id);
      n = null;
    }
    if (n) {
      hostsOwn.set(n, q);
      shown.push(n);
    }
  }
  return dedupe(shown, seen).map((n) => ({ q: hostsOwn.get(n)!, shown: n }));
}

export type AnswerStep = 'quickCheck' | 'yourTurn' | 'tryAgain' | 'check';

/** What strategy help needs from the run. */
export interface WhyHelp {
  /** The skill being retried. Its family decides whether help shows, and which saved pick opens first. */
  skillId: string;
  grade: string | null;
  /** Read when the panel opens: a host's saved picks may arrive while the kid is on the question. */
  host: Pick<PracticeHost, 'strategyPicks' | 'translator'>;
}

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
  /** Try again: the why card shows strategy help in place of the tip, when this skill and question have any. */
  help?: WhyHelp | undefined;
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
 * <chocabloc-question>'s own composed events. They stop at the question, so the
 * page sees only the player's events. That is tidiness, not a seal: a capture-phase
 * listener on document still sees them. The control that keeps the answer from the
 * page in Check is stripping `expected` from the verdict the element gets (below).
 */
const INNER_EVENTS = ['answered', 'chocabloc-validation-unavailable', 'chocabloc-misconfigured'];
const stop = (e: Event): void => e.stopPropagation();

/** <chocabloc-help>'s own composed events. They stop at the panel too: the page gets `lesson-help`. */
const HELP_EVENTS = ['help-step', 'help-record', 'help-close'];

interface QuestionHelp extends WhyHelp {
  family: HelpFamily;
  fact: HelpFact;
  /** Help's code, or null if it couldn't load. */
  code: Promise<HelpCode | null>;
}

/** Help for this question, or null: the skill has no family, or the question shows no fact. Non-fact lessons never load the code. */
function helpFor(o: AskOptions): QuestionHelp | null {
  const family = o.help ? familyForSkill(o.help.skillId) : null;
  // item.q, not item.shown: normalizing can drop the operands.
  const fact = family ? helpFactFromQuestion(o.item.q) : null;
  if (!o.help || !family || !fact) return null;
  return {
    ...o.help,
    family,
    fact,
    // Loads with the question, so a wrong answer doesn't wait for it.
    code: helpChunk.load().catch((err: unknown) => {
      console.warn('[chocabloc-lesson] could not load help:', err);
      return null;
    }),
  };
}

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
  /** The kid has moved on, or the run ended: help that arrives now draws nothing. */
  let leaving = false;
  /** While a help panel is on the card: closes it, then takes its listeners away. */
  let closeHelp: (() => void) | undefined;
  const help = helpFor(o);
  const done = new Promise<Outcome>((resolve) => {
    finish = (out) => {
      leaving = true;
      // "Yes!" was announced while it showed; the next screen starts clean.
      shell.feedback('');
      resolve(out);
    };
  });

  const el = document.createElement('chocabloc-question') as QuestionElement;
  el.style.alignSelf = 'stretch';
  // A <style> child of the element is not drawn (it has no slot) but styles the
  // lesson's own tree, which is where ::part(prompt) is matched.
  const look = document.createElement('style');
  look.textContent = QUESTION_LOOK_CSS;
  el.append(look);
  for (const type of INNER_EVENTS) el.addEventListener(type, stop);
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
      const { afterWrong } = o;
      if (afterWrong && r.outcome !== 'right') {
        // Got it first: the kid can go on even if help is slow to arrive.
        const gotIt = buttons[2];
        if (gotIt) gotIt.hidden = false;
        if (help) {
          gotIt?.focus();
          void help.code.then((code) => {
            if (!leaving) whyCard(afterWrong, r.expected, code);
          });
        } else whyCard(afterWrong, r.expected, null);
        return;
      }
      // "Yes!" is short enough to finish; the Check thanks is not, and the next question cancels it.
      shell.feedback(r.outcome === 'right' ? msg('feedback.right') : msg('feedback.checkThanks'), r.outcome === 'right');
      timer = setTimeout(() => finish(r.outcome), timing.advanceMs);
    },
    onFailed(err) {
      console.warn('[chocabloc-lesson] could not check the answer:', err);
      shell.feedback(msg('feedback.couldNotCheck'));
      shell.emit('lesson-error', { reason: 'validation-unavailable' });
      buttons[1]?.focus();
    },
  });

  /** The help panel on the card, opened. Its 👍 and Close help close only the panel: Got it is still the way on. */
  const openHelp = (code: HelpCode, on: QuestionHelp, card: HTMLElement, answer: string | undefined): void => {
    const panel = new code.ChocaHelp();
    panel.style.alignSelf = 'stretch';
    // Inside the lesson's shadow root, the panel can't find the page's [lang] by itself.
    panel.lang = shell.lang;
    panel.fact = on.fact;
    panel.grade = on.grade;
    // Optional chaining: `strategyPicks` is whatever the host set, if anything. The panel ignores a pick it can't use.
    panel.pick = on.host.strategyPicks?.[on.family] ?? null;
    panel.translator = on.host.translator;
    panel.pictureBase = shell.look.base;
    const onPanel = (e: Event): void => {
      stop(e);
      if (e.type === 'help-record') {
        shell.emit('lesson-help', { ...(e as CustomEvent<HelpRecord>).detail, beforeAnswer: false, triesBefore: null });
      } else if (e.type === 'help-close') {
        if (answer != null && !leaving) {
          // The answer's turn (Ruling 26). The button that had focus just hid; on the card, the line gets read.
          card.append(h('p', 'text', undefined, answer));
          screen.say = spoken(msg, answer);
          shell.speak(screen.say);
          card.focus();
        } else {
          // Nothing left to show: the host sent no answer, or the kid left with the panel open.
          card.hidden = true;
          if (!leaving) buttons[2]?.focus();
        }
      }
    };
    for (const type of HELP_EVENTS) panel.addEventListener(type, onPanel);
    closeHelp = () => {
      panel.close();
      for (const type of HELP_EVENTS) panel.removeEventListener(type, onPanel);
    };
    card.prepend(panel);
    // It speaks for itself, to a young kid, and takes the focus.
    panel.open();
  };

  /**
   * The question's own numbers drawn as the lesson's picture and the tip, and the answer when the
   * host sent it. Or the help panel in their place, and the answer only once it closes: a panel that
   * never says the final number can't sit above a line that does (Ruling 26). `code` is help's, if it loaded.
   */
  const whyCard = (afterWrong: Lesson['afterWrong'], expected: unknown, code: HelpCode | null): void => {
    const card = h('div', 'why');
    card.tabIndex = -1;
    // K has the shortest list of any grade, so a fact with a way there has one for every kid.
    const hasWays = code && help && code.strategyOrder(help.fact, { grade: 0, pick: null, solved: [] }).length > 0;
    if (!hasWays) {
      // The picture shows the question's numbers, and often the answer (a jump's end, a digit's
      // place), so it waits for the server's verdict: no `expected`, no picture. The tip still shows.
      const pic = afterWrong.picture && expected != null ? pictureFromQuestion(afterWrong.picture, item.q) : null;
      if (pic) card.append(renderPicture(pic, msg, shell.lang));
      card.append(h('p', 'tip', undefined, afterWrong.tip));
    }
    // `== null`, never truthiness: 0 is an answer.
    const answer = expected == null ? undefined : msg('feedback.answerIs', { answer: expected });
    if (hasWays) {
      el.after(card);
      // Read to me keeps the question's words until the answer shows.
      openHelp(code, help, card, answer);
      return;
    }
    if (answer != null) card.append(h('p', 'text', undefined, answer));
    el.after(card);
    screen.say = spoken(msg, afterWrong.tip, answer);
    shell.speak(screen.say);
    card.focus();
  };

  // The validator first, so the element never holds this question without it.
  // With no why card (Check), the element gets each verdict without `expected`:
  // its typed-answer input would print "The answer is …". The guard still sees it all.
  el.validateAnswer = o.afterWrong
    ? guard.validator
    : (q, a) => guard.validator(q, a).then(({ expected: _hidden, ...verdict }) => verdict);
  el.question = item.shown;
  buttons = shell.show(screen);
  const [, again, gotIt] = buttons;
  if (again) again.hidden = true;
  if (gotIt) gotIt.hidden = true;

  return {
    done,
    /** Once the kid has moved on, or the run ends: no more reports, timers or listeners. */
    dispose() {
      leaving = true;
      clearTimeout(timer);
      guard.dispose();
      // A panel still open sends its last record now, with no thumb, while the run can report it.
      // shortcut: a run replaced or removed (not closed) has stopped reporting by here, so that record is lost; revisit when a host saves lesson-help.
      closeHelp?.();
      for (const type of INNER_EVENTS) el.removeEventListener(type, stop);
    },
  };
}
