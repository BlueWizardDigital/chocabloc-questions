import { expect } from '@esm-bundle/chai';
import type { ChocaWhiteboard } from '../../src/elements/ChocaWhiteboard';
import '../../src/elements/ChocaWhiteboard';

function mount(html: string): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.innerHTML = html;
  document.body.appendChild(wrapper);
  return wrapper.firstElementChild as HTMLElement;
}

function asWb(el: HTMLElement): ChocaWhiteboard {
  return el as unknown as ChocaWhiteboard;
}

async function frame(): Promise<void> { await new Promise((r) => requestAnimationFrame(r)); }
afterEach(() => { document.body.innerHTML = ''; });

describe('<choca-whiteboard>', () => {
  it('registers', () => {
    expect(customElements.get('choca-whiteboard')).to.not.be.undefined;
  });

  it('renders canvas', async () => {
    const el = mount(`<choca-whiteboard></choca-whiteboard>`);
    await frame();
    expect(el.shadowRoot!.querySelector('[part="wb-canvas"]')!.tagName.toLowerCase()).to.equal('canvas');
  });

  it('renders tool buttons', async () => {
    const el = mount(`<choca-whiteboard></choca-whiteboard>`);
    await frame();
    expect(el.shadowRoot!.querySelectorAll('[part~="wb-tool-btn"]').length).to.be.at.least(4);
  });

  it('renders color + width buttons', async () => {
    const el = mount(`<choca-whiteboard></choca-whiteboard>`);
    await frame();
    expect(el.shadowRoot!.querySelectorAll('[part~="wb-color-btn"]').length).to.be.at.least(4);
    expect(el.shadowRoot!.querySelectorAll('[part~="wb-width-btn"]').length).to.be.at.least(2);
  });

  it('pen is default tool', async () => {
    const el = mount(`<choca-whiteboard></choca-whiteboard>`);
    await frame();
    expect(asWb(el).activeTool).to.equal('pen');
  });

  it('eraser click switches tool', async () => {
    const el = mount(`<choca-whiteboard></choca-whiteboard>`);
    await frame();
    const btns = el.shadowRoot!.querySelectorAll('[part~="wb-tool-btn"]');
    const eraser = Array.from(btns).find((b) => (b as HTMLElement).dataset.tool === 'eraser') as HTMLButtonElement;
    eraser.click();
    expect(asWb(el).activeTool).to.equal('eraser');
  });

  it('pointer events create strokes', async () => {
    const el = mount(`<choca-whiteboard></choca-whiteboard>`);
    await frame();
    const c = el.shadowRoot!.querySelector('[part="wb-canvas"]') as HTMLCanvasElement;
    c.dispatchEvent(new PointerEvent('pointerdown', { clientX: 10, clientY: 10, bubbles: true }));
    c.dispatchEvent(new PointerEvent('pointermove', { clientX: 50, clientY: 50, bubbles: true }));
    c.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
    expect(asWb(el).strokeCount).to.equal(1);
  });

  it('undo removes last stroke', async () => {
    const el = mount(`<choca-whiteboard></choca-whiteboard>`);
    await frame();
    const c = el.shadowRoot!.querySelector('[part="wb-canvas"]') as HTMLCanvasElement;
    c.dispatchEvent(new PointerEvent('pointerdown', { clientX: 10, clientY: 10, bubbles: true }));
    c.dispatchEvent(new PointerEvent('pointermove', { clientX: 50, clientY: 50, bubbles: true }));
    c.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
    c.dispatchEvent(new PointerEvent('pointerdown', { clientX: 60, clientY: 10, bubbles: true }));
    c.dispatchEvent(new PointerEvent('pointermove', { clientX: 100, clientY: 50, bubbles: true }));
    c.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
    expect(asWb(el).strokeCount).to.equal(2);
    const undo = Array.from(el.shadowRoot!.querySelectorAll('[part~="wb-tool-btn"]'))
      .find((b) => (b as HTMLElement).dataset.tool === 'undo') as HTMLButtonElement;
    undo.click();
    expect(asWb(el).strokeCount).to.equal(1);
  });

  it('clear() resets everything', async () => {
    const el = mount(`<choca-whiteboard></choca-whiteboard>`);
    await frame();
    const c = el.shadowRoot!.querySelector('[part="wb-canvas"]') as HTMLCanvasElement;
    c.dispatchEvent(new PointerEvent('pointerdown', { clientX: 10, clientY: 10, bubbles: true }));
    c.dispatchEvent(new PointerEvent('pointermove', { clientX: 50, clientY: 50, bubbles: true }));
    c.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
    asWb(el).clear();
    expect(asWb(el).strokeCount).to.equal(0);
  });
});
