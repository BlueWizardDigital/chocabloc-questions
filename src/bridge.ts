// Portable bridge to ChocaBLOC portal. Defensive — every method is a no-op
// when the game runs standalone or the portal never responds.
//
// The bridge deliberately has no ChocaBLOC imports and no hard-coded origins,
// so this file drops into any host (ChocaBLOC, another portal, direct browse).
//
// Source: ported 1:1 from chocabloc/client/public/games/monkey-money/src/
// chocablocBridge.js (MM bridge, audited 2026-05-11). TypeScript types added,
// no logic change. Phase 1.5 security invariants preserved verbatim:
//   - inbound source-check (e.source === window.parent)
//   - parentOrigin capture only after gate passes
//   - explicit switch allow-list (no fallthrough default)
//   - 2-second standalone fallback timer

import type { AnswerValue } from './types';

const INIT_TIMEOUT_MS = 2000;
const REQUEST_TIMEOUT_MS = 3000;
const VALIDATE_TIMEOUT_MS = 5000;

/**
 * Bridge context delivered by the host on boot, or synthesized for standalone.
 * Consumers should treat `standalone === true` as "no host" and degrade
 * gracefully — every bridge method below is already a no-op in that mode.
 */
export interface BridgeContext {
  standalone: boolean;
  isMobile: boolean;
  viewport: { w: number; h: number };
  gradeBand: string | null;
  grade: number | string | null;
  player: unknown;
}

export type ReadyCallback = (ctx: BridgeContext) => void;

/**
 * Next-question request options. Mirrors GET /api/v1/games/:gameId/questions/next
 * query params. Only one of skillId / recipeSlug may be set (server rejects both).
 */
export interface RequestNextQuestionOptions {
  skillId?: string;
  recipeSlug?: string;
}

/**
 * Attempt payload sent to host. Shape matches GamePageWrapper.tsx's
 * handleQuestionAttempt expectations.
 */
export interface AttemptPayload {
  questionId: string;
  isCorrect: boolean;
  skillIds?: string[];
  timeToAnswerMs?: number;
  studentAnswer?: unknown;
}

/**
 * Score payload sent at level/round complete. Host treats this as the
 * "level complete" signal and awards XP.
 */
export interface ScorePayload {
  score: number;
  stars?: number;
  xp?: number;
}

/**
 * F6 server-side validation request payload. Sent to host via postMessage;
 * host POSTs to /api/v1/answer/validate using its own session + CSRF setup
 * and replies via chocabloc:validate:deliver.
 */
export interface ValidateAnswerOptions {
  answerToken: string;
  studentAnswer: AnswerValue;
}

/**
 * F6 server-side validation result. Mirrors /api/v1/answer/validate response
 * shape. `errorType` may be null even when distractor matched (server may not
 * have an error-type tag for some distractors).
 */
export interface ValidateAnswerResult {
  isCorrect: boolean;
  expected: AnswerValue;
  distractorMatched: { value: AnswerValue; errorType: string | null } | null;
}

/**
 * Local timeout — host never replied within VALIDATE_TIMEOUT_MS. Indicates
 * a transport problem (host crashed, postMessage dropped, parent gone).
 * Distinct from BridgeStandaloneError: here a host EXISTS but did not answer.
 * Consumers should NOT treat this as "answer was wrong"; surface a retry UX
 * or fail visibly to the operator.
 */
export class BridgeTimeoutError extends Error {
  constructor(public readonly requestId: string) {
    super(`bridge.validateAnswer timed out after ${VALIDATE_TIMEOUT_MS}ms`);
    this.name = 'BridgeTimeoutError';
  }
}

/**
 * No host present — game is running standalone (not in an iframe, or host
 * never responded with chocabloc:init). Validation is impossible because
 * there is no party to POST /api/v1/answer/validate on the game's behalf.
 * Distinct from BridgeTimeoutError so telemetry + debugging can tell apart
 * "host crashed" from "no host at all".
 */
export class BridgeStandaloneError extends Error {
  constructor() {
    super('bridge.validateAnswer called in standalone mode (no host present)');
    this.name = 'BridgeStandaloneError';
  }
}

/**
 * Server returned { error: { code: "INVALID_TOKEN" } } — token signature
 * failed verification, token bound to a different question/user, or token
 * format invalid. Consumer should refetch the question and retry.
 */
export class InvalidTokenError extends Error {
  constructor(public readonly requestId: string, message?: string) {
    super(message ?? 'answerToken rejected by server');
    this.name = 'InvalidTokenError';
  }
}

/**
 * Server returned { error: { code: "EXPIRED_TOKEN" } } — token's 15-min TTL
 * has elapsed. Consumer should refetch the question and retry.
 */
export class ExpiredTokenError extends Error {
  constructor(public readonly requestId: string, message?: string) {
    super(message ?? 'answerToken expired');
    this.name = 'ExpiredTokenError';
  }
}

/**
 * Server reply did not match the expected ValidateAnswerResult shape. Should
 * be impossible in well-behaved deployments; signals a protocol drift between
 * server and lib. Consumer should NOT treat this as "answer was wrong";
 * surface visibly to the operator.
 */
