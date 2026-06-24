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

import type {
  AnswerValue,
  NormalizedQuestion,
  ValidateAnswer,
  ValidationResult,
} from './types';

const INIT_TIMEOUT_MS = 2000;
const REQUEST_TIMEOUT_MS = 3000;
const VALIDATE_TIMEOUT_MS = 5000;
const QUESTIONS_TIMEOUT_MS = 4000;

// Input shapes mirror the host's own validators (GamePageWrapper /
// useNextGameQuestion). Applied ONLY on the no-host fetch fallback — the
// postMessage branch sends no gameId, so the host pins it and these never gate it.
const GAME_ID_RE = /^[a-z0-9][a-z0-9-]{0,49}$/;
const SKILL_ID_RE = /^[A-Z][A-Z0-9-]{0,99}$/;
const RECIPE_SLUG_RE = /^[a-z0-9][a-z0-9-]{0,99}$/;

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
  /**
   * Used ONLY by the no-host fetch fallback (game served same-origin with the
   * API, no chocabloc host). Ignored when embedded — the host pins the gameId.
   * Must match /^[a-z0-9][a-z0-9-]{0,49}$/.
   */
  gameId?: string;
}

/**
 * Bulk question-batch request options. Mirrors GET /api/v1/games/:gameId/questions
 * query params. Note: bulk uses `recipe` (the adaptive path uses `recipeSlug`),
 * matching the host's fetchGameQuestions contract.
 */
export interface RequestQuestionsOptions {
  count?: number;
  recipe?: string;
  grade?: number | string;
  /** Used ONLY by the no-host fetch fallback. Ignored when embedded. */
  gameId?: string;
}

/**
 * Attempt payload sent to host. Shape matches GamePageWrapper.tsx's
 * handleQuestionAttempt expectations.
 *
 * v0.5.0-beta.2: `answerToken` is the F6 cross-check field. When present,
 * the server re-derives `isCorrect` from the canonical answer and ignores
 * the client-supplied flag (security fix P1-4 — closes the
 * `chocabloc:attempt` channel that previously let any iframe forge
 * `isCorrect: true` and corrupt mastery/XP). Optional during F6 rollout;
 * once all SDK consumers forward tokens, server will require it.
 */
export interface AttemptPayload {
  questionId: string;
  isCorrect: boolean;
  skillIds?: string[];
  timeToAnswerMs?: number;
  studentAnswer?: unknown;
  answerToken?: string;
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

/**
 * Minimal structural shape for the lib's `<chocabloc-question>` element. Used
 * by attachValidator without importing the concrete class, so the bridge stays
 * DOM-free at the type level.
 */
export interface ChocablocQuestionLike {
  validateAnswer?: ValidateAnswer | undefined;
}

/**
 * F6 question shape accepted by attachValidator. Structural subset of
 * NormalizedQuestion + the wire-only `answerToken` field, which the lib's
 * NormalizedQuestion type does not formally declare today.
 */
export interface AttachValidatorQuestion {
  answerToken?: string;
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
  requestQuestions(opts?: RequestQuestionsOptions): Promise<unknown[]>;
  validateAnswer(opts: ValidateAnswerOptions): Promise<ValidateAnswerResult>;
  attachValidator(
    el: ChocablocQuestionLike,
    question: AttachValidatorQuestion
  ): void;
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

// In-flight chocabloc:questions:request promises keyed by requestId. The deliver
// handler resolves with the whole deliver payload; callers extract `.question` /
// `.questions`. Resolves to null on timeout (never rejects).
interface PendingQuestions {
  resolve: (payload: Record<string, unknown> | null) => void;
  timer: ReturnType<typeof setTimeout>;
}
const pendingQuestions = new Map<string, PendingQuestions>();

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
  // Same-origin only in v0.5: reject messages from a different origin. Allow
  // empty string (Edge/legacy same-origin quirk) since we already gated on
  // window.parent. Cross-origin support is future work — see handoff doc.
  if (e.origin !== '' && e.origin !== window.location.origin) return;

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
    case 'chocabloc:questions:deliver': {
      handleQuestionsDeliver(msg.payload);
      return;
    }
    default:
      return;
  }
});

