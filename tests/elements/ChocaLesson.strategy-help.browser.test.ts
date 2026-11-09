// Try again's wrong-answer card in the two fact lessons shows <chocabloc-help> in place of the tip.
// Not in ChocaLesson.help.browser.test.ts: that file is the lesson's Help mode, and must never load
// the question element.
import { expect } from '@esm-bundle/chai';
import { ChocaLesson } from '../../src/lesson/index';
import type { NormalizedQuestion } from '../../src/lesson/index';
import { helpChunk, timing } from '../../src/lesson/dom/question-view';
import {
  button,
  captureConsole,
  cleanup,
  deepText,
  deferred,
  heading,
  holder,
  labels,
  listen,
  part,
  questionId,
  stubSpeech,
  tick,
  until,
} from './lesson-test-utils';
import type { Detail } from './lesson-test-utils';
import { check, click, div, focusedPart, isOpen, mult, say, the, way } from './help-test-utils';
import {
  ANSWER_LINE,
  TIP,
  WRONG,
  answer,
  atTryAgain,
  expectLessonCard,
  fq,
  helpOf,
  helpShown,
  lessonFor,
  loadLessonFixture,
  right,
  shown,
  start,
  threeFacts,
  walk,
  whyShown,
} from './try-again-test-utils';

const advanceMs = timing.advanceMs;
const realLoad = helpChunk.load;
let loads = 0;

before(async () => {
  await loadLessonFixture();
  timing.advanceMs = 0;
});

after(() => {
  timing.advanceMs = advanceMs;
});

beforeEach(() => {
  loads = 0;
  helpChunk.load = () => {
    loads++;
    return realLoad();
  };
});

afterEach(() => {
  helpChunk.load = realLoad;
  cleanup();
});

const thumbs =(records: Detail[]): unknown[] => records.map((r) => r.thumb);

