import { expect } from '@esm-bundle/chai';
import '../../src/lesson/index';
import type { ChocaLesson, Lesson } from '../../src/lesson/index';
import { pickAnimals } from '../../src/lesson/animals';
import { picturesChunk, youngChunk } from '../../src/lesson/dom/ChocaLesson';
import { renderPicture } from '../../src/lesson/dom/pictures';
import type { PictureLook } from '../../src/lesson/dom/pictures';
import { pictureFromQuestion } from '../../src/lesson/from-question';
import { createMessages, lessonMessagesEn } from '../../src/lesson/messages';
import type { NormalizedQuestion } from '../../src/types';
import { button, cleanup, heading, mount, part, parts, root, until } from './lesson-test-utils';


let fixture: Lesson;
const BASE = new URL('../fixtures/animals/', import.meta.url).pathname;
const msg = createMessages({ lang: 'en' });
const realLoad = youngChunk.load;

before(async () => {
  const res = await fetch(new URL('../fixtures/lesson-compare-100.json', import.meta.url));
  fixture = (await res.json()) as Lesson;
  // The chunk is in the module cache from here on, so a mounted element gets it in a tick.
  (await realLoad()).register(lessonMessagesEn);
});

afterEach(() => {
  youngChunk.load = realLoad;
  cleanup();
});

const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

const lessonWith = (step: Record<string, unknown>, skillGrade = '2'): Lesson =>
  ({
    ...fixture,
    skillGrade,
    example: { ...fixture.example, steps: [step, ...fixture.example.steps.slice(1)] },
  }) as Lesson;

const counting = (skillGrade?: string): Lesson =>
  lessonWith(
    {
      heading: 'Count them',
      text: 'Count the animals in the picture.',
      picture: { kind: 'count', groups: [3, 2] },
      young: '{a} 3. {b} 2.',
    },
    skillGrade,
  );

/** Opens Help on the first worked step. */
async function open(lesson: Lesson, grade: string | null | undefined, base: string | null = BASE, chunk = true): Promise<ChocaLesson> {
  const el = mount();
  el.grade = grade as string | null;
  el.pictureBase = base;
  el.mode = 'help';
  el.lesson = lesson;
  // The chunk adds its stylesheet when it arrives.
  if (chunk) await until(() => root(el).querySelectorAll('style').length === 2, 'the young chunk');
  button(el, 'Next').click();
  return el;
}

const imgs = (el: ChocaLesson): HTMLImageElement[] => Array.from(root(el).querySelectorAll('[part~="picture"] img'));
const cells = (el: ChocaLesson): HTMLElement[] => Array.from(root(el).querySelectorAll('[part~="picture"] .cell'));
const frame = (): Promise<void> => new Promise((r) => requestAnimationFrame(() => r()));

