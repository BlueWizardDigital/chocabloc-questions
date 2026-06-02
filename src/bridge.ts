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

const INIT_TIMEOUT_MS = 2000;
const REQUEST_TIMEOUT_MS = 3000;

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

export interface Bridge {
  readonly ctx: BridgeContext | null;
  onReady(cb: ReadyCallback): void;
  started(): void;
  attempt(payload: AttemptPayload): void;
  score(payload: ScorePayload): void;
  saveNotify(): void;
  exit(): void;
  requestNextQuestion(opts?: RequestNextQuestionOptions): Promise<unknown | null>;
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
    default:
      return;
  }
});

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
