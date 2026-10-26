import { expect } from '@esm-bundle/chai';
import { emulateMedia } from '@web/test-runner-commands';
import '../../src/lesson/index';
import type { ChocaLesson, Lesson } from '../../src/lesson/index';
import { picturesChunk } from '../../src/lesson/dom/ChocaLesson';
import { button, captureConsole, cleanup, firstArgs, heading, mount, part, parts, root, tick, until } from './lesson-test-utils';

let fixture: Lesson;
const realLoad = picturesChunk.load;

before(async () => {
  const res = await fetch(new URL('../fixtures/lesson-compare-100.json', import.meta.url));
  fixture = (await res.json()) as Lesson;
  // The chunk is in the module cache from here on, so a mounted element gets it in a tick.
  await realLoad();
});

afterEach(() => {
  picturesChunk.load = realLoad;
  cleanup();
});

type Pic = Record<string, unknown>;

/** A lesson whose example has 6 steps: one per picture, then plain steps; the last has the result. */
function lessonOf(pictures: Pic[]): Lesson {
  const steps: Record<string, unknown>[] = pictures.map((picture, i) => ({ heading: `Step ${i + 1}`, text: `Text ${i + 1}.`, picture }));
  while (steps.length < 5) steps.push({ heading: `Step ${steps.length + 1}`, text: 'More.' });
  steps.push({ heading: 'Done', text: 'All done.', result: '4 × 3 = 12' });
  return { ...fixture, skillGrade: '4', example: { ...fixture.example, steps } } as Lesson;
}

/** 4 × 3, one row counted per step: counted 0 to 4 on steps 1 to 5. */
let counting: Lesson;
/** 59 ÷ 4: shown 0, 1 and 2 on steps 1 to 3, then the leftovers on step 4. */
let sharing: Lesson;

before(() => {
  counting = lessonOf([0, 1, 2, 3, 4].map((counted) => ({ kind: 'array', rows: 4, cols: 3, counted })));
  sharing = lessonOf([
    { kind: 'share', total: 59, rows: 4, shown: 0 },
    { kind: 'share', total: 59, rows: 4, shown: 1 },
    { kind: 'share', total: 59, rows: 4, shown: 2 },
    { kind: 'share', total: 59, rows: 4, shown: 2, left: true },
  ]);
});

/** Help on worked step `at` (1 is the first), with the pictures chunk loaded first. */
async function open(lesson: Lesson, at = 1, width?: number): Promise<ChocaLesson> {
  const el = mount();
  if (width != null) {
    el.style.display = 'block';
    el.style.width = `${width}px`;
  }
  el.grade = '5';
  el.mode = 'help';
  el.lesson = lesson;
  // The chunk adds its stylesheet when it arrives.
  await until(() => root(el).querySelectorAll('style').length === 2, 'the pictures chunk');
  for (let i = 0; i < at; i++) button(el, 'Next').click();
  return el;
}

const frame = (): Promise<void> => new Promise((r) => requestAnimationFrame(() => r()));
const picture = (el: ChocaLesson): HTMLElement => parts(el, 'picture')[0]!;
const rows = (el: ChocaLesson): HTMLElement[] => parts(el, 'row');
const texts = (els: Element[]): string[] => els.map((e) => (e.textContent ?? '').trim());
const has = (els: Element[], cls: string): boolean[] => els.map((e) => e.classList.contains(cls));
const count = (node: ParentNode, sel: string): number => node.querySelectorAll(sel).length;
const lines = (el: ChocaLesson): HTMLElement[] => Array.from(root(el).querySelectorAll<HTMLElement>('[part~="long-division"] .ld-line'));