describe('<chocabloc-lesson> young look', () => {
  const [cat, dog] = pickAnimals('COMPARE-NUMBERS-WITHIN-100', 2);

  it('grade K draws animal images and shows the young text in place of heading and text', async () => {
    const el = await open(counting(), 'K');
    expect(imgs(el).map((i) => i.getAttribute('src'))).to.deep.equal([
      ...Array(3).fill(`${BASE}${cat}.webp`),
      ...Array(2).fill(`${BASE}${dog}.webp`),
    ]);
    expect(imgs(el).every((i) => i.alt === '')).to.equal(true);
    expect(heading(el)).to.equal(`${msg(`animals.${cat}`, { count: 3 })} 3. ${msg(`animals.${dog}`, { count: 2 })} 2.`);
    expect(part(el, 'text')!.hidden).to.equal(true);
  });

  it('grade 5 draws ones blocks and the normal words', async () => {
    const el = await open(counting(), '5');
    expect(imgs(el)).to.have.length(0);
    expect(cells(el)).to.have.length(5);
    expect(heading(el)).to.equal('Count them');
    expect(part(el, 'text')!.textContent).to.equal('Count the animals in the picture.');
  });

  it('with no grade, skillGrade decides; an unknown grade falls back to it', async () => {
    expect(imgs(await open(counting('2'), null))).to.have.length(5);
    expect(imgs(await open(counting('5'), null))).to.have.length(0);
    const warn = console.warn;
    console.warn = () => undefined;
    try {
      for (const bad of ['13', 'Grade 3', '']) {
        expect(imgs(await open(counting('K'), bad))).to.have.length(5);
        expect(imgs(await open(counting('6'), bad))).to.have.length(0);
      }
    } finally {
      console.warn = warn;
    }
  });

  it('grades 7 to 12 are standard even on a K skill: never the young look', async () => {
    for (const g of ['7', '12']) {
      const el = await open(counting('K'), g);
      expect(imgs(el)).to.have.length(0);
      expect(heading(el)).to.equal('Count them');
    }
  });

  it('every cell in a picture is drawn at the same size, animals and blocks', async () => {
    for (const grade of ['K', '5']) {
      const el = await open(counting(), grade);
      const sizes = cells(el).map((c) => `${Math.round(c.getBoundingClientRect().width)}x${Math.round(c.getBoundingClientRect().height)}`);
      expect(new Set(sizes).size).to.equal(1);
      expect(sizes[0]).to.not.equal('0x0');
    }
  });

  it('a pictureBase with no trailing slash still joins the file name', async () => {
    const el = await open(counting(), 'K', '/images/animals');
    expect(imgs(el)[0]!.getAttribute('src')).to.equal(`/images/animals/${cat}.webp`);
  });

  it('one failed image turns the whole picture into blocks, with no img left', async () => {
    const el = await open(counting(), 'K');
    imgs(el)[4]!.dispatchEvent(new Event('error'));
    expect(imgs(el)).to.have.length(0);
    expect(cells(el)).to.have.length(5);
  });

  it('a base that 404s ends as blocks too', async () => {
    const el = await open(counting(), 'K', '/no-such-folder/');
    for (let i = 0; i < 60 && imgs(el).length > 0; i++) await new Promise((r) => setTimeout(r, 25));
    expect(imgs(el)).to.have.length(0);
    expect(cells(el)).to.have.length(5);
  });

  it('pictureBase null draws blocks and the words are the normal ones, not the animal line', async () => {
    const el = await open(counting(), 'K', null);
    expect(imgs(el)).to.have.length(0);
    expect(cells(el)).to.have.length(5);
    expect(heading(el)).to.equal('Count them');
    expect(part(el, 'text')!.hidden).to.equal(false);
    expect(part(el, 'text')!.textContent).to.equal('Count the animals in the picture.');
  });

  it('the words swap back at the moment a failed image turns the picture into blocks', async () => {
    const el = await open(counting(), 'K');
    expect(heading(el)).to.not.equal('Count them');
    expect(part(el, 'text')!.hidden).to.equal(true);
    imgs(el)[0]!.dispatchEvent(new Event('error'));
    expect(imgs(el)).to.have.length(0);
    expect(heading(el)).to.equal('Count them');
    expect(part(el, 'text')!.hidden).to.equal(false);
  });

  it('a young array of 5 x 6 draws 30 images; 5 x 7 draws squares on a canvas', async () => {
    const step = (cols: number) => ({ heading: 'Rows', text: 'Rows and columns.', picture: { kind: 'array', rows: 5, cols }, young: '{a} in rows.' });
    const thirty = await open(lessonWith(step(6)), 'K');
    expect(imgs(thirty)).to.have.length(30);
    expect(heading(thirty)).to.match(/s in rows\.$|fish in rows\.$/);
    const over = await open(lessonWith(step(7)), 'K');
    expect(imgs(over)).to.have.length(0);
    expect(root(over).querySelector('[part~="picture"] canvas') !== null).to.equal(true);
    const standard = await open(lessonWith(step(6)), '5', BASE, false);
    expect(imgs(standard)).to.have.length(0);
    expect(root(standard).querySelector('[part~="picture"] canvas') !== null).to.equal(true);
    expect(heading(standard)).to.equal('Rows');
  });

  it('take away keeps the taken ones in place, marked; empty places are dashed', async () => {
    const y = await realLoad();
    const look: PictureLook = { young: false, base: null, skillId: '', y, wait: [] };
    const take = renderPicture({ kind: 'count', groups: [5], takeAway: 2 }, msg, 'en', look);
    expect(take.querySelectorAll('.cell')).to.have.length(5);
    expect(take.querySelectorAll('.cell.taken')).to.have.length(2);
    const fill = renderPicture({ kind: 'count', groups: [3], empty: 2 }, msg, 'en', look);
    expect(fill.querySelectorAll('.cell.empty')).to.have.length(2);
  });

  it('draws the after-wrong picture from the question operands', async () => {
    const q = (operation: string, operands: number[]) => ({ content: { operands, operation } }) as unknown as NormalizedQuestion;
    const spec = { kind: 'count', from: 'operands' } as const;
    const look: PictureLook = { young: false, base: null, skillId: '', y: await realLoad(), wait: [] };
    const add = pictureFromQuestion(spec, q('addition', [3, 2]))!;
    expect(renderPicture(add, msg, 'en', look).querySelectorAll('.cell')).to.have.length(5);
    const sub = pictureFromQuestion(spec, q('subtraction', [5, 2]))!;
    expect(renderPicture(sub, msg, 'en', look).querySelectorAll('.cell.taken')).to.have.length(2);
    expect(pictureFromQuestion(spec, q('addition', [12, 15]))).to.equal(null);
  });

  it('a count drawn before the chunk arrives holds a box of the same height, then fills it', async () => {
    let arrive!: (m: Awaited<ReturnType<typeof realLoad>>) => void;
    youngChunk.load = () => new Promise((r) => (arrive = r));
    for (const pic of [{ kind: 'count', groups: [8, 5] }, { kind: 'count', groups: [12, 3], apart: true }]) {
      const el = mount();
      el.grade = '5';
      el.mode = 'help';
      el.lesson = lessonWith({ heading: 'Count', text: 'Count them.', picture: pic });
      button(el, 'Next').click();
      const box = parts(el, 'picture')[0]!;
      expect(box.querySelectorAll('.cell')).to.have.length(0);
      const before = box.getBoundingClientRect().height;
      expect(before).to.be.greaterThan(80);
      arrive(await realLoad());
      await tick();
      expect(box.querySelectorAll('.cell').length).to.be.greaterThan(0);
      expect(Math.abs(box.getBoundingClientRect().height - before)).to.be.below(2);
    }
  });

  it('with the chunk failing, a count step has no picture and no young text, and nothing throws', async () => {
    const warn = console.warn;
    const warned: unknown[][] = [];
    console.warn = (...a: unknown[]) => void warned.push(a);
    try {
      youngChunk.load = () => Promise.reject(new Error('offline'));
      const el = mount();
      el.grade = 'K';
      el.pictureBase = BASE;
      el.mode = 'help';
      el.lesson = counting();
      await tick();
      button(el, 'Next').click();
      await tick();
      expect(heading(el)).to.equal('Count them');
      expect(part(el, 'text')!.textContent).to.equal('Count the animals in the picture.');
      expect(parts(el, 'picture')[0]!.childElementCount).to.equal(0);
      expect(warned.filter((w) => String(w[0]).includes('young look'))).to.have.length(1);
    } finally {
      console.warn = warn;
    }
  });

  it('asks for the chunk only for a count picture or a young kid', async () => {
    let asked = 0;
    youngChunk.load = () => {
      asked++;
      return realLoad();
    };
    const plain = mount();
    plain.grade = '5';
    plain.mode = 'help';
    plain.lesson = fixture;
    await tick();
    expect(asked).to.equal(0);
    // A young kid on base-ten pictures needs nothing from the chunk.
    const young = mount();
    young.grade = 'K';
    young.mode = 'help';
    young.lesson = fixture;
    await tick();
    expect(asked).to.equal(0);
    const counts = mount();
    counts.grade = '5';
    counts.mode = 'help';
    counts.lesson = counting();
    await tick();
    expect(asked).to.equal(1);
    // An array needs it only for a young kid.
    const rows = { heading: 'Rows', text: 'Rows.', picture: { kind: 'array', rows: 2, cols: 3 } };
    const oldArray = mount();
    oldArray.grade = '5';
    oldArray.mode = 'help';
    oldArray.lesson = lessonWith(rows);
    await tick();
    expect(asked).to.equal(1);
    // A young array with no animals to draw has no young line to show either.
    const noBase = mount();
    noBase.grade = 'K';
    noBase.mode = 'help';
    noBase.lesson = lessonWith(rows);
    await tick();
    expect(asked).to.equal(1);
    const youngArray = mount();
    youngArray.grade = 'K';
    youngArray.pictureBase = BASE;
    youngArray.mode = 'help';
    youngArray.lesson = lessonWith(rows);
    await tick();
    expect(asked).to.equal(2);
  });

  it('a failed image is remembered for the run: the next screen draws blocks and the normal words from the start', async () => {
    const two = {
      ...fixture,
      skillGrade: '2',
      example: {
        ...fixture.example,
        steps: [
          { heading: 'First', text: 'First text.', picture: { kind: 'count', groups: [3, 2] }, young: '{a} one.' },
          { heading: 'Second', text: 'Second text.', picture: { kind: 'count', groups: [4, 1] }, young: '{a} two.' },
          ...fixture.example.steps.slice(2),
        ],
      },
    } as Lesson;
    const el = await open(two, 'K', '/no-such-folder/');
    for (let i = 0; i < 60 && imgs(el).length > 0; i++) await new Promise((r) => setTimeout(r, 25));
    expect(heading(el)).to.equal('First');
    button(el, 'Next').click();
    expect(imgs(el)).to.have.length(0);
    expect(cells(el)).to.have.length(5);
    expect(heading(el)).to.equal('Second');
    expect(part(el, 'text')!.hidden).to.equal(false);
  });

  it('a screen drawn before the chunk arrives stays blocks with the normal words; the next screen gets animals', async () => {
    let arrive!: (m: Awaited<ReturnType<typeof realLoad>>) => void;
    youngChunk.load = () => new Promise((r) => (arrive = r));
    const two = {
      ...fixture,
      skillGrade: '2',
      example: {
        ...fixture.example,
        steps: [
          { heading: 'First', text: 'First text.', picture: { kind: 'count', groups: [3, 2] }, young: '{a} one.' },
          { heading: 'Second', text: 'Second text.', picture: { kind: 'count', groups: [4, 1] }, young: '{a} two.' },
          ...fixture.example.steps.slice(2),
        ],
      },
    } as Lesson;
    const el = mount();
    el.grade = 'K';
    el.pictureBase = BASE;
    el.mode = 'help';
    el.lesson = two;
    button(el, 'Next').click();
    arrive(await realLoad());
    await tick();
    expect(imgs(el)).to.have.length(0);
    expect(cells(el)).to.have.length(5);
    expect(heading(el)).to.equal('First');
    expect(part(el, 'text')!.hidden).to.equal(false);
    button(el, 'Next').click();
    expect(imgs(el)).to.have.length(5);
    expect(heading(el)).to.not.equal('Second');
  });

  it('two groups apart each sit in their own frames', async () => {
    const el = await open(lessonWith({ heading: 'Compare', text: 'More or fewer?', picture: { kind: 'count', groups: [12, 3], apart: true } }), '5');
    await frame();
    expect(parts(el, 'picture')[0]!.querySelectorAll('.grp')).to.have.length(2);
    expect(root(el).querySelectorAll('.grp')[0]!.querySelectorAll('.frame')).to.have.length(2);
    expect(root(el).querySelectorAll('.grp')[1]!.querySelectorAll('.frame')).to.have.length(1);
  });

  describe('compare groups apart', () => {
    const apart = (groups: number[]): Lesson =>
      lessonWith({ heading: 'Compare', text: 'More or fewer?', picture: { kind: 'count', groups, apart: true } });

    for (const width of [320, 560]) {
      it(`sit side by side, top-aligned, and never scroll sideways at ${width} px`, async () => {
        const el = mount();
        el.style.display = 'block';
        el.style.width = `${width}px`;
        el.grade = '5';
        el.mode = 'help';
        el.lesson = apart([17, 12]);
        await until(() => root(el).querySelectorAll('style').length === 2, 'the young chunk');
        button(el, 'Next').click();
        // The cell size is set by a ResizeObserver, which runs before the next paint.
        await until(() => {
          const c = root(el).querySelector('.cnt');
          return c !== null && c.scrollWidth <= c.clientWidth && c.clientWidth > 0 && root(el).querySelectorAll('.cell').length > 0;
        }, 'the cells to fit');
        const grps = Array.from(root(el).querySelectorAll<HTMLElement>('.grp'));
        expect(grps).to.have.length(2);
        const [a, b] = grps.map((g) => g.getBoundingClientRect());
        expect(Math.abs(a!.top - b!.top)).to.be.below(1);
        expect(b!.left).to.be.greaterThan(a!.right);
        // The gap between groups is clearly bigger than the gap between frames inside one.
        const frames = Array.from(grps[0]!.querySelectorAll('.frame')).map((f) => f.getBoundingClientRect());
        expect(b!.left - a!.right).to.be.greaterThan(frames[1]!.top - frames[0]!.bottom + 8);
        const pic = parts(el, 'picture')[0]!;
        expect(pic.scrollWidth).to.be.at.most(pic.clientWidth);
        const cnt = root(el).querySelector('.cnt')!;
        expect(cnt.scrollWidth).to.be.at.most(cnt.clientWidth);
        for (const f of root(el).querySelectorAll('.frame')) {
          expect(f.getBoundingClientRect().right).to.be.at.most(pic.getBoundingClientRect().right + 0.5);
        }
      });
    }
  });

  describe('ten frame places', () => {
    const framed = (pic: Record<string, unknown>) =>
      open(lessonWith({ heading: 'Count', text: 'Count them.', picture: pic }), '5');
    const places = (el: ChocaLesson): HTMLElement[] => Array.from(root(el).querySelectorAll('.frame > .slot'));

    for (const grade of ['K', '5']) {
      it(`[8] shows 10 places, 8 filled and 2 outlined but empty (grade ${grade})`, async () => {
        const el = await open(lessonWith({ heading: 'Count', text: 'Count them.', picture: { kind: 'count', groups: [8] } }), grade);
        expect(places(el)).to.have.length(10);
        expect(places(el).filter((p) => p.querySelector('.cell'))).to.have.length(8);
        for (const p of places(el)) {
          const css = getComputedStyle(p);
          expect([css.borderTopStyle, css.borderTopWidth]).to.deep.equal(['solid', '1px']);
        }
      });
    }

    it('[3] with empty 2 has 2 dashed places and 5 plain unused ones', async () => {
      const el = await framed({ kind: 'count', groups: [3], empty: 2 });
      expect(places(el)).to.have.length(10);
      const dashed = places(el).filter((p) => p.querySelector('.cell.empty'));
      expect(dashed).to.have.length(2);
      expect(getComputedStyle(dashed[0]!.querySelector('.cell')!).borderTopStyle).to.equal('dashed');
      expect(places(el).filter((p) => !p.querySelector('.cell'))).to.have.length(5);
    });

    it('every place is the same size, filled or not', async () => {
      const el = await framed({ kind: 'count', groups: [8, 5] });
      const sizes = places(el).map((p) => `${Math.round(p.getBoundingClientRect().width)}x${Math.round(p.getBoundingClientRect().height)}`);
      expect(new Set(sizes).size).to.equal(1);
    });
  });

  describe('tidy-ups', () => {
    it('a grade with no string form never throws from the setter, and warns once', () => {
      const warn = console.warn;
      const seen: string[] = [];
      console.warn = (...a: unknown[]) => void seen.push(String(a[0]));
      try {
        const el = mount();
        expect(() => {
          el.grade = Object.create(null) as unknown as string;
        }).to.not.throw();
        expect(el.grade).to.equal(null);
        expect(seen.filter((m) => m.includes('unknown grade'))).to.have.length(1);
      } finally {
        console.warn = warn;
      }
    });

    it('a cyclic lesson object shows the invalid screen and does not throw from the setter', () => {
      const cyclic: Record<string, unknown> = { formatVersion: 1 };
      cyclic.self = cyclic;
      const el = mount();
      el.mode = 'help';
      const errors: unknown[] = [];
      el.addEventListener('lesson-error', (e) => errors.push((e as CustomEvent).detail));
      expect(() => {
        el.lesson = cyclic as unknown as Lesson;
      }).to.not.throw();
      expect(errors).to.deep.equal([{ reason: 'invalid' }]);
      expect(heading(el)).to.equal("Help isn't ready for this one yet.");
    });

    it('a bad grade warns once, however often the lesson, mode or base is set later', async () => {
      const warn = console.warn;
      const seen: string[] = [];
      console.warn = (...a: unknown[]) => void seen.push(String(a[0]));
      try {
        const el = mount();
        el.grade = 'Grade 3';
        el.lesson = counting();
        el.mode = 'help';
        el.pictureBase = BASE;
        el.lesson = counting();
        el.mode = 'intro';
        await tick();
        expect(seen.filter((m) => m.includes('unknown grade'))).to.have.length(1);
        expect(el.grade).to.equal(null);
      } finally {
        console.warn = warn;
      }
    });

    it('the young chunk adds its stylesheet once per element', async () => {
      const el = mount();
      el.pictureBase = BASE;
      el.mode = 'help';
      el.grade = 'K';
      el.lesson = counting();
      await until(() => root(el).querySelectorAll('style').length === 2, 'the young chunk');
      el.grade = '4';
      el.grade = 'K';
      for (let i = 0; i < 3; i++) {
        el.lesson = counting();
        await tick();
      }
      // Every earlier import was queued before this one, so awaiting it lets them all finish.
      await realLoad();
      await tick();
      expect(root(el).querySelectorAll('style')).to.have.length(2);
    });

    it('a stale run whose chunk fails stays quiet; only the current run warns', async () => {
      const warn = console.warn;
      const seen: string[] = [];
      console.warn = (...a: unknown[]) => void seen.push(String(a[0]));
      try {
        youngChunk.load = () => Promise.reject(new Error('offline'));
        const el = mount();
        el.grade = 'K';
        el.mode = 'help';
        el.lesson = counting();
        el.lesson = counting();
        await tick();
        await tick();
        expect(seen.filter((m) => m.includes('young look'))).to.have.length(1);
      } finally {
        console.warn = warn;
      }
    });

    it('when the chunk fails after a count was drawn, the held height is let go', async () => {
      const warn = console.warn;
      console.warn = () => undefined;
      try {
        let fail!: (e: Error) => void;
        youngChunk.load = () => new Promise((_, rej) => (fail = rej));
        const el = mount();
        el.grade = '5';
        el.mode = 'help';
        el.lesson = lessonWith({ heading: 'Count', text: 'Count them.', picture: { kind: 'count', groups: [8, 5] } });
        button(el, 'Next').click();
        const box = parts(el, 'picture')[0]!;
        expect(box.style.minHeight).to.not.equal('');
        fail(new Error('offline'));
        await tick();
        await tick();
        expect(box.style.minHeight).to.equal('');
        expect(box.getBoundingClientRect().height).to.be.below(2);
      } finally {
        console.warn = warn;
      }
    });

    it('after the chunk loads, the box is as tall as the picture, even on a 320 px phone', async () => {
      let arrive!: (m: Awaited<ReturnType<typeof realLoad>>) => void;
      youngChunk.load = () => new Promise((r) => (arrive = r));
      const el = mount();
      el.style.display = 'block';
      el.style.width = '320px';
      el.grade = '5';
      el.mode = 'help';
      el.lesson = lessonWith({ heading: 'Compare', text: 'More?', picture: { kind: 'count', groups: [17, 12], apart: true } });
      button(el, 'Next').click();
      const box = parts(el, 'picture')[0]!;
      arrive(await realLoad());
      await tick();
      await frame();
      await frame();
      const cnt = root(el).querySelector('.cnt')!;
      expect(box.style.minHeight).to.equal('');
      expect(Math.abs(box.getBoundingClientRect().height - cnt.getBoundingClientRect().height)).to.be.below(1);
    });

    for (const [rows, cols] of [[3, 10], [2, 15]] as const) {
      it(`a young ${rows} x ${cols} array draws squares in the held height when the chunk arrives late`, async () => {
        let arrive!: (m: Awaited<ReturnType<typeof realLoad>>) => void;
        youngChunk.load = () => new Promise((r) => (arrive = r));
        const el = mount();
        el.style.display = 'block';
        el.style.width = '700px';
        el.grade = 'K';
        el.pictureBase = BASE;
        el.mode = 'help';
        el.lesson = lessonWith({ heading: 'Rows', text: 'Rows.', picture: { kind: 'array', rows, cols }, young: '{a} in rows.' });
        button(el, 'Next').click();
        const box = parts(el, 'picture')[0]!;
        const before = box.getBoundingClientRect().height;
        arrive(await realLoad());
        await tick();
        expect(root(el).querySelectorAll('.arr .cell')).to.have.length(0);
        expect(box.querySelector('canvas') !== null).to.equal(true);
        expect(Math.abs(box.getBoundingClientRect().height - before)).to.be.below(2);
      });
    }
  });
});

