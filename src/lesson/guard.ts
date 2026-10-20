import type { AnswerValue, NormalizedQuestion, ValidateAnswer, ValidationResult } from '../types';
import type { Outcome } from './flow';

export type GuardState = 'waiting' | 'checking' | 'failed' | 'done';

export interface GuardResult {
  studentAnswer: AnswerValue | null;
  outcome: Outcome;
  expected: AnswerValue | null;
}

export interface AnswerGuard {
  readonly state: GuardState;
  /** Give this to <chocabloc-question>.validateAnswer. */
  readonly validator: ValidateAnswer;
  /** Accepted only while waiting. */
  unsure(): boolean;
  /** Only in 'failed': re-sends the same question and first answer to the host. */
  checkAgain(): void;
  /** After this, nothing is reported. */
  dispose(): void;
}

interface GuardOptions {
  question: NormalizedQuestion;
  host: ValidateAnswer;
  onState(s: GuardState): void;
  onResult(r: GuardResult): void;
  onFailed(err: unknown): void;
}

export function createAnswerGuard(o: GuardOptions): AnswerGuard {
  let state: GuardState = 'waiting';
  let disposed = false;
  let first: AnswerValue | null = null;

  const setState = (s: GuardState): void => {
    state = s;
    o.onState(s);
  };

  // Set just before a host failure is thrown, so checkAgain can swallow that one error
  // and let anything thrown by onState or onResult surface.
  let hostFailureReported = false;

  const fail = (err: unknown): never => {
    setState('failed');
    o.onFailed(err);
    hostFailureReported = true;
    throw err;
  };

  const send = (answer: AnswerValue): Promise<ValidationResult> => {
    let call: Promise<ValidationResult>;
    try {
      call = Promise.resolve(o.host(o.question, answer));
    } catch (err) {
      call = Promise.reject(err);
    }
    return call.then(
      (verdict) => {
        if (disposed) return new Promise<ValidationResult>(() => {});
        if (verdict == null || typeof verdict.correct !== 'boolean') {
          return fail(new Error('host returned a verdict without a boolean "correct"'));
        }
        setState('done');
        o.onResult({
          studentAnswer: answer,
          outcome: verdict.correct ? 'right' : 'wrong',
          expected: verdict.expected ?? null,
        });
        return verdict;
      },
      (err) => {
        if (disposed) return new Promise<ValidationResult>(() => {});
        return fail(err);
      },
    );
  };

  return {
    get state() {
      return state;
    },
    validator(question, studentAnswer) {
      if (state !== 'waiting' || disposed || question !== o.question) return new Promise(() => {});
      first = studentAnswer;
      setState('checking');
      return send(studentAnswer);
    },
    unsure() {
      if (state !== 'waiting' || disposed) return false;
      setState('done');
      o.onResult({ studentAnswer: null, outcome: 'unsure', expected: null });
      return true;
    },
    checkAgain() {
      if (state !== 'failed' || disposed || first == null) return;
      hostFailureReported = false;
      setState('checking');
      send(first).catch((err) => {
        if (!hostFailureReported) throw err;
        hostFailureReported = false; // already reported through onFailed
      });
    },
    dispose() {
      disposed = true;
    },
  };
}