describe('<chocabloc-lesson> Try again shows strategy help', () => {
  describe('when it shows', () => {
    it('MULT-FACTS Try again wrong answer shows help, not the lesson tip', async () => {
      const { el, host } = await atTryAgain(lessonFor('MULT-FACTS-0-5'));
      await answer(el, host, 'e1', WRONG);
      const help = await helpShown(el);
      expect(isOpen(help)).to.equal(true);
      expect(help.draw).to.equal('card');
      expect(way(help)).to.equal('Way 1 of 3: Equal groups');
      expect(say(help)).to.include('7 rows of 8');
      expect(the(help, 'picture').children.length).to.be.greaterThan(0);
      expect(part(el, 'tip') === null, 'no lesson tip').to.equal(true);
      expect(part(el, 'why')?.querySelector('[part~="picture"]') == null, 'no lesson picture').to.equal(true);
      expect(labels(el)).to.include('Got it');
      expect(focusedPart(help)).to.equal('text');
      expect(check(help, mult(7, 8), [], undefined, way(help)!)).to.deep.equal([]);
    });

    it('a right answer on Try again shows nothing and moves on', async () => {
      const { el, host } = await atTryAgain(lessonFor('MULT-FACTS-0-5'));
      await right(el, host, 'e1');
      expect(part(el, 'why') === null).to.equal(true);
    });

    it('the answer line shows only when the validator returned it, even after the panel closes', async () => {
      const { el, host } = await atTryAgain(lessonFor('MULT-FACTS-0-5'));
      await answer(el, host, 'e1', { correct: false });
      click(await helpShown(el), 'thumb-up');
      expect(part(el, 'why')?.textContent).to.not.include(ANSWER_LINE);
    });

    it("\"I'm not sure yet\" gets help too, with no answer line", async () => {
      const { el } = await atTryAgain(lessonFor('MULT-FACTS-0-5'));
      button(el, "I'm not sure yet").click();
      const help = await helpShown(el);
      expect(isOpen(help)).to.equal(true);
      expect(part(el, 'why')?.textContent).to.not.include(ANSWER_LINE);
    });

    it('the gate is the retry skill, not the harder one', async () => {
      const { el, host } = await atTryAgain(lessonFor('MULT-FACTS-0-5', 'MULT-2DIGIT-BY-1DIGIT'));
      await answer(el, host, 'e1', WRONG);
      expect(isOpen(await helpShown(el))).to.equal(true);
    });

    it('DIV-BASIC-DIVISION-FACTS Try again shows div-facts help', async () => {
      const records = listen('lesson-help');
      const again = [fq('e1', 56, 8, 'division'), fq('e2', 42, 7, 'division'), fq('e3', 24, 6, 'division')];
      const { el, host } = await atTryAgain(lessonFor('DIV-BASIC-DIVISION-FACTS', 'DIV-LONG'), again);
      await answer(el, host, 'e1', WRONG);
      const help = await helpShown(el);
      expect(way(help)).to.equal('Way 1 of 4: Share into equal groups');
      expect(check(help, div(56, 8), [], undefined, way(help)!)).to.deep.equal([]);
      click(help, 'thumb-up');
      expect(records).to.have.length(1);
      expect(records[0]).to.include({ family: 'div-facts', strategy: 'div.share', fact: '56÷8' });
    });

    it('every wrong answer on Try again gets its own panel, for its own numbers', async () => {
      const { el, host } = await atTryAgain(lessonFor('MULT-FACTS-0-5'));
      await answer(el, host, 'e1', WRONG);
      await helpShown(el);
      button(el, 'Got it').click();
      await answer(el, host, 'e2', WRONG);
      await until(() => questionId(el) === 'e2' && helpOf(el) !== null, 'the second panel');
      expect(say(helpOf(el)!)).to.include('6 rows of 7');
    });
  });

  describe('when it does not show', () => {
    it('Quick check and Your turn are unchanged', async () => {
      const lesson = lessonFor('MULT-FACTS-0-5');
      const { el, host } = start(lesson, threeFacts(), () => undefined);
      await answer(el, host, 'q1', WRONG);
      await whyShown(el);
      expect(heading(el)).to.equal('Quick check');
      expectLessonCard(el);
      button(el, 'Got it').click();
      await right(el, host, 'q2');
      await walk(el, lesson.example.steps);
      await right(el, host, 'q3');
      await answer(el, host, 'q4', WRONG);
      await whyShown(el);
      expect(heading(el)).to.equal('Your turn');
      expectLessonCard(el);
      expect(loads, 'help never loaded').to.equal(0);
    });

    for (const skill of ['COMPARE-NUMBERS-WITHIN-20', 'MULT-2DIGIT-BY-1DIGIT', 'MULT-FACTSHEET', 'DIV-BASIC-DIVISION-FACTS-2']) {
      it(`a non-fact lesson's Try again is unchanged (${skill})`, async () => {
        const { el, host } = await atTryAgain(lessonFor(skill));
        await answer(el, host, 'e1', WRONG);
        await whyShown(el);
        expectLessonCard(el);
        expect(loads, 'help never loaded').to.equal(0);
      });
    }

    it('a question with no operands keeps the lesson card, and help never loads', async () => {
      const blind = { ...fq('e1', 7, 8), content: { operation: 'multiplication' } } as unknown as NormalizedQuestion;
      const { el, host } = await atTryAgain(lessonFor('MULT-FACTS-0-5'), [blind, fq('e2', 6, 7), fq('e3', 4, 6)]);
      await answer(el, host, 'e1', { correct: false });
      await whyShown(el);
      expect(helpOf(el) === null, 'no help panel').to.equal(true);
      expect(part(el, 'tip')?.textContent).to.equal(TIP);
      expect(loads, 'help never loaded').to.equal(0);
    });

    for (const [name, q] of [
      ['a zero factor', fq('e1', 0, 8)],
      ['a division with a remainder', fq('e1', 7, 2, 'division')],
      ['a zero divisor', fq('e1', 8, 0, 'division')],
    ] as const) {
      it(`${name} has no strategies, so the lesson card stays, and no teacher fallback line shows`, async () => {
        for (const grade of ['2', '5']) {
          cleanup();
          const { el, host } = await atTryAgain(lessonFor('MULT-FACTS-0-5'), [q, fq('e2', 6, 7), fq('e3', 4, 6)], (e) => {
            e.grade = grade;
          });
          await answer(el, host, 'e1', WRONG);
          await whyShown(el);
          expectLessonCard(el);
        }
      });
    }

    it('help that fails to load leaves the lesson card, with a warning, and the kid can go on', async () => {
      const got = captureConsole();
      helpChunk.load = () => Promise.reject(new Error('offline'));
      const { el, host } = await atTryAgain(lessonFor('MULT-FACTS-0-5'));
      await answer(el, host, 'e1', WRONG);
      await whyShown(el);
      expectLessonCard(el);
      expect(got.warn.map((c) => String(c[0]))).to.include('[chocabloc-lesson] could not load help:');
      button(el, 'Got it').click();
      await shown(el, 'e2');
    });
  });

  // Ruling 26: a panel that never says the final number can't sit above a line that does.
  describe('the answer waits for the panel', () => {
    for (const [label, name] of [
      ['👍', 'thumb-up'],
      ['Close help', 'close'],
    ] as const) {
      it(`the answer is hidden while help is open and shows after ${label}`, async () => {
        const { el, host } = await atTryAgain(lessonFor('MULT-FACTS-0-5'));
        await answer(el, host, 'e1', WRONG);
        const help = await helpShown(el);
        expect(deepText(part(el, 'why')!), 'not on the card').to.not.include(ANSWER_LINE);
        // Light DOM only: the panel's own text has its own oracle, and its <style> is full of digits.
        expect(part(el, 'why')?.textContent, 'not the number either').to.not.include('56');
        expect(check(help, mult(7, 8), [], undefined, way(help)!)).to.deep.equal([]);
        expect(labels(el)).to.include('Got it');
        click(help, name);
        expect(isOpen(help)).to.equal(false);
        expect(part(el, 'why')?.textContent).to.include(`${ANSWER_LINE} 56`);
        expect(questionId(el), 'still on the question').to.equal('e1');
        expect(labels(el)).to.include('Got it');
      });
    }

    it('👎 is still help: the answer stays hidden', async () => {
      const { el, host } = await atTryAgain(lessonFor('MULT-FACTS-0-5'));
      await answer(el, host, 'e1', WRONG);
      click(await helpShown(el), 'thumb-down');
      expect(deepText(part(el, 'why')!)).to.not.include(ANSWER_LINE);
    });

    it('Read to me keeps to the question while the panel is open, and says the answer after', async () => {
      const speech = stubSpeech();
      const { el, host } = await atTryAgain(lessonFor('MULT-FACTS-0-5'));
      await answer(el, host, 'e1', WRONG);
      const help = await helpShown(el);
      button(el, 'Read to me').click();
      const open = speech.spoken[speech.spoken.length - 1];
      expect(open).to.include('7');
      expect(open).to.not.include(ANSWER_LINE);
      click(help, 'close');
      button(el, 'Read to me').click();
      expect(speech.spoken[speech.spoken.length - 1]).to.include(`${ANSWER_LINE} 56`);
    });

    it('a young kid hears the answer when it appears, since they may not read it', async () => {
      const speech = stubSpeech();
      const { el, host } = await atTryAgain(lessonFor('MULT-FACTS-0-5'), threeFacts(), (e) => {
        e.grade = '2';
      });
      const before = speech.spoken.length;
      await answer(el, host, 'e1', WRONG);
      const help = await helpShown(el);
      expect(speech.spoken.slice(before).join(' ')).to.not.include(ANSWER_LINE);
      click(help, 'thumb-up');
      expect(speech.spoken[speech.spoken.length - 1]).to.include(`${ANSWER_LINE} 56`);
    });

    it('an older kid hears nothing when it appears', async () => {
      const speech = stubSpeech();
      const { el, host } = await atTryAgain(lessonFor('MULT-FACTS-0-5'));
      await answer(el, host, 'e1', WRONG);
      const help = await helpShown(el);
      const before = speech.spoken.length;
      click(help, 'thumb-up');
      expect(speech.spoken.length).to.equal(before);
    });

    it('the fallback card still shows the answer at once', async () => {
      // Help's code failed to load.
      const got = captureConsole();
      helpChunk.load = () => Promise.reject(new Error('offline'));
      const failed = await atTryAgain(lessonFor('MULT-FACTS-0-5'));
      await answer(failed.el, failed.host, 'e1', WRONG);
      await whyShown(failed.el);
      expectLessonCard(failed.el);
      expect(got.warn.length).to.be.greaterThan(0);
      cleanup();
      helpChunk.load = realLoad;
      // Help loaded, and has no strategy for these numbers.
      const none = await atTryAgain(lessonFor('MULT-FACTS-0-5'), [fq('e1', 0, 8), fq('e2', 6, 7), fq('e3', 4, 6)]);
      await answer(none.el, none.host, 'e1', WRONG);
      await whyShown(none.el);
      expectLessonCard(none.el);
    });

    it('Got it with help open moves on and sends the record once, and the answer never draws', async () => {
      const records = listen('lesson-help');
      const { el, host } = await atTryAgain(lessonFor('MULT-FACTS-0-5'));
      await answer(el, host, 'e1', WRONG);
      await helpShown(el);
      const card = part(el, 'why')!;
      button(el, 'Got it').click();
      await shown(el, 'e2');
      expect(thumbs(records)).to.deep.equal([null]);
      expect(card.textContent, 'the card it left').to.not.include(ANSWER_LINE);
      expect(part(el, 'why') === null, 'nothing carried over').to.equal(true);
    });

    it("the lesson's Close with the panel open draws no answer and leaves no empty box", async () => {
      const { el, host } = await atTryAgain(lessonFor('MULT-FACTS-0-5'));
      await answer(el, host, 'e1', WRONG);
      await helpShown(el);
      part(el, 'close')!.click();
      expect(part(el, 'why')?.textContent).to.not.include(ANSWER_LINE);
      expect(part(el, 'why')!.getBoundingClientRect().height).to.equal(0);
    });
  });

  describe('the kid can always go on', () => {
    it('Got it shows while help is still loading; help then appears on the same card', async () => {
      const slow = deferred<Awaited<ReturnType<typeof realLoad>>>();
      helpChunk.load = () => slow.promise;
      const { el, host } = await atTryAgain(lessonFor('MULT-FACTS-0-5'));
      await answer(el, host, 'e1', WRONG);
      await until(() => labels(el).includes('Got it'), 'Got it');
      expect(part(el, 'why') === null, 'no card yet').to.equal(true);
      slow.resolve(await realLoad());
      expect(isOpen(await helpShown(el))).to.equal(true);
    });

    it('moving on before help arrives is final: no panel, no record', async () => {
      const records = listen('lesson-help');
      const slow = deferred<Awaited<ReturnType<typeof realLoad>>>();
      helpChunk.load = () => slow.promise;
      const { el, host } = await atTryAgain(lessonFor('MULT-FACTS-0-5'));
      await answer(el, host, 'e1', WRONG);
      await until(() => labels(el).includes('Got it'), 'Got it');
      button(el, 'Got it').click();
      await shown(el, 'e2');
      slow.resolve(await realLoad());
      await tick();
      await tick();
      expect(part(el, 'why') === null, 'nothing drawn on the next question').to.equal(true);
      expect(records).to.deep.equal([]);
    });

    it("the panel's 👍 and Close help close only the panel: the question and Got it stay", async () => {
      for (const name of ['thumb-up', 'close']) {
        cleanup();
        const { el, host } = await atTryAgain(lessonFor('MULT-FACTS-0-5'));
        await answer(el, host, 'e1', WRONG);
        const help = await helpShown(el);
        click(help, name);
        expect(isOpen(help), name).to.equal(false);
        expect(questionId(el)).to.equal('e1');
        expect(part(el, 'tip') === null, 'the tip does not come back').to.equal(true);
        expect(labels(el)).to.include('Got it');
        // The button that hid had the focus. It goes to the card, so the answer line gets read, as on the lesson's own card.
        expect((el.shadowRoot as ShadowRoot).activeElement?.getAttribute('part')).to.equal('why');
        button(el, 'Got it').click();
        await shown(el, 'e2');
      }
    });

    it('a card with no answer line and a closed panel leaves no empty box, and focus on Got it', async () => {
      const { el, host } = await atTryAgain(lessonFor('MULT-FACTS-0-5'));
      await answer(el, host, 'e1', { correct: false });
      const help = await helpShown(el);
      expect(part(el, 'why')!.getBoundingClientRect().height).to.be.greaterThan(0);
      click(help, 'close');
      expect(part(el, 'why')!.getBoundingClientRect().height).to.equal(0);
      expect(labels(el)).to.include('Got it');
      expect((el.shadowRoot as ShadowRoot).activeElement?.textContent).to.equal('Got it');
    });
  });

  describe('lesson-help', () => {
    it('lesson-help fires with beforeAnswer false, once for each record, and help-* events stay inside', async () => {
      const records = listen('lesson-help');
      const inner = [listen('help-record'), listen('help-step'), listen('help-close')];
      const { el, host } = await atTryAgain(lessonFor('MULT-FACTS-0-5'));
      await answer(el, host, 'e1', WRONG);
      const help = await helpShown(el);
      click(help, 'thumb-up');
      expect(records).to.have.length(1);
      const { eventId, ...rest } = records[0]! as { eventId: string };
      expect(eventId).to.match(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
      expect(rest).to.deep.equal({
        family: 'mult-facts',
        strategy: 'mult.groups',
        thumb: 'up',
        fact: '7x8',
        beforeAnswer: false,
        triesBefore: null,
      });
      expect(inner.map((got) => got.length)).to.deep.equal([0, 0, 0]);
    });

    it('👎 records the way it left, and Got it records the one left open, with no thumb', async () => {
      const records = listen('lesson-help');
      const { el, host } = await atTryAgain(lessonFor('MULT-FACTS-0-5'));
      await answer(el, host, 'e1', WRONG);
      const help = await helpShown(el);
      click(help, 'thumb-down');
      expect(way(help)).to.equal('Way 2 of 3: Skip counting');
      button(el, 'Got it').click();
      await shown(el, 'e2');
      expect(thumbs(records)).to.deep.equal(['down', null]);
      expect(records.map((r) => r.strategy)).to.deep.equal(['mult.groups', 'mult.skip-count']);
    });

    it('Got it after the panel was closed sends nothing more', async () => {
      const records = listen('lesson-help');
      const { el, host } = await atTryAgain(lessonFor('MULT-FACTS-0-5'));
      await answer(el, host, 'e1', WRONG);
      click(await helpShown(el), 'close');
      button(el, 'Got it').click();
      await shown(el, 'e2');
      expect(thumbs(records)).to.deep.equal([null]);
    });

    it("the lesson's Close with the panel open records it first, then lesson-close, then nothing", async () => {
      const log: string[] = [];
      const note = (e: Event) => log.push(e.type);
      document.addEventListener('lesson-help', note);
      document.addEventListener('lesson-close', note);
      try {
        const { el, host } = await atTryAgain(lessonFor('MULT-FACTS-0-5'));
        await answer(el, host, 'e1', WRONG);
        const help = await helpShown(el);
        part(el, 'close')!.click();
        expect(log).to.deep.equal(['lesson-help', 'lesson-close']);
        expect(isOpen(help), 'a dead screen keeps no live panel').to.equal(false);
        part(el, 'close')!.click();
        await tick();
        expect(log).to.have.length(2);
      } finally {
        document.removeEventListener('lesson-help', note);
        document.removeEventListener('lesson-close', note);
      }
    });

    it('the answer events still come first and are unchanged', async () => {
      const answers = listen('lesson-answer');
      const { el, host } = await atTryAgain(lessonFor('MULT-FACTS-0-5'));
      const before = answers.length;
      await answer(el, host, 'e1', WRONG);
      await helpShown(el);
      expect(answers.slice(before).map((a) => [a.step, a.skillId, a.outcome])).to.deep.equal([['tryAgain', 'MULT-FACTS-0-5', 'wrong']]);
    });
  });

  describe('what the panel is given', () => {
    it('a saved pick is opened first', async () => {
      const { el, host } = await atTryAgain(lessonFor('MULT-FACTS-0-5'), threeFacts(), (e) => {
        e.strategyPicks = { 'mult-facts': 'mult.skip-count' };
      });
      await answer(el, host, 'e1', WRONG);
      expect(way(await helpShown(el))).to.equal('Way 1 of 3: Skip counting');
    });

    it('picks are read when the panel opens, so they may arrive while the kid is on the question', async () => {
      const { el, host } = await atTryAgain(lessonFor('MULT-FACTS-0-5'));
      // Try again's first question is on screen by now.
      el.strategyPicks = { 'mult-facts': 'mult.known-fact' };
      await answer(el, host, 'e1', WRONG);
      expect(way(await helpShown(el))).to.equal('Way 1 of 3: Start from a fact you know');
    });

    it('a division lesson reads its own family: a multiplication pick is not used', async () => {
      const again = [fq('e1', 56, 8, 'division'), fq('e2', 42, 7, 'division'), fq('e3', 24, 6, 'division')];
      const { el, host } = await atTryAgain(lessonFor('DIV-BASIC-DIVISION-FACTS'), again, (e) => {
        e.strategyPicks = { 'mult-facts': 'mult.skip-count', 'div-facts': 'div.think-mult' };
      });
      await answer(el, host, 'e1', WRONG);
      expect(way(await helpShown(el))).to.equal('Way 1 of 4: Think multiplication');
    });

    for (const [name, picks] of [
      ['null', null],
      ['a string', 'mult.skip-count'],
      ['a pick for the other family', { 'mult-facts': 'div.share' }],
      ['a made-up pick', { 'mult-facts': '__proto__' }],
    ] as const) {
      it(`bad picks are ignored (${name})`, async () => {
        const { el, host } = await atTryAgain(lessonFor('MULT-FACTS-0-5'), threeFacts(), (e) => {
          e.strategyPicks = picks as unknown as ChocaLesson['strategyPicks'];
        });
        await answer(el, host, 'e1', WRONG);
        expect(way(await helpShown(el))).to.equal('Way 1 of 3: Equal groups');
      });
    }

    it('strategyPicks set before the element is defined still count', async () => {
      const tag = 'chocabloc-lesson-late-help';
      const el = document.createElement(tag) as ChocaLesson;
      const picks = { 'mult-facts': 'mult.skip-count' } as const;
      el.strategyPicks = picks;
      holder().appendChild(el);
      customElements.define(tag, class extends ChocaLesson {});
      expect(el.strategyPicks === picks).to.equal(true);
    });

    it('no picks at all is the normal case: the property starts unset, and help opens on the first way', async () => {
      const { el, host } = await atTryAgain(lessonFor('MULT-FACTS-0-5'));
      // Declared only, to stay inside the lesson Help size line.
      expect(el.strategyPicks).to.equal(undefined);
      await answer(el, host, 'e1', WRONG);
      expect(way(await helpShown(el))).to.equal('Way 1 of 3: Equal groups');
    });

    it('a young grade gets the young look', async () => {
      const { el, host } = await atTryAgain(lessonFor('MULT-FACTS-0-5'), threeFacts(), (e) => {
        e.grade = '2';
      });
      await answer(el, host, 'e1', WRONG);
      const help = await helpShown(el);
      expect(the(help, 'panel').classList.contains('young')).to.equal(true);
      expect(way(help)).to.equal('Way 1 of 2: Equal groups');
    });

    it("with no grade, the lesson's own skillGrade decides, as it does for the lesson's look", async () => {
      for (const [skillGrade, young, line] of [
        ['3', true, 'Way 1 of 2: Equal groups'],
        ['5', false, 'Way 1 of 3: Equal groups'],
      ] as const) {
        cleanup();
        const { el, host } = await atTryAgain(lessonFor('MULT-FACTS-0-5', 'MULT-FACTS-6-10', skillGrade));
        await answer(el, host, 'e1', WRONG);
        const help = await helpShown(el);
        expect(the(help, 'panel').classList.contains('young'), skillGrade).to.equal(young);
        expect(way(help)).to.equal(line);
      }
    });

    it("the kid's grade wins over the lesson's", async () => {
      const { el, host } = await atTryAgain(lessonFor('MULT-FACTS-0-5', 'MULT-FACTS-6-10', '3'), threeFacts(), (e) => {
        e.grade = '5';
      });
      await answer(el, host, 'e1', WRONG);
      expect(way(await helpShown(el))).to.equal('Way 1 of 3: Equal groups');
    });

    it("takes the lesson's language, translator and pictureBase", async () => {
      const speech = stubSpeech();
      const { el, host } = await atTryAgain(lessonFor('MULT-FACTS-0-5'), threeFacts(), (e) => {
        (e.parentElement as HTMLElement).setAttribute('lang', 'fr');
        e.grade = '2';
        e.pictureBase = '/images/animals';
        e.translator = (k) => (k === 'panel.more' ? 'Encore' : undefined);
      });
      await answer(el, host, 'e1', WRONG);
      const help = await helpShown(el);
      expect(the(help, 'more').textContent).to.equal('Encore');
      expect(help.pictureBase).to.equal('/images/animals/');
      // A panel inside the lesson's shadow root can't find the page's [lang] by itself.
      expect(speech.langs[speech.langs.length - 1]).to.equal('fr');
    });

    it('a young kid hears the panel, never the tip', async () => {
      const speech = stubSpeech();
      const { el, host } = await atTryAgain(lessonFor('MULT-FACTS-0-5'), threeFacts(), (e) => {
        e.grade = '2';
      });
      // The earlier steps' cards rightly spoke the tip; only Try again's counts here.
      const before = speech.spoken.length;
      await answer(el, host, 'e1', WRONG);
      await helpShown(el);
      expect(speech.spoken[speech.spoken.length - 1]).to.include('7 rows of 8');
      expect(speech.spoken.slice(before).join(' ')).to.not.include('Count the tens');
    });

    it('an older kid hears nothing by itself, and Read to me with no answer line reads the question', async () => {
      const speech = stubSpeech();
      const { el, host } = await atTryAgain(lessonFor('MULT-FACTS-0-5'));
      const before = speech.spoken.length;
      await answer(el, host, 'e1', { correct: false });
      await helpShown(el);
      expect(speech.spoken.length).to.equal(before);
      button(el, 'Read to me').click();
      expect(speech.spoken[speech.spoken.length - 1]).to.include('7');
      expect(speech.spoken[speech.spoken.length - 1]).to.not.include('Count the tens');
    });

    it('fits 320 px, and the panel fills the card', async () => {
      const { el, host } = await atTryAgain(lessonFor('MULT-FACTS-0-5'), threeFacts(), (e) => {
        (e.parentElement as HTMLElement).style.width = '320px';
      });
      await answer(el, host, 'e1', WRONG);
      const help = await helpShown(el);
      const panel = part(el, 'panel')!;
      expect(panel.scrollWidth).to.be.at.most(panel.clientWidth);
      const card = part(el, 'why')!;
      const s = getComputedStyle(card);
      const inner = card.clientWidth - parseFloat(s.paddingLeft) - parseFloat(s.paddingRight);
      expect(Math.round(help.getBoundingClientRect().width)).to.equal(Math.round(inner));
    });
  });

  it('removing the lesson with the panel open leaves nothing running', async () => {
    const speech = stubSpeech();
    const { el, host } = await atTryAgain(lessonFor('MULT-FACTS-0-5'), threeFacts(), (e) => {
      e.grade = '2';
    });
    await answer(el, host, 'e1', WRONG);
    const help = await helpShown(el);
    const before = speech.cancels();
    el.remove();
    expect(isOpen(help)).to.equal(false);
    expect(speech.cancels()).to.be.greaterThan(before);
  });
});
