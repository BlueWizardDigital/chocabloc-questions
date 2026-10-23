import { parseLesson } from '../parse';
import { createMessages, lessonMessagesEn, safeLang } from '../messages';
import type { Msg, Translator } from '../messages';
import type { IdeaCard, Lesson } from '../types';
import type { NormalizedQuestion, ValidateAnswer } from '../../types';
import { h, svg, renderPicture } from './pictures';
import type { PictureLook } from './pictures';
import { lookFor, normalizeGrade } from '../look';
import { createSpeaker } from './speaker';
import type { Speaker } from './speaker';
import { LESSON_CSS } from './styles';
import { introChips, showIdea, spoken, walkSteps } from './screens';
import type { Chip, GetQuestions, Kit, LessonShell, ModeController, Screen } from './screens';

export type { GetQuestions, LessonShell, ModeController, Screen, ScreenAction } from './screens';
export type LessonMode = 'help' | 'intro' | 'check';

interface Run {
  lang: string;
  msg: Msg;
  speaker: Speaker;
  look: PictureLook;
  /** The kid has tapped Tap to hear, so the voice may start. */
  tapped: boolean;
  controller: ModeController | null;
  /** Closed by the kid, or done: the run reports nothing more. */
  ended: boolean;
}

const MODES: readonly LessonMode[] = ['help', 'intro', 'check'];
const PROPS = ['lesson', 'mode', 'getQuestions', 'questions', 'validateAnswer', 'translator', 'grade', 'pictureBase'] as const;
const KIT: Kit = { h, renderPicture, spoken, walkSteps, introChips };

/** How the element loads the practice chunk. Not public; a test swaps `load` to see a chunk that fails to load. */
export const practiceChunk = { load: (): Promise<typeof import('./practice')> => import('./practice') };

/** How the element loads the young chunk. Not public; a test swaps `load` to see it fail or to count requests. */
export const youngChunk = { load: (): Promise<typeof import('./young')> => import('./young') };

/** Help: the idea, then each worked-example step with Next and Back, then Back to the game. */
function startHelp(shell: LessonShell, lesson: Lesson): ModeController {
  const { msg } = shell;
  const chips = (watching: boolean): Chip[] => [
    { label: msg('steps.idea'), state: watching ? 'done' : 'on' },
    { label: msg('steps.watch'), state: watching ? 'on' : 'todo' },
  ];
  const end = { label: msg('backToGame'), primary: true, run: () => shell.done({ mode: 'help' }) };
  const idea = (): void =>
    showIdea(shell, lesson, chips(false), () => walkSteps(shell, lesson.example.steps, chips(true), 'watch', end, idea));
  idea();
  // Help holds nothing that outlives a screen.
  return { dispose: () => undefined };
}

function cardsOf(cards: IdeaCard[]): HTMLElement {
  const row = h('div', undefined, 'cards');
  for (const c of cards) {
    const card = h('div', 'card');
    card.append(h('span', undefined, 'big', c.big), h('span', undefined, 'words', c.words), h('span', undefined, 'eg', c.example));
    row.append(card);
  }
  return row;
}

function speakerIcon(): SVGSVGElement {
  const icon = svg('svg', {
    viewBox: '0 0 24 24',
    'aria-hidden': 'true',
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': 2.4,
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
  });
  icon.append(
    svg('path', { d: 'M4 9v6h4l5 4V5L8 9H4z', fill: 'currentColor' }),
    svg('path', { d: 'M16.5 8.5a5 5 0 0 1 0 7' }),
    svg('path', { d: 'M19 6a8.5 8.5 0 0 1 0 12' }),
  );
  return icon;
}

/**
 * `<chocabloc-lesson>`: a skill lesson in Help, Intro or Check mode.
 *
 * The first screen renders synchronously once `lesson` is set on a connected
 * element (Check, which has no lesson, says it is getting its questions).
 * Setting `lesson` or `mode` starts again from the first screen, and so does
 * adding the element back after it was removed. Intro reads `getQuestions` and
 * `validateAnswer` when it needs them, so they may be set after `mode`. Check
 * reads `questions` and `validateAnswer` as soon as its code loads; set them in
 * the same synchronous code as `mode`. Closing, or finishing, ends the run: its
 * last screen stays and reports nothing more. It adds no listener to `window` or `document`: one
 * click listener lives on its shadow root, and each practice question stops
 * its question element's events there until the kid moves on.
 */
