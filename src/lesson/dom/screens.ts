// Screens shared by Help (static) and the lazy practice code. Help loads this
// file, so it holds only what Help itself needs plus the Intro idea screen.
import { speakableText } from '../speak-text';
import type { Msg } from '../messages';
import type { IdeaCard, Lesson, LessonPicture, LessonStep } from '../types';
import type { NormalizedQuestion, ValidateAnswer } from '../../types';
import type { h, renderPicture } from './pictures';

export type GetQuestions = (skillId: string, count: number, excludeIds: string[]) => Promise<NormalizedQuestion[]>;

export interface ScreenAction {
  label: string;
  run(): void;
  /** The yellow main button; the others are paler. */
  primary?: boolean;
}

export type Chip = { label: string; state: 'on' | 'done' | 'todo' };

/** One screen of any mode. A mode controller describes it; the element draws it. */
export interface Screen {
  /** Sent as lesson-close `{ step }` when the kid closes on this screen. */
  step: string;
  chips?: Chip[] | undefined;
  heading: string;
  text?: string | undefined;
  cards?: IdeaCard[] | undefined;
  picture?: LessonPicture | undefined;
  result?: string | undefined;
  /** A mode's own content under the text, such as a question. */
  body?: HTMLElement | undefined;
  tip?: string | undefined;
  /** What Read to me speaks, already in words. Read when the button is tapped, so it may change. */
  say: string;
  actions: ScreenAction[];
  /**
   * Written to the polite live region once the screen is drawn ('' clears it).
   * Left out, the region keeps what it says, so a message written just before
   * this screen is still announced.
   */
  feedback?: string | undefined;
  /** What Close does on this screen. Left out, Close sends lesson-close and ends the run. */
  close?: (() => void) | undefined;
}

/**
 * Help's own code, lent to the lazy practice chunk. The chunk imports nothing
 * Help loads: if it did, Rollup would move Help into a shared chunk behind a
 * facade, and `dist/lesson.mjs` would no longer hold Help or its one dynamic import.
 */
export interface Kit {
  h: typeof h;
  renderPicture: typeof renderPicture;
  spoken: typeof spoken;
  walkSteps: typeof walkSteps;
  introChips: typeof introChips;
}

/** What a mode controller gets from the element. Calls from a run that was replaced or closed do nothing. */
export interface LessonShell {
  readonly msg: Msg;
  readonly lang: string;
  readonly kit: Kit;
  /** Draws the screen and returns its action buttons, in order ([] for a run that was replaced or ended). */
  show(screen: Screen): HTMLButtonElement[];
  /** Writes the polite live region. */
  feedback(text: string): void;
  /** Sends an event while the run is active. */
  emit(type: string, detail: Record<string, unknown>): void;
  /** False once the run was replaced, removed or closed: async work then stops. */
  active(): boolean;
  /** Sends lesson-done once; the run is finished after it. */
  done(detail: Record<string, unknown>): void;
}

export interface ModeController {
  dispose(): void;
}

/** Intro or Check, from the lazy practice chunk. */
export interface PracticeController extends ModeController {
  /** Intro: the kid left the idea. Check: start the questions. */
  begin(): void;
}

/**
 * The element's host-set properties. The practice code reads each one at the
 * moment it needs it: getQuestions at each fetch, validateAnswer and questions
 * when the questions start. So a host may set them after `mode`.
 */
export interface PracticeHost {
  readonly getQuestions: GetQuestions | undefined;
  readonly questions: NormalizedQuestion[];
  readonly validateAnswer: ValidateAnswer | undefined;
}

const sentence = (s: string): string => (/[.!?…:]$/.test(s) ? s : `${s}.`);

/** Shown text as speech: symbols read as words, one sentence per piece. */
export const spoken = (msg: Msg, ...shown: (string | undefined)[]): string =>
  shown
    .filter((s): s is string => s != null)
    .map((s) => sentence(speakableText(s, msg)))
    .join(' ');

/** A `say` replaces the shown words of its own idea or card, not the others'. */
function ideaSay(idea: Lesson['idea'], msg: Msg): string {
  const cards = (idea.cards ?? []).map((c) => c.say ?? spoken(msg, c.words, c.example));
  if (idea.say != null) return [idea.say, ...cards].join(' ');
  return [spoken(msg, idea.heading, idea.text), ...cards, spoken(msg, idea.tip)].filter(Boolean).join(' ');
}

/** The idea card, with Next. Help and Intro both start here. */
export function showIdea(shell: LessonShell, lesson: Lesson, chips: Chip[], next: () => void): void {
  const { idea } = lesson;
  shell.show({
    step: 'idea',
    chips,
    heading: idea.heading,
    text: idea.text,
    cards: idea.cards,
    picture: idea.picture,
    tip: idea.tip,
    say: ideaSay(idea, shell.msg),
    actions: [{ label: shell.msg('next'), primary: true, run: next }],
  });
}

/**
 * Worked-example steps with Next and Back. The last step shows `end`
 * instead of Next; the first shows Back only when `back` is given.
 */
export function walkSteps(
  shell: LessonShell,
  steps: LessonStep[],
  chips: Chip[],
  step: string,
  end: ScreenAction,
  back?: () => void,
): void {
  const { msg } = shell;
  const show = (i: number): void => {
    const s = steps[i]!;
    const prev = i > 0 ? () => show(i - 1) : back;
    shell.show({
      step,
      chips,
      heading: s.heading,
      text: s.text,
      picture: s.picture,
      result: s.result,
      say: s.say ?? spoken(msg, s.heading, s.text, s.result),
      actions: [
        ...(prev ? [{ label: msg('back'), run: prev }] : []),
        i === steps.length - 1 ? end : { label: msg('next'), primary: true, run: () => show(i + 1) },
      ],
    });
  };
  show(0);
}

export type IntroStep = 'idea' | 'quickCheck' | 'watch' | 'yourTurn' | 'moreExamples' | 'tryAgain' | 'done';

/** Intro's step chips. More examples and Try again appear once Your turn is failed (`again`). */
export function introChips(msg: Msg, lesson: Lesson, at: IntroStep, again = false): Chip[] {
  const steps: IntroStep[] = ['idea', ...(lesson.quickCheck > 0 ? ['quickCheck' as const] : []), 'watch', 'yourTurn'];
  if (again) steps.push('moreExamples', 'tryAgain');
  const i = at === 'done' ? steps.length : steps.indexOf(at);
  return steps.map((s, k) => ({ label: msg(`steps.${s}`), state: k < i ? 'done' : k > i ? 'todo' : 'on' }));
}
