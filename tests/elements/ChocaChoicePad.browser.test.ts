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
