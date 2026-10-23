import { expect } from '@esm-bundle/chai';
import '../../src/elements/ChocablocQuestion';
import '../../src/elements/ChocaChoicePad';
import { normalizeQuestion } from '../../src/helpers/normalizer';

afterEach(() => {
  document.body.innerHTML = '';
});

const BASE = {
  id: 'FRAC-HALVES-BASIC-old', skillIds: ['FRAC-HALVES-BASIC'],
  content: {}, format: 'fraction_concept', imageType: 'fraction_visual',
  difficulty: 'easy', questionText: 'What fraction is shaded?',
};

async function show(raw: Record<string, unknown>): Promise<ShadowRoot[]> {
  const el = document.createElement('chocabloc-question') as HTMLElement & { question: unknown };
  document.body.appendChild(el);
  const q = normalizeQuestion(raw);
  expect(q, 'question is kept').to.not.equal(null);
  el.question = q;
  await new Promise((r) => requestAnimationFrame(r));
  await new Promise((r) => requestAnimationFrame(r));
  const roots: ShadowRoot[] = [];
  const walk = (root: ShadowRoot): void => {
    roots.push(root);
    root.querySelectorAll('*').forEach((n) => { if (n.shadowRoot) walk(n.shadowRoot); });
  };
  walk(el.shadowRoot!);
  return roots;
}

function check(roots: ShadowRoot[]): void {
  const canvases = roots.flatMap((r) => Array.from(r.querySelectorAll('canvas')));
  expect(canvases.length).to.be.greaterThan(0);
  for (const c of canvases) expect(c.hidden).to.equal(true);
  const buttons = roots.flatMap((r) => Array.from(r.querySelectorAll('button')));
  expect(buttons.length).to.equal(4);
}

describe('fraction_concept with no fraction (Trello 426)', () => {
  it('keeps an answer-carrying row: canvas hidden, 4 buttons', async () => {
    check(await show({
      ...BASE, answer: '1/2',
      distractors: [{ value: '1/3' }, { value: '2/3' }, { value: '1/4' }],
    }));
  });
  it('keeps a choices-only row: canvas hidden, 4 buttons', async () => {
    check(await show({
      ...BASE,
      choices: [{ value: '1/2' }, { value: '1/3' }, { value: '2/3' }, { value: '1/4' }],
      answerToken: 'token',
    }));
  });
});

describe('choice pad fixed orders', () => {
  it('shows 0, 1/2, 1 and the second button picks "1/2"', async () => {
    const el = document.createElement('choca-choice-pad') as HTMLElement & { choices: unknown };
    el.setAttribute('mode', 'mc');
    document.body.appendChild(el);
    el.choices = [{ value: 1 }, { value: 0 }, { value: '1/2' }];
    await new Promise((r) => requestAnimationFrame(r));
    const btns = Array.from(el.shadowRoot!.querySelectorAll<HTMLButtonElement>('[part~="choice"]'));
    expect(btns.map((b) => b.textContent!.trim())).to.deep.equal(['0', '1/2', '1']);
    let got: { value: unknown } | null = null;
    el.addEventListener('picked', (e) => { got = (e as CustomEvent).detail; });
    btns[1].click();
    expect(got!.value).to.equal('1/2');
  });
  it('leaves other sets in the server order', async () => {
    const el = document.createElement('choca-choice-pad') as HTMLElement & { choices: unknown };
    document.body.appendChild(el);
    el.choices = [{ value: '3/4' }, { value: '1/2' }, { value: '2/3' }];
    await new Promise((r) => requestAnimationFrame(r));
    const btns = Array.from(el.shadowRoot!.querySelectorAll('[part~="choice"]'));
    expect(btns.map((b) => b.textContent!.trim())).to.deep.equal(['3/4', '1/2', '2/3']);
  });
});