describe('<chocabloc-lesson> young look: counted rows of animals', () => {
  const countedStep = (rows: number, cols: number, counted: number) => ({
    heading: 'Rows',
    text: 'Count the rows.',
    picture: { kind: 'array', rows, cols, counted },
    young: '{a} in rows.',
  });
  const rowsOf = (el: ChocaLesson): HTMLElement[] => parts(el, 'row');
  const texts = (els: Element[]): string[] => els.map((e) => (e.textContent ?? '').trim());

  /** Help on the first worked step; waits for the young chunk's stylesheet and the first counted row. */
  async function openRows(step: Record<string, unknown>): Promise<ChocaLesson> {
    const el = mount();
    el.grade = 'K';
    el.pictureBase = BASE;
    el.mode = 'help';
    el.lesson = lessonWith(step);
    await until(() => root(el).querySelectorAll('style').length >= 2, 'the chunks');
    button(el, 'Next').click();
    await until(() => rowsOf(el).length > 0, 'the rows');
    return el;
  }

  it('counted 2 of a 4 x 3 array: 12 animals in 4 rows, rows 1 and 2 circled with "1 row", "2 rows" and 3, 6', async () => {
    const el = await openRows(countedStep(4, 3, 2));
    expect(rowsOf(el)).to.have.length(4);
    expect(rowsOf(el).map((r) => r.querySelectorAll('img').length)).to.deep.equal([3, 3, 3, 3]);
    expect(imgs(el)).to.have.length(12);
    expect(rowsOf(el).map((r) => r.classList.contains('on'))).to.deep.equal([true, true, false, false]);
    expect(texts(parts(el, 'row-label'))).to.deep.equal(['1 row', '2 rows', '', '']);
    expect(texts(parts(el, 'row-total'))).to.deep.equal(['3', '6', '', '']);
    expect(heading(el)).to.match(/in rows\.$/);
  });

  it('counted 0: animals with no rings, faded rows or labels', async () => {
    const el = await openRows(countedStep(4, 3, 0));
    expect(imgs(el)).to.have.length(12);
    expect(rowsOf(el).some((r) => r.classList.contains('on') || r.classList.contains('faded'))).to.equal(false);
    expect(texts(parts(el, 'row-label')).join('')).to.equal('');
  });

  it('the labels read right when only the young chunk has arrived', async () => {
    const realPictures = picturesChunk.load;
    picturesChunk.load = () => new Promise(() => undefined);
    try {
      const el = mount();
      el.grade = 'K';
      el.pictureBase = BASE;
      el.mode = 'help';
      el.lesson = lessonWith(countedStep(4, 3, 2));
      await until(() => root(el).querySelectorAll('style').length >= 2, 'the young chunk');
      button(el, 'Next').click();
      await until(() => rowsOf(el).length > 0, 'the rows');
      expect(texts(parts(el, 'row-label'))).to.deep.equal(['1 row', '2 rows', '', '']);
    } finally {
      picturesChunk.load = realPictures;
    }
  });

  it('a 6 x 6 array (36, over 30) draws dots through the pictures chunk, not animals', async () => {
    const el = mount();
    el.grade = 'K';
    el.pictureBase = BASE;
    el.mode = 'help';
    el.lesson = lessonWith(countedStep(6, 6, 1));
    await until(() => root(el).querySelectorAll('style').length >= 3, 'both chunks');
    button(el, 'Next').click();
    await until(() => rowsOf(el).length > 0, 'the rows');
    expect(imgs(el)).to.have.length(0);
    expect(root(el).querySelectorAll('[part~="row"] .dot')).to.have.length(36);
  });

  it('one failed image turns the rows to dots and the normal words come back', async () => {
    const el = await openRows(countedStep(4, 3, 2));
    expect(heading(el)).to.not.equal('Rows');
    imgs(el)[0]!.dispatchEvent(new Event('error'));
    expect(imgs(el)).to.have.length(0);
    expect(heading(el)).to.equal('Rows');
    expect(part(el, 'text')!.hidden).to.equal(false);
  });
});
