import { expect } from '@esm-bundle/chai';
import type { ChocaToolbar } from '../../src/elements/ChocaToolbar';
import '../../src/elements/ChocaToolbar';

function mount(html: string): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.innerHTML = html;
  document.body.appendChild(wrapper);
  return wrapper.firstElementChild as HTMLElement;
}

function asToolbar(el: HTMLElement): ChocaToolbar {
  return el as unknown as ChocaToolbar;
}

async function frame(): Promise<void> { await new Promise((r) => requestAnimationFrame(r)); }
afterEach(() => { document.body.innerHTML = ''; });

describe('<choca-toolbar>', () => {
  it('registers', () => {
    expect(customElements.get('choca-toolbar')).to.not.be.undefined;
  });

  it('no buttons when no tools', async () => {
    const el = mount(`<choca-toolbar></choca-toolbar>`);
    await frame();
    expect(el.shadowRoot!.querySelectorAll('[part~="tool-btn"]').length).to.equal(0);
  });

  it('renders whiteboard button', async () => {
    const el = mount(`<choca-toolbar></choca-toolbar>`);
    asToolbar(el).tools = ['whiteboard'];
    await frame();
    expect(el.shadowRoot!.querySelector('[part~="tool-btn-whiteboard"]')).to.not.be.null;
  });

  it('fires tool-toggled on click', async () => {
    const el = mount(`<choca-toolbar></choca-toolbar>`);
    asToolbar(el).tools = ['whiteboard'];
    await frame();
    let captured: CustomEvent | null = null;
    el.addEventListener('tool-toggled', (e) => { captured = e as CustomEvent; });
    (el.shadowRoot!.querySelector('[part~="tool-btn-whiteboard"]') as HTMLButtonElement).click();
    expect((captured as unknown as CustomEvent).detail).to.deep.equal({ tool: 'whiteboard', active: true });
  });

  it('toggles off on second click', async () => {
    const el = mount(`<choca-toolbar></choca-toolbar>`);
    asToolbar(el).tools = ['whiteboard'];
    await frame();
    const events: CustomEvent[] = [];
    el.addEventListener('tool-toggled', (e) => { events.push(e as CustomEvent); });
    (el.shadowRoot!.querySelector('[part~="tool-btn-whiteboard"]') as HTMLButtonElement).click();
    await frame();
    (el.shadowRoot!.querySelector('[part~="tool-btn-whiteboard"]') as HTMLButtonElement).click();
    expect(events[1]!.detail).to.deep.equal({ tool: 'whiteboard', active: false });
  });

  it('sets aria-pressed', async () => {
    const el = mount(`<choca-toolbar></choca-toolbar>`);
    asToolbar(el).tools = ['whiteboard'];
    await frame();
    const btn = el.shadowRoot!.querySelector('[part~="tool-btn-whiteboard"]') as HTMLButtonElement;
    expect(btn.getAttribute('aria-pressed')).to.equal('false');
    btn.click();
    await frame();
    expect(el.shadowRoot!.querySelector('[part~="tool-btn-whiteboard"]')!.getAttribute('aria-pressed')).to.equal('true');
  });
});
