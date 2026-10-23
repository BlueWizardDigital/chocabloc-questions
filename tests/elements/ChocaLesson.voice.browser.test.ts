import { expect } from '@esm-bundle/chai';
import '../../src/lesson/index';
import type { ChocaLesson, Lesson } from '../../src/lesson/index';
import { timing } from '../../src/lesson/dom/question-view';
import { anyButton, button, choose, cleanup, cmp, fakeHost, heading, mount, part, questionId, until } from './lesson-test-utils';

let fixture: Lesson;
const advanceMs = timing.advanceMs;

before(async () => {
  const res = await fetch(new URL('../fixtures/lesson-compare-100.json', import.meta.url));
  fixture = (await res.json()) as Lesson;
  timing.advanceMs = 0;
});

after(() => {
  timing.advanceMs = advanceMs;
});

const restore: (() => void)[] = [];
afterEach(() => {
  restore.splice(0).reverse().forEach((fn) => fn());
  cleanup();
});

/**
 * Replaces window.speechSynthesis (or removes it) and logs every cancel and speak, in order. `tapped`
 * is what navigator.userActivation says: false is a page nobody has touched yet.
 */
function stubSpeech(present = true, tapped = true): { log: string[]; spoken: string[]; cancels(): number } {
  const log: string[] = [];
  const spoken: string[] = [];
  const synth = {
    speak(u: SpeechSynthesisUtterance) {
      log.push('speak');
      spoken.push(u.text);
    },
    cancel() {
      log.push('cancel');
    },
  };
  const own = Object.getOwnPropertyDescriptor(window, 'speechSynthesis');
  Object.defineProperty(window, 'speechSynthesis', { configurable: true, get: () => (present ? synth : undefined) });
  restore.push(() => {
    if (own) Object.defineProperty(window, 'speechSynthesis', own);
    else Reflect.deleteProperty(window, 'speechSynthesis');
  });
  const ua = Object.getOwnPropertyDescriptor(navigator, 'userActivation');
  Object.defineProperty(navigator, 'userActivation', { configurable: true, get: () => ({ hasBeenActive: tapped }) });
  restore.push(() => {
    if (ua) Object.defineProperty(navigator, 'userActivation', ua);
    else Reflect.deleteProperty(navigator, 'userActivation');
  });
  return { log, spoken, cancels: () => log.filter((l) => l === 'cancel').length };
}

function help(grade: string | null): ChocaLesson {
  const el = mount();
  el.grade = grade;
  el.mode = 'help';
  el.lesson = fixture;
  return el;
}

function intro(grade: string, host = fakeHost([[cmp('q1', [3, 8]), cmp('q2', [8, 3]), cmp('q3', [34, 99]), cmp('q4', [5, 6]), cmp('q5', [7, 2])]])): ChocaLesson {
  const el = mount();
  el.grade = grade;
  el.getQuestions = host.getQuestions;
  el.validateAnswer = host.validateAnswer;
  el.mode = 'intro';
  el.lesson = fixture;
  return el;
}

