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
  skillIds: ['MONEY-COIN-VALUE-CAD'],
  format: 'money',
  imageType: 'coins',
  content: { coins: { quarter: 1 }, currency: 'CAD' },
  answer: 25,
  distractors: [{ value: 20, errorType: 'off-by-nickel' }],
  ...overrides,
});

afterEach(() => {
  document.body.innerHTML = '';
});

describe('<choca-coin-pile> Phase D layout', () => {
  it('emits one coin-row per non-zero denomination', async () => {
    const el = mount(`<choca-coin-pile answer-mode="mc" seed="42"></choca-coin-pile>`);
    await setQuestion(
      el,
      moneyQ({
        content: { coins: { dime: 5, nickel: 5 }, currency: 'CAD' },
        answer: 75,
      }),
    );
    const rows = el.shadowRoot!.querySelectorAll('[part~="coin-row"]');
    expect(rows.length).to.equal(2);
  });

  it('skips zero-count denominations', async () => {
    const el = mount(`<choca-coin-pile answer-mode="mc" seed="42"></choca-coin-pile>`);
    await setQuestion(
      el,
      moneyQ({
        content: { coins: { toonie: 0, loonie: 1, quarter: 0, dime: 2 }, currency: 'CAD' },
        answer: 220,
      }),
    );
    const rows = el.shadowRoot!.querySelectorAll('[part~="coin-row"]');
    expect(rows.length).to.equal(2);
    expect(rows[0].getAttribute('part')).to.contain('coin-row-loonie');
    expect(rows[1].getAttribute('part')).to.contain('coin-row-dime');
  });

  it('orders rows high-to-low by denomination', async () => {
    const el = mount(`<choca-coin-pile answer-mode="mc" seed="42"></choca-coin-pile>`);
    await setQuestion(
      el,
      moneyQ({
        content: {
          coins: { penny: 1, nickel: 1, dime: 1, quarter: 1, loonie: 1, toonie: 1 },
          currency: 'CAD',
        },
        answer: 341,
      }),
    );
    const rows = Array.from(el.shadowRoot!.querySelectorAll('[part~="coin-row"]'));
    const parts = rows.map((r) => r.getAttribute('part') ?? '');
    expect(parts[0]).to.contain('coin-row-toonie');
    expect(parts[1]).to.contain('coin-row-loonie');
    expect(parts[2]).to.contain('coin-row-quarter');
    expect(parts[3]).to.contain('coin-row-dime');
    expect(parts[4]).to.contain('coin-row-nickel');
    expect(parts[5]).to.contain('coin-row-penny');
  });

  it('places N coin spans inside a row matching content.coins[denom]', async () => {
    const el = mount(`<choca-coin-pile answer-mode="mc" seed="42"></choca-coin-pile>`);
    await setQuestion(
      el,
      moneyQ({
        content: { coins: { quarter: 4, loonie: 1 }, currency: 'CAD' },
        answer: 200,
      }),
    );
    const loonieRow = el.shadowRoot!.querySelector('[part~="coin-row-loonie"]')!;
    const quarterRow = el.shadowRoot!.querySelector('[part~="coin-row-quarter"]')!;
    expect(loonieRow.querySelectorAll('[part~="coin"]').length).to.equal(1);
    expect(quarterRow.querySelectorAll('[part~="coin"]').length).to.equal(4);
  });

  it('renders dime coins at 40px and nickel coins at 43px by default', async () => {
    const el = mount(`<choca-coin-pile answer-mode="mc" seed="42"></choca-coin-pile>`);
    await setQuestion(
      el,
      moneyQ({
        content: { coins: { dime: 1, nickel: 1 }, currency: 'CAD' },
        answer: 15,
      }),
    );
    const dime = el.shadowRoot!.querySelector('[part~="coin-dime"]') as HTMLElement;
    const nickel = el.shadowRoot!.querySelector('[part~="coin-nickel"]') as HTMLElement;
    expect(getComputedStyle(dime).width).to.equal('40px');
    expect(getComputedStyle(dime).height).to.equal('40px');
    expect(getComputedStyle(nickel).width).to.equal('43px');
    expect(getComputedStyle(nickel).height).to.equal('43px');
  });

  it('renders toonie/loonie/quarter at default --cq-coin-size 56px', async () => {
    const el = mount(`<choca-coin-pile answer-mode="mc" seed="42"></choca-coin-pile>`);
    await setQuestion(
      el,
      moneyQ({
        content: { coins: { quarter: 1 }, currency: 'CAD' },
        answer: 25,
      }),
    );
    const quarter = el.shadowRoot!.querySelector('[part~="coin-quarter"]') as HTMLElement;
    expect(getComputedStyle(quarter).width).to.equal('56px');
  });

  it('applies per-denom margin-left overlap (px-based, not %)', async () => {
    const el = mount(`<choca-coin-pile answer-mode="mc" seed="42"></choca-coin-pile>`);
    await setQuestion(
      el,
      moneyQ({
        content: { coins: { dime: 3, quarter: 3 }, currency: 'CAD' },
        answer: 105,
      }),
    );
    const dimes = Array.from(
      el.shadowRoot!.querySelectorAll('[part~="coin-dime"]'),
    ) as HTMLElement[];
    const quarters = Array.from(
      el.shadowRoot!.querySelectorAll('[part~="coin-quarter"]'),
    ) as HTMLElement[];
    // first child of each row has no negative margin
    expect(getComputedStyle(dimes[0]).marginLeft).to.equal('0px');
    expect(getComputedStyle(quarters[0]).marginLeft).to.equal('0px');
    // 25% overlap of 40px dime = -10px; 25% overlap of 56px quarter = -14px
    expect(getComputedStyle(dimes[1]).marginLeft).to.equal('-10px');
    expect(getComputedStyle(quarters[1]).marginLeft).to.equal('-14px');
  });

  it('assigns increasing z-index inline so later coins layer over earlier', async () => {
    const el = mount(`<choca-coin-pile answer-mode="mc" seed="42"></choca-coin-pile>`);
    await setQuestion(
      el,
      moneyQ({
        content: { coins: { quarter: 3 }, currency: 'CAD' },
        answer: 75,
      }),
    );
    const coins = Array.from(
      el.shadowRoot!.querySelectorAll('[part~="coin-quarter"]'),
    ) as HTMLElement[];
    expect(coins.length).to.equal(3);
    expect(coins[0].style.zIndex).to.equal('1');
    expect(coins[1].style.zIndex).to.equal('2');
    expect(coins[2].style.zIndex).to.equal('3');
  });
});
