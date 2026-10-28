import { expect } from '@esm-bundle/chai';
import '../../src/elements/ChocaCanvasQuestion';

afterEach(() => {
  document.body.innerHTML = '';
});

describe('question canvas on a narrow screen', () => {
  it('is no wider than its container at 320 px', async () => {
    const wrapper = document.createElement('div');
    wrapper.style.width = '320px';
    wrapper.innerHTML = '<choca-canvas-question></choca-canvas-question>';
    document.body.appendChild(wrapper);
    const el = wrapper.firstElementChild as HTMLElement & { question: unknown };
    el.question = {
      id: 'q1', skillIds: ['S'], format: 'fraction_models', imageType: 'fraction_models',
      difficulty: 'easy', questionText: 'What fraction is shaded?',
      content: { operation: 'fraction_read', layout: 'row', models: [{ shape: 'bar', d: 4, n: 1, wholes: 1 }] },
      answer: '1/4', distractors: [{ value: '1/2' }, { value: '3/4' }, { value: '1/3' }],
    };
    await new Promise((r) => requestAnimationFrame(r));
    const canvas = el.shadowRoot!.querySelector('[part~="canvas"]') as HTMLCanvasElement;
    const container = el.shadowRoot!.querySelector('[part~="container"]') as HTMLElement;
    const inner = container.getBoundingClientRect().width - 32;
    expect(canvas.getBoundingClientRect().width).to.be.at.most(inner + 0.5);
    expect(canvas.getBoundingClientRect().width).to.be.greaterThan(0);
  });
});