function handleQuestionsDeliver(payload: unknown): void {
  // Ignore anything we can't tie to a pending request (late / duplicate /
  // malformed). An error envelope ({ requestId, error }) carries no question(s),
  // so callers naturally degrade to null / [].
  if (!payload || typeof payload !== 'object') return;
  const p = payload as Record<string, unknown>;
  if (typeof p.requestId !== 'string') return;

  const pending = pendingQuestions.get(p.requestId);
  if (!pending) return;

  clearTimeout(pending.timer);
  pendingQuestions.delete(p.requestId);
  pending.resolve(p);
}

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

/**
 * Convenience sugar over the existing v0.4.0-beta.0 `el.validateAnswer`
 * property setter. When `question.answerToken` is present (F6 payload),
 * assigns a validator function that proxies via `bridge.validateAnswer()`
 * and adapts the server response to the lib's ValidationResult shape:
 *
 *   isCorrect          → correct
 *   expected           → expected
 *   distractorMatched  → distractorMatched (errorType null coerced to '')
 *   q.skillIds         → skillTags
 *
 * When `answerToken` is absent (pre-F6 payload), no-op — the lib's pure
 * helper handles validation as before.
 *
 * This is NOT a new validation capability — it's a 1-line replacement for
 *   el.validateAnswer = (q, sa) => bridge.validateAnswer({...}).then(...)
 * so iframe-game consumers don't hand-roll the conversion. Safe to call on
 * any pick — same token, same closure.
 */
function attachValidator(
  el: ChocablocQuestionLike,
  question: AttachValidatorQuestion
): void {
  if (
    typeof question.answerToken !== 'string' ||
    question.answerToken.length === 0
  ) {
    return; // pre-F6 question — lib falls back to pure helper
  }
  const token = question.answerToken;
  el.validateAnswer = async (
    q: NormalizedQuestion,
    studentAnswer: AnswerValue
  ): Promise<ValidationResult> => {
    const result = await validateAnswer({ answerToken: token, studentAnswer });
    return {
      correct: result.isCorrect,
      expected: result.expected,
      distractorMatched: result.distractorMatched
        ? {
            value: result.distractorMatched.value,
            // Lib's Distractor.errorType is required string; server may
            // return null when no error-type tag exists for the distractor.
            errorType: result.distractorMatched.errorType ?? '',
          }
        : null,
      skillTags: q.skillIds,
    };
  };
}

