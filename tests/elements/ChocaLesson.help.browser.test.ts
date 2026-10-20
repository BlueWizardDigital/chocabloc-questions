import { expect } from '@esm-bundle/chai';
import { emulateMedia } from '@web/test-runner-commands';
// The lesson entry registers <chocabloc-lesson> on import. This file must never
// import the question element: Help has to load no questions.
import { ChocaLesson } from '../../src/lesson/index';
import type { Lesson, LessonPicture } from '../../src/lesson/index';
import { renderPicture } from '../../src/lesson/dom/pictures';
import { createMessages } from '../../src/lesson/messages';

type Detail = Record<string, unknown>;

let fixture: Lesson;
const cleanups: (() => void)[] = [];

before(async () => {
  const res = await fetch(new URL('../fixtures/lesson-compare-100.json', import.meta.url));
  fixture = (await res.json()) as Lesson;
});

afterEach(() => {
  cleanups.splice(0).reverse().forEach((fn) => fn());
});

function mount(opts: { lang?: string; width?: number } = {}): ChocaLesson {
  const holder = document.createElement('div');
  if (opts.lang != null) holder.setAttribute('lang', opts.lang);
  if (opts.width != null) holder.style.width = `${opts.width}px`;
  document.body.appendChild(holder);
  cleanups.push(() => holder.remove());
  const el = document.createElement('chocabloc-lesson') as ChocaLesson;
  holder.appendChild(el);
  return el;
}

const copy = (): Lesson => JSON.parse(JSON.stringify(fixture)) as Lesson;
const root = (el: ChocaLesson): ShadowRoot => el.shadowRoot as ShadowRoot;
const part = (el: ChocaLesson, name: string): HTMLElement | null =>
  root(el).querySelector<HTMLElement>(`[part~="${name}"]`);
const parts = (el: ChocaLesson, name: string): HTMLElement[] =>
  Array.from(root(el).querySelectorAll<HTMLElement>(`[part~="${name}"]`));
const buttons = (el: ChocaLesson): HTMLButtonElement[] => Array.from(root(el).querySelectorAll('button'));
const labels = (el: ChocaLesson): string[] => buttons(el).map((b) => (b.textContent ?? '').trim());
const heading = (el: ChocaLesson): string | null | undefined => part(el, 'heading')?.textContent;
// A string, not the element: a failed assertion on DOM nodes stalls the runner's diff.
const focused = (el: ChocaLesson): string | null | undefined => root(el).activeElement?.getAttribute('part');

function button(el: ChocaLesson, label: string): HTMLButtonElement {
  const b = buttons(el).find((x) => (x.textContent ?? '').trim() === label);
  if (!b) throw new Error(`no "${label}" button; have ${JSON.stringify(labels(el))}`);
  return b;
}

function listen(type: string): Detail[] {
  const got: Detail[] = [];
  const fn = (e: Event) => got.push((e as CustomEvent<Detail>).detail);
  document.addEventListener(type, fn);
  cleanups.push(() => document.removeEventListener(type, fn));
  return got;
}

const frames = (): Promise<void> =>
  new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));

/** The layout box, untouched by the step's enter transform (getBoundingClientRect is not). */
function boxOf(e: Element): { width: number; height: number } {
  const s = getComputedStyle(e);
  return { width: parseFloat(s.width), height: parseFloat(s.height) };
}

function painted(c: HTMLCanvasElement): number {
  const data = (c.getContext('2d') as CanvasRenderingContext2D).getImageData(0, 0, c.width, c.height).data;
  let n = 0;
  for (let i = 3; i < data.length; i += 4) if (data[i] !== 0) n++;
  return n;
}

interface SpeechStub {
  spoken: SpeechSynthesisUtterance[];
  cancels: number;
}

/** Replaces a window property for one test, and puts the original back after it. */
function override(name: string, get: () => unknown): void {
  const own = Object.getOwnPropertyDescriptor(window, name);
  Object.defineProperty(window, name, { configurable: true, get });
  cleanups.push(() => {
    if (own) Object.defineProperty(window, name, own);
    else Reflect.deleteProperty(window, name);
  });
}

