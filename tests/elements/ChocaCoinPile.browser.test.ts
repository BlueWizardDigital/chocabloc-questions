import { expect } from '@esm-bundle/chai';
import '../../src/elements/ChocaCoinPile';
import '../../src/elements/ChocaChoicePad';

function mount(html: string): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.innerHTML = html;
  document.body.appendChild(wrapper);
  return wrapper.firstElementChild as HTMLElement;
}

function setQuestion(el: HTMLElement, q: unknown): Promise<void> {
  (el as HTMLElement & { question: unknown }).question = q;
  return new Promise((r) => requestAnimationFrame(r));
}

const moneyQ = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: 'X',
  skillIds: ['MONEY-COIN-VALUE-USD'],
  format: 'money',
  imageType: 'coins',
  content: { coins: { quarter: 1 }, currency: 'USD' },
  answer: 25,
  distractors: [{ value: 20, errorType: 'off-by-nickel' }],
  ...overrides,
});

afterEach(() => {
  document.body.innerHTML = '';
});

describe('<choca-coin-pile> M1 subset', () => {
  it('registers', () => {
    expect(customElements.get('choca-coin-pile')).to.not.be.undefined;
  });

  it('renders one coin element per coin count', async () => {
    const el = mount(`<choca-coin-pile answer-mode="mc" seed="42"></choca-coin-pile>`);
    await setQuestion(el, moneyQ({ content: { coins: { penny: 2, quarter: 1 }, currency: 'USD' }, answer: 27 }));
    const coins = el.shadowRoot!.querySelectorAll('[part~="coin"]');
    expect(coins.length).to.equal(3);
  });

  it('exposes container + canvas parts', async () => {
    const el = mount(`<choca-coin-pile answer-mode="mc" seed="42"></choca-coin-pile>`);
    await setQuestion(el, moneyQ());
    expect(el.shadowRoot!.querySelector('[part="container"]')).to.not.be.null;
    expect(el.shadowRoot!.querySelector('[part="canvas"]')).to.not.be.null;
  });

  it('default <choca-choice-pad> renders inside shadow DOM (R2.4), not light DOM', async () => {
    const el = mount(`<choca-coin-pile answer-mode="mc" seed="42"></choca-coin-pile>`);
    await setQuestion(el, moneyQ());
    // No light-DOM children — coin pile must NOT have appended the choice pad to itself
    expect(el.children.length).to.equal(0);
    // Choice pad lives in shadow DOM
    expect(el.shadowRoot!.querySelector('choca-choice-pad')).to.not.be.null;
  });

  it('emits answered with correct=true for right choice', async () => {
    const el = mount(`<choca-coin-pile answer-mode="mc" seed="42"></choca-coin-pile>`);
    await setQuestion(el, moneyQ());
    let captured: { correct?: boolean; studentAnswer?: number } | null = null;
    el.addEventListener('answered', (e) => {
      captured = (e as CustomEvent).detail;
    });
    const pad = el.shadowRoot!.querySelector('choca-choice-pad') as HTMLElement;
    const correctBtn = pad.shadowRoot!.querySelector('[part~="choice-correct"]') as HTMLButtonElement;
    correctBtn.click();
    await new Promise((r) => requestAnimationFrame(r));
    expect(captured).to.not.be.null;
    expect(captured!.correct).to.equal(true);
    expect(captured!.studentAnswer).to.equal(25);
  });

  it('emits answered with distractorMatched on wrong choice', async () => {
    const el = mount(`<choca-coin-pile answer-mode="mc" seed="42"></choca-coin-pile>`);
    await setQuestion(el, moneyQ());
    let captured: { correct?: boolean; distractorMatched?: unknown } | null = null;
    el.addEventListener('answered', (e) => {
      captured = (e as CustomEvent).detail;
    });
    const pad = el.shadowRoot!.querySelector('choca-choice-pad') as HTMLElement;
    const buttons = pad.shadowRoot!.querySelectorAll('button');
    const wrong = Array.from(buttons).find(
      (b) => !b.getAttribute('part')!.includes('choice-correct'),
    ) as HTMLButtonElement;
    wrong.click();
    await new Promise((r) => requestAnimationFrame(r));
    expect(captured!.correct).to.equal(false);
    expect(captured!.distractorMatched).to.deep.include({ value: 20, errorType: 'off-by-nickel' });
  });

  it('seed attribute plumbed to buildChoicePool (R2.5) — same seed → same order', async () => {
    const elA = mount(`<choca-coin-pile answer-mode="mc" seed="42"></choca-coin-pile>`);
    await setQuestion(elA, moneyQ({ distractors: [
      { value: 20, errorType: 'a' },
      { value: 30, errorType: 'b' },
      { value: 26, errorType: 'c' },
    ] }));
    const padA = elA.shadowRoot!.querySelector('choca-choice-pad') as HTMLElement;
    const orderA = Array.from(padA.shadowRoot!.querySelectorAll('button')).map((b) => b.textContent);

    const elB = mount(`<choca-coin-pile answer-mode="mc" seed="42"></choca-coin-pile>`);
    await setQuestion(elB, moneyQ({ distractors: [
      { value: 20, errorType: 'a' },
      { value: 30, errorType: 'b' },
      { value: 26, errorType: 'c' },
    ] }));
    const padB = elB.shadowRoot!.querySelector('choca-choice-pad') as HTMLElement;
    const orderB = Array.from(padB.shadowRoot!.querySelectorAll('button')).map((b) => b.textContent);

    expect(orderA).to.deep.equal(orderB);
  });

  it('container has role=group', async () => {
    const el = mount(`<choca-coin-pile answer-mode="mc" seed="42"></choca-coin-pile>`);
    await setQuestion(el, moneyQ());
    const container = el.shadowRoot!.querySelector('[part="container"]') as HTMLElement;
    expect(container.getAttribute('role')).to.equal('group');
  });

  it('after answer, choice pad gets disabled', async () => {
    const el = mount(`<choca-coin-pile answer-mode="mc" seed="42"></choca-coin-pile>`);
    await setQuestion(el, moneyQ());
    const pad = el.shadowRoot!.querySelector('choca-choice-pad') as HTMLElement;
    const correctBtn = pad.shadowRoot!.querySelector('[part~="choice-correct"]') as HTMLButtonElement;
    correctBtn.click();
    await new Promise((r) => requestAnimationFrame(r));
    expect(pad.hasAttribute('disabled')).to.equal(true);
  });
});

