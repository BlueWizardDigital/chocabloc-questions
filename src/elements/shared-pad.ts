import type {
  Choice,
  NormalizedQuestion,
  ValidateAnswer,
  ValidationResult,
} from '../types';
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
  //
  // v0.4.0+: choices-only questions (no `answer` field) REQUIRE a host
  // validator. If we fall through to the built-in here, every pick will
  // be marked wrong (validateLocal returns correct:false + warn). Dispatch
  // a misconfigured event so the host page can surface the issue
  // (Sentry, banner, refuse-to-render) instead of silently regressing.
  const customValidate = (host as HTMLElement & { validateAnswer?: ValidateAnswer })
    .validateAnswer;
  if (typeof customValidate !== 'function' && question.answer === undefined) {
    host.dispatchEvent(
      new CustomEvent('chocabloc-misconfigured', {
        detail: {
          reason: 'choices-only-without-host-validator',
          questionId: question.id,
        },
        bubbles: true,
        composed: true,
      }),
    );
  }
  // v0.5.0-beta.2: when the question is choices-only (no `answer`) AND the
  // host validator rejects, do NOT fall through to the built-in helper. The
  // built-in returns `correct: false` for every studentAnswer when `answer`
  // is undefined, which would silently mark a correct kid wrong during a
  // validate-endpoint outage. Surface a `chocabloc-validation-unavailable`
  // event and leave the pad interactive so the host can render a retry UX.
  const choicesOnly = question.answer === undefined;
  const verdictPromise: Promise<ValidationResult | null> =
    typeof customValidate === 'function'
      ? customValidate(question, studentAnswer).catch((err) => {
          if (choicesOnly) {
            console.warn(
              '[chocabloc-question] host validateAnswer rejected and no local answer to fall back on:',
              err,
            );
            host.dispatchEvent(
              new CustomEvent('chocabloc-validation-unavailable', {
                detail: {
                  reason: 'host-validator-rejected',
                  questionId: question.id,
                  error: err,
                },
                bubbles: true,
                composed: true,
              }),
            );
            return null;
          }
          console.warn('[chocabloc-question] host validateAnswer rejected — falling back:', err);
          return validateAnswer(question, studentAnswer);
        })
      : validateAnswer(question, studentAnswer);
  void verdictPromise.then((verdict) => {
    if (verdict === null) return; // validation unavailable: leave pad enabled, no `answered` event
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
