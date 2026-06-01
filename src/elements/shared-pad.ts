import type { Choice, NormalizedQuestion, ValidateAnswer } from '../types';
import { buildChoicePool } from '../helpers/choice-builder';
import { validateAnswer } from '../helpers/validators';

export function syncChoicePad(
  question: NormalizedQuestion,
  pad: HTMLElement,
  host: HTMLElement,
): void {
  const seedAttr = host.getAttribute('seed');
  const seed = seedAttr !== null ? Number.parseInt(seedAttr, 10) : undefined;
  const opts: { shuffle: boolean; seed?: number } = { shuffle: true };
  if (typeof seed === 'number' && Number.isFinite(seed)) opts.seed = seed;
  const pool: Choice[] = buildChoicePool(question, opts);
  (pad as HTMLElement & { choices: Choice[] }).choices = pool;
  const mode = host.getAttribute('answer-mode') ?? 'mc';
  pad.setAttribute('mode', mode);
  if (host.hasAttribute('disabled')) pad.setAttribute('disabled', '');
  else pad.removeAttribute('disabled');
  // v0.2.0: forward student-answer attribute for review-mode marking.
  // String-coerced comparison happens inside ChocaChoicePad._render (PC-3).
  const studentAnswer = host.getAttribute('student-answer');
  if (studentAnswer != null) pad.setAttribute('student-answer', studentAnswer);
  else pad.removeAttribute('student-answer');
}

export function handlePick(
  host: HTMLElement,
  question: NormalizedQuestion,
  choice: Choice,
  renderedAt: number,
  pad: HTMLElement,
  extras?: Record<string, unknown>,
): void {
  const studentAnswer = choice.value;
  // v0.3.0+: if the host (root <chocabloc-question> or a forwarding inner
  // format element) exposes a `validateAnswer` property, use it instead of
  // the built-in client compare. Lets a host route validation through
  // Phase F6's POST /answer/validate without forking the element.
  //
  // If the host validator rejects (network failure, malformed response,
  // etc.) fall back to the built-in helper so the pad doesn't lock up and
  // the kid still sees a verdict. Hosts that want a different recovery
  // path should wrap their own logic.
  const customValidate = (host as HTMLElement & { validateAnswer?: ValidateAnswer })
    .validateAnswer;
  const verdictPromise =
    typeof customValidate === 'function'
      ? customValidate(question, studentAnswer).catch((err) => {
          console.warn('[chocabloc-question] host validateAnswer rejected — falling back:', err);
          return validateAnswer(question, studentAnswer);
        })
      : validateAnswer(question, studentAnswer);
  void verdictPromise.then((verdict) => {
    pad.setAttribute('disabled', '');
    host.dispatchEvent(
      new CustomEvent('answered', {
        detail: {
          questionId: question.id,
          studentAnswer,
          correct: verdict.correct,
          distractorMatched: verdict.distractorMatched,
          skillTags: verdict.skillTags,
          expected: verdict.expected,
          timeToAnswerMs: performance.now() - renderedAt,
          ...extras,
        },
        bubbles: true,
        composed: true,
      }),
    );
  });
}
