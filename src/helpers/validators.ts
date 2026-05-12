import type {
  AnswerValue,
  Distractor,
  NormalizedQuestion,
  ValidationResult,
} from '../types';

function valuesEqual(a: AnswerValue, b: AnswerValue): boolean {
  if (typeof a === 'number' && typeof b === 'number') return a === b;
  if (typeof a === 'string' && typeof b === 'string') return a === b;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((v, i) => v === b[i]);
  }
  if (typeof a === 'number' && typeof b === 'string') return numericCompare(a, b);
  if (typeof b === 'number' && typeof a === 'string') return numericCompare(b, a);
  return false;
}

const NUMERIC_PATTERN = /^-?(\d+\.?\d*|\.\d+)$/;

function numericCompare(numeric: number, str: string): boolean {
  // Only coerce when the string is unambiguously a number representation.
  // Rejects empty string, whitespace-only, "abc", "12abc", etc.
  const trimmed = str.trim();
  if (trimmed === '' || !NUMERIC_PATTERN.test(trimmed)) return false;
  const n = Number(trimmed);
  if (!Number.isFinite(n)) return false;
  return numeric === n;
}

export function matchesDistractor(
  question: NormalizedQuestion,
  studentAnswer: AnswerValue,
): Distractor | null {
  for (const d of question.distractors) {
    if (valuesEqual(d.value, studentAnswer)) return d;
  }
  return null;
}

export function validateAnswer(
  question: NormalizedQuestion,
  studentAnswer: AnswerValue,
): Promise<ValidationResult> {
  return Promise.resolve(validateLocal(question, studentAnswer));
}

function validateLocal(
  question: NormalizedQuestion,
  studentAnswer: AnswerValue,
): ValidationResult {
  const correct = valuesEqual(question.answer, studentAnswer);
  const distractorMatched = correct ? null : matchesDistractor(question, studentAnswer);
  return {
    correct,
    skillTags: question.skillIds,
    distractorMatched,
    expected: question.answer,
  };
}
