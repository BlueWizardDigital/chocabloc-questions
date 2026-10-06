import { describe, it, expect } from 'vitest';
import { normalizeQuestion } from '../../src/helpers/normalizer';

// A review/assignment row carries `answer` + `distractors`, but its `content`
// holds only what the server's CONTENT_BY_FORMAT entry lets through. The
// answer-only fields (missing_angle, time, answer_cents, currency) are gone.
// The normalizer must still accept the row (Trello 360).
const distractors = [{ value: 1, error_type: 'x' }, { value: 2, error_type: 'y' }];

describe('normalizeQuestion: content fields the server withholds', () => {
  it('geometry_angles without missing_angle', () => {
    const q = normalizeQuestion({
      id: 'A', skill_ids: ['GEOM-ANGLES'], format: 'geometry_angles',
      content: { known_angles: [60, 70], operation: 'geometry_angles' },
      answer: 50, distractors,
    })!;
    if (q.format !== 'geometry_angles') throw new Error('format');
    expect(q.content.known_angles).toEqual([60, 70]);
    expect(q.answer).toBe(50);
  });

  it('time without the time string', () => {
    const q = normalizeQuestion({
      id: 'T', skill_ids: ['TIME-ANALOG'], format: 'time', image_type: 'analog_clock',
      content: { hour: 3, minute: 5, operation: 'time' },
      answer: '3:05', distractors: [{ value: '4:05', error_type: 'x' }],
    })!;
    if (q.format !== 'time') throw new Error('format');
    expect(q.content.hour).toBe(3);
    expect(q.content.minute).toBe(5);
    expect(q.answer).toBe('3:05');
  });

  it('money_budget_adjust without currency or answer_cents', () => {
    const q = normalizeQuestion({
      id: 'M', skill_ids: ['MONEY-BUDGET-ADJUST'], format: 'money_budget_adjust', image_type: 'table',
      content: {
        solve_for: 'entertainment', original_income_cents: 1335, operation: 'money_budget_adjust',
        change_event: { type: 'income_drop', new_income_cents: 1135 },
        original_rows: [{ category: 'rent', amount_cents: 850 }, { category: 'entertainment', amount_cents: 300 }],
      },
      answer: '100', distractors,
    })!;
    if (q.format !== 'money_budget_adjust') throw new Error('format');
    expect(q.content.solve_for).toBe('entertainment');
    expect(q.content.original_rows).toHaveLength(2);
    expect(q.answer).toBe('100');
    expect(q.content.answer_cents).toBe(100);
  });

  it('money_budget_adjust still reads currency when the row carries it', () => {
    const q = normalizeQuestion({
      id: 'M2', skill_ids: ['MONEY-BUDGET-ADJUST-USD'], format: 'money_budget_adjust', image_type: 'table',
      content: {
        solve_for: 'a', original_income_cents: 10, change_event: { type: 'income_drop', new_income_cents: 5 },
        original_rows: [{ category: 'a', amount_cents: 5 }],
      },
      answer: 5, distractors,
    })!;
    if (q.format !== 'money_budget_adjust') throw new Error('format');
    expect(q.content.currency).toBe('USD');
  });
});
