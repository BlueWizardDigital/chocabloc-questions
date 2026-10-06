import { expect } from '@esm-bundle/chai';
import '../../src/full';
import { normalizeQuestion } from '../../src/helpers/normalizer';

// Review rows after the server trims `content` (Trello 360): the row has
// `answer`, but not the answer-only content fields. It must still draw.
type Q = HTMLElement & { question: unknown };

async function mount(row: unknown): Promise<Q> {
  const el = document.createElement('chocabloc-question') as Q;
  el.setAttribute('answer-mode', 'review');
  document.body.appendChild(el);
  // The review screens normalize first; that step threw before the fix.
  el.question = normalizeQuestion(row);
  await new Promise((r) => setTimeout(r, 30));
  return el;
}

afterEach(() => { document.body.innerHTML = ''; });

const distractors = [{ value: '4:05', errorType: 'x' }, { value: '2:05', errorType: 'y' }];

describe('rows with withheld content fields still render', () => {
  it('time: a canvas clock', async () => {
    const el = await mount({
      id: 'T', skillIds: ['TIME-ANALOG'], format: 'time', imageType: 'analog_clock',
      content: { hour: 3, minute: 5, operation: 'time' }, answer: '3:05', distractors,
    });
    const canvasQ = el.shadowRoot!.querySelector('choca-canvas-question');
    expect(canvasQ, 'canvas question missing').to.exist;
    expect(canvasQ!.shadowRoot!.querySelector('canvas')).to.exist;
  });

  it('geometry_angles: a canvas triangle', async () => {
    const el = await mount({
      id: 'A', skillIds: ['GEOM-ANGLES'], format: 'geometry_angles',
      content: { known_angles: [60, 70], operation: 'geometry_angles' }, answer: 50,
      distractors: [{ value: 40, errorType: 'x' }, { value: 60, errorType: 'y' }],
    });
    expect(el.shadowRoot!.querySelector('choca-canvas-question'), 'canvas question missing').to.exist;
  });

  it('money_budget_adjust: the budget table', async () => {
    const el = await mount({
      id: 'M', skillIds: ['MONEY-BUDGET-ADJUST'], format: 'money_budget_adjust', imageType: 'table',
      content: {
        solve_for: 'entertainment', original_income_cents: 1335, operation: 'money_budget_adjust',
        change_event: { type: 'income_drop', new_income_cents: 1135 },
        original_rows: [{ category: 'rent', amount_cents: 850 }, { category: 'entertainment', amount_cents: 300 }],
      },
      answer: 100,
      distractors: [{ value: 300, errorType: 'x' }, { value: 200, errorType: 'y' }],
    });
    const table = el.shadowRoot!.querySelector('choca-table-question');
    expect(table, 'table question missing').to.exist;
    expect(table!.shadowRoot!.querySelector('table')).to.exist;
  });
});
