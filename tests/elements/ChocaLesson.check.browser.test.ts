import { expect } from '@esm-bundle/chai';
// The lesson entry registers <chocabloc-lesson> on import.
import '../../src/lesson/index';
import type { ChocaLesson, NormalizedQuestion } from '../../src/lesson/index';
import type { ValidationResult } from '../../src/types';
import { timing } from '../../src/lesson/dom/question-view';
import { practiceChunk } from '../../src/lesson/dom/ChocaLesson';
import {
  answerRows,
  button,
  captureConsole,
  choose,
  cleanup,
  cmp,
  fakeHost,
  feedback,
  feedbackLog,
  firstArgs,
  heading,
  listen,
  microtasks,
  mount,
  part,
  questionId,
  root,
  until,
} from './lesson-test-utils';
import type { FakeHost } from './lesson-test-utils';

type Host = FakeHost;

const advanceMs = timing.advanceMs;

before(() => {
  timing.advanceMs = 0;
});

after(() => {
  timing.advanceMs = advanceMs;
});

afterEach(cleanup);

function check(host: Host, questions: NormalizedQuestion[], withValidator = true): ChocaLesson {
  const el = mount();
  el.questions = questions;
  if (withValidator) el.validateAnswer = host.validateAnswer;
  el.mode = 'check';
  return el;
}

const shown = (el: ChocaLesson, id: string) => until(() => questionId(el) === id, `question ${id} on screen`);

/** Everything the player shows as text, outside the question element. */
const allText = (el: ChocaLesson): string => root(el).textContent ?? '';