// Generate a unique request id for postMessage round-trips. Mirrors the
// validateAnswer requestId scheme: a bare crypto.randomUUID() when available,
// otherwise a fallback id. The `qr-` (questions) / `vr-` (validate) prefixes
// only distinguish the two channels' NON-crypto fallback ids.
function makeRequestId(): string {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `qr-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

// Post a questions request to the host and await its chocabloc:questions:deliver.
// Resolves to the deliver payload, or null on timeout / parent gone. Never rejects.
function postQuestionsRequest(
  payload: Record<string, unknown>
): Promise<Record<string, unknown> | null> {
  return new Promise((resolve) => {
    const requestId = makeRequestId();
    const timer = setTimeout(() => {
      pendingQuestions.delete(requestId);
      resolve(null);
    }, QUESTIONS_TIMEOUT_MS);
    pendingQuestions.set(requestId, { resolve, timer });
    try {
      window.parent.postMessage(
        { type: 'chocabloc:questions:request', payload: { requestId, ...payload } },
        parentOrigin || '*'
      );
    } catch {
      clearTimeout(timer);
      pendingQuestions.delete(requestId);
      resolve(null);
    }
  });
}

// Same-origin GET with credentials and a hard timeout. Returns the parsed JSON
// body, or null on non-2xx / network error / abort. Never throws.
async function fetchJson(url: string): Promise<Record<string, unknown> | null> {
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
    return (await res.json()) as Record<string, unknown>;
  } catch {
    clearTimeout(timer);
    return null;
  }
}

// Request the next adaptive question. Embedded (host present): routes through the
// host's chocabloc:questions:request channel — the host pins the gameId from the
// iframe's manifest, so any caller-supplied gameId is ignored. No host: falls back
// to a same-origin relative fetch using a validated caller-supplied gameId.
// Returns the canonical question verbatim, or null (standalone with no gameId,
// invalid gameId, timeout, fetch failure, or non-2xx). Never throws.
// Call after bridge.onReady so `ctx` is populated.
async function requestNextQuestion(
  opts: RequestNextQuestionOptions = {}
): Promise<unknown | null> {
  // Host present? Gate on ctx (not inIframe): a framed game whose host never
  // sent chocabloc:init drops to the fetch fallback after INIT_TIMEOUT_MS.
  if (ctx && !ctx.standalone) {
    const payload: Record<string, unknown> = { mode: 'adaptive' };
    if (opts.skillId) payload.skillId = opts.skillId;
    if (opts.recipeSlug) payload.recipeSlug = opts.recipeSlug;
    const deliver = await postQuestionsRequest(payload);
    return deliver?.question ?? null;
  }

  // No host → same-origin fetch fallback. Requires a valid gameId.
  if (!opts.gameId || !GAME_ID_RE.test(opts.gameId)) return null;
  const params = new URLSearchParams();
  if (opts.skillId) {
    if (!SKILL_ID_RE.test(opts.skillId)) return null;
    params.set('skillId', opts.skillId);
  }
  if (opts.recipeSlug) {
    if (!RECIPE_SLUG_RE.test(opts.recipeSlug)) return null;
    params.set('recipeSlug', opts.recipeSlug);
  }
  const qs = params.toString();
  const url = `/api/v1/games/${encodeURIComponent(opts.gameId)}/questions/next${qs ? `?${qs}` : ''}`;
  const body = await fetchJson(url);
  return body?.question ?? null;
}

// Request a bulk batch of questions (e.g. a full board). Embedded: host channel
// (bulk = no `mode`), host pins gameId. No host: same-origin relative fetch with
// a validated caller-supplied gameId. Returns the canonical questions array
// verbatim, or [] on standalone-without-gameId / invalid gameId / timeout /
// error reply / fetch failure. Never throws. Call after bridge.onReady.
async function requestQuestions(
  opts: RequestQuestionsOptions = {}
): Promise<unknown[]> {
  // Host present (ctx-based gate; see requestNextQuestion).
  if (ctx && !ctx.standalone) {
    const payload: Record<string, unknown> = {};
    if (Number.isFinite(opts.count)) payload.count = opts.count;
    if (opts.recipe) payload.recipe = opts.recipe;
    if (opts.grade !== undefined && opts.grade !== null) payload.grade = opts.grade;
    const deliver = await postQuestionsRequest(payload);
    const questions = deliver?.questions;
    return Array.isArray(questions) ? questions : [];
  }

  if (!opts.gameId || !GAME_ID_RE.test(opts.gameId)) return [];
  const params = new URLSearchParams();
  if (Number.isFinite(opts.count)) params.set('count', String(opts.count));
  if (opts.grade !== undefined && opts.grade !== null) {
    params.set('grade', String(opts.grade));
  }
  if (opts.recipe) {
    if (!RECIPE_SLUG_RE.test(opts.recipe)) return [];
    params.set('recipe', opts.recipe);
  }
  const qs = params.toString();
  const url = `/api/v1/games/${encodeURIComponent(opts.gameId)}/questions${qs ? `?${qs}` : ''}`;
  const body = await fetchJson(url);
  const questions = body?.questions;
  return Array.isArray(questions) ? questions : [];
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
  requestQuestions(opts?: RequestQuestionsOptions) {
    return requestQuestions(opts);
  },
  validateAnswer(opts: ValidateAnswerOptions) {
    return validateAnswer(opts);
  },
  attachValidator(el: ChocablocQuestionLike, question: AttachValidatorQuestion) {
    attachValidator(el, question);
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
