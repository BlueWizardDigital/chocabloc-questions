import { expect } from '@esm-bundle/chai';
import { ChocaLesson } from '../../src/lesson/index';
import { youngChunk } from '../../src/lesson/dom/ChocaLesson';
import type { Lesson } from '../../src/lesson/index';

// wtr starts Chromium with --expose-gc and --enable-precise-memory-info (web-test-runner.config.mjs).
const CYCLES = 20;
const WARM_UP = 3;
const LONG_RUN = 100;
// Measured in headless Chromium: 51 KB (every run) when nothing leaks, 234 KB when every removed element is kept.
const MAX_GROWTH_KB = 120;

let fixture: Lesson;
const cleanups: (() => void)[] = [];

before(async () => {
  const res = await fetch(new URL('../fixtures/lesson-compare-100.json', import.meta.url));
  fixture = (await res.json()) as Lesson;
});

afterEach(() => {
  cleanups.splice(0).reverse().forEach((fn) => fn());
});

type Add = EventTarget['addEventListener'];
type Remove = EventTarget['removeEventListener'];

/**
 * Records every listener added to `inScope` nodes, and every one removed from a
 * node that was ever in scope, keyed by target, type and listener. Restored after the test.
 */
function watchListeners(inScope: (t: EventTarget) => boolean): { open(): string[]; adds: number } {
  const proto = EventTarget.prototype;
  const { addEventListener: add, removeEventListener: remove } = proto;
  const targets = new Map<EventTarget, Map<string, number>>();
  const result = { adds: 0, open: (): string[] => [] as string[] };
  const key = (type: string, fn: unknown): string => `${type}:${String(fn)}`;
  const ids = new WeakMap<object, number>();
  let next = 0;
  const idOf = (fn: unknown): string => {
    if (fn == null || (typeof fn !== 'object' && typeof fn !== 'function')) return String(fn);
    if (!ids.has(fn as object)) ids.set(fn as object, next++);
    return `#${ids.get(fn as object)}`;
  };
  proto.addEventListener = function (this: EventTarget, type: string, fn: never, opts?: never): void {
    if (inScope(this) || targets.has(this)) {
      const m = targets.get(this) ?? new Map<string, number>();
      const k = key(type, idOf(fn));
      if (!m.has(k)) result.adds++;
      m.set(k, 1);
      targets.set(this, m);
    }
    (add as Add).call(this, type, fn, opts);
  } as Add;
  proto.removeEventListener = function (this: EventTarget, type: string, fn: never, opts?: never): void {
    const m = targets.get(this);
    if (m) m.delete(key(type, idOf(fn)));
    (remove as Remove).call(this, type, fn, opts);
  } as Remove;
  cleanups.push(() => {
    proto.addEventListener = add;
    proto.removeEventListener = remove;
  });
  result.open = () => [...targets].flatMap(([t, m]) => [...m.keys()].map((k) => `${(t as Node).nodeName}:${k}`));
  return result;
}

/** Replaces window.speechSynthesis and counts its cancel() calls. */
function stubSpeech(): { cancels: number; speaks: number } {
  const stub = { cancels: 0, speaks: 0 };
  const synth = {
    speak() {
      stub.speaks++;
    },
    cancel() {
      stub.cancels++;
    },
  };
  const own = Object.getOwnPropertyDescriptor(window, 'speechSynthesis');
  Object.defineProperty(window, 'speechSynthesis', { configurable: true, get: () => synth });
  cleanups.push(() => {
    if (own) Object.defineProperty(window, 'speechSynthesis', own);
    else Reflect.deleteProperty(window, 'speechSynthesis');
  });
  return stub;
}

