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
  if (!question.distractors) return null;
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
  // v0.4.0+: server-validated shape has no `answer` field. The built-in
  // validator can't determine correctness — caller MUST wire a host
  // validateAnswer on <chocabloc-question>. If not wired, every pick falls
  // through to this branch and returns correct:false so the kid sees
  // their pick marked wrong + a warn lands in the console for diagnosis.
  if (question.answer === undefined) {
    console.warn(
      '[chocabloc-questions] validateLocal called on a server-validated ' +
        'question (no `answer` field). Set `validateAnswer` on ' +
        '<chocabloc-question> to route through your server endpoint.',
    );
    return {
      correct: false,
      skillTags: question.skillIds,
      distractorMatched: null,
    };
  }
  const correct = valuesEqual(question.answer, studentAnswer);
  const distractorMatched = correct ? null : matchesDistractor(question, studentAnswer);
  return {
    correct,
    skillTags: question.skillIds,
    distractorMatched,
    expected: question.answer,
  };
}