describe('<choca-coin-pile> M2 a11y', () => {
  it('aria-live region announces coin count via formatCoinCountForScreenReader', async () => {
    const el = mount(`<choca-coin-pile answer-mode="mc" seed="42"></choca-coin-pile>`);
    await setQuestion(el, moneyQ({ content: { coins: { quarter: 2, dime: 1 }, currency: 'USD' }, answer: 60 }));
    const live = el.shadowRoot!.querySelector('[aria-live="polite"]') as HTMLElement;
    expect(live).to.not.be.null;
    expect(live.textContent ?? '').to.contain('2 quarters');
    expect(live.textContent ?? '').to.contain('1 dime');
  });

  it('container has aria-label with prompt', async () => {
    const el = mount(`<choca-coin-pile answer-mode="mc" seed="42"></choca-coin-pile>`);
    await setQuestion(el, moneyQ());
    const container = el.shadowRoot!.querySelector('[part="container"]') as HTMLElement;
    const label = container.getAttribute('aria-label') ?? '';
    expect(label).to.contain('Question');
  });

  it('XSS hardening — malicious prompt does not inject HTML elements', async () => {
    const el = mount(`<choca-coin-pile answer-mode="mc" seed="42"></choca-coin-pile>`);
    (el as HTMLElement & { prompt: string }).prompt = '<img src=x onerror="window.__pwned=true">';
    await setQuestion(el, moneyQ());
    expect(el.shadowRoot!.querySelector('img')).to.be.null;
    expect((window as unknown as { __pwned?: boolean }).__pwned).to.be.undefined;
  });

  it('seed determinism — same seed across 3 mounts produces same order', async () => {
    const orders: string[][] = [];
    for (let i = 0; i < 3; i++) {
      const el = mount(`<choca-coin-pile answer-mode="mc" seed="42"></choca-coin-pile>`);
      await setQuestion(el, moneyQ({
        distractors: [
          { value: 20, errorType: 'a' },
          { value: 30, errorType: 'b' },
          { value: 26, errorType: 'c' },
          { value: 28, errorType: 'd' },
        ],
      }));
      const pad = el.shadowRoot!.querySelector('choca-choice-pad') as HTMLElement;
      const order = Array.from(pad.shadowRoot!.querySelectorAll('button')).map((b) => b.textContent ?? '');
      orders.push(order);
    }
    expect(orders[0]).to.deep.equal(orders[1]);
    expect(orders[1]).to.deep.equal(orders[2]);
  });
});
