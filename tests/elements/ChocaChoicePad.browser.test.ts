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