export class ChocaLesson extends HTMLElement {
  private _getQuestions: GetQuestions | undefined = undefined;
  private _questions: NormalizedQuestion[] = [];
  private _validateAnswer: ValidateAnswer | undefined = undefined;
  private _translator: Translator | undefined = undefined;
  private _grade: string | null = null;
  private _youngCss: HTMLStyleElement | null = null;
  private _pictureBase: string | null = null;
  private _mode: LessonMode = 'help';
  private _lesson: Lesson | null = null;
  private _run: Run | null = null;
  private _connected = false;
  private _actions = new Map<Element, () => void>();
  private readonly _root: ShadowRoot;
  private readonly _panel: HTMLElement;
  private readonly _chips: HTMLElement;
  private readonly _close: HTMLButtonElement;
  private _step: HTMLElement;
  private readonly _feedback: HTMLElement;
  private readonly _actionBar: HTMLElement;

  private readonly _onClick = (e: Event): void => {
    const b = e.target instanceof Element ? e.target.closest('button') : null;
    const run = b ? this._actions.get(b) : undefined;
    if (run) run();
  };

  constructor() {
    super();
    this._root = this.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = LESSON_CSS;
    this._panel = h('div', 'panel');
    this._panel.hidden = true;
    this._chips = h('div', 'chips');
    this._close = h('button', 'button close');
    this._close.type = 'button';
    const top = h('div', undefined, 'top');
    top.append(this._chips, this._close);
    this._step = h('div', undefined, 'step');
    this._feedback = h('div', 'feedback');
    this._feedback.setAttribute('aria-live', 'polite');
    this._actionBar = h('div', 'actions');
    this._panel.append(top, this._step, this._feedback, this._actionBar);
    this._root.append(style, this._panel);
    // A host may set properties before the element is defined. They then sit on
    // the instance and hide the accessors, so take them back through the
    // accessors. Nothing starts here: connecting starts the run.
    const self = this as unknown as Record<string, unknown>;
    for (const p of PROPS) {
      if (Object.prototype.hasOwnProperty.call(this, p)) {
        const v = self[p];
        delete self[p];
        self[p] = v;
      }
    }
  }

  /** Intro: up to `count` bank questions for `skillId`, none whose id is in `excludeIds`. */
  get getQuestions(): GetQuestions | undefined {
    return this._getQuestions;
  }

  set getQuestions(fn: GetQuestions | undefined) {
    this._getQuestions = fn;
  }

  /** Check: the host's questions, fetched in one request. */
  get questions(): NormalizedQuestion[] {
    return this._questions;
  }

  set questions(qs: NormalizedQuestion[]) {
    this._questions = qs;
  }

  /** Intro and Check: the host's validator. The player never holds an answer. */
  get validateAnswer(): ValidateAnswer | undefined {
    return this._validateAnswer;
  }

  set validateAnswer(fn: ValidateAnswer | undefined) {
    this._validateAnswer = fn;
  }

  /** Asked first for each of the player's own words; `undefined` falls back to English. */
  get translator(): Translator | undefined {
    return this._translator;
  }

  set translator(fn: Translator | undefined) {
    this._translator = fn;
  }

  /** The kid's grade, `'K'` or `'1'` to `'6'`, or null. K to 3 get the young look; with none, the lesson's `skillGrade` decides. */
  get grade(): string | null {
    return this._grade;
  }

  set grade(g: string | null) {
    // Normalized here, so a bad grade warns once, not at every restart.
    this._grade = normalizeGrade(g);
    this._start();
  }

  /** Where the animal drawings live, such as `/images/animals/`. With null, pictures draw blocks. */
  get pictureBase(): string | null {
    return this._pictureBase;
  }

  set pictureBase(b: string | null) {
    this._pictureBase = typeof b === 'string' && b !== '' ? (b.endsWith('/') ? b : `${b}/`) : null;
    this._start();
  }

  get mode(): LessonMode {
    return this._mode;
  }

  set mode(m: LessonMode) {
    if (!MODES.includes(m)) {
      console.warn(`[chocabloc-lesson] unknown mode: ${String(m)}`);
      return;
    }
    this._mode = m;
    this._start();
  }

  get lesson(): Lesson | null {
    return this._lesson;
  }

  set lesson(l: Lesson | null) {
    this._lesson = l;
    this._start();
  }

  connectedCallback(): void {
    this._connected = true;
    this._root.addEventListener('click', this._onClick);
    this._start();
  }

  disconnectedCallback(): void {
    this._connected = false;
    this._root.removeEventListener('click', this._onClick);
    this._stop();
  }

