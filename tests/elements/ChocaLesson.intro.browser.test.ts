import { expect } from '@esm-bundle/chai';
import { ChocaLesson } from '../../src/lesson/index';
import type { Lesson, NormalizedQuestion } from '../../src/lesson/index';
import type { ValidationResult } from '../../src/types';
import { timing } from '../../src/lesson/dom/question-view';
import {
  anyButton,
  answerRows,
  button,
  cleanup,
  cmp,
  fakeHost,
  feedback,
  heading,
  holder,
  labels,
  listen,
  mount,
  part,
  parts,
  questionEl,
  questionId,
  choose,
  root,
  tick,
  until,
} from './lesson-test-utils';
import type { FakeHost } from './lesson-test-utils';

type Host = FakeHost;

let fixture: Lesson;
const advanceMs = timing.advanceMs;

before(async () => {
  const res = await fetch(new URL('../fixtures/lesson-compare-100.json', import.meta.url));
  fixture = (await res.json()) as Lesson;
  // The pause after "Yes!" is for kids; tests move on at once.
  timing.advanceMs = 0;
});

after(() => {
  timing.advanceMs = advanceMs;
});

afterEach(cleanup);

const five = (): NormalizedQuestion[] => [
  cmp('q1', [3, 8]),
  cmp('q2', [8, 3]),
  cmp('q3', [34, 99]),
  cmp('q4', [56, 56]),
  cmp('q5', [81, 18]),
];
const easy = (...ids: string[]): NormalizedQuestion[] =>
  ids.map((id, i) => cmp(id, [7 + i, 12], 'COMPARE-NUMBERS-WITHIN-20'));

function intro(host: Host, lesson: Lesson = fixture): ChocaLesson {
  const el = mount();
  el.getQuestions = host.getQuestions;
  el.validateAnswer = host.validateAnswer;
  el.mode = 'intro';
  el.lesson = lesson;
  return el;
}

const shown = (el: ChocaLesson, id: string) => until(() => questionId(el) === id, `question ${id} on screen`);

/** Picks "<" on question `id` and releases the host's reply. A right answer moves on by itself. */
async function answer(el: ChocaLesson, host: Host, id: string, verdict: ValidationResult): Promise<void> {
  await shown(el, id);
  choose(el, '<');
  host.last.reply.resolve(verdict);
  if (verdict.correct) {
    await until(() => questionId(el) !== id, `moved on from ${id}`);
  } else {
    await until(() => part(el, 'why') !== null, `why card for ${id}`);
    button(el, 'Got it').click();
  }
}

const right = (el: ChocaLesson, host: Host, id: string) => answer(el, host, id, { correct: true });
const wrong = (el: ChocaLesson, host: Host, id: string) => answer(el, host, id, { correct: false, expected: '>' });

async function walk(el: ChocaLesson, steps: { heading: string }[]): Promise<void> {
  await until(() => heading(el) === steps[0]!.heading, `"${steps[0]!.heading}"`);
  for (const s of steps) {
    expect(heading(el)).to.equal(s.heading);
    expect(questionEl(el) === null, 'no question element').to.equal(true);
    button(el, 'Next').click();
  }
}

async function finish(el: ChocaLesson, text: string): Promise<void> {
  await until(() => heading(el) === text, `done screen "${text}"`);
  button(el, 'Play').click();
}

