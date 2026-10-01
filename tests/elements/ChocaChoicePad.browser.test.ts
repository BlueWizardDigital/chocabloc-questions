import { expect } from '@esm-bundle/chai';
import '../../src/elements/ChocaChoicePad';

function mount(html: string): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.innerHTML = html;
  document.body.appendChild(wrapper);
  return wrapper.firstElementChild as HTMLElement;
}

async function setChoicesAndAwait(el: HTMLElement, choices: unknown): Promise<void> {
  (el as HTMLElement & { choices: unknown }).choices = choices;
  await new Promise((r) => requestAnimationFrame(r));
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('<choca-choice-pad> M1 subset', () => {
  it('registers as custom element', () => {
    expect(customElements.get('choca-choice-pad')).to.not.be.undefined;
  });

  it('renders one button per choice', async () => {
    const el = mount(`<choca-choice-pad mode="mc"></choca-choice-pad>`);
    await setChoicesAndAwait(el, [
      { value: 144, correct: true },
      { value: 140, correct: false },
      { value: 150, correct: false },
      { value: 145, correct: false },
    ]);
    const buttons = el.shadowRoot!.querySelectorAll('[part~="choice"]');
    expect(buttons.length).to.equal(4);
  });

  it('emits picked event on click', async () => {
    const el = mount(`<choca-choice-pad mode="mc"></choca-choice-pad>`);
    await setChoicesAndAwait(el, [
      { value: 144, correct: true },
      { value: 140, correct: false },
    ]);
    let captured: unknown = null;
    el.addEventListener('picked', (e) => {
      captured = (e as CustomEvent).detail;
    });
    const firstBtn = el.shadowRoot!.querySelector('[part~="choice"]') as HTMLButtonElement;
    firstBtn.click();
    expect(captured).to.deep.equal({ value: 144, correct: true });
  });

  it('exposes choice part + role=radio on each button', async () => {
    const el = mount(`<choca-choice-pad mode="mc"></choca-choice-pad>`);
    await setChoicesAndAwait(el, [{ value: 1, correct: true }]);
    const btn = el.shadowRoot!.querySelector('button');
    expect(btn?.getAttribute('part')).to.contain('choice');
    expect(btn?.getAttribute('role')).to.equal('radio');
  });

  it('first choice has tabindex=0; rest have tabindex=-1', async () => {
    const el = mount(`<choca-choice-pad mode="mc"></choca-choice-pad>`);
    await setChoicesAndAwait(el, [
      { value: 1, correct: true },
      { value: 2, correct: false },
      { value: 3, correct: false },
    ]);
    const buttons = el.shadowRoot!.querySelectorAll('button');
    expect((buttons[0] as HTMLButtonElement).tabIndex).to.equal(0);
    expect((buttons[1] as HTMLButtonElement).tabIndex).to.equal(-1);
    expect((buttons[2] as HTMLButtonElement).tabIndex).to.equal(-1);
  });

  it('pad has role=radiogroup', async () => {
    const el = mount(`<choca-choice-pad mode="mc"></choca-choice-pad>`);
    await setChoicesAndAwait(el, [{ value: 1, correct: true }]);
    const pad = el.shadowRoot!.querySelector('[part="pad"]');
    expect(pad?.getAttribute('role')).to.equal('radiogroup');
  });

  it('disabled attribute prevents picked event', async () => {
    const el = mount(`<choca-choice-pad mode="mc" disabled></choca-choice-pad>`);
    await setChoicesAndAwait(el, [{ value: 1, correct: true }]);
    let picks = 0;
    el.addEventListener('picked', () => picks++);
    const btn = el.shadowRoot!.querySelector('button') as HTMLButtonElement;
    btn.click();
    expect(picks).to.equal(0);
  });
});

function pressKey(target: Element, key: string): void {
  target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
}

describe('<choca-choice-pad> M2 a11y', () => {
  it('ArrowRight moves focus + tabindex to next choice', async () => {
    const el = mount(`<choca-choice-pad mode="mc"></choca-choice-pad>`);
    await setChoicesAndAwait(el, [
      { value: 1, correct: true },
      { value: 2, correct: false },
      { value: 3, correct: false },
    ]);
    const buttons = el.shadowRoot!.querySelectorAll('button');
    (buttons[0] as HTMLButtonElement).focus();
    pressKey(buttons[0]!, 'ArrowRight');
    await new Promise((r) => requestAnimationFrame(r));
    expect(el.shadowRoot!.activeElement).to.equal(buttons[1]);
    expect((buttons[0] as HTMLButtonElement).tabIndex).to.equal(-1);
    expect((buttons[1] as HTMLButtonElement).tabIndex).to.equal(0);
  });

  it('ArrowLeft from first wraps to last', async () => {
    const el = mount(`<choca-choice-pad mode="mc"></choca-choice-pad>`);
    await setChoicesAndAwait(el, [
      { value: 1, correct: true },
      { value: 2, correct: false },
      { value: 3, correct: false },
    ]);
    const buttons = el.shadowRoot!.querySelectorAll('button');
    (buttons[0] as HTMLButtonElement).focus();
    pressKey(buttons[0]!, 'ArrowLeft');
    await new Promise((r) => requestAnimationFrame(r));
    expect(el.shadowRoot!.activeElement).to.equal(buttons[2]);
  });

  it('Home focuses first, End focuses last', async () => {
    const el = mount(`<choca-choice-pad mode="mc"></choca-choice-pad>`);
    await setChoicesAndAwait(el, [
      { value: 1, correct: true },
      { value: 2, correct: false },
      { value: 3, correct: false },
    ]);
    const buttons = el.shadowRoot!.querySelectorAll('button');
    (buttons[1] as HTMLButtonElement).focus();
    pressKey(buttons[1]!, 'End');
    await new Promise((r) => requestAnimationFrame(r));
    expect(el.shadowRoot!.activeElement).to.equal(buttons[2]);
    pressKey(buttons[2]!, 'Home');
    await new Promise((r) => requestAnimationFrame(r));
    expect(el.shadowRoot!.activeElement).to.equal(buttons[0]);
  });

  it('Space / Enter on focused choice fires picked', async () => {
    const el = mount(`<choca-choice-pad mode="mc"></choca-choice-pad>`);
    await setChoicesAndAwait(el, [
      { value: 1, correct: true },
      { value: 2, correct: false },
    ]);
    let picks = 0;
    el.addEventListener('picked', () => picks++);
    const buttons0 = el.shadowRoot!.querySelectorAll('button');
    (buttons0[0] as HTMLButtonElement).focus();
    pressKey(buttons0[0]!, ' ');
    // Re-query after _pick() triggers _render() and replaces DOM children
    const buttons1 = el.shadowRoot!.querySelectorAll('button');
    (buttons1[1] as HTMLButtonElement).focus();
    pressKey(buttons1[1]!, 'Enter');
    expect(picks).to.equal(2);
  });

  it('aria-checked reflects pick after a choice', async () => {
    const el = mount(`<choca-choice-pad mode="mc"></choca-choice-pad>`);
    await setChoicesAndAwait(el, [
      { value: 1, correct: true },
      { value: 2, correct: false },
    ]);
    const buttons = el.shadowRoot!.querySelectorAll('button');
    expect((buttons[0] as HTMLButtonElement).getAttribute('aria-checked')).to.equal('false');
    (buttons[1] as HTMLButtonElement).click();
    await new Promise((r) => requestAnimationFrame(r));
    expect((buttons[0] as HTMLButtonElement).getAttribute('aria-checked')).to.equal('false');
    const buttonsAfter = el.shadowRoot!.querySelectorAll('button');
    expect((buttonsAfter[1] as HTMLButtonElement).getAttribute('aria-checked')).to.equal('true');
  });

  it('disabled sets aria-disabled on pad + each button', async () => {
    const el = mount(`<choca-choice-pad mode="mc" disabled></choca-choice-pad>`);
    await setChoicesAndAwait(el, [{ value: 1, correct: true }]);
    const btn = el.shadowRoot!.querySelector('button') as HTMLButtonElement;
    expect(btn.getAttribute('aria-disabled')).to.equal('true');
    const pad = el.shadowRoot!.querySelector('[part="pad"]') as HTMLElement;
    expect(pad.getAttribute('aria-disabled')).to.equal('true');
  });

  it('keyboard activation respects disabled', async () => {
    const el = mount(`<choca-choice-pad mode="mc" disabled></choca-choice-pad>`);
    await setChoicesAndAwait(el, [{ value: 1, correct: true }]);
    let picks = 0;
    el.addEventListener('picked', () => picks++);
    const btn = el.shadowRoot!.querySelector('button') as HTMLButtonElement;
    btn.focus();
    pressKey(btn, ' ');
    pressKey(btn, 'Enter');
    expect(picks).to.equal(0);
  });
});

describe('<choca-choice-pad coin-choices>', () => {
  const coinParts = (btn: Element): string[] =>
    Array.from(btn.querySelectorAll('[part~="choice-coin"]')).map((s) => s.getAttribute('part')!);

  it('draws a coin-list value as coins in pile order, keeping repeats', async () => {
    const el = mount(`<choca-choice-pad mode="mc" coin-choices></choca-choice-pad>`);
    await setChoicesAndAwait(el, [{ value: ['nickel', 'quarter', 'toonie', 'nickel'] }]);
    const btn = el.shadowRoot!.querySelector('button')!;
    expect(coinParts(btn)).to.deep.equal([
      'choice-coin choice-coin-toonie',
      'choice-coin choice-coin-quarter',
      'choice-coin choice-coin-nickel',
      'choice-coin choice-coin-nickel',
    ]);
    expect(btn.textContent).to.equal('');
    expect(btn.getAttribute('aria-label')).to.equal('toonie, quarter, nickel, nickel');
  });

  it('shows the coin image the game supplies', async () => {
    const el = mount(`<choca-choice-pad mode="mc" coin-choices></choca-choice-pad>`);
    el.style.setProperty('--cq-coin-loonie-img', 'url("data:image/gif;base64,R0lGODlhAQABAAAAACw=")');
    await setChoicesAndAwait(el, [{ value: ['loonie'] }]);
    const coin = el.shadowRoot!.querySelector('[part~="choice-coin-loonie"]') as HTMLElement;
    expect(getComputedStyle(coin).backgroundImage).to.contain('data:image/gif');
    expect(coin.getBoundingClientRect().width).to.be.greaterThan(0);
  });

  it('labels an empty coin list "None" instead of a blank button', async () => {
    const el = mount(`<choca-choice-pad mode="mc" coin-choices></choca-choice-pad>`);
    await setChoicesAndAwait(el, [{ value: [] }]);
    const btn = el.shadowRoot!.querySelector('button')!;
    expect(btn.textContent).to.equal('None');
    expect(coinParts(btn)).to.deep.equal([]);
  });

  it('keeps a single coin name as text (naming the coin is often the question)', async () => {
    const el = mount(`<choca-choice-pad mode="mc" coin-choices></choca-choice-pad>`);
    await setChoicesAndAwait(el, [{ value: 'loonie' }]);
    const btn = el.shadowRoot!.querySelector('button')!;
    expect(btn.textContent).to.equal('loonie');
    expect(coinParts(btn)).to.deep.equal([]);
  });

  it('falls back to text when the list holds anything but coin names', async () => {
    const el = mount(`<choca-choice-pad mode="mc" coin-choices></choca-choice-pad>`);
    await setChoicesAndAwait(el, [{ value: ['nickel', 'button'] }]);
    const btn = el.shadowRoot!.querySelector('button')!;
    expect(btn.textContent).to.equal('nickel,button');
    expect(coinParts(btn)).to.deep.equal([]);
  });

  it('draws coins even when the pool supplied a text label', async () => {
    const el = mount(`<choca-choice-pad mode="mc" coin-choices></choca-choice-pad>`);
    await setChoicesAndAwait(el, [{ value: ['nickel', 'quarter'], label: '(nickel, quarter)' }]);
    const btn = el.shadowRoot!.querySelector('button')!;
    expect(btn.textContent).to.equal('');
    expect(coinParts(btn).length).to.equal(2);
  });

  it('without the attribute, coin lists render as text (unchanged)', async () => {
    const el = mount(`<choca-choice-pad mode="mc"></choca-choice-pad>`);
    await setChoicesAndAwait(el, [{ value: ['nickel', 'dime'] }]);
    const btn = el.shadowRoot!.querySelector('button')!;
    expect(btn.textContent).to.equal('nickel,dime');
    expect(coinParts(btn)).to.deep.equal([]);
  });

  it('picking a coin choice reports the original value', async () => {
    const el = mount(`<choca-choice-pad mode="mc" coin-choices></choca-choice-pad>`);
    const value = ['nickel', 'quarter', 'toonie', 'nickel'];
    await setChoicesAndAwait(el, [{ value }]);
    let captured: { value?: unknown } | null = null;
    el.addEventListener('picked', (e) => { captured = (e as CustomEvent).detail; });
    (el.shadowRoot!.querySelector('button') as HTMLButtonElement).click();
    expect(captured!.value).to.deep.equal(['nickel', 'quarter', 'toonie', 'nickel']);
  });
});
