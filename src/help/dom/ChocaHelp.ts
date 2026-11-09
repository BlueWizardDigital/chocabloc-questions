import { lookFor, normalizeGrade } from '../../lesson/look';
import { h, DISPLAY } from '../../lesson/dom/counted-rows';
import { createSpeaker } from '../../lesson/dom/speaker';
import type { Speaker } from '../../lesson/dom/speaker';
import { speakerIcon, voiceUnlocked } from '../../lesson/dom/tap-to-hear';
import { safeLang } from '../../lesson/message-format';
import type { Msg, Translator } from '../../lesson/message-format';
import { speakableText } from '../../lesson/speak-text';
import { factKey, familyOf } from '../catalog';
import { createHelpMessages } from '../messages';
import { buildSteps, strategyOrder } from '../strategies';
import type { HelpFact, HelpRecord, HelpStep, SolvedFact, StrategyId } from '../types';
import { PICTURE_CSS, drawPicture, roleNodes } from './picture';
import type { HelpLook } from './picture';

export type HelpDraw = 'card' | 'strip';
type Thumb = HelpRecord['thumb'];

interface Way {
  id: StrategyId;
  steps: HelpStep[];
}

/** One opening of the panel. What it reads from the properties, it reads once, at open(). */
interface Run {
  fact: HelpFact;
  msg: Msg;
  /** Null for an older kid: the panel then never touches speech, so it can't cut off a game's voice. */
  speaker: Speaker | null;
  look: HelpLook;
  draw: HelpDraw;
  ways: Way[];
  way: number;
  step: number;
  /** 👎 has gone past the last way at least once. */
  wrapped: boolean;
  /** This way's help-record has gone out. */
  recorded: boolean;
}

const PROPS = ['fact', 'grade', 'pick', 'solved', 'draw', 'translator', 'pictureBase'] as const;

const BODY = 'var(--cl-font-body, var(--cq-font, system-ui))';
const BG = 'var(--cl-bg, #fff8ec)';
const INK = 'var(--cl-ink, #2b2118)';
const ACCENT = 'var(--cl-accent, #ffcf33)';
const BORDER = 'var(--cl-border, #2b2118)';
const RADIUS = 'var(--cl-radius, 16px)';
const PAPER = 'rgba(255, 255, 255, 0.6)';

// Chrome 103: nothing newer (tests/lesson/chrome103.test.ts).
const HELP_CSS = `
:host { display: block; font-family: ${BODY}; color: ${INK}; }
:host([hidden]) { display: none; }
[hidden] { display: none !important; }
[part~="panel"] {
  box-sizing: border-box; display: flex; flex-direction: column; gap: 8px; padding: 12px;
  background: ${BG}; color: ${INK};
  border: 3px solid ${BORDER}; border-radius: ${RADIUS};
  overflow-wrap: anywhere; line-height: 1.35;
}
[part~="way"] { margin: 0; font-size: 13px; font-weight: 700; opacity: 0.75; }
[part~="text"] { margin: 0; font-family: ${DISPLAY}; font-size: 17px; font-weight: 700; }
.young [part~="text"] { font-size: 22px; }
[part~="text"]:focus { outline: none; }
[part~="picture"] { box-sizing: border-box; display: flex; justify-content: center; overflow-x: auto; }
.ctrls { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.spacer { flex: 1 1 auto; }
[part~="button"] {
  box-sizing: border-box; min-height: 44px; padding: 6px 10px; cursor: pointer;
  font-family: ${BODY}; font-weight: 800; font-size: 14px; line-height: 1.1;
  color: ${INK}; background: ${PAPER};
  border: 2px solid ${BORDER}; border-radius: ${RADIUS};
}
[part~="button"]:active { transform: translateY(1px); }
[part~="button"]:focus-visible { outline: 3px solid ${INK}; outline-offset: 2px; }
[part~="button"]:disabled { opacity: 0.45; cursor: default; }
[part~="thumb-up"], [part~="thumb-down"] { font-size: 20px; padding: 4px 8px; }
[part~="tap-to-hear"] {
  display: inline-flex; align-items: center; justify-content: center; gap: 6px; width: 100%;
  font-size: 20px; padding: 12px; background: ${ACCENT};
}
[part~="tap-to-hear"] svg { width: 28px; height: 28px; flex: none; }
${PICTURE_CSS}`;

