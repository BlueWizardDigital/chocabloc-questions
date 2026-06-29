// Host kit — thin, framework-free conveniences over the bridge that every
// ChocaBLOC game needs: a safe boot/context accessor, fail-safe progress
// reporting, and a single answer-check seam (local compare vs F6 server
// validation). Wraps the local `./bridge`, which is import-safe without a
// window — so this module is too.
//
// Deliberately NOT here yet: the question loader (bank → fixture → generate).
// The lib's NormalizedQuestion / normalizeQuestion does not carry F6
// `answerToken`, so the loader needs a question-model decision first.
import {
  bridge,
  type BridgeContext,
  type AttemptPayload,
  type ScorePayload,
} from './bridge';

export type { BridgeContext, AttemptPayload, ScorePayload } from './bridge';

// ── Host context ────────────────────────────────────────────────────────────

function inferStandalone(): boolean {
  return typeof window === 'undefined' || window.self === window.top;
}

function snapshot(): BridgeContext {
  const c = bridge.ctx;
  if (c) return c;
  // Host hasn't reported (or there's no host) — infer a safe standalone context
  // so callers never block on a missing host.
  return {
    standalone: inferStandalone(),
    isMobile: false,
    viewport: { w: 0, h: 0 },
    gradeBand: null,
    grade: null,
    player: null,
  };
}

let current: BridgeContext = snapshot();
let resolved = false;
const waiters: ((c: BridgeContext) => void)[] = [];

bridge.onReady((c) => {
  current = c;
  resolved = true;
  for (const fn of waiters.splice(0)) fn(current);
});

/** The latest known host context, synchronously. Safe before the host replies. */
export function hostContext(): BridgeContext {
  return current;
}

/**
 * Resolve once the host context is known. Fires immediately if already known;
 * otherwise waits for the host, falling back to the inferred context after
 * `timeoutMs` so a standalone game never hangs. Stays resolved after the
 * timeout so repeat calls return immediately; a later host reply still
 * corrects `current`.
 */
export function whenHostReady(timeoutMs = 1500): Promise<BridgeContext> {
  if (resolved) return Promise.resolve(current);
  return new Promise((resolve) => {
    let done = false;
    const finish = (c: BridgeContext) => {
      if (done) return;
      done = true;
      resolved = true;
      current = c;
      const i = waiters.indexOf(finish);
      if (i >= 0) waiters.splice(i, 1);
      resolve(c);
    };
    waiters.push(finish);
    if (typeof window !== 'undefined') window.setTimeout(() => finish(snapshot()), timeoutMs);
  });
}

/** Tell the host gameplay has actually begun. No-op when standalone. */
export function notifyStarted(): void {
  try {
    bridge.started();
  } catch {
    /* no-op when standalone / no host */
  }
}

// ── Progress reporting (fail-safe) ──────────────────────────────────────────
// Telemetry must never crash the game, so every wrapper swallows transport
// errors. Forward the question's `answerToken` on attempts — the host
// re-derives correctness from it server-side.

export function reportAttempt(payload: AttemptPayload): void {
  try {
    bridge.attempt(payload);
  } catch {
    /* never let telemetry crash the game */
  }
}

export function reportScore(payload: ScorePayload): void {
  try {
    bridge.score(payload);
  } catch {
    /* never let telemetry crash the game */
  }
}

export function notifySave(): void {
  try {
    bridge.saveNotify();
  } catch {
    /* never let telemetry crash the game */
  }
}

// ── Answer check (local compare vs F6 server validation) ────────────────────

/** Minimal validator seam — defaults to the bridge; injectable for tests. */
export interface AnswerValidator {
  validateAnswer(opts: {
    answerToken: string;
    studentAnswer: number | string;
  }): Promise<{ isCorrect: boolean }>;
}

/**
 * Resolve correctness for a student's answer.
 * - Local (question carries `answer`): compare here.
 * - F6 (question carries `answerToken`): server-authoritative via the validator.
 * A missing validator or transport failure returns `false` — we cannot confirm,
 * so we never count it correct.
 */
export async function checkAnswer(
  q: { answer?: number | string; answerToken?: string },
  studentAnswer: number | string,
  validator?: AnswerValidator,
): Promise<boolean> {
  if (q.answerToken) {
    const v: AnswerValidator = validator ?? bridge;
    try {
      const res = await v.validateAnswer({ answerToken: q.answerToken, studentAnswer });
      return res.isCorrect === true;
    } catch {
      return false; // cannot confirm → never count as correct
    }
  }
  return q.answer != null && studentAnswer === q.answer;
}