describe('<chocabloc-lesson> voice for young kids', () => {
  it('young Help speaks each screen as it appears', () => {
    const s = stubSpeech();
    const el = help('K');
    expect(s.spoken).to.have.length(1);
    expect(s.spoken[0]).to.include(fixture.idea.heading);
    button(el, 'Next').click();
    expect(s.spoken).to.have.length(2);
    expect(s.spoken[1]).to.include(fixture.example.steps[0]!.heading);
  });

  it('standard Help speaks nothing until Read to me is tapped', () => {
    const s = stubSpeech();
    const el = help('5');
    button(el, 'Next').click();
    expect(s.spoken).to.have.length(0);
    button(el, 'Read to me').click();
    expect(s.spoken).to.have.length(1);
  });

  it('with no grade, the lesson skillGrade decides', () => {
    const s = stubSpeech();
    help(null);
    expect(s.spoken).to.have.length(1);
  });

  it('fast Next taps cancel before each speak and speak once per screen', () => {
    const s = stubSpeech();
    const el = help('K');
    let screens = 1;
    for (let i = 0; i < 5 && anyButton(el, 'Next') && !anyButton(el, 'Next')!.hidden; i++) {
      button(el, 'Next').click();
      screens++;
    }
    expect(screens).to.be.greaterThan(3);
    expect(s.spoken).to.have.length(screens);
    // Every speak is directly preceded by a cancel, and no two speaks are side by side.
    s.log.forEach((entry, i) => {
      if (entry === 'speak') expect(s.log[i - 1]).to.equal('cancel');
    });
  });

  it('young Intro speaks each question as it appears, "Yes!" on a right answer, and the why card on a wrong one', async () => {
    const s = stubSpeech();
    const host = fakeHost([[cmp('q1', [3, 8]), cmp('q2', [8, 3]), cmp('q3', [34, 99]), cmp('q4', [5, 6]), cmp('q5', [7, 2])]]);
    const el = intro('K', host);
    button(el, 'Next').click();
    await until(() => questionId(el) === 'q1', 'question q1');
    expect(s.spoken[s.spoken.length - 1]).to.include('Which sign goes in the box');
    choose(el, '<');
    host.last.reply.resolve({ correct: true });
    await until(() => s.spoken.includes('Yes!'), '"Yes!" spoken');
    await until(() => questionId(el) === 'q2', 'question q2');
    expect(s.spoken[s.spoken.length - 1]).to.include('Which sign goes in the box');
    choose(el, '<');
    host.last.reply.resolve({ correct: false, expected: '>' });
    await until(() => part(el, 'why') !== null, 'the why card');
    expect(s.spoken[s.spoken.length - 1]).to.include(fixture.afterWrong.tip.replace(/\.$/, ''));
  });

  it('a standard Intro stays silent', async () => {
    const s = stubSpeech();
    const host = fakeHost([[cmp('q1', [3, 8]), cmp('q2', [8, 3]), cmp('q3', [34, 99]), cmp('q4', [5, 6]), cmp('q5', [7, 2])]]);
    const el = intro('5', host);
    button(el, 'Next').click();
    await until(() => questionId(el) === 'q1', 'question q1');
    choose(el, '<');
    host.last.reply.resolve({ correct: true });
    await until(() => questionId(el) === 'q2', 'question q2');
    expect(s.spoken).to.have.length(0);
  });

  it('with nothing tapped yet, the first screen shows Tap to hear and is silent; the tap speaks it, then every screen speaks', () => {
    const s = stubSpeech(true, false);
    const el = help('K');
    expect(s.spoken).to.have.length(0);
    expect(part(el, 'tap-to-hear')).to.not.equal(null);
    button(el, 'Tap to hear').click();
    expect(s.spoken).to.have.length(1);
    expect(s.spoken[0]).to.include(fixture.idea.heading);
    expect(anyButton(el, 'Tap to hear')).to.equal(undefined);
    button(el, 'Next').click();
    expect(s.spoken).to.have.length(2);
    expect(anyButton(el, 'Tap to hear')).to.equal(undefined);
  });

  it('a standard kid never sees Tap to hear', () => {
    stubSpeech(true, false);
    const el = help('5');
    expect(anyButton(el, 'Tap to hear')).to.equal(undefined);
  });

  it('without speechSynthesis nothing throws, the words show, and there is no Tap to hear', () => {
    stubSpeech(false, false);
    const el = help('K');
    expect(heading(el)).to.equal(fixture.idea.heading);
    expect(anyButton(el, 'Tap to hear')).to.equal(undefined);
    expect(anyButton(el, 'Read to me')).to.equal(undefined);
    button(el, 'Next').click();
    expect(heading(el)).to.equal(fixture.example.steps[0]!.heading);
  });

  describe('words and voice match the picture', () => {
    const counting = (): Lesson =>
      ({
        ...fixture,
        example: {
          ...fixture.example,
          steps: [
            { heading: 'Count them', text: 'Count the animals.', picture: { kind: 'count', groups: [3, 2] }, young: '{a} 3. {b} 2.' },
            ...fixture.example.steps.slice(1),
          ],
        },
      }) as Lesson;
    const BASE = new URL('../fixtures/animals/', import.meta.url).pathname;
    const open = async (base: string | null): Promise<ChocaLesson> => {
      const el = mount();
      el.grade = 'K';
      el.pictureBase = base;
      el.mode = 'help';
      el.lesson = counting();
      await until(() => el.shadowRoot!.querySelectorAll('style').length === 2, 'the young chunk');
      button(el, 'Next').click();
      return el;
    };

    it('with animals drawn, the young line is shown and spoken', async () => {
      const s = stubSpeech();
      const el = await open(BASE);
      expect(heading(el)).to.not.equal('Count them');
      expect(s.spoken[s.spoken.length - 1]).to.include(heading(el)!.replace(/\.$/, ''));
    });

    it('when an image fails and the words swap back, the normal words are spoken again', async () => {
      const s = stubSpeech();
      const el = await open('/no-such-folder/');
      await until(() => el.shadowRoot!.querySelectorAll('[part~="picture"] img').length === 0, 'the picture to fall back to blocks');
      expect(heading(el)).to.equal('Count them');
      await until(() => s.spoken[s.spoken.length - 1]!.includes('Count the animals'), 'the normal words spoken');
      expect(s.log[s.log.length - 2]).to.equal('cancel');
    });

    it('with no pictureBase the normal words are shown and spoken', async () => {
      const s = stubSpeech();
      const el = await open(null);
      expect(heading(el)).to.equal('Count them');
      expect(s.spoken[s.spoken.length - 1]).to.include('Count them');
      expect(s.spoken[s.spoken.length - 1]).to.include('Count the animals');
    });
  });

  it('after Tap to hear, focus moves to the heading, not the body', () => {
    stubSpeech(true, false);
    const el = help('K');
    const tap = button(el, 'Tap to hear');
    tap.focus();
    expect(el.shadowRoot!.activeElement).to.equal(tap);
    tap.click();
    expect(el.shadowRoot!.activeElement?.getAttribute('part')).to.equal('heading');
  });

  describe('Check, at real speed', () => {
    const check = (host: ReturnType<typeof fakeHost>): ChocaLesson => {
      const el = mount();
      el.grade = 'K';
      el.mode = 'check';
      el.questions = [cmp('c1', [3, 8]), cmp('c2', [8, 3])];
      el.validateAnswer = host.validateAnswer;
      return el;
    };
    const real = timing.advanceMs;
    beforeEach(() => {
      timing.advanceMs = 900;
    });
    afterEach(() => {
      timing.advanceMs = 0;
      void real;
    });

    it('a right answer says "Yes!" before the next question; nothing is cut off', async () => {
      const s = stubSpeech();
      const host = fakeHost();
      const el = check(host);
      await until(() => questionId(el) === 'c1', 'c1');
      choose(el, '<');
      host.last.reply.resolve({ correct: true });
      await until(() => questionId(el) === 'c2', 'c2', 3000);
      expect(s.spoken.filter((t) => !t.startsWith('Getting')).map((t) => (t.startsWith('Which') ? 'question' : t))).to.deep.equal(['question', 'Yes!', 'question']);
    });

    it('a wrong answer voices no thanks (it would be cut off), then the next question', async () => {
      const s = stubSpeech();
      const host = fakeHost();
      const el = check(host);
      await until(() => questionId(el) === 'c1', 'c1');
      choose(el, '<');
      host.last.reply.resolve({ correct: false });
      await until(() => questionId(el) === 'c2', 'c2', 3000);
      expect(s.spoken.filter((t) => !t.startsWith('Getting')).map((t) => (t.startsWith('Which') ? 'question' : t))).to.deep.equal(['question', 'question']);
      expect(s.spoken.join(' ')).to.not.include('Thanks');
    });
  });

  it('close and removal cancel speech', () => {
    const s = stubSpeech();
    const el = help('K');
    const before = s.cancels();
    part(el, 'close')!.click();
    expect(s.cancels()).to.be.greaterThan(before);
    const el2 = help('K');
    const before2 = s.cancels();
    el2.remove();
    expect(s.cancels()).to.be.greaterThan(before2);
  });
});