describe('<chocabloc-lesson> counted rows of dots', () => {
  it('counted 0: 4 rows of 3 dots, nothing circled or faded, labels and totals empty', async () => {
    const el = await open(counting, 1);
    expect(rows(el)).to.have.length(4);
    expect(rows(el).map((r) => count(r, '.dot'))).to.deep.equal([3, 3, 3, 3]);
    expect(has(rows(el), 'on')).to.deep.equal([false, false, false, false]);
    expect(has(rows(el), 'faded')).to.deep.equal([false, false, false, false]);
    expect(texts(parts(el, 'row-label'))).to.deep.equal(['', '', '', '']);
    expect(texts(parts(el, 'row-total'))).to.deep.equal(['', '', '', '']);
    expect(picture(el).firstElementChild!.getAttribute('aria-hidden')).to.equal('true');
  });

  it('counted 2: rows 1 and 2 circled, row 2 the newest, rows 3 and 4 faded, labels and running totals', async () => {
    const el = await open(counting, 3);
    expect(has(rows(el), 'on')).to.deep.equal([true, true, false, false]);
    expect(has(rows(el), 'now')).to.deep.equal([false, true, false, false]);
    expect(has(rows(el), 'faded')).to.deep.equal([false, false, true, true]);
    expect(texts(parts(el, 'row-label'))).to.deep.equal(['1 row', '2 rows', '', '']);
    expect(texts(parts(el, 'row-total'))).to.deep.equal(['3', '6', '', '']);
  });

  it('counted 4 of 4: every row circled, none faded', async () => {
    const el = await open(counting, 5);
    expect(has(rows(el), 'on')).to.deep.equal([true, true, true, true]);
    expect(has(rows(el), 'now')).to.deep.equal([false, false, false, true]);
    expect(has(rows(el), 'faded')).to.deep.equal([false, false, false, false]);
    expect(texts(parts(el, 'row-total'))).to.deep.equal(['3', '6', '9', '12']);
  });

  it('an array with no counted still draws on the canvas, and needs no chunk', async () => {
    let asked = 0;
    picturesChunk.load = () => {
      asked++;
      return realLoad();
    };
    const el = mount();
    el.grade = '5';
    el.mode = 'help';
    el.lesson = lessonOf([{ kind: 'array', rows: 4, cols: 3 }]);
    await tick();
    button(el, 'Next').click();
    expect(picture(el).querySelector('canvas') !== null).to.equal(true);
    expect(count(picture(el), '.dot')).to.equal(0);
    expect(asked).to.equal(0);
  });
});

describe('<chocabloc-lesson> share pictures', () => {
  const dotsOf = (row: HTMLElement) => ({
    p0: count(row, '.dot.p0'),
    p1: count(row, '.dot.p1'),
    left: count(row, '.dot.left'),
    spot: count(row, '.dot.spot'),
  });

  it('shown 0: every row is 14 dashed spots, and the long division is bare', async () => {
    const el = await open(sharing, 1);
    expect(rows(el).map(dotsOf)).to.deep.equal(Array(4).fill({ p0: 0, p1: 0, left: 0, spot: 14 }));
    expect(lines(el)).to.have.length(2);
    expect(texts(lines(el))[1]!.replace(/\s/g, '')).to.equal('459');
    expect(picture(el).firstElementChild!.getAttribute('aria-hidden')).to.equal('true');
  });

  it('59 ÷ 4 shown 1: 10 dots and 4 spots a row, five lines, with their notes', async () => {
    const el = await open(sharing, 2);
    expect(rows(el)).to.have.length(4);
    expect(rows(el).map(dotsOf)).to.deep.equal(Array(4).fill({ p0: 10, p1: 0, left: 0, spot: 4 }));
    expect(lines(el)).to.have.length(5);
    expect(texts(Array.from(root(el).querySelectorAll('.ld-note')))).to.deep.equal(['4 tens = 40', '19 left']);
  });

  it('59 ÷ 4 shown 2: 10 and 4 more a row, the ones product note, no R yet', async () => {
    const el = await open(sharing, 3);
    expect(rows(el).map(dotsOf)).to.deep.equal(Array(4).fill({ p0: 10, p1: 4, left: 0, spot: 0 }));
    expect(lines(el)).to.have.length(8);
    expect(texts(Array.from(root(el).querySelectorAll('.ld-note')))).to.deep.equal(['4 tens = 40', '19 left', '4 × 4']);
    expect(lines(el)[0]!.textContent).to.not.include('R');
  });

  it('59 ÷ 4 with left: 3 leftovers, one dashed spot, the part labels, and R3', async () => {
    const el = await open(sharing, 4);
    expect(rows(el).map((r) => [count(r, '.dot.p0'), count(r, '.dot.p1')])).to.deep.equal(Array(4).fill([10, 4]));
    expect(count(picture(el), '.dot.left')).to.equal(3);
    const spots = Array.from(picture(el).querySelectorAll('.dot.spot'));
    expect(spots).to.have.length(1);
    expect(getComputedStyle(spots[0]!).borderTopStyle).to.equal('dashed');
    // The spot is in the last row: rows 1 to 3 get a leftover, row 4 misses out.
    expect(rows(el)[3]!.contains(spots[0]!)).to.equal(true);
    expect(texts(Array.from(root(el).querySelectorAll('.slab')))).to.deep.equal(['10 each', '4 more', '3 left']);
    expect(lines(el)[0]!.textContent).to.include('R3');
  });

  it('47 ÷ 6 with left: 6 rows of 7, and 5 leftovers', async () => {
    const el = await open(lessonOf([{ kind: 'share', total: 47, rows: 6, shown: 1, left: true }]), 1);
    expect(rows(el).map(dotsOf)).to.deep.equal([
      ...Array(5).fill({ p0: 7, p1: 0, left: 1, spot: 0 }),
      { p0: 7, p1: 0, left: 0, spot: 1 },
    ]);
    expect(texts(Array.from(root(el).querySelectorAll('.slab')))).to.deep.equal(['7 each', '5 left']);
  });

  it('57 ÷ 3 with nothing left: the long division ends at 0, and no leftovers', async () => {
    const el = await open(lessonOf([{ kind: 'share', total: 57, rows: 3, shown: 2 }]), 1);
    const all = lines(el);
    expect(all[all.length - 1]!.textContent!.trim()).to.equal('0');
    expect(count(picture(el), '.dot.left')).to.equal(0);
    expect(root(el).querySelector('[part~="long-division"]')!.textContent).to.not.include('R');
  });

  it('colours each line like its dots, and only cells that hold text', async () => {
    const el = await open(sharing, 4);
    const [quotient, , product1, , , product2, , last] = lines(el);
    const tone = (cell: Element): string => (cell.className.match(/\bt[01l]\b/) ?? [''])[0];
    expect(Array.from(quotient!.children).map(tone)).to.deep.equal(['', 't0', 't1', 'tl']);
    expect(Array.from(product1!.children).slice(0, 4).map(tone)).to.deep.equal(['t0', 't0', '', '']);
    expect(Array.from(product2!.children).slice(0, 4).map(tone)).to.deep.equal(['t1', 't1', 't1', '']);
    expect(Array.from(last!.children).slice(0, 4).map(tone)).to.deep.equal(['', '', 'tl', '']);
  });
});

