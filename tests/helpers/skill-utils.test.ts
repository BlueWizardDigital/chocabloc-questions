import { describe, it, expect } from 'vitest';
import { isValidSkillId, matchesGradeFilter } from '../../src/helpers/skill-utils';
import type { MoneyQuestion } from '../../src/types';

describe('isValidSkillId', () => {
  it('accepts UPPER-KEBAB', () => {
    expect(isValidSkillId('MONEY-COIN-VALUE-USD')).toBe(true);
    expect(isValidSkillId('DATA-BAR-GRAPH-READ')).toBe(true);
  });

  it('rejects lowercase', () => {
    expect(isValidSkillId('money-coin')).toBe(false);
  });

  it('rejects empty', () => {
    expect(isValidSkillId('')).toBe(false);
  });

  it('rejects spaces', () => {
    expect(isValidSkillId('MONEY COIN')).toBe(false);
  });
});

describe('matchesGradeFilter', () => {
  const q: MoneyQuestion = {
    id: 'X',
    skillIds: ['MONEY-COIN-VALUE-USD'],
    gradeBand: 'adventure',
    gradeLevel: 4,
    format: 'money',
    imageType: 'coins',
    content: { coins: { penny: 1 }, currency: 'USD' },
    answer: 1,
    distractors: [],
  };

  it('matches by gradeBand', () => {
    expect(matchesGradeFilter(q, { gradeBand: 'adventure' })).toBe(true);
    expect(matchesGradeFilter(q, { gradeBand: 'sprout' })).toBe(false);
  });

  it('matches by grade number', () => {
    expect(matchesGradeFilter(q, { grade: 4 })).toBe(true);
    expect(matchesGradeFilter(q, { grade: 7 })).toBe(false);
  });

  it('no filter = always matches', () => {
    expect(matchesGradeFilter(q, {})).toBe(true);
  });
});
