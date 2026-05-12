import { expect } from '@esm-bundle/chai';

describe('browser test infra', () => {
  it('runs in a real browser', () => {
    expect(typeof window).to.equal('object');
    expect(typeof document).to.equal('object');
    expect(typeof customElements).to.equal('object');
  });

  it('shadow DOM is available', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const shadow = host.attachShadow({ mode: 'open' });
    expect(shadow).to.not.be.null;
    expect(host.shadowRoot).to.equal(shadow);
    document.body.removeChild(host);
  });

  it('can define and use a custom element', () => {
    class TestEl extends HTMLElement {
      constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        const span = document.createElement('span');
        span.textContent = 'hello';
        this.shadowRoot!.appendChild(span);
      }
    }
    const tag = `cq-test-${Date.now()}`;
    customElements.define(tag, TestEl);
    const el = document.createElement(tag);
    document.body.appendChild(el);
    expect(el.shadowRoot!.querySelector('span')?.textContent).to.equal('hello');
    document.body.removeChild(el);
  });
});