  /** Starts the mode from its first screen. Only while connected: connecting starts it. */
  private _start(): void {
    this._stop();
    this._clear();
    if (!this._connected) return;
    const own = this._lesson?.lang;
    const lang = safeLang(this.closest('[lang]')?.getAttribute('lang') || (typeof own === 'string' ? own : 'en'));
    const run: Run = {
      lang,
      msg: createMessages({ lang, translator: (k, v) => this.translator?.(k, v) }),
      speaker: createSpeaker(lang),
      look: {
        young: lookFor(this._grade, this._lesson?.skillGrade) === 'young',
        base: this._pictureBase,
        skillId: this._lesson?.skillId ?? '',
        y: null,
        wait: [],
      },
      tapped: false,
      controller: null,
      ended: false,
    };
    this._run = run;
    const shell = this._shell(run);
    if (this._mode === 'check') {
      this._practice(run, shell, null);
      return;
    }
    if (this._lesson == null) return;
    const parsed = parseLesson(this._lesson);
    if (!parsed.ok) {
      this._emit('lesson-error', { reason: parsed.reason });
      const sorry = run.msg('errors.unsupported');
      this._show(run, { step: 'error', heading: sorry, say: sorry, actions: [] });
      return;
    }
    this._loadYoung(run, parsed.lesson);
    if (this._mode === 'help') run.controller = startHelp(shell, parsed.lesson);
    else this._practice(run, shell, parsed.lesson);
  }

  /**
   * Starts the young chunk at once, without waiting, when the parsed lesson has a
   * count picture anywhere, or the kid is young and it has an array picture:
   * young lines exist only on those steps. Screens that need it before it arrives
   * wait in `look.wait`; if it fails, they are left out and the normal words show.
   */
  private _loadYoung(run: Run, lesson: Lesson): void {
    const { look } = run;
    const kinds = [lesson.idea.picture, lesson.afterWrong.picture, ...[lesson.example, ...lesson.moreHelp.examples].flatMap((e) => e.steps.map((s) => s.picture))].map((p) => p?.kind);
    if (!(kinds.includes('count') || (look.young && kinds.includes('array')))) return;
    youngChunk.load().then(
      (y) => {
        if (run !== this._run) return;
        y.register(lessonMessagesEn);
        if (!this._youngCss) {
          this._youngCss = document.createElement('style');
          this._youngCss.textContent = y.CSS;
          this._root.append(this._youngCss);
        }
        look.y = y;
        look.wait.splice(0).forEach((f) => f(true));
      },
      (err: unknown) => {
        if (run !== this._run) return;
        console.warn('[chocabloc-lesson] could not load the young look:', err);
        look.y = false;
        look.wait.splice(0).forEach((f) => f(false));
      },
    );
  }

  /**
   * Intro (with its lesson) and Check (without): the first screen now, and the
   * practice code, with <chocabloc-question>, from its own chunk. Intro shows the
   * idea while the chunk and the first questions load.
   */
  private _practice(run: Run, shell: LessonShell, lesson: Lesson | null): void {
    const { msg } = run;
    let begin: (() => void) | undefined;
    let waiting = false;
    const wait = (): void => {
      waiting = true;
      const text = msg('gettingQuestions');
      shell.show({ step: 'loading', heading: text, say: text, actions: [] });
    };
    if (lesson) showIdea(shell, lesson, introChips(msg, lesson, 'idea'), () => (begin ? begin() : wait()));
    else wait();
    practiceChunk.load().then(
      (p) => {
        if (!shell.active()) return;
        const c = lesson ? p.startIntro(shell, lesson, this) : p.startCheck(shell, this);
        run.controller = c;
        begin = c.begin;
        if (waiting) c.begin();
      },
      (err: unknown) => {
        if (!shell.active()) return;
        console.error('[chocabloc-lesson] could not load the practice code:', err);
        shell.emit('lesson-error', { reason: 'no-questions' });
        const sorry = msg('errors.noQuestions');
        const fail = (): void => void shell.show({ step: 'error', heading: sorry, say: sorry, actions: [], feedback: '' });
        // The idea stays while the kid reads it; Next then says so.
        if (waiting) fail();
        else {
          shell.feedback(sorry);
          begin = fail;
        }
      },
    );
  }

  /** Ends the current run: its controller, its speech, and anything it would still show or send. */
  private _stop(): void {
    const run = this._run;
    this._run = null;
    if (!run) return;
    run.controller?.dispose();
    run.speaker.cancel();
  }

  private _clear(): void {
    this._panel.hidden = true;
    this._actions.clear();
    this._chips.replaceChildren();
    this._step.replaceChildren();
    this._feedback.textContent = '';
    this._actionBar.replaceChildren();
  }

