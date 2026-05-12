import type { GradeBand, NormalizedQuestion, SkillId } from '../types';

const SKILL_ID_PATTERN = /^[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+$/;

export function isValidSkillId(id: string): id is SkillId {
  return SKILL_ID_PATTERN.test(id);
}

export type GradeFilter = {
  gradeBand?: GradeBand;
  grade?: number;
};

export function matchesGradeFilter(q: NormalizedQuestion, filter: GradeFilter): boolean {
  if (filter.gradeBand && q.gradeBand !== filter.gradeBand) return false;
  if (typeof filter.grade === 'number' && q.gradeLevel !== filter.grade) return false;
  return true;
}