describe('<chocabloc-lesson> pictures chunk loading', () => {
  it('a box drawn before the chunk lands holds its height, then fills; the chunk is asked for once', async () => {
    let asked = 0;
    picturesChunk.load = () => {
      asked++;
      return new Promise((r) => setTimeout(() => r(realLoad()), 200));
    };
    const el = mount();
    el.style.display = 'block';
    el.style.width = '700px';
    el.grade = '5';
    el.mode = 'help';
    el.lesson = sharing;
    button(el, 'Next').click();
    button(el, 'Next').click();
    const box = picture(el);
    expect(count(box, '.dot')).to.equal(0);
    expect(box.style.minHeight).to.not.equal('');
    const held = box.getBoundingClientRect().height;
    expect(held).to.be.greaterThan(0);
    await until(() => count(box, '.dot') > 0, 'the dots', 3000);
    expect(box.style.minHeight).to.equal('');
    await frame();
    // Wide enough for the dots and the long division side by side: no jump.
    expect(Math.abs(box.getBoundingClientRect().height - held)).to.be.below(2);
    button(el, 'Next').click();
    expect(count(picture(el), '.dot.p1')).to.equal(16);
    expect(asked).to.equal(1);
  });

  it('a counted array drawn before the chunk lands holds the same height it ends with', async () => {
    let arrive!: (m: Awaited<ReturnType<typeof realLoad>>) => void;
    picturesChunk.load = () => new Promise((r) => (arrive = r));
    const el = mount();
    el.style.display = 'block';
    el.style.width = '700px';
    el.grade = '5';
    el.mode = 'help';
    el.lesson = counting;
    button(el, 'Next').click();
    const box = picture(el);
    const held = box.getBoundingClientRect().height;
    expect(held).to.be.greaterThan(80);
    arrive(await realLoad());
    await tick();
    expect(rows(el)).to.have.length(4);
    expect(Math.abs(box.getBoundingClientRect().height - held)).to.be.below(2);
  });

  it('with the chunk failing, the step keeps its heading and text, has no picture, and Next works', async () => {
    const log = captureConsole();
    picturesChunk.load = () => Promise.reject(new Error('offline'));
    const el = mount();
    el.grade = '5';
    el.mode = 'help';
    el.lesson = sharing;
    await tick();
    button(el, 'Next').click();
    expect(heading(el)).to.equal('Step 1');
    expect(part(el, 'text')!.textContent).to.equal('Text 1.');
    expect(picture(el).childElementCount).to.equal(0);
    button(el, 'Next').click();
    expect(heading(el)).to.equal('Step 2');
    expect(picture(el).childElementCount).to.equal(0);
    expect(firstArgs(log.warn).filter((w) => w.includes('picture code'))).to.have.length(1);
  });

  it('a chunk that fails after the step was drawn lets the held height go', async () => {
    captureConsole();
    let fail!: (e: Error) => void;
    picturesChunk.load = () => new Promise((_, rej) => (fail = rej));
    const el = mount();
    el.grade = '5';
    el.mode = 'help';
    el.lesson = counting;
    button(el, 'Next').click();
    const box = picture(el);
    expect(box.style.minHeight).to.not.equal('');
    fail(new Error('offline'));
    await tick();
    expect(box.style.minHeight).to.equal('');
    expect(box.childElementCount).to.equal(0);
  });

  it('asks for the chunk only for a share or a counted array', async () => {
    let asked = 0;
    picturesChunk.load = () => {
      asked++;
      return realLoad();
    };
    for (const [lesson, want] of [
      [fixture, 0],
      [lessonOf([{ kind: 'array', rows: 2, cols: 3 }]), 0],
      [lessonOf([{ kind: 'share', total: 59, rows: 4, shown: 0 }]), 1],
      [lessonOf([{ kind: 'array', rows: 2, cols: 3, counted: 0 }]), 2],
    ] as const) {
      const el = mount();
      el.grade = '5';
      el.mode = 'help';
      el.lesson = lesson;
      await tick();
      expect(asked).to.equal(want);
    }
  });
});