export class MalformedResponseError extends Error {
  constructor(public readonly requestId: string, message?: string) {
    super(message ?? 'chocabloc:validate:deliver payload malformed');
    this.name = 'MalformedResponseError';
  }
}

export interface Bridge {
  readonly ctx: BridgeContext | null;
  onReady(cb: ReadyCallback): void;
  started(): void;
  attempt(payload: AttemptPayload): void;
  score(payload: ScorePayload): void;
  saveNotify(): void;
  exit(): void;
  requestNextQuestion(opts?: RequestNextQuestionOptions): Promise<unknown | null>;
  validateAnswer(opts: ValidateAnswerOptions): Promise<ValidateAnswerResult>;
}

const inIframe: boolean = (() => {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
})();

let ctx: BridgeContext | null = null;
let readyCbs: ReadyCallback[] = [];
let initTimer: ReturnType<typeof setTimeout> | null = null;
// Captured from the first chocabloc:init message so subsequent posts target
// that exact origin instead of wildcard '*'. Falls back to '*' if unknown
// (pre-init / parent gone).
let parentOrigin: string | null = null;

// In-flight chocabloc:validate:request promises keyed by requestId. Entries
// are removed on resolve / reject / timeout. Map (not object) so iteration
// order is preserved and `delete` is O(1).
interface PendingValidate {
  resolve: (result: ValidateAnswerResult) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}
const pendingValidates = new Map<string, PendingValidate>();

function deliverReady(payload: BridgeContext): void {
  if (ctx) return;
  ctx = payload;
  for (const cb of readyCbs) {
    try {
      cb(ctx);
    } catch {
      /* ignore */
    }
  }
  readyCbs = [];
}

function enterStandalone(): void {
  const mm =
    typeof matchMedia === 'function' ? matchMedia('(max-width: 768px)') : null;
  deliverReady({
    standalone: true,
    isMobile: mm?.matches ?? false,
    viewport: { w: window.innerWidth, h: window.innerHeight },
    gradeBand: null,
    grade: null,
    player: null,
  });
}

window.addEventListener('message', (e: MessageEvent) => {
  // Correction F1: only trust messages from our actual parent. The host
  // already enforces the symmetric check (e.source === iframeWin) in
  // GamePageWrapper.tsx; this closes the asymmetric gap on the game side.
  // Without this, an attacker tab/popup/extension with a window handle to
  // the iframe could forge chocabloc:init and poison parentOrigin, redirecting
  // subsequent bridge.score / bridge.attempt / bridge.save-notify posts to
  // the attacker's origin.
  if (e.source !== window.parent) return;

  const msg = e.data;
  if (
    !msg ||
    typeof msg.type !== 'string' ||
    !msg.type.startsWith('chocabloc:')
  ) {
    return;
  }

  // Correction F3: explicit allow-list. Future protocol additions must opt
  // in here — silently accepting any chocabloc:* type is a footgun.
  switch (msg.type) {
    case 'chocabloc:init': {
      if (initTimer) {
        clearTimeout(initTimer);
        initTimer = null;
      }
      if (e.origin && e.origin !== 'null') parentOrigin = e.origin;
      const p = (msg.payload ?? {}) as Partial<BridgeContext>;
      deliverReady({
        standalone: false,
        isMobile: !!p.isMobile,
        viewport: p.viewport ?? { w: window.innerWidth, h: window.innerHeight },
        gradeBand: p.gradeBand ?? null,
        grade: p.grade ?? null,
        player: p.player ?? null,
      });
      return;
    }
    case 'chocabloc:validate:deliver': {
      handleValidateDeliver(msg.payload);
      return;
    }
    default:
      return;
  }
});

function handleValidateDeliver(payload: unknown): void {
  // Defensive: ignore any deliver we can't tie to a pending request. Avoids
  // unhandled-rejection on duplicate / late / malformed replies.
  if (!payload || typeof payload !== 'object') return;
  const p = payload as Record<string, unknown>;
  if (typeof p.requestId !== 'string') return;

  const pending = pendingValidates.get(p.requestId);
  if (!pending) return; // already timed out, or duplicate delivery

  clearTimeout(pending.timer);
  pendingValidates.delete(p.requestId);

  // Server error envelope path.
  const err = p.error;
  if (err && typeof err === 'object') {
    const errObj = err as { code?: unknown; message?: unknown };
    const code = typeof errObj.code === 'string' ? errObj.code : null;
    const message =
      typeof errObj.message === 'string' ? errObj.message : undefined;
    if (code === 'INVALID_TOKEN') {
      pending.reject(new InvalidTokenError(p.requestId, message));
    } else if (code === 'EXPIRED_TOKEN') {
      pending.reject(new ExpiredTokenError(p.requestId, message));
    } else {
      pending.reject(
        new MalformedResponseError(
          p.requestId,
          message ?? `server error (code=${code ?? 'unknown'})`
        )
      );
    }
    return;
  }

  // Success envelope: validate shape before resolving.
  if (typeof p.isCorrect !== 'boolean') {
    pending.reject(
      new MalformedResponseError(p.requestId, 'isCorrect missing or wrong type')
    );
    return;
  }
  if (p.expected === undefined) {
    pending.reject(
      new MalformedResponseError(p.requestId, 'expected field missing')
    );
    return;
  }
  if (p.distractorMatched !== null && typeof p.distractorMatched !== 'object') {
    pending.reject(
      new MalformedResponseError(p.requestId, 'distractorMatched malformed')
    );
    return;
  }

  pending.resolve({
    isCorrect: p.isCorrect,
    expected: p.expected as AnswerValue,
    distractorMatched: p.distractorMatched as ValidateAnswerResult['distractorMatched'],
  });
}