describe('<chocabloc-lesson> Intro', () => {
  it('pass path: asks for 5, runs 2 quick-check and 3 your-turn questions, and passes with 2 right', async () => {
    const qs = five();
    const host = fakeHost([qs]);
    const answers = listen('lesson-answer');
    const done = listen('lesson-done');
    const el = intro(host);
    expect(heading(el)).to.equal('Meet the signs');
    await until(() => host.calls.length === 1, 'the first getQuestions call');
    expect(host.calls[0]).to.deep.equal(['COMPARE-NUMBERS-WITHIN-100', 5, []]);

    button(el, 'Next').click();
    await shown(el, 'q1');
    expect(heading(el)).to.equal('Quick check');
    expect(labels(el)).to.include("I'm not sure yet");
    await right(el, host, 'q1');
    await wrong(el, host, 'q2');
    await walk(el, fixture.example.steps);
    await shown(el, 'q3');
    expect(heading(el)).to.equal('Your turn');
    await right(el, host, 'q3');
    await wrong(el, host, 'q4');
    await right(el, host, 'q5');
    await finish(el, "You're ready!");

    expect(host.calls).to.have.length(1);
    expect(answerRows(answers)).to.deep.equal([
      ['quickCheck', 'q1', '<', 'right'],
      ['quickCheck', 'q2', '<', 'wrong'],
      ['yourTurn', 'q3', '<', 'right'],
      ['yourTurn', 'q4', '<', 'wrong'],
      ['yourTurn', 'q5', '<', 'right'],
    ]);
    expect(answers.every((a) => a.skillId === 'COMPARE-NUMBERS-WITHIN-100')).to.equal(true);
    // The host gets back the very question it gave.
    expect(answers[0]!.question === qs[0]).to.equal(true);
    expect(done).to.deep.equal([
      {
        mode: 'intro',
        skillId: 'COMPARE-NUMBERS-WITHIN-100',
        outcome: 'passed',
        startSkillId: 'COMPARE-NUMBERS-WITHIN-100',
        quickCheck: { right: 1, of: 2, unsure: 0 },
        yourTurn: { right: 2, of: 3, unsure: 0 },
      },
    ]);
  });

  it('fail path: more examples, then Try again on the easier skill without the 5 shown ids; 2 of 3 is passedEasier', async () => {
    const host = fakeHost([five(), easy('e1', 'e2', 'e3')]);
    const answers = listen('lesson-answer');
    const done = listen('lesson-done');
    const el = intro(host);
    button(el, 'Next').click();
    await right(el, host, 'q1');
    await right(el, host, 'q2');
    await walk(el, fixture.example.steps);
    await right(el, host, 'q3');
    await wrong(el, host, 'q4');
    await wrong(el, host, 'q5');

    const more = fixture.moreHelp.examples[0]!.steps;
    await until(() => heading(el) === more[0]!.heading, 'more examples');
    // Fetched when "more examples" starts.
    expect(host.calls[1]).to.deep.equal(['COMPARE-NUMBERS-WITHIN-20', 3, ['q1', 'q2', 'q3', 'q4', 'q5']]);
    expect(part(el, 'chip')?.parentElement?.textContent).to.include('More examples');
    await walk(el, more);
    await shown(el, 'e1');
    expect(heading(el)).to.equal('Try again');
    await right(el, host, 'e1');
    await wrong(el, host, 'e2');
    await right(el, host, 'e3');
    await finish(el, "Nice work! We'll start with numbers up to 20…");

    expect(answers).to.have.length(8);
    expect(answerRows(answers).slice(5)).to.deep.equal([
      ['tryAgain', 'e1', '<', 'right'],
      ['tryAgain', 'e2', '<', 'wrong'],
      ['tryAgain', 'e3', '<', 'right'],
    ]);
    expect(answers.slice(5).every((a) => a.skillId === 'COMPARE-NUMBERS-WITHIN-20')).to.equal(true);
    expect(done).to.have.length(1);
    expect(done[0]).to.deep.include({
      outcome: 'passedEasier',
      startSkillId: 'COMPARE-NUMBERS-WITHIN-20',
      yourTurn: { right: 1, of: 3, unsure: 0 },
      tryAgain: { right: 2, of: 3, unsure: 0 },
    });
  });

  it('a repeat in the Try again batch is dropped, so the step is short and the run is incomplete at tryAgain', async () => {
    const host = fakeHost([five(), [cmp('q3', [34, 99], 'COMPARE-NUMBERS-WITHIN-20'), ...easy('e1', 'e2')]]);
    const answers = listen('lesson-answer');
    const done = listen('lesson-done');
    const el = intro(host);
    button(el, 'Next').click();
    await right(el, host, 'q1');
    await right(el, host, 'q2');
    await walk(el, fixture.example.steps);
    await wrong(el, host, 'q3');
    await wrong(el, host, 'q4');
    await wrong(el, host, 'q5');
    await walk(el, fixture.moreHelp.examples[0]!.steps);
    await finish(el, "Let's play!");
    expect(answers).to.have.length(5);
    expect(done[0]).to.deep.include({
      outcome: 'incomplete',
      incompleteStep: 'tryAgain',
      startSkillId: 'COMPARE-NUMBERS-WITHIN-20',
      tryAgain: { right: 0, of: 0, unsure: 0 },
    });
  });

  it('a short first batch of 2 shows no questions and ends incomplete at yourTurn; a second Play tap sends nothing', async () => {
    const host = fakeHost([five().slice(0, 2)]);
    const answers = listen('lesson-answer');
    const done = listen('lesson-done');
    const el = intro(host);
    await until(() => host.calls.length === 1, 'getQuestions');
    button(el, 'Next').click();
    await walk(el, fixture.example.steps);
    await until(() => heading(el) === "Let's play!", 'done screen');
    const play = button(el, 'Play');
    play.click();
    play.click();
    expect(answers).to.deep.equal([]);
    expect(done).to.deep.equal([
      {
        mode: 'intro',
        skillId: 'COMPARE-NUMBERS-WITHIN-100',
        outcome: 'incomplete',
        incompleteStep: 'yourTurn',
        startSkillId: null,
        quickCheck: { right: 0, of: 0, unsure: 0 },
        yourTurn: { right: 0, of: 0, unsure: 0 },
      },
    ]);
  });

  it('getQuestions rejecting sends lesson-error no-questions, says so, and still reaches the done screen', async () => {
    const host = fakeHost([new Error('network down')]);
    const errors = listen('lesson-error');
    const done = listen('lesson-done');
    const el = intro(host);
    await until(() => errors.length === 1, 'lesson-error');
    expect(errors).to.deep.equal([{ reason: 'no-questions' }]);
    button(el, 'Next').click();
    await until(() => heading(el) === fixture.example.steps[0]!.heading, 'the worked example');
    expect(feedback(el)).to.equal("We couldn't get questions right now.");
    await walk(el, fixture.example.steps);
    await finish(el, "Let's play!");
    expect(questionEl(el) === null, 'no question element').to.equal(true);
    expect(done[0]).to.deep.include({ outcome: 'incomplete', incompleteStep: 'yourTurn', startSkillId: null });
  });

  describe('the why card', () => {
    async function wrongFirst(q: NormalizedQuestion, verdict: ValidationResult): Promise<ChocaLesson> {
      const host = fakeHost([[q, ...five().slice(1)]]);
      const el = intro(host);
      button(el, 'Next').click();
      await shown(el, q.id);
      choose(el, '<');
      host.last.reply.resolve(verdict);
      await until(() => part(el, 'why') !== null, 'the why card');
      return el;
    }

    it('with expected 0: the picture of the question, the tip and "The answer is 0."', async () => {
      const el = await wrongFirst(cmp('w1', [34, 99]), { correct: false, expected: 0 });
      const why = part(el, 'why')!;
      expect(why.textContent).to.include(fixture.afterWrong.tip).and.include('The answer is 0.');
      expect(why.querySelectorAll('canvas')).to.have.length(2);
      expect(parts(el, 'caption').map((c) => c.textContent)).to.deep.equal(['3 tens and 4 ones', '9 tens and 9 ones']);
      expect(labels(el)).to.include('Got it').and.not.include("I'm not sure yet");
      expect(root(el).activeElement?.getAttribute('part')).to.equal('why');
    });

    it('with expected null: the picture and the tip only', async () => {
      const el = await wrongFirst(cmp('w2', [34, 99]), { correct: false, expected: null as unknown as string });
      const why = part(el, 'why')!;
      expect(why.textContent).to.include(fixture.afterWrong.tip).and.not.include('The answer is');
      expect(why.querySelectorAll('canvas')).to.have.length(2);
    });

    it('for a question with no operands: the tip only', async () => {
      const el = await wrongFirst(cmp('w3', null), { correct: false, expected: '<' });
      const why = part(el, 'why')!;
      expect(why.textContent).to.include(fixture.afterWrong.tip).and.include('The answer is <.');
      expect(why.querySelector('[part~="picture"]') === null, 'no picture').to.equal(true);
    });

    it('also follows "I\'m not sure yet", without calling the validator', async () => {
      const host = fakeHost([five()]);
      const answers = listen('lesson-answer');
      const el = intro(host);
      button(el, 'Next').click();
      await shown(el, 'q1');
      button(el, "I'm not sure yet").click();
      await until(() => part(el, 'why') !== null, 'the why card');
      expect(host.checks).to.have.length(0);
      expect(part(el, 'why')!.textContent).to.not.include('The answer is');
      expect(answerRows(answers)).to.deep.equal([['quickCheck', 'q1', null, 'unsure']]);
    });
  });

  describe('one answer per question', () => {
    async function onFirst(): Promise<{ el: ChocaLesson; host: Host; answers: Record<string, unknown>[] }> {
      const host = fakeHost([five()]);
      const answers = listen('lesson-answer');
      const el = intro(host);
      button(el, 'Next').click();
      await shown(el, 'q1');
      return { el, host, answers };
    }

    it('two fast taps on different choices send one check and one lesson-answer', async () => {
      const { el, host, answers } = await onFirst();
      choose(el, '<');
      choose(el, '>');
      expect(host.checks).to.have.length(1);
      expect(host.checks[0]!.answer).to.equal('<');
      host.last.reply.resolve({ correct: true });
      await until(() => questionId(el) === 'q2', 'the next question');
      await tick();
      expect(host.checks).to.have.length(1);
      expect(answerRows(answers)).to.deep.equal([['quickCheck', 'q1', '<', 'right']]);
    });

    it('while checking, Unsure is disabled and the choices are inert; the outcome is the tap\'s', async () => {
      const { el, host, answers } = await onFirst();
      choose(el, '<');
      const unsure = button(el, "I'm not sure yet");
      expect(unsure.disabled).to.equal(true);
      expect(questionEl(el)!.hasAttribute('inert')).to.equal(true);
      unsure.click();
      host.last.reply.resolve({ correct: false, expected: '>' });
      await until(() => part(el, 'why') !== null, 'the why card');
      expect(answerRows(answers)).to.deep.equal([['quickCheck', 'q1', '<', 'wrong']]);
    });

    it('a reply after Close fires nothing', async () => {
      const { el, host, answers } = await onFirst();
      const done = listen('lesson-done');
      const closed = listen('lesson-close');
      choose(el, '<');
      part(el, 'close')!.click();
      expect(closed).to.deep.equal([{ step: 'quickCheck' }]);
      host.last.reply.resolve({ correct: false, expected: '>' });
      await tick();
      await tick();
      expect(answers).to.deep.equal([]);
      expect(done).to.deep.equal([]);
      expect(part(el, 'why') === null, 'no why card').to.equal(true);
      expect(host.calls).to.have.length(1);
    });

    it('a reply after the lesson is set again fires nothing, and the new run starts at the idea', async () => {
      const { el, host, answers } = await onFirst();
      choose(el, '<');
      el.lesson = { ...fixture, title: 'Again' };
      expect(heading(el)).to.equal('Meet the signs');
      host.checks[0]!.reply.resolve({ correct: true });
      await tick();
      await tick();
      expect(answers).to.deep.equal([]);
      expect(heading(el)).to.equal('Meet the signs');
      expect(feedback(el)).to.equal('');
    });

    it('a reply after removal fires nothing', async () => {
      const { el, host, answers } = await onFirst();
      const errors = listen('lesson-error');
      choose(el, '<');
      el.remove();
      host.last.reply.reject(new Error('late'));
      await tick();
      await tick();
      expect(answers).to.deep.equal([]);
      expect(errors).to.deep.equal([]);
    });

    it('lost reply: the first answer is kept, and Check again resends it with the same token', async () => {
      const { el, host, answers } = await onFirst();
      const errors = listen('lesson-error');
      choose(el, '<');
      host.last.reply.reject(new Error('reply lost'));
      await until(() => errors.length === 1, 'validation-unavailable');
      expect(errors).to.deep.equal([{ reason: 'validation-unavailable' }]);
      expect(feedback(el)).to.equal("Couldn't check that one.");
      expect(questionEl(el)!.hasAttribute('inert')).to.equal(true);
      const unsure = button(el, "I'm not sure yet");
      expect(unsure.disabled).to.equal(true);
      unsure.click();
      choose(el, '>');
      expect(host.checks).to.have.length(1);
      expect(answers).to.deep.equal([]);

      button(el, 'Check again').click();
      expect(host.checks).to.have.length(2);
      const [first, again] = host.checks;
      expect(again!.answer).to.equal('<');
      expect(again!.question === first!.question).to.equal(true);
      expect((again!.question as { answerToken?: string }).answerToken).to.equal('token-q1');
      again!.reply.resolve({ correct: true });
      await until(() => answers.length === 1, 'lesson-answer');
      expect(answerRows(answers)).to.deep.equal([['quickCheck', 'q1', '<', 'right']]);
      await until(() => questionId(el) === 'q2', 'the next question');
      expect(answers).to.have.length(1);
    });

    it('a second failed check reports again and keeps Check again', async () => {
      const { el, host } = await onFirst();
      const errors = listen('lesson-error');
      choose(el, '<');
      host.last.reply.reject(new Error('lost'));
      await until(() => errors.length === 1, 'first failure');
      button(el, 'Check again').click();
      expect(anyButton(el, 'Check again')!.hidden).to.equal(true);
      host.last.reply.reject(new Error('lost again'));
      await until(() => errors.length === 2, 'second failure');
      expect(button(el, 'Check again').hidden).to.equal(false);
      expect(host.checks.map((c) => c.answer)).to.deep.equal(['<', '<']);
    });
  });

  it('with no validator: lesson-error no-validator, no question element and no getQuestions call', async () => {
    const host = fakeHost([five()]);
    const errors = listen('lesson-error');
    const done = listen('lesson-done');
    const el = mount();
    el.getQuestions = host.getQuestions;
    el.mode = 'intro';
    el.lesson = fixture;
    await until(() => errors.length === 1, 'lesson-error');
    expect(errors).to.deep.equal([{ reason: 'no-validator' }]);
    button(el, 'Next').click();
    await until(() => heading(el) === fixture.example.steps[0]!.heading, 'the worked example');
    expect(feedback(el)).to.equal("Questions can't be checked here yet.");
    await walk(el, fixture.example.steps);
    await finish(el, "Let's play!");
    expect(root(el).querySelector('chocabloc-question') === null, 'no question element').to.equal(true);
    expect(host.calls).to.deep.equal([]);
    expect(done[0]).to.deep.include({ outcome: 'incomplete', startSkillId: null });
  });

  it('says "Getting your questions…" when Next comes before the practice code has loaded', async () => {
    const host = fakeHost([five()]);
    const el = intro(host);
    expect(heading(el)).to.equal('Meet the signs');
    expect(Array.from(part(el, 'chips')!.children).map((c) => c.textContent)).to.deep.equal([
      'Idea',
      'Quick check',
      'Watch',
      'Your turn',
    ]);
    button(el, 'Next').click();
    expect(heading(el)).to.equal('Getting your questions…');
    await shown(el, 'q1');
    expect(customElements.get('chocabloc-question')).to.not.equal(undefined);
  });

  it('takes properties a host set before the element was defined, and fetches once', async () => {
    const host = fakeHost([five()]);
    const tag = 'chocabloc-lesson-late-intro';
    const el = document.createElement(tag) as ChocaLesson;
    el.getQuestions = host.getQuestions;
    el.validateAnswer = host.validateAnswer;
    el.translator = (k) => (k === 'next' ? 'Suivant' : undefined);
    el.mode = 'intro';
    el.lesson = fixture;
    holder().appendChild(el);
    customElements.define(tag, class extends ChocaLesson {});
    expect(heading(el)).to.equal('Meet the signs');
    expect(labels(el)).to.include('Suivant');
    await until(() => host.calls.length === 1, 'getQuestions');
    button(el, 'Suivant').click();
    await shown(el, 'q1');
    expect(host.calls).to.have.length(1);
  });

  it('is hidden by the hidden attribute', () => {
    const el = intro(fakeHost([five()]));
    el.hidden = true;
    expect(getComputedStyle(el).display).to.equal('none');
  });
});