describe('<chocabloc-lesson> pictures motion and fit', () => {
  it('Back then Next: row 2 is the newest again, and only one thing pops', async () => {
    const el = await open(counting, 3);
    button(el, 'Back').click();
    expect(has(rows(el), 'now')).to.deep.equal([true, false, false, false]);
    button(el, 'Next').click();
    expect(has(rows(el), 'now')).to.deep.equal([false, true, false, false]);
    const pops = Array.from(root(el).querySelectorAll('.pop'));
    expect(pops).to.have.length(1);
    expect(pops[0]!.contains(rows(el)[1]!)).to.equal(true);
    expect(texts(Array.from(pops[0]!.querySelectorAll('[part~="row-label"], [part~="row-total"]')))).to.deep.equal(['2 rows', '6']);
  });

  it('a share pops only the newest part: its dots, label and long-division lines', async () => {
    const el = await open(sharing, 3);
    const pops = Array.from(picture(el).querySelectorAll('.pop'));
    expect(pops.reduce((n, p) => n + count(p, '.dot.p1'), 0)).to.equal(16);
    expect(pops.some((p) => count(p, '.dot.p0') > 0)).to.equal(false);
    expect(texts(pops.filter((p) => p.classList.contains('slab')))).to.deep.equal(['4 more']);
    expect(lines(el).map((l) => l.classList.contains('pop'))).to.deep.equal([false, false, false, false, false, true, true, true]);
    expect(texts(Array.from(lines(el)[0]!.querySelectorAll('.pop')))).to.deep.equal(['4']);
  });

  it('pops with opacity and transform in 300 ms or less', async () => {
    const el = await open(counting, 2);
    const pop = root(el).querySelector('.pop')!;
    const css = getComputedStyle(pop);
    expect(css.transitionProperty).to.equal('opacity, transform');
    for (const d of css.transitionDuration.split(',')) expect(parseFloat(d)).to.be.within(0.01, 0.3);
  });

  it('nothing moves under reduced motion', async () => {
    await emulateMedia({ reducedMotion: 'reduce' });
    try {
      for (const [lesson, at] of [[counting, 3], [sharing, 3]] as const) {
        const el = await open(lesson, at);
        const all = [picture(el), ...Array.from(picture(el).querySelectorAll('*'))];
        for (const node of all) {
          const css = getComputedStyle(node);
          expect(css.animationName).to.equal('none');
          for (const d of css.transitionDuration.split(',')) expect(parseFloat(d)).to.equal(0);
        }
      }
    } finally {
      await emulateMedia({ reducedMotion: 'no-preference' });
    }
  });

  const fits = async (pic: Pic): Promise<ChocaLesson> => {
    const el = await open(lessonOf([pic]), 1, 320);
    await frame();
    await frame();
    expect(el.scrollWidth).to.be.at.most(el.clientWidth);
    const panel = part(el, 'panel')!;
    expect(panel.scrollWidth).to.be.at.most(panel.clientWidth);
    expect(picture(el).scrollWidth).to.be.at.most(picture(el).clientWidth);
    return el;
  };

  for (const pic of [
    { kind: 'share', total: 95, rows: 5, shown: 2 },
    { kind: 'share', total: 99, rows: 5, shown: 2, left: true },
  ]) {
    it(`fits 320 px with ${JSON.stringify(pic)}: the long division wraps below the dots`, async () => {
      const el = await fits(pic);
      const dots = Array.from(picture(el).querySelectorAll('.dot')).map((d) => d.getBoundingClientRect().bottom);
      const ld = root(el).querySelector('[part~="long-division"]')!.getBoundingClientRect();
      expect(ld.top).to.be.at.least(Math.max(...dots));
      expect(ld.width).to.be.greaterThan(0);
    });
  }

  it('fits 320 px with a counted 3 x 15 array, every dot still round', async () => {
    const el = await fits({ kind: 'array', rows: 3, cols: 15, counted: 2 });
    for (const d of Array.from(picture(el).querySelectorAll('.dot'))) {
      const r = d.getBoundingClientRect();
      expect(r.width).to.be.greaterThan(4);
      expect(Math.abs(r.width - r.height)).to.be.below(0.5);
    }
  });
});