  private _shell(run: Run): LessonShell {
    const active = (): boolean => run === this._run && !run.ended;
    return {
      msg: run.msg,
      lang: run.lang,
      kit: { ...KIT, renderPicture: (pic, msg, lang) => renderPicture(pic, msg, lang, run.look) },
      look: run.look,
      active,
      show: (screen) => this._show(run, screen),
      feedback: (text, say = true) => {
        if (!active()) return;
        this._feedback.textContent = text;
        if (text && say) this._voice(run, text);
      },
      speak: (text) => {
        if (active()) this._voice(run, text);
      },
      emit: (type, detail) => {
        if (active()) this._emit(type, detail);
      },
      done: (detail) => {
        if (!active()) return;
        run.ended = true;
        run.speaker.cancel();
        this._emit('lesson-done', detail);
      },
    };
  }

  /** Browsers refuse speech until the page has been tapped; until then a young kid gets Tap to hear. */
  private _unlocked(run: Run): boolean {
    return run.tapped || navigator.userActivation?.hasBeenActive !== false;
  }

  /** A young kid hears what is shown, once the voice is allowed. */
  private _voice(run: Run, text: string): void {
    if (run.look.young && run.speaker.supported && this._unlocked(run)) run.speaker.speak(text);
  }

  private _show(run: Run, screen: Screen): HTMLButtonElement[] {
    // An ended run keeps its last screen as it is.
    if (run !== this._run || run.ended) return [];
    const { msg, speaker } = run;
    speaker.cancel();
    this._actions = new Map();
    this._actions.set(this._close, () => {
      if (run.ended) return;
      speaker.cancel();
      if (screen.close) {
        screen.close();
        return;
      }
      this._emit('lesson-close', { step: screen.step });
      // Closing ends the run: a late answer or fetch reports nothing.
      run.ended = true;
      run.controller?.dispose();
    });
    this._close.textContent = msg('close');

    this._chips.replaceChildren(
      ...(screen.chips ?? []).map((c) => {
        const chip = h('span', 'chip', c.state, c.label);
        if (c.state === 'on') chip.setAttribute('aria-current', 'step');
        return chip;
      }),
    );

    const step = h('div', undefined, 'step enter');
    const heading = h('h2', 'heading', undefined, screen.heading);
    heading.tabIndex = -1;
    step.append(heading);
    const text = screen.text != null ? h('p', 'text', undefined, screen.text) : null;
    if (text) step.append(text);
    if (screen.cards?.length) step.append(cardsOf(screen.cards));
    if (screen.picture) step.append(renderPicture(screen.picture, msg, run.lang, run.look));
    // The young words go with animals: shown, and spoken, only while the picture really draws them.
    const { young } = screen;
    if (young && step.querySelector('.animals')) {
      const normal = screen.say;
      const words = (on: boolean): void => {
        heading.textContent = on ? young.text : screen.heading;
        if (text) text.hidden = on;
        screen.say = on ? young.say : normal;
      };
      words(true);
      step.addEventListener('error', () => words(false), { once: true, capture: true });
    }
    if (screen.result != null) step.append(h('p', 'result', undefined, screen.result));
    if (screen.body) step.append(screen.body);
    if (screen.tip != null) step.append(h('p', 'tip', undefined, screen.tip));
    this._step.replaceWith(step);
    this._step = step;
    if (screen.feedback != null) this._feedback.textContent = screen.feedback;

    const bar: HTMLButtonElement[] = [];
    // A speaker button: `part` and label, and what it says is the screen's read-to-me words.
    const sayButton = (part: string, label: string, after?: () => void): HTMLButtonElement => {
      const b = this._button(part, label, () => {
        after?.();
        speaker.speak(screen.say);
      });
      b.prepend(speakerIcon());
      return b;
    };
    const talks = speaker.supported && run.look.young;
    const voiced = talks && this._unlocked(run);
    if (speaker.supported) bar.push(sayButton('button read-to-me', msg('readToMe')));
    if (talks && !voiced) {
      const tap = sayButton('button tap-to-hear', msg('tapToHear'), () => {
        run.tapped = true;
        tap.remove();
        heading.focus();
      });
      bar.unshift(tap);
    }
    const acts = screen.actions.map((a) => this._button('button', a.label, a.run, a.primary ? undefined : 'secondary'));
    this._actionBar.replaceChildren(...bar, ...acts);
    this._panel.hidden = false;

    heading.focus();
    // Enter motion: the start state applies first, then CSS moves the step to rest.
    // Under reduced motion the step has no transition, so it simply appears.
    void step.offsetWidth;
    step.classList.remove('enter');
    if (voiced) speaker.speak(screen.say);
    return acts;
  }

  private _button(part: string, label: string, run: () => void, cls?: string): HTMLButtonElement {
    const b = h('button', part, cls, label);
    b.type = 'button';
    this._actions.set(b, run);
    return b;
  }

  private _emit(type: string, detail: Record<string, unknown>): void {
    this.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));
  }
}

if (!customElements.get('chocabloc-lesson')) customElements.define('chocabloc-lesson', ChocaLesson);