/** Replaces window.speechSynthesis for one test; `absent` removes it. */
function stubSpeech(opts: { throws?: boolean; absent?: boolean } = {}): SpeechStub {
  const stub: SpeechStub = { spoken: [], cancels: 0 };
  const synth = opts.absent
    ? undefined
    : {
        speak(u: SpeechSynthesisUtterance) {
          stub.spoken.push(u);
          if (opts.throws) throw new Error('no voice for this language');
        },
        cancel() {
          stub.cancels++;
        },
      };
  override('speechSynthesis', () => synth);
  return stub;
}

describe('<chocabloc-lesson> Help', () => {
  it('registers on import', () => {
    expect(customElements.get('chocabloc-lesson')).to.equal(ChocaLesson);
  });

  it('shows the idea in the same task the lesson is set', () => {
    const el = mount();
    el.lesson = fixture;
    expect(heading(el)).to.equal('Meet the signs');
    expect(part(el, 'text')?.textContent).to.equal(fixture.idea.text);
    const cards = parts(el, 'card');
    expect(cards).to.have.length(3);
    expect(cards[0]!.textContent).to.include('<').and.include('is less than').and.include('3 < 8');
    expect(part(el, 'tip')?.textContent).to.equal(fixture.idea.tip);
    expect(part(el, 'close')).to.not.equal(null);
  });

  it('Next walks the 4 steps with focus on each heading, Back returns, the last screen ends Help', () => {
    const done = listen('lesson-done');
    const el = mount();
    el.lesson = fixture;
    const steps = fixture.example.steps;
    expect(steps).to.have.length(4);
    for (const s of steps) {
      button(el, 'Next').click();
      expect(heading(el)).to.equal(s.heading);
      expect(focused(el)).to.equal('heading');
      expect(part(el, 'close')).to.not.equal(null);
    }
    expect(part(el, 'result')?.textContent).to.equal('43 < 52');
    expect(labels(el)).to.not.include('Next');

    button(el, 'Back').click();
    expect(heading(el)).to.equal(steps[2]!.heading);
    expect(focused(el)).to.equal('heading');
    button(el, 'Next').click();
    expect(done).to.deep.equal([]);
    button(el, 'Back to the game').click();
    expect(done).to.deep.equal([{ mode: 'help' }]);
  });

  it('Close sends lesson-close once, with the step it was on, and ends the run', () => {
    const closed = listen('lesson-close');
    const done = listen('lesson-done');
    const el = mount();
    el.lesson = fixture;
    part(el, 'close')!.click();
    part(el, 'close')!.click();
    expect(closed).to.deep.equal([{ step: 'idea' }]);
    // An ended run keeps its last screen and does nothing more.
    button(el, 'Next').click();
    expect(heading(el)).to.equal('Meet the signs');
    // Setting the lesson again starts a new run.
    el.lesson = fixture;
    button(el, 'Next').click();
    part(el, 'close')!.click();
    expect(closed).to.have.length(2);
    expect(closed[1]).to.deep.equal({ step: 'watch' });
    expect(done).to.deep.equal([]);
  });

  it('after Back to the game, Close sends nothing', () => {
    const closed = listen('lesson-close');
    const done = listen('lesson-done');
    const el = mount();
    el.lesson = fixture;
    for (let i = 0; i < fixture.example.steps.length; i++) button(el, 'Next').click();
    button(el, 'Back to the game').click();
    button(el, 'Back to the game').click();
    part(el, 'close')!.click();
    expect(done).to.deep.equal([{ mode: 'help' }]);
    expect(closed).to.deep.equal([]);
  });

  it('shows lesson words as text, never as HTML', async () => {
    const bad = '<img src=x onerror="window.__x=1">';
    const l = copy();
    l.idea.heading = bad;
    l.idea.text = bad;
    l.idea.tip = bad;
    l.idea.cards![0]!.words = bad;
    l.example.steps[0]!.heading = bad;
    const el = mount();
    el.lesson = l;
    expect(heading(el)).to.equal(bad);
    expect(part(el, 'text')?.textContent).to.equal(bad);
    expect(root(el).querySelectorAll('img').length).to.equal(0);
    button(el, 'Next').click();
    expect(heading(el)).to.equal(bad);
    expect(root(el).querySelectorAll('img').length).to.equal(0);
    await frames();
    expect((window as unknown as { __x?: number }).__x).to.equal(undefined);
  });

  it("asks the translator first for the player's own words", () => {
    const el = mount();
    el.translator = (k) => (k === 'next' ? 'Suivant' : undefined);
    el.lesson = fixture;
    expect(button(el, 'Suivant')).to.not.equal(undefined);
    expect(part(el, 'close')?.textContent).to.equal('Close');
  });

  it('setting the lesson or the mode starts again from the first screen', () => {
    const el = mount();
    el.lesson = fixture;
    button(el, 'Next').click();
    button(el, 'Next').click();
    el.mode = 'help';
    expect(heading(el)).to.equal('Meet the signs');
    button(el, 'Next').click();
    el.lesson = fixture;
    expect(heading(el)).to.equal('Meet the signs');
  });

  describe('Read to me', () => {
    it('speaks the screen with symbols as words, in the language around the element', () => {
      const speech = stubSpeech();
      const el = mount({ lang: 'fr' });
      el.lesson = fixture;
      button(el, 'Read to me').click();
      expect(speech.spoken).to.have.length(1);
      const u = speech.spoken[0]!;
      expect(u.lang).to.equal('fr');
      expect(u.text).to.include('Meet the signs').and.include('3 is less than 8').and.include('8 is greater than 3');
      expect(u.text).to.not.match(/[<>]/);
    });

    it("speaks a step's say text instead of its words", () => {
      const speech = stubSpeech();
      const l = copy();
      l.example.steps[0]!.say = 'Thirty-four and ninety-nine.';
      const el = mount();
      el.lesson = l;
      button(el, 'Next').click();
      button(el, 'Read to me').click();
      expect(speech.spoken[0]!.text).to.equal('Thirty-four and ninety-nine.');
    });

    it("a card's say replaces that card's words only", () => {
      const speech = stubSpeech();
      const l = copy();
      l.idea.cards![0]!.say = 'Less than.';
      const el = mount();
      el.lesson = l;
      button(el, 'Read to me').click();
      const text = speech.spoken[0]!.text;
      expect(text).to.include('Less than.').and.include('8 is greater than 3').and.include('smaller number');
      expect(text).to.not.include('3 is less than 8');
    });

    it('a Next tap, Close and removal each stop speech', () => {
      const speech = stubSpeech();
      const el = mount();
      el.lesson = fixture;
      button(el, 'Read to me').click();
      let before = speech.cancels;
      button(el, 'Next').click();
      expect(speech.cancels).to.be.greaterThan(before);
      before = speech.cancels;
      part(el, 'close')!.click();
      expect(speech.cancels).to.be.greaterThan(before);
      before = speech.cancels;
      el.remove();
      expect(speech.cancels).to.be.greaterThan(before);
    });

    it('a voice that throws is caught and logged, and the button still works', () => {
      const speech = stubSpeech({ throws: true });
      const escaped: unknown[] = [];
      const onError = (e: ErrorEvent) => {
        escaped.push(e.error);
        e.preventDefault();
      };
      window.addEventListener('error', onError);
      const warn = console.warn;
      const warned: unknown[][] = [];
      console.warn = (...args: unknown[]) => warned.push(args);
      try {
        const el = mount();
        el.lesson = fixture;
        button(el, 'Read to me').click();
        button(el, 'Read to me').click();
      } finally {
        console.warn = warn;
        window.removeEventListener('error', onError);
      }
      expect(escaped).to.deep.equal([]);
      expect(speech.spoken).to.have.length(2);
      expect(warned.length).to.be.greaterThan(0);
    });

    it('is hidden where speechSynthesis does not exist', () => {
      stubSpeech({ absent: true });
      const el = mount();
      el.lesson = fixture;
      const b = part(el, 'read-to-me');
      expect(b === null || getComputedStyle(b).display === 'none').to.equal(true);
      expect(heading(el)).to.equal('Meet the signs');
    });

    it('falls back to English when the page language is not a valid tag', () => {
      const speech = stubSpeech();
      const el = mount({ lang: 'not a tag!!' });
      el.lesson = fixture;
      expect(heading(el)).to.equal('Meet the signs');
      button(el, 'Next').click();
      expect(parts(el, 'caption').map((c) => c.textContent)).to.deep.equal(['4 tens and 3 ones', '5 tens and 2 ones']);
      button(el, 'Read to me').click();
      expect(speech.spoken[0]!.lang).to.equal('en');
    });
  });

  it('moves steps with opacity and transform only, and not at all under reduced motion', async () => {
    const el = mount();
    el.lesson = fixture;
    button(el, 'Next').click();
    const step = () => root(el).querySelector('.step') as HTMLElement;
    expect(getComputedStyle(step()).transitionDuration).to.not.equal('0s');
    expect(getComputedStyle(step()).transitionProperty).to.equal('opacity, transform');
    await emulateMedia({ reducedMotion: 'reduce' });
    try {
      button(el, 'Next').click();
      expect(getComputedStyle(step()).transitionDuration).to.equal('0s');
    } finally {
      await emulateMedia({ reducedMotion: 'no-preference' });
    }
  });

  it('fits 320 px, even with a 30-character word', async () => {
    const l = copy();
    l.idea.text = `${'W'.repeat(30)} is a very long word.`;
    const el = mount({ width: 320 });
    el.lesson = l;
    const panel = part(el, 'panel')!;
    expect(panel.scrollWidth).to.be.at.most(panel.clientWidth);
    for (let i = 0; i < l.example.steps.length; i++) {
      button(el, 'Next').click();
      await frames();
      expect(panel.scrollWidth, `step ${i + 1}`).to.be.at.most(panel.clientWidth);
    }
  });

  it('a lesson in an unknown format sends lesson-error and says Help is not ready', () => {
    const errors = listen('lesson-error');
    const el = mount();
    el.lesson = { ...copy(), formatVersion: 2 } as unknown as Lesson;
    expect(errors).to.deep.equal([{ reason: 'unsupported-version' }]);
    expect(part(el, 'panel')?.textContent).to.include("Help isn't ready for this one yet.");
    expect(labels(el)).to.not.include('Next');
  });

  it('a lesson of the wrong shape sends lesson-error invalid', () => {
    const errors = listen('lesson-error');
    const el = mount();
    el.lesson = { ...copy(), extra: true } as unknown as Lesson;
    expect(errors).to.deep.equal([{ reason: 'invalid' }]);
    expect(part(el, 'panel')?.textContent).to.include("Help isn't ready for this one yet.");
  });

  describe('pictures', () => {
    it('base-ten: one sharp canvas per number, each with its caption', async () => {
      // Headless Chromium runs at 1; a Chromebook-like 2 shows the scaling is applied.
      override('devicePixelRatio', () => 2);
      expect(devicePixelRatio).to.equal(2);
      const el = mount();
      el.lesson = fixture;
      button(el, 'Next').click();
      const canvases = Array.from(part(el, 'picture')!.querySelectorAll('canvas'));
      expect(canvases).to.have.length(2);
      expect(parts(el, 'caption').map((c) => c.textContent)).to.deep.equal(['4 tens and 3 ones', '5 tens and 2 ones']);
      await frames();
      for (const c of canvases) {
        const box = boxOf(c);
        expect(box.width).to.be.greaterThan(0);
        expect(box.height).to.equal(140);
        expect(c.width).to.equal(Math.round(box.width * 2));
        expect(c.height).to.equal(280);
        expect(painted(c)).to.be.greaterThan(0);
      }
    });

    it('redraws a canvas to its new width when its box changes size', async () => {
      const el = mount({ width: 600 });
      el.lesson = fixture;
      button(el, 'Next').click();
      await frames();
      const c = part(el, 'picture')!.querySelector('canvas')!;
      const wide = c.width;
      el.parentElement!.style.width = '320px';
      await frames();
      expect(c.width).to.be.lessThan(wide);
      expect(c.width).to.equal(Math.round(boxOf(c).width * devicePixelRatio));
    });

    it('works outside the element, and stops watching its canvases once removed', async () => {
      // Only this picture's observers count: earlier tests' removed canvases settle too.
      const mine = new Set<ResizeObserver>();
      let disconnects = 0;
      const { observe, disconnect } = ResizeObserver.prototype;
      ResizeObserver.prototype.observe = function (this: ResizeObserver, ...args) {
        mine.add(this);
        observe.apply(this, args);
      };
      ResizeObserver.prototype.disconnect = function (this: ResizeObserver) {
        if (mine.has(this)) disconnects++;
        disconnect.call(this);
      };
      cleanups.push(() => Object.assign(ResizeObserver.prototype, { observe, disconnect }));
      const pic = renderPicture({ kind: 'base10', numbers: [34, 99] }, createMessages({ lang: 'en' }), 'en');
      ResizeObserver.prototype.observe = observe;
      expect(mine.size).to.equal(2);
      document.body.append(pic);
      cleanups.push(() => pic.remove());
      await frames();
      const c = pic.querySelector('canvas')!;
      expect(boxOf(c).height).to.equal(140);
      expect(painted(c)).to.be.greaterThan(0);
      expect(disconnects).to.equal(0);
      pic.remove();
      await frames();
      expect(disconnects).to.equal(2);
    });

    it('number lines are SVG, columns a grid of spans, arrays a canvas', async () => {
      const l = copy();
      const pics: LessonPicture[] = [
        { kind: 'numberLine', from: 0, to: 20, marks: [7], jumps: [{ from: 7, to: 12 }] },
        { kind: 'columns', op: '+', numbers: [345, 1278], carry: '11', result: '1623', focus: 'tens' },
        { kind: 'array', rows: 3, cols: 4 },
      ];
      pics.forEach((p, i) => (l.example.steps[i]!.picture = p));
      const el = mount();
      el.lesson = l;

      button(el, 'Next').click();
      const svg = part(el, 'picture')!.querySelector('svg')!;
      expect(svg.namespaceURI).to.equal('http://www.w3.org/2000/svg');
      const texts = Array.from(svg.querySelectorAll('text')).map((t) => t.textContent);
      expect(texts).to.include('0').and.include('20').and.include('+5');
      expect(svg.querySelectorAll('circle')).to.have.length(1);

      button(el, 'Next').click();
      const grid = part(el, 'picture')!.querySelector('.cols') as HTMLElement;
      expect(getComputedStyle(grid).display).to.match(/grid/);
      const cells = Array.from(grid.querySelectorAll('span'));
      expect(cells.every((c) => c.children.length === 0)).to.equal(true);
      expect(cells.map((c) => c.textContent).filter(Boolean)).to.deep.equal(
        ['1', '1', '3', '4', '5', '+', '1', '2', '7', '8', '1', '6', '2', '3'],
      );
      expect(cells.filter((c) => c.classList.contains('on')).map((c) => c.textContent)).to.deep.equal(['1', '4', '7', '2']);

      button(el, 'Next').click();
      const arr = Array.from(part(el, 'picture')!.querySelectorAll('canvas'));
      expect(arr).to.have.length(1);
      await frames();
      expect(painted(arr[0]!)).to.be.greaterThan(0);
    });
  });

  it('loads no questions and defines no question element', () => {
    let calls = 0;
    const el = mount();
    el.getQuestions = () => {
      calls++;
      return Promise.resolve([]);
    };
    el.lesson = fixture;
    for (let i = 0; i < fixture.example.steps.length; i++) button(el, 'Next').click();
    button(el, 'Back to the game').click();
    expect(calls).to.equal(0);
    expect(customElements.get('chocabloc-question')).to.equal(undefined);
  });

  it('every button is at least 44 px tall, and feedback is a polite live region', () => {
    stubSpeech();
    const el = mount({ width: 320 });
    el.lesson = fixture;
    expect(part(el, 'feedback')?.getAttribute('aria-live')).to.equal('polite');
    for (let i = 0; i <= fixture.example.steps.length; i++) {
      for (const b of buttons(el)) {
        expect(b.getBoundingClientRect().height, (b.textContent ?? '').trim()).to.be.at.least(44);
      }
      if (i < fixture.example.steps.length) button(el, 'Next').click();
    }
  });

  it('works again after being removed and added back', () => {
    const el = mount();
    el.lesson = fixture;
    button(el, 'Next').click();
    const holder = el.parentElement!;
    el.remove();
    holder.appendChild(el);
    expect(heading(el)).to.equal('Meet the signs');
    button(el, 'Next').click();
    expect(heading(el)).to.equal(fixture.example.steps[0]!.heading);
  });
});
