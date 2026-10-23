import { expect } from '@esm-bundle/chai';
import '../../src/lesson/index';
import type { ChocaLesson, Lesson } from '../../src/lesson/index';
import { pickAnimals } from '../../src/lesson/animals';
import { youngChunk } from '../../src/lesson/dom/ChocaLesson';
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
    expect(part(el, 'text')).to.equal(null);
    expect(root(el).textContent).to.not.include('Count the animals in the picture.');
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
    for (const bad of ['7', 'Grade 3', '']) {
      expect(imgs(await open(counting('K'), bad))).to.have.length(5);
      expect(imgs(await open(counting('6'), bad))).to.have.length(0);
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

  it('pictureBase null draws blocks but the young text still shows', async () => {
    const el = await open(counting(), 'K', null);
    expect(imgs(el)).to.have.length(0);
    expect(cells(el)).to.have.length(5);
    expect(heading(el)).to.include('3.');
    expect(root(el).textContent).to.not.include('Count the animals');
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
    const young = mount();
    young.grade = 'K';
    young.mode = 'help';
    young.lesson = fixture;
    await tick();
    expect(asked).to.equal(1);
    const counts = mount();
    counts.grade = '5';
    counts.mode = 'help';
    counts.lesson = counting();
    await tick();
    expect(asked).to.equal(2);
  });

  it('two groups apart each sit in their own frames', async () => {
    const el = await open(lessonWith({ heading: 'Compare', text: 'More or fewer?', picture: { kind: 'count', groups: [12, 3], apart: true } }), '5');
    await frame();
    expect(parts(el, 'picture')[0]!.querySelectorAll('.grp')).to.have.length(2);
    expect(root(el).querySelectorAll('.grp')[0]!.querySelectorAll('.frame')).to.have.length(2);
    expect(root(el).querySelectorAll('.grp')[1]!.querySelectorAll('.frame')).to.have.length(1);
  });
});