function send(type: string, payload?: unknown): void {
  if (!inIframe) return;
  try {
    window.parent.postMessage(
      payload === undefined ? { type } : { type, payload },
      parentOrigin || '*'
    );
  } catch {
    /* parent gone, silent */
  }
}

/**
 * F6 server-side answer validation. Posts the token + student answer to host
 * via chocabloc:validate:request; host hits /api/v1/answer/validate using its
 * existing auth/CSRF setup and replies with chocabloc:validate:deliver.
 *
 * Throws (never resolves) when:
 *   - game is standalone (no host) → BridgeStandaloneError (rejects immediately)
 *   - host doesn't reply in VALIDATE_TIMEOUT_MS → BridgeTimeoutError
 *   - server rejects token → InvalidTokenError | ExpiredTokenError
 *   - reply shape is malformed → MalformedResponseError
 *
 * The lib element's host-validator catch turns a rejection into a fall-through
 * to the built-in pure helper. For pre-F6 payloads (canonical.answer present)
 * that's a safe degradation; for choices-only F6 payloads it produces a silent
 * wrong-mark + fires `chocabloc-misconfigured`. See Risk 4 in v0.5 plan.
 */
function validateAnswer(
  opts: ValidateAnswerOptions
): Promise<ValidateAnswerResult> {
  return new Promise<ValidateAnswerResult>((resolve, reject) => {
    if (!inIframe) {
      reject(new BridgeStandaloneError());
      return;
    }
    const requestId =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `vr-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    const timer = setTimeout(() => {
      // Late delivery after timeout: handleValidateDeliver skips the entry
      // already because we delete here first.
      pendingValidates.delete(requestId);
      reject(new BridgeTimeoutError(requestId));
    }, VALIDATE_TIMEOUT_MS);

    pendingValidates.set(requestId, { resolve, reject, timer });

    try {
      window.parent.postMessage(
        {
          type: 'chocabloc:validate:request',
          payload: {
            requestId,
            answerToken: opts.answerToken,
            studentAnswer: opts.studentAnswer,
          },
        },
        parentOrigin || '*'
      );
    } catch (err) {
      // Parent gone or postMessage threw — clean up + reject so caller knows
      // the request never left.
      clearTimeout(timer);
      pendingValidates.delete(requestId);
      reject(new BridgeTimeoutError(requestId));
    }
  });
}

// Request the next adaptive question from the bank. Server emits the canonical
// chocabloc question shape (camelCase: skillIds, imageType, questionText, plus
// answer + distractors[]) directly — same shape the chocabloc-questions lib
// normalizer accepts as input. So we pass response.question through verbatim.
// Resolves to the canonical question on success, or null if standalone / fetch
// failure / timeout / non-2xx. Never throws.
async function requestNextQuestion(
  opts: RequestNextQuestionOptions = {}
): Promise<unknown | null> {
  if (!ctx || ctx.standalone) return null;

  const params = new URLSearchParams();
  if (opts.skillId) params.set('skillId', opts.skillId);
  if (opts.recipeSlug) params.set('recipeSlug', opts.recipeSlug);

  const qs = params.toString();
  const url = `/api/v1/games/monkey-money/questions/next${qs ? `?${qs}` : ''}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method: 'GET',
      credentials: 'include',
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const body = await res.json();
    return body?.question ?? null;
  } catch {
    clearTimeout(timer);
    return null;
  }
}

export const bridge: Bridge = {
  get ctx() {
    return ctx;
  },
  onReady(cb: ReadyCallback) {
    if (ctx) {
      try {
        cb(ctx);
      } catch {
        /* ignore */
      }
      return;
    }
    readyCbs.push(cb);
  },
  started() {
    send('chocabloc:started');
  },
  attempt(p: AttemptPayload) {
    send('chocabloc:attempt', p);
  },
  score(p: ScorePayload) {
    send('chocabloc:score', p);
  },
  saveNotify() {
    send('chocabloc:save-notify');
  },
  exit() {
    send('chocabloc:exit');
  },
  requestNextQuestion(opts?: RequestNextQuestionOptions) {
    return requestNextQuestion(opts);
  },
  validateAnswer(opts: ValidateAnswerOptions) {
    return validateAnswer(opts);
  },
};

if (inIframe) {
  try {
    window.parent.postMessage({ type: 'chocabloc:ready' }, '*');
  } catch {
    enterStandalone();
  }
  initTimer = setTimeout(enterStandalone, INIT_TIMEOUT_MS);
} else {
  enterStandalone();
}