/** Mounts, sets the lesson, taps Read to me and removes the element. Returns the element and how many cancels the removal alone made. */
function cycle(speech?: { cancels: number }): { el: ChocaLesson; cancelsOnRemove: number } {
  const el = document.createElement('chocabloc-lesson') as ChocaLesson;
  document.body.appendChild(el);
  el.lesson = fixture;
  const read = el.shadowRoot!.querySelector<HTMLButtonElement>('[part~="read-to-me"]');
  if (!read) throw new Error('no Read to me button');
  read.click();
  // Next onto the first worked-example step, which draws a base10 picture on a canvas.
  const next = el.shadowRoot!.querySelector<HTMLButtonElement>('[part~="actions"] [part~="button"]:not([part~="read-to-me"]):not([part~="tap-to-hear"])');
  if (!next) throw new Error('no Next button');
  next.click();
  if (!el.shadowRoot!.querySelector('canvas')) throw new Error('the step drew no canvas');
  const before = speech?.cancels ?? 0;
  el.remove();
  return { el, cancelsOnRemove: (speech?.cancels ?? 0) - before };
}

/** Counts ResizeObservers created and not yet disconnected. Restored after the test. */
function watchObservers(): { live(): number; made: number } {
  const Real = window.ResizeObserver;
  const open = new Set<object>();
  const out = { made: 0, live: () => open.size };
  class Spy extends Real {
    constructor(cb: ResizeObserverCallback) {
      super(cb);
      out.made++;
      open.add(this);
    }
    disconnect(): void {
      open.delete(this);
      super.disconnect();
    }
  }
  window.ResizeObserver = Spy;
  cleanups.push(() => {
    window.ResizeObserver = Real;
  });
  return out;
}

const frame = (): Promise<void> => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));

const gc = (): Promise<void> => {
  (window as unknown as { gc(): void }).gc();
  return new Promise((r) => setTimeout(r, 0));
};
const heap = (): number => (performance as unknown as { memory: { usedJSHeapSize: number } }).memory.usedJSHeapSize;

describe('<chocabloc-lesson> leaves nothing behind', () => {
  it('has gc() and heap numbers to test with', () => {
    expect(typeof (window as unknown as { gc?: unknown }).gc).to.equal('function');
    expect(heap()).to.be.greaterThan(0);
  });

  it('every listener it adds is removed, and speech is cancelled on each removal', () => {
    const speech = stubSpeech();
    const mine = (t: EventTarget): boolean => {
      const shadow = t instanceof ShadowRoot ? t : t instanceof Node ? t.getRootNode() : null;
      return t instanceof ChocaLesson || (shadow instanceof ShadowRoot && shadow.host instanceof ChocaLesson);
    };
    const watch = watchListeners(mine);
    for (let i = 0; i < CYCLES; i++) {
      // Speak and every screen cancel too, so only the count across remove() proves removal cancels.
      const { cancelsOnRemove } = cycle(speech);
      expect(cancelsOnRemove, `removal in cycle ${i + 1} cancelled speech`).to.be.greaterThan(0);
    }
    expect(watch.adds, 'the spy saw the element add listeners').to.be.greaterThan(0);
    expect(watch.open(), 'listeners added and never removed').to.deep.equal([]);
    expect(speech.speaks).to.equal(CYCLES);
  });

  it('every picture canvas observer is disconnected when its screen is removed before it draws', async () => {
    stubSpeech();
    const obs = watchObservers();
    for (let i = 0; i < CYCLES; i++) cycle();
    await frame();
    expect(obs.made, 'the cycles made picture observers').to.be.greaterThan(0);
    expect(obs.live(), 'observers still connected').to.equal(0);
  });

  it(`${LONG_RUN} mount, read and remove cycles grow the heap by under ${MAX_GROWTH_KB} KB`, async function () {
    this.timeout(30000);
    stubSpeech();
    for (let i = 0; i < WARM_UP; i++) cycle();
    await gc();
    await gc();
    const first = heap();
    for (let i = 0; i < LONG_RUN; i++) cycle();
    // Each young-look mount (this lesson is young by skillGrade) has a chunk import in flight. Awaiting
    // the same import, queued after all of them, lets those finish; then the heap shows what is kept.
    await youngChunk.load();
    await new Promise((r) => setTimeout(r, 0));
    await gc();
    await gc();
    const grownKb = Math.round((heap() - first) / 1024);
    // Numbers, not nodes: a failed equal on DOM nodes stalls the runner.
    expect(grownKb, `heap grew ${grownKb} KB over ${LONG_RUN} cycles`).to.be.below(MAX_GROWTH_KB);
  });
});
