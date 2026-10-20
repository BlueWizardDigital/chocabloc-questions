import { parseLesson } from '../parse';
import { createMessages, safeLang } from '../messages';
import type { Msg, Translator } from '../messages';
import { speakableText } from '../speak-text';
import type { IdeaCard, Lesson, LessonPicture } from '../types';
import type { NormalizedQuestion, ValidateAnswer } from '../../types';
import { h, svg, renderPicture } from './pictures';
import { createSpeaker } from './speaker';
import type { Speaker } from './speaker';
import { LESSON_CSS } from './styles';

export type LessonMode = 'help' | 'intro' | 'check';
export type GetQuestions = (skillId: string, count: number, excludeIds: string[]) => Promise<NormalizedQuestion[]>;

export interface ScreenAction {
  label: string;
  run(): void;
  /** The yellow main button; the others are paler. */
  primary?: boolean;
}

/** One screen of any mode. A mode controller describes it; the element draws it. */
export interface Screen {
  /** Sent as lesson-close `{ step }` when the kid closes on this screen. */
  step: string;
  chips?: { label: string; state: 'on' | 'done' | 'todo' }[] | undefined;
  heading: string;
  text?: string | undefined;
  cards?: IdeaCard[] | undefined;
  picture?: LessonPicture | undefined;
  result?: string | undefined;
  /** A mode's own content under the text, such as a question. */
  body?: HTMLElement | undefined;
  tip?: string | undefined;
  /** What Read to me speaks, already in words. */
  say: string;
  actions: ScreenAction[];
}

/** What a mode controller gets from the element. Calls from a run that was replaced do nothing. */
export interface LessonShell {
  readonly msg: Msg;
  readonly lang: string;
  show(screen: Screen): void;
  done(detail: Record<string, unknown>): void;
}

export interface ModeController {
  dispose(): void;
}

interface Run {
  lang: string;
  msg: Msg;
  speaker: Speaker;
  controller: ModeController | null;
}

const MODES: readonly LessonMode[] = ['help', 'intro', 'check'];

const sentence = (s: string): string => (/[.!?…:]$/.test(s) ? s : `${s}.`);

/** Shown text as speech: symbols read as words, one sentence per piece. */
const spoken = (msg: Msg, ...shown: (string | undefined)[]): string =>
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

/** Help: the idea, then each worked-example step with Next and Back, then Back to the game. */
function startHelp(shell: LessonShell, lesson: Lesson): ModeController {
  const { msg } = shell;
  const { idea, example } = lesson;
  const chips = (watching: boolean): Screen['chips'] => [
    { label: msg('steps.idea'), state: watching ? 'done' : 'on' },
    { label: msg('steps.watch'), state: watching ? 'on' : 'todo' },
  ];
  const show = (i: number): void => {
    if (i === 0) {
      shell.show({
        step: 'idea',
        chips: chips(false),
        heading: idea.heading,
        text: idea.text,
        cards: idea.cards,
        picture: idea.picture,
        tip: idea.tip,
        say: ideaSay(idea, msg),
        actions: [{ label: msg('next'), primary: true, run: () => show(1) }],
      });
      return;
    }
    const s = example.steps[i - 1]!;
    const last = i === example.steps.length;
    shell.show({
      step: 'watch',
      chips: chips(true),
      heading: s.heading,
      text: s.text,
      picture: s.picture,
      result: s.result,
      say: s.say ?? spoken(msg, s.heading, s.text, s.result),
      actions: [
        { label: msg('back'), run: () => show(i - 1) },
        last
          ? { label: msg('backToGame'), primary: true, run: () => shell.done({ mode: 'help' }) }
          : { label: msg('next'), primary: true, run: () => show(i + 1) },
      ],
    });
  };
  show(0);
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
 * element. Setting `lesson` or `mode` starts again from the first screen, and
 * so does adding the element back after it was removed. It adds no listener to
 * `window` or `document`; its one click listener lives on its shadow root.
 */
export class ChocaLesson extends HTMLElement {
  /** Intro: up to `count` bank questions for `skillId`, none whose id is in `excludeIds`. */
  getQuestions: GetQuestions | undefined = undefined;
  /** Check: the host's questions, fetched in one request. */
  questions: NormalizedQuestion[] = [];
  /** Intro and Check: the host's validator. The player never holds an answer. */
  validateAnswer: ValidateAnswer | undefined = undefined;
  /** Asked first for each of the player's own words; `undefined` falls back to English. */
  translator: Translator | undefined = undefined;

  private _mode: LessonMode = 'help';
  private _lesson: Lesson | null = null;
  private _run: Run | null = null;
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
    this._root.addEventListener('click', this._onClick);
    this._start();
  }

  disconnectedCallback(): void {
    this._root.removeEventListener('click', this._onClick);
    this._stop();
  }

  /** Starts the mode from its first screen. Only while connected: connecting starts it. */
  private _start(): void {
    this._stop();
    this._clear();
    if (!this.isConnected) return;
    const own = this._lesson?.lang;
    const lang = safeLang(this.closest('[lang]')?.getAttribute('lang') || (typeof own === 'string' ? own : 'en'));
    const run: Run = {
      lang,
      msg: createMessages({ lang, translator: (k, v) => this.translator?.(k, v) }),
      speaker: createSpeaker(lang),
      controller: null,
    };
    this._run = run;
    if (this._mode !== 'help') {
      // shortcut: Intro and Check show nothing until task B8 builds their controllers.
      console.warn(`[chocabloc-lesson] mode "${this._mode}" is not available yet`);
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
    run.controller = startHelp(this._shell(run), parsed.lesson);
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
    return {
      msg: run.msg,
      lang: run.lang,
      show: (screen) => this._show(run, screen),
      done: (detail) => {
        if (run !== this._run) return;
        run.speaker.cancel();
        this._emit('lesson-done', detail);
      },
    };
  }

  private _show(run: Run, screen: Screen): void {
    if (run !== this._run) return;
    const { msg, speaker } = run;
    speaker.cancel();
    this._actions = new Map();
    this._actions.set(this._close, () => {
      speaker.cancel();
      this._emit('lesson-close', { step: screen.step });
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
    if (screen.text != null) step.append(h('p', 'text', undefined, screen.text));
    if (screen.cards?.length) step.append(cardsOf(screen.cards));
    if (screen.picture) step.append(renderPicture(screen.picture, msg, run.lang));
    if (screen.result != null) step.append(h('p', 'result', undefined, screen.result));
    if (screen.body) step.append(screen.body);
    if (screen.tip != null) step.append(h('p', 'tip', undefined, screen.tip));
    this._step.replaceWith(step);
    this._step = step;
    this._feedback.textContent = '';

    const bar: HTMLButtonElement[] = [];
    if (speaker.supported) {
      const read = this._button('button read-to-me', msg('readToMe'), () => speaker.speak(screen.say));
      read.prepend(speakerIcon());
      bar.push(read);
    }
    for (const a of screen.actions) bar.push(this._button('button', a.label, a.run, a.primary ? undefined : 'secondary'));
    this._actionBar.replaceChildren(...bar);
    this._panel.hidden = false;

    heading.focus();
    // Enter motion: the start state applies first, then CSS moves the step to rest.
    // Under reduced motion the step has no transition, so it simply appears.
    void step.offsetWidth;
    step.classList.remove('enter');
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
