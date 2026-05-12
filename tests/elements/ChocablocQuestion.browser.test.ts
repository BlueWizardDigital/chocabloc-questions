import { expect } from '@esm-bundle/chai';
import '../../src/elements/ChocablocQuestion';

function mount(html: string): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.innerHTML = html;
  document.body.appendChild(wrapper);
  return wrapper.firstElementChild as HTMLElement;
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('<chocabloc-question> M1 subset', () => {
  it('registers', () => {
    expect(customElements.get('chocabloc-question')).to.not.be.undefined;
  });

  it('dispatches to <choca-coin-pile> for money format', async () => {
    const el = mount(`<chocabloc-question seed="42"></chocabloc-question>`);
    (el as HTMLElement & { question: unknown }).question = {
      id: 'X',
      skillIds: ['MONEY-COIN-VALUE-USD'],
      format: 'money',
      imageType: 'coins',
      content: { coins: { quarter: 1 }, currency: 'USD' },
      answer: 25,
      distractors: [],
    };
    await new Promise((r) => requestAnimationFrame(r));
    const inner = el.shadowRoot!.querySelector('choca-coin-pile');
    expect(inner).to.not.be.null;
  });

  it('renders text-only fallback for text format', async () => {
    const el = mount(`<chocabloc-question></chocabloc-question>`);
    (el as HTMLElement & { question: unknown }).question = {
      id: 'X',
      skillIds: ['MISC'],
      format: 'text',
      content: { stem: 'What is the capital of France?' },
      answer: 'Paris',
      distractors: [],
    };
    await new Promise((r) => requestAnimationFrame(r));
    const text = el.shadowRoot!.textContent ?? '';
    expect(text).to.contain('What is the capital');
  });

  it('forwards answered event from inner renderer', async () => {
    const el = mount(`<chocabloc-question seed="42"></chocabloc-question>`);
    (el as HTMLElement & { question: unknown }).question = {
      id: 'X',
      skillIds: ['MONEY-COIN-VALUE-USD'],
      format: 'money',
      imageType: 'coins',
      content: { coins: { quarter: 1 }, currency: 'USD' },
      answer: 25,
      distractors: [{ value: 20, errorType: 'off-by-nickel' }],
    };
    await new Promise((r) => requestAnimationFrame(r));
    let captured: unknown = null;
    el.addEventListener('answered', (e) => {
      captured = (e as CustomEvent).detail;
    });
    const inner = el.shadowRoot!.querySelector('choca-coin-pile') as HTMLElement;
    const pad = inner.shadowRoot!.querySelector('choca-choice-pad') as HTMLElement;
    const correctBtn = pad.shadowRoot!.querySelector('[part~="choice-correct"]') as HTMLButtonElement;
    correctBtn.click();
    await new Promise((r) => requestAnimationFrame(r));
    expect(captured).to.not.be.null;
  });
});

describe('<chocabloc-question> M2 hardening', () => {
  it('XSS hardening — malicious text-only stem does not inject HTML', async () => {
    const el = mount(`<chocabloc-question></chocabloc-question>`);
    (el as HTMLElement & { question: unknown }).question = {
      id: 'X',
      skillIds: ['MISC'],
      format: 'text',
      content: { stem: '<img src=x onerror="window.__pwned2=true">' },
      answer: 'whatever',
      distractors: [],
    };
    await new Promise((r) => requestAnimationFrame(r));
    expect(el.shadowRoot!.querySelector('img')).to.be.null;
    expect((window as unknown as { __pwned2?: boolean }).__pwned2).to.be.undefined;
  });

  it('forwards rendered event from inner', async () => {
    const el = mount(`<chocabloc-question seed="42"></chocabloc-question>`);
    let rendered = 0;
    el.addEventListener('rendered', () => rendered++);
    (el as HTMLElement & { question: unknown }).question = {
      id: 'X',
      skillIds: ['MONEY-COIN-VALUE-USD'],
      format: 'money',
      imageType: 'coins',
      content: { coins: { quarter: 1 }, currency: 'USD' },
      answer: 25,
      distractors: [],
    };
    await new Promise((r) => requestAnimationFrame(r));
    expect(rendered).to.be.greaterThan(0);
  });
});
