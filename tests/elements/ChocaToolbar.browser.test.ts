import { expect } from '@esm-bundle/chai';
import '../../src/elements/ChocaToolbar';

function mount(html: string): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.innerHTML = html;
  document.body.appendChild(wrapper);
  return wrapper.firstElementChild as HTMLElement;
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
    const el = mount(`<choca-toolbar></choca-toolbar>`) as any;
    el.tools = ['whiteboard'];
    await frame();
    expect(el.shadowRoot!.querySelector('[part~="tool-btn-whiteboard"]')).to.not.be.null;
  });

  it('fires tool-toggled on click', async () => {
    const el = mount(`<choca-toolbar></choca-toolbar>`) as any;
    el.tools = ['whiteboard'];
    await frame();
    let captured: any = null;
    el.addEventListener('tool-toggled', (e: CustomEvent) => { captured = e.detail; });
    (el.shadowRoot!.querySelector('[part~="tool-btn-whiteboard"]') as HTMLButtonElement).click();
    expect(captured).to.deep.equal({ tool: 'whiteboard', active: true });
  });

  it('toggles off on second click', async () => {
    const el = mount(`<choca-toolbar></choca-toolbar>`) as any;
    el.tools = ['whiteboard'];
    await frame();
    const events: any[] = [];
    el.addEventListener('tool-toggled', (e: CustomEvent) => { events.push(e.detail); });
    (el.shadowRoot!.querySelector('[part~="tool-btn-whiteboard"]') as HTMLButtonElement).click();
    await frame();
    (el.shadowRoot!.querySelector('[part~="tool-btn-whiteboard"]') as HTMLButtonElement).click();
    expect(events[1]).to.deep.equal({ tool: 'whiteboard', active: false });
  });

  it('sets aria-pressed', async () => {
    const el = mount(`<choca-toolbar></choca-toolbar>`) as any;
    el.tools = ['whiteboard'];
    await frame();
    const btn = el.shadowRoot!.querySelector('[part~="tool-btn-whiteboard"]') as HTMLButtonElement;
    expect(btn.getAttribute('aria-pressed')).to.equal('false');
    btn.click();
    await frame();
    expect(el.shadowRoot!.querySelector('[part~="tool-btn-whiteboard"]')!.getAttribute('aria-pressed')).to.equal('true');
  });
});
