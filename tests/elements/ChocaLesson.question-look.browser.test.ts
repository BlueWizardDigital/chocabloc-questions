import { expect } from '@esm-bundle/chai';
import '../../src/lesson/index';
import type { ChocaLesson, NormalizedQuestion } from '../../src/lesson/index';
import { timing } from '../../src/lesson/dom/question-view';
import { choose, cleanup, cmp, fakeHost, holder, mount, questionEl, until } from './lesson-test-utils';

const advanceMs = timing.advanceMs;
before(() => {
  timing.advanceMs = 0;
});
after(() => {
  timing.advanceMs = advanceMs;
});
afterEach(cleanup);

/** A four-choice question that <chocabloc-question> draws with its canvas renderer. */
function four(id: string): NormalizedQuestion {
  return {
    id,
    format: 'multiplication',
    skillIds: ['MULT-FACTS-0-5'],
    questionText: 'What is 0 + 0?',
    content: { operands: [0, 0], operation: 'addition' },
    choices: [{ value: 0 }, { value: 10 }, { value: 100 }, { value: 1000 }],
    difficulty: 'easy',
    answerToken: `token-${id}`,
  } as unknown as NormalizedQuestion;
}

async function open(grade: string, q: NormalizedQuestion, width?: number): Promise<ChocaLesson> {
  const el = mount();
  if (width) (el.parentElement as HTMLElement).style.width = `${width}px`;
  el.grade = grade;
  el.questions = [q];
  el.validateAnswer = fakeHost().validateAnswer;
  el.mode = 'check';
  await until(() => (questionEl(el)?.shadowRoot?.querySelector('choca-canvas-question, choca-choice-pad') ?? null) !== null, 'the question');
  const inner = questionEl(el)!.shadowRoot!.querySelector('choca-canvas-question');
  if (inner) await until(() => !!inner.shadowRoot?.querySelector('choca-choice-pad')?.shadowRoot?.querySelector('button'), 'the choices');
  else await until(() => !!questionEl(el)!.shadowRoot!.querySelector('choca-choice-pad')?.shadowRoot?.querySelector('button'), 'the choices');
  return el;
}

const deep = (el: ChocaLesson, sel: string): HTMLElement => {
  const q = questionEl(el)!.shadowRoot!;
  const inner = q.querySelector('choca-canvas-question');
  const scope = inner?.shadowRoot ?? q;
  const found = scope.querySelector(sel) as HTMLElement | null;
  if (!found) throw new Error(`no ${sel}`);
  return found;
};
const choices = (el: ChocaLesson): HTMLButtonElement[] => {
  const pad = deep(el, 'choca-choice-pad');
  return Array.from(pad.shadowRoot!.querySelectorAll<HTMLButtonElement>('button'));
};
const css = (n: Element) => getComputedStyle(n);

for (const [name, grade] of [['K-3', 'K'], ['grade 4+', '5']] as const) {
  describe(`lesson question look (${name})`, () => {
    it('draws the equation big, bold and centred', async () => {
      const el = await open(grade, four('p1'));
      const p = css(deep(el, '[part="prompt"]'));
      expect(parseFloat(p.fontSize)).to.be.at.least(28);
      expect(p.fontWeight).to.equal('700');
      expect(p.textAlign).to.equal('center');
    });

    it('draws the choices like the lesson buttons', async () => {
      const el = await open(grade, four('p2'));
      const lessonBg = css(el.shadowRoot!.querySelector('[part~="panel"]')!).backgroundColor;
      const b = choices(el)[0]!;
      const s = css(b);
      expect(s.backgroundColor).to.equal(lessonBg);
      expect(s.borderTopWidth).to.equal('3px');
      expect(s.borderTopColor).to.equal('rgb(43, 33, 24)');
      expect(s.fontWeight).to.equal('700');
      expect(parseFloat(s.fontSize)).to.equal(22);
      expect(b.getBoundingClientRect().height).to.be.at.least(48);
      expect(s.borderRadius).to.equal('16px');
    });

    it('centres the row and tells the picked choice apart', async () => {
      const el = await open(grade, four('p3'));
      expect(css(choices(el)[0]!.parentElement!).justifyContent).to.equal('center');
      const before = css(choices(el)[1]!).backgroundColor;
      choose(el, '10');
      const picked = choices(el).find((c) => c.getAttribute('aria-checked') === 'true')!;
      expect(css(picked).backgroundColor).to.not.equal(before);
    });

    it('wraps four choices at 320px with no sideways scroll', async () => {
      const el = await open(grade, four('p4'), 320);
      const panel = el.shadowRoot!.querySelector('[part~="panel"]') as HTMLElement;
      expect(panel.scrollWidth).to.be.at.most(panel.clientWidth);
      expect(document.documentElement.scrollWidth).to.be.at.most(document.documentElement.clientWidth);
      const pad = choices(el)[0]!.parentElement!;
      expect(pad.scrollWidth).to.be.at.most(pad.clientWidth);
      for (const c of choices(el)) expect(c.getBoundingClientRect().right).to.be.at.most(panel.getBoundingClientRect().right);
    });

    it('beats a host page that sets --cq-* for its games', async () => {
      document.documentElement.style.setProperty('--cq-choice-bg', 'rgb(1, 2, 3)');
      document.documentElement.style.setProperty('--cq-prompt-size', '10px');
      try {
        const el = await open(grade, four('p5'));
        expect(css(choices(el)[0]!).backgroundColor).to.not.equal('rgb(1, 2, 3)');
        expect(parseFloat(css(deep(el, '[part="prompt"]')).fontSize)).to.be.at.least(28);
      } finally {
        document.documentElement.style.removeProperty('--cq-choice-bg');
        document.documentElement.style.removeProperty('--cq-prompt-size');
      }
    });
  });
}

describe('<chocabloc-question> outside a lesson', () => {
  it('keeps the library default look', async () => {
    const q = document.createElement('chocabloc-question') as HTMLElement & { question: NormalizedQuestion; validateAnswer: unknown };
    holder().appendChild(q);
    q.validateAnswer = () => Promise.resolve({ correct: true });
    q.question = cmp('d1', [3, 8]);
    await until(() => !!q.shadowRoot!.querySelector('choca-canvas-question')?.shadowRoot?.querySelector('choca-choice-pad')?.shadowRoot?.querySelector('button'), 'choices');
    const inner = q.shadowRoot!.querySelector('choca-canvas-question')!;
    const pad = inner.shadowRoot!.querySelector('choca-choice-pad')!;
    const b = pad.shadowRoot!.querySelector('button')!;
    const s = css(b);
    expect(s.backgroundColor).to.equal('rgb(240, 240, 240)');
    expect(s.borderTopWidth).to.equal('1px');
    expect(s.borderRadius).to.equal('8px');
    expect(css(b.parentElement!).justifyContent).to.equal('normal');
    const p = css(inner.shadowRoot!.querySelector('[part="prompt"]')!);
    expect(p.fontSize).to.equal('16px');
    expect(p.fontWeight).to.equal('600');
    expect(p.textAlign).to.equal('start');
    // picking one changes nothing about how it looks
    b.click();
    const picked = pad.shadowRoot!.querySelector('button[aria-checked="true"]')!;
    expect(css(picked).backgroundColor).to.equal('rgb(240, 240, 240)');
    expect(css(picked).borderTopWidth).to.equal('1px');
  });
});
