import { expect } from '@esm-bundle/chai';
import type { ChocaAnswerInput } from '../../src/elements/ChocaAnswerInput';
import '../../src/elements/ChocaAnswerInput';

function mount(html: string): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.innerHTML = html;
  document.body.appendChild(wrapper);
  return wrapper.firstElementChild as HTMLElement;
}

function asInput(el: HTMLElement): ChocaAnswerInput {
  return el as unknown as ChocaAnswerInput;
}

async function frame(): Promise<void> {
  await new Promise((r) => requestAnimationFrame(r));
}

afterEach(() => { document.body.innerHTML = ''; });

describe('<choca-answer-input>', () => {
  it('registers as custom element', () => {
    expect(customElements.get('choca-answer-input')).to.not.be.undefined;
  });

  it('renders input + submit button', async () => {
    const el = mount(`<choca-answer-input></choca-answer-input>`);
    asInput(el).format = 'geometry_area';
    await frame();
    expect(el.shadowRoot!.querySelector('[part="input-field"]')).to.not.be.null;
    expect(el.shadowRoot!.querySelector('[part="input-submit"]')).to.not.be.null;
  });

  it('placeholder matches format — money', async () => {
    const el = mount(`<choca-answer-input></choca-answer-input>`);
    asInput(el).format = 'money';
    await frame();
    const input = el.shadowRoot!.querySelector('[part="input-field"]') as HTMLInputElement;
    expect(input.placeholder).to.equal('$0.00');
  });

  it('placeholder matches format — degrees', async () => {
    const el = mount(`<choca-answer-input></choca-answer-input>`);
    asInput(el).format = 'geometry_angles';
    await frame();
    expect((el.shadowRoot!.querySelector('[part="input-field"]') as HTMLInputElement).placeholder).to.equal('0°');
  });

  it('fires submitted on button click', async () => {
    const el = mount(`<choca-answer-input></choca-answer-input>`);
    asInput(el).format = 'geometry_area';
    await frame();
    const input = el.shadowRoot!.querySelector('[part="input-field"]') as HTMLInputElement;
    const btn = el.shadowRoot!.querySelector('[part="input-submit"]') as HTMLButtonElement;
    let captured: CustomEvent | null = null;
    el.addEventListener('submitted', (e) => { captured = e as CustomEvent; });
    input.value = '24';
    btn.click();
    expect((captured as unknown as CustomEvent).detail).to.deep.equal({ parsedValue: 24, rawInput: '24' });
  });

  it('fires submitted on Enter key', async () => {
    const el = mount(`<choca-answer-input></choca-answer-input>`);
    asInput(el).format = 'money';
    await frame();
    const input = el.shadowRoot!.querySelector('[part="input-field"]') as HTMLInputElement;
    let captured: CustomEvent | null = null;
    el.addEventListener('submitted', (e) => { captured = e as CustomEvent; });
    input.value = '$2.53';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect((captured as unknown as CustomEvent).detail).to.deep.equal({ parsedValue: 253, rawInput: '$2.53' });
  });

  it('does not fire when disabled', async () => {
    const el = mount(`<choca-answer-input disabled></choca-answer-input>`);
    asInput(el).format = 'geometry_area';
    await frame();
    let fired = false;
    el.addEventListener('submitted', () => { fired = true; });
    (el.shadowRoot!.querySelector('[part="input-submit"]') as HTMLButtonElement).click();
    expect(fired).to.be.false;
  });

  it('showFeedback disables and shows result', async () => {
    const el = mount(`<choca-answer-input></choca-answer-input>`);
    const cai = asInput(el);
    cai.format = 'geometry_area';
    await frame();
    cai.showFeedback(false, 24);
    await frame();
    const fb = el.shadowRoot!.querySelector('[part="input-feedback"]') as HTMLElement;
    expect(fb.textContent).to.contain('24');
    expect((el.shadowRoot!.querySelector('[part="input-field"]') as HTMLInputElement).disabled).to.be.true;
  });
});