describe('<chocabloc-lesson> Check', () => {
  it('runs the host\'s questions one at a time and reports bySkill, counting Unsure', async () => {
    const host = fakeHost();
    const answers = listen('lesson-answer');
    const done = listen('lesson-done');
    const qs = [cmp('a1', [3, 8], 'SKILL-A'), cmp('a2', [8, 3], 'SKILL-A'), cmp('b1', [4, 9], 'SKILL-B'), cmp('b2', [9, 4], 'SKILL-B')];
    const el = check(host, qs);
    const said = feedbackLog(el);
    expect(heading(el)).to.equal('Getting your questions…');

    await shown(el, 'a1');
    choose(el, '<');
    host.last.reply.resolve({ correct: true, expected: 'SECRET-1' });
    await shown(el, 'a2');
    choose(el, '<');
    host.last.reply.resolve({ correct: false, expected: 'SECRET-2' });
    await shown(el, 'b1');
    button(el, "I'm not sure yet").click();
    await shown(el, 'b2');
    choose(el, '<');
    host.last.reply.resolve({ correct: true, expected: 'SECRET-4' });
    await until(() => heading(el) === 'All done!', 'All done!');
    button(el, 'Play').click();

    expect(said).to.deep.equal(['Yes!', 'Thanks! On to the next one.', 'Thanks! On to the next one.', 'Yes!']);
    expect(host.checks).to.have.length(3);
    expect(answerRows(answers)).to.deep.equal([
      ['check', 'a1', '<', 'right'],
      ['check', 'a2', '<', 'wrong'],
      ['check', 'b1', null, 'unsure'],
      ['check', 'b2', '<', 'right'],
    ]);
    expect(answers.map((a) => a.skillId)).to.deep.equal(['SKILL-A', 'SKILL-A', 'SKILL-B', 'SKILL-B']);
    expect(done).to.deep.equal([
      {
        mode: 'check',
        right: 2,
        of: 4,
        unsure: 1,
        bySkill: {
          'SKILL-A': { right: 1, of: 2, unsure: 0 },
          'SKILL-B': { right: 1, of: 2, unsure: 1 },
        },
      },
    ]);
  });

  it('never shows the answer: "Yes!" or "Thanks!", no why card, nothing from expected', async () => {
    const host = fakeHost();
    const el = check(host, [cmp('a1', [34, 99]), cmp('a2', [56, 56])]);
    const replies: [string, ValidationResult, string][] = [
      ['a1', { correct: true, expected: 'SECRET-RIGHT' }, 'Yes!'],
      ['a2', { correct: false, expected: 'SECRET-WRONG' }, 'Thanks! On to the next one.'],
    ];
    for (const [id, verdict, said] of replies) {
      await shown(el, id);
      choose(el, '<');
      host.last.reply.resolve(verdict);
      // The reply is in, and the question is still on screen (its pause is a timer).
      await microtasks();
      expect(questionId(el)).to.equal(id);
      expect(feedback(el)).to.equal(said);
      expect(part(el, 'why') === null, 'no why card').to.equal(true);
      expect(allText(el)).to.not.include('SECRET').and.not.include('The answer is');
    }
    await until(() => heading(el) === 'All done!', 'All done!');
  });

  it('Close on the done screen sends lesson-done, not lesson-close', async () => {
    const host = fakeHost();
    const done = listen('lesson-done');
    const closed = listen('lesson-close');
    const el = check(host, [cmp('a1', [3, 8])]);
    await shown(el, 'a1');
    button(el, "I'm not sure yet").click();
    await until(() => heading(el) === 'All done!', 'All done!');
    part(el, 'close')!.click();
    part(el, 'close')!.click();
    button(el, 'Play').click();
    expect(closed).to.deep.equal([]);
    expect(done).to.deep.equal([{ mode: 'check', right: 0, of: 1, unsure: 1, bySkill: { 'COMPARE-NUMBERS-WITHIN-100': { right: 0, of: 1, unsure: 1 } } }]);
  });

  it('questions that are not a list: a warning, lesson-error no-questions, and the done screen', async () => {
    const logged = captureConsole();
    const host = fakeHost();
    const errors = listen('lesson-error');
    const el = check(host, { a1: cmp('a1', [3, 8]) } as unknown as NormalizedQuestion[]);
    await until(() => heading(el) === 'All done!', 'All done!');
    expect(errors).to.deep.equal([{ reason: 'no-questions' }]);
    expect(firstArgs(logged.warn)).to.deep.equal(['[chocabloc-lesson] questions is not a list:']);
  });

  it('a practice chunk that fails to load replaces "Getting your questions…" with the message', async () => {
    const logged = captureConsole();
    const { load } = practiceChunk;
    practiceChunk.load = () => Promise.reject(new Error('chunk 404'));
    try {
      const errors = listen('lesson-error');
      const el = check(fakeHost(), [cmp('a1', [3, 8])]);
      expect(heading(el)).to.equal('Getting your questions…');
      await until(() => errors.length === 1, 'lesson-error');
      expect(errors).to.deep.equal([{ reason: 'no-questions' }]);
      expect(heading(el)).to.equal("We couldn't get questions right now.");
      expect(firstArgs(logged.error)).to.deep.equal(['[chocabloc-lesson] could not load the practice code:']);
    } finally {
      practiceChunk.load = load;
    }
  });

  it('with zero questions: lesson-error no-questions, then the done screen with of 0', async () => {
    const host = fakeHost();
    const errors = listen('lesson-error');
    const done = listen('lesson-done');
    const el = check(host, []);
    await until(() => heading(el) === 'All done!', 'All done!');
    expect(errors).to.deep.equal([{ reason: 'no-questions' }]);
    expect(feedback(el)).to.equal("We couldn't get questions right now.");
    button(el, 'Play').click();
    expect(done).to.deep.equal([{ mode: 'check', right: 0, of: 0, unsure: 0, bySkill: {} }]);
  });

  it('with no validator: lesson-error no-validator and no question element', async () => {
    const host = fakeHost();
    const errors = listen('lesson-error');
    const el = check(host, [cmp('a1', [3, 8])], false);
    await until(() => heading(el) === 'All done!', 'All done!');
    expect(errors).to.deep.equal([{ reason: 'no-validator' }]);
    expect(feedback(el)).to.equal("Questions can't be checked here yet.");
    expect(root(el).querySelector('chocabloc-question') === null, 'no question element').to.equal(true);
  });

  it('shows each question id once, even when the host repeats one', async () => {
    const host = fakeHost();
    const answers = listen('lesson-answer');
    const el = check(host, [cmp('a1', [3, 8]), cmp('a1', [3, 8])]);
    await shown(el, 'a1');
    button(el, "I'm not sure yet").click();
    await until(() => heading(el) === 'All done!', 'All done!');
    expect(answers).to.have.length(1);
  });

  it('drops a row that fails to normalize, with a warning, and reports of honestly', async () => {
    const logged = captureConsole();
    const host = fakeHost();
    const done = listen('lesson-done');
    const el = check(host, [cmp('a1', [3, 8]), { id: 'bad' } as unknown as NormalizedQuestion]);
    await shown(el, 'a1');
    expect(logged.warn).to.have.length(1);
    expect(firstArgs(logged.warn)[0]).to.match(/^\[chocabloc-lesson\] skipped a question/);
    button(el, "I'm not sure yet").click();
    await until(() => heading(el) === 'All done!', 'All done!');
    button(el, 'Play').click();
    expect(done[0]).to.deep.include({ of: 1, unsure: 1 });
  });
});