/** K is 0; null means grade 4 and up. `g` has been through normalizeGrade. */
const gradeNumber = (g: string | null): number | null =>
  g === 'K' ? 0 : g === null ? null : Number(g);

const sameFact = (x: HelpFact | null, y: HelpFact | null): boolean =>
  x === y ||
  (x !== null && y !== null && x.op === y.op && x.a === y.a && x.b === y.b && x.c === y.c);

/** A v4 UUID: the only kind the server and Cocoa Lab accept. */
function newEventId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  // randomUUID exists only in a secure context (a tablet on a dev machine's LAN address has none).
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = ((b[6] as number) & 0x0f) | 0x40;
  b[8] = ((b[8] as number) & 0x3f) | 0x80;
  const hex = Array.from(b, (n) => n.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * `<chocabloc-help>`: one short nudge for a stuck kid, in a way a teacher would use, and never the
 * final number. Set the properties, then call `open()` when the kid asks; it never opens by itself.
 * It takes only the numbers the question shows (`fact`), never its answer, choices, token or id.
 *
 * What `open()` reads it reads once. Setting a different `fact` while open closes the panel first,
 * because its numbers are then out of date. Removing the element closes it too.
 */
export class ChocaHelp extends HTMLElement {
  private _fact: HelpFact | null = null;
  private _grade: string | null = null;
  private _pick: StrategyId | null = null;
  private _solved: SolvedFact[] = [];
  private _draw: HelpDraw = 'card';
  private _translator: Translator | undefined = undefined;
  private _pictureBase: string | null = null;
  private _run: Run | null = null;
  /** The kid has tapped Tap to hear, so the voice may start. */
  private _tapped = false;
  private readonly _panel: HTMLElement;
  private readonly _way: HTMLElement;
  private readonly _text: HTMLElement;
  private readonly _picture: HTMLElement;
  private readonly _tap: HTMLElement;
  private readonly _back: HTMLButtonElement;
  private readonly _more: HTMLButtonElement;
  private readonly _up: HTMLButtonElement;
  private readonly _down: HTMLButtonElement;
  private readonly _close: HTMLButtonElement;

  constructor() {
    super();
    const root = this.attachShadow({ mode: 'open' });
    this._panel = h('div', 'panel');
    this._panel.hidden = true;
    this._way = h('p', 'way');
    this._text = h('p', 'text');
    this._text.tabIndex = -1;
    this._text.setAttribute('aria-live', 'polite');
    this._picture = h('div', 'picture');
    // Numbers on the picture stay on the picture: the words say what a kid needs to hear.
    this._picture.setAttribute('aria-hidden', 'true');
    this._tap = h('div');
    this._back = this._button('back', () => this._go(-1));
    this._more = this._button('more', () => this._go(1));
    this._up = this._button('thumb-up', () => this._finish('up'));
    this._down = this._button('thumb-down', () => this._nextWay());
    this._close = this._button('close', () => this._finish(null));
    const controls = h('div', undefined, 'ctrls');
    controls.append(
      this._back,
      this._more,
      h('span', undefined, 'spacer'),
      this._up,
      this._down,
      this._close,
    );
    this._panel.append(this._way, this._text, this._picture, this._tap, controls);
    root.append(h('style', undefined, undefined, HELP_CSS), this._panel);
    // A host may set properties before the element is defined. They then sit on the instance and
    // hide the accessors, so take them back through the accessors.
    const self = this as unknown as Record<string, unknown>;
    for (const p of PROPS) {
      if (Object.prototype.hasOwnProperty.call(this, p)) {
        const v = self[p];
        delete self[p];
        self[p] = v;
      }
    }
  }

  /** The question's visible numbers, with one of `a`, `b`, `c` null: the unknown. */
  get fact(): HelpFact | null {
    return this._fact;
  }

  set fact(f: HelpFact | null) {
    if (sameFact(this._fact, f)) return;
    this.close();
    this._fact = f;
  }

  /** The kid's grade, `'K'` or `'1'` to `'12'`, or null. K to 3 get the young look and two ways; anything else counts as null, with one warning. */
  get grade(): string | null {
    return this._grade;
  }

  set grade(g: string | null) {
    this._grade = normalizeGrade(g);
  }

  /** The kid's saved strategy for this family, if any. A pick above the grade or for another family is ignored. */
  get pick(): StrategyId | null {
    return this._pick;
  }

  set pick(p: StrategyId | null) {
    this._pick = p;
  }

  /** Facts already solved on screen (Cocoa Lab's grid), for the nearby fact. */
  get solved(): SolvedFact[] {
    return this._solved;
  }

  set solved(s: SolvedFact[]) {
    this._solved = Array.isArray(s) ? s : [];
  }

  /** `card` draws the picture; `strip` doesn't, and the game lights its own from `help-step`. */
  get draw(): HelpDraw {
    return this._draw;
  }

  set draw(d: HelpDraw) {
    if (d !== 'card' && d !== 'strip') {
      console.warn(`[chocabloc-help] unknown draw: ${String(d)}`);
      return;
    }
    this._draw = d;
  }

  /** Asked first for each of the panel's words; `undefined` falls back to English. */
  get translator(): Translator | undefined {
    return this._translator;
  }

  set translator(fn: Translator | undefined) {
    this._translator = fn;
  }

  /** Where the animal drawings live, such as `/images/animals/`. With null, pictures draw blocks. */
  get pictureBase(): string | null {
    return this._pictureBase;
  }

  set pictureBase(b: string | null) {
    this._pictureBase = typeof b === 'string' && b !== '' ? (b.endsWith('/') ? b : `${b}/`) : null;
  }

  disconnectedCallback(): void {
    this.close();
  }

  /** Shows the panel, on the kid's pick or the first way. Does nothing if it is already open. */
  open(): void {
    if (this._run) return;
    if (!this.isConnected) {
      console.warn('[chocabloc-help] open() needs the element on the page');
      return;
    }
    const lang = safeLang(this.closest('[lang]')?.getAttribute('lang') || 'en');
    const msg = createHelpMessages({ lang, translator: (k, v) => this._translator?.(k, v) });
    const young = lookFor(this._grade, null) === 'young';
    // Only the four fields: the host's object may be a whole question.
    const f = this._fact;
    const fact: HelpFact = f
      ? { op: f.op, a: f.a, b: f.b, c: f.c }
      : { op: 'mult', a: null, b: null, c: null };
    const options = { grade: gradeNumber(this._grade), solved: this._solved };
    const ways = strategyOrder(fact, { ...options, pick: this._pick }).flatMap((id) => {
      const steps = buildSteps(id, fact, options);
      return steps ? [{ id, steps }] : [];
    });
    const run: Run = {
      fact,
      msg,
      speaker: young ? createSpeaker(lang) : null,
      look: { young, base: this._pictureBase, key: factKey(fact) },
      draw: this._draw,
      ways,
      way: 0,
      step: 0,
      wrapped: false,
      recorded: false,
    };
    this._run = run;
    this._panel.className = young ? 'young' : '';
    this._back.textContent = msg('panel.back');
    this._more.textContent = msg('panel.more');
    this._close.textContent = msg('panel.close');
    this._up.textContent = '👍';
    this._down.textContent = '👎';
    for (const [b, key] of [
      [this._up, 'panel.thumbUp'],
      [this._down, 'panel.thumbDown'],
    ] as const) {
      const label = msg(key);
      b.setAttribute('aria-label', label);
      b.title = label;
    }
    const hasWays = ways.length > 0;
    for (const e of [this._way, this._back, this._more, this._up, this._down]) e.hidden = !hasWays;
    this._panel.hidden = false;
    if (hasWays) {
      this._showStep(run);
    } else {
      // Nothing is ever guessed from the question's text.
      const sorry = msg('panel.fallback');
      this._text.textContent = sorry;
      this._picture.hidden = true;
      this._voice(run, sorry);
    }
    this._text.focus();
  }

  /** Closes the panel. If a strategy is showing, it is left with no thumb. Does nothing if already closed. */
  close(): void {
    this._finish(null);
  }

  private _button(name: string, run: () => void): HTMLButtonElement {
    const b = h('button', `button ${name}`);
    b.type = 'button';
    b.addEventListener('click', run);
    return b;
  }

  private _go(by: number): void {
    const run = this._run;
    if (!run) return;
    run.step += by;
    this._showStep(run);
  }

  /** 👎: the next way, from its first step; after the last, back to the first. */
  private _nextWay(): void {
    const run = this._run;
    if (!run) return;
    this._record(run, 'down');
    // A help-record listener may have closed the panel.
    if (this._run !== run) return;
    run.way = (run.way + 1) % run.ways.length;
    run.wrapped = run.wrapped || run.way === 0;
    run.step = 0;
    run.recorded = false;
    this._showStep(run);
  }

  private _finish(thumb: Thumb): void {
    const run = this._run;
    if (!run) return;
    this._run = null;
    run.speaker?.cancel();
    this._panel.hidden = true;
    for (const e of [this._way, this._text, this._picture, this._tap]) e.replaceChildren();
    this._record(run, thumb);
    this._emit('help-close', {});
  }

  private _record(run: Run, thumb: Thumb): void {
    const way = run.ways[run.way];
    if (!way || run.recorded) return;
    run.recorded = true;
    const record: HelpRecord = {
      eventId: newEventId(),
      family: familyOf(run.fact),
      strategy: way.id,
      thumb,
      fact: factKey(run.fact),
    };
    this._emit('help-record', record);
  }

  private _showStep(run: Run): void {
    const way = run.ways[run.way] as Way;
    const step = way.steps[run.step] as HelpStep;
    const { msg } = run;
    const again = run.wrapped && run.step === 0 ? `${msg('panel.again')} ` : '';
    const name = msg(`name.${way.id}`);
    this._way.textContent =
      again + msg('panel.way', { index: run.way + 1, count: run.ways.length, name });
    const line = msg(step.say.key, step.say.params);
    this._text.replaceChildren(...roleNodes(line, step.say.params));
    const picture = run.draw === 'card' ? step.picture : null;
    this._picture.hidden = picture === null;
    this._picture.replaceChildren(...(picture ? [drawPicture(picture, run.look)] : []));
    // A disabled button loses focus; the words can hold it, and a screen reader reads them from there.
    const focused = this.shadowRoot?.activeElement;
    this._back.disabled = run.step === 0;
    this._more.disabled = run.step === way.steps.length - 1;
    if (focused instanceof HTMLButtonElement && focused.disabled) this._text.focus();
    this._voice(run, again + line);
    this._emit('help-step', { strategy: way.id, index: run.step, points: step.points });
  }

  /** A young kid hears what is shown, once the voice is allowed; before that, Tap to hear. */
  private _voice(run: Run, line: string): void {
    const { speaker, msg } = run;
    if (!speaker?.supported) return;
    speaker.cancel();
    const words = speakableText(line, msg);
    if (voiceUnlocked(this._tapped)) {
      this._tap.replaceChildren();
      speaker.speak(words);
      return;
    }
    const tap = this._button('tap-to-hear', () => {
      this._tapped = true;
      tap.remove();
      this._text.focus();
      speaker.speak(words);
    });
    tap.textContent = msg('tapToHear');
    tap.prepend(speakerIcon());
    this._tap.replaceChildren(tap);
  }

  private _emit(type: string, detail: unknown): void {
    this.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));
  }
}

if (!customElements.get('chocabloc-help')) customElements.define('chocabloc-help', ChocaHelp);
