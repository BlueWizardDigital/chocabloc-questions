/**
 * Concept saver — `chocabloc-questions/concept-run`.
 *
 * Tracks one run's ACTIVE play time and reports it to the host in pieces, so practice
 * from a run that never formally ends (Restart, Home, a closed page) still counts.
 * Platform rule (2026-10-02): a gap between taps/keys counts at most 2 minutes; a
 * hidden tab or a paused game never counts.
 *
 * Every piece is whole numbers within the server's bounds and carries the run id as
 * clientSessionId (the server counts a run once). Each piece is marked sent BEFORE it
 * is sent and never retried: the bridge answers null for a timeout and an error alike,
 * so a retry could record the same practice twice. Nothing here throws into the game.
 *
 * No runtime import of the bridge: the game passes `bridge.reportConceptSession` in, so
 * a game that copies `bridge.ts` keeps it self-contained.
 */
import type { ConceptSessionPayload } from './bridge';

export const CONCEPT_IDLE_MS = 2 * 60 * 1000;
export const CONCEPT_CHECKPOINT_MS = 60 * 1000;
export const CONCEPT_HIDE_MIN_MS = 15 * 1000;
export const CONCEPT_TICK_MS = 5 * 1000;

// Server bounds (validateConceptSession). Larger values are capped so a piece is never
// rejected.
const MAX_TIME_MS = 86_400_000;
const MAX_LEVELS = 10_000;
const MAX_XP = 1_000_000;
const MAX_CORRECT = 100_000;

const INPUT_OPTS = { capture: true, passive: true } as const;
const INPUT_EVENTS = ['pointerdown', 'keydown'] as const;

interface Listenable {
  addEventListener(type: string, fn: () => void, opts?: AddEventListenerOptions | boolean): void;
  removeEventListener(type: string, fn: () => void, opts?: EventListenerOptions | boolean): void;
}

export interface ConceptRunEnv {
  now(): number;
  window: Listenable | null;
  document: (Listenable & { hidden: boolean }) | null;
  setInterval(fn: () => void, ms: number): unknown;
  clearInterval(handle: unknown): void;
  newId(): string;
}

export interface ConceptRunResult {
  levels?: number;
  xp?: number;
}

export interface ConceptRunOptions {
  /** `bridge.reportConceptSession`. Its result is ignored; a throw or rejection is logged. */
  report: (payload: ConceptSessionPayload) => unknown;
  /** What `bridge.requestConcept()` gave the game: the value or the promise. Nothing is
   *  sent until it settles to something truthy (signed out / standalone → never). */
  concept: unknown;
  /** The game files practice per sub-topic with setConcept(). A stretch with no concept
   *  is dropped, never sent without one. */
  perConcept?: boolean;
  /** Test seams; real browser globals by default. */
  env?: Partial<ConceptRunEnv>;
}

export interface ConceptRun {
  start(): void;
  pause(paused: boolean): void;
  correct(n?: number): void;
  add(result: ConceptRunResult): void;
  setConcept(conceptId: string | null): void;
  abandon(): void;
  finish(result?: ConceptRunResult): void;
  dispose(): void;
}

export function defaultRunId(): string {
  const c = typeof crypto !== 'undefined' ? (crypto as { randomUUID?: () => string }) : undefined;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  return 'run-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

function defaultNow(): number {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
}

function withDefaults(env: Partial<ConceptRunEnv> = {}): ConceptRunEnv {
  return {
    now: env.now ?? defaultNow,
    window:
      env.window !== undefined
        ? env.window
        : typeof window !== 'undefined'
          ? (window as unknown as Listenable)
          : null,
    document:
      env.document !== undefined
        ? env.document
        : typeof document !== 'undefined'
          ? (document as unknown as Listenable & { hidden: boolean })
          : null,
    setInterval: env.setInterval ?? ((fn, ms) => setInterval(fn, ms)),
    clearInterval: env.clearInterval ?? ((h) => clearInterval(h as ReturnType<typeof setInterval>)),
    newId: env.newId ?? defaultRunId,
  };
}

function warn(err: unknown): void {
  try {
    console.warn('[chocabloc-questions] concept report failed', err);
  } catch {
    /* a broken console must not break the game */
  }
}

/** A whole, non-negative number; anything else is 0. */
function whole(n: unknown): number {
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

function settle(concept: unknown): Promise<boolean> {
  return new Promise<unknown>((r) => r(concept)).then(Boolean, () => false);
}

export function createConceptRun(options: ConceptRunOptions): ConceptRun {
  const env = withDefaults(options.env);
  const ready = settle(options.concept);

  let live = false;
  let paused = false;
  let disposed = false;
  let visible = !(env.document && env.document.hidden);
  let runId = '';
  let active = 0; // banked active ms this run (may be fractional)
  let sentMs = 0; // whole ms already sent this run
  let lastInput = 0;
  let lastBank = 0;
  let correct = 0; // unsent
  let levels = 0; // unsent
  let xp = 0; // unsent
  let perConcept = options.perConcept === true;
  let conceptId: string | null = null;
  let timer: unknown = null;

  function bank(t: number): void {
    if (live && !paused && visible) {
      const end = Math.min(t, lastInput + CONCEPT_IDLE_MS);
      if (end > lastBank) active += end - lastBank;
    }
    lastBank = t;
  }

  function unsentMs(): number {
    return Math.floor(active) - sentMs;
  }

  function send(payload: ConceptSessionPayload): void {
    void ready.then((ok) => {
      if (!ok) return;
      try {
        const result = options.report(payload);
        if (result && typeof (result as PromiseLike<unknown>).then === 'function') {
          (result as PromiseLike<unknown>).then(undefined, warn);
        }
      } catch (err) {
        warn(err);
      }
    });
  }

  /** Send everything unsent as one piece. `always`: send even an empty piece (finish). */
  function piece(always: boolean): void {
    const ms = Math.max(0, unsentMs());
    if (!always && ms === 0 && correct === 0 && levels === 0 && xp === 0) return;
    const payload: ConceptSessionPayload = {
      timePlayedMs: Math.min(ms, MAX_TIME_MS),
      levelsCompleted: Math.min(levels, MAX_LEVELS),
      xpEarned: Math.min(xp, MAX_XP),
      correctCombos: Math.min(correct, MAX_CORRECT),
      clientSessionId: runId,
    };
    sentMs += ms; // marked sent before sending: at most once
    correct = 0;
    levels = 0;
    xp = 0;
    if (perConcept) {
      if (!conceptId) return; // no concept for this stretch: dropped, never filed under the wrong one
      payload.conceptId = conceptId;
    }
    send(payload);
  }

  function stopTimer(): void {
    if (timer !== null) env.clearInterval(timer);
    timer = null;
  }

  function tick(): void {
    if (!live) return;
    bank(env.now());
    if (unsentMs() >= CONCEPT_CHECKPOINT_MS) piece(false);
  }

  function endRun(finishing: boolean, result?: ConceptRunResult): void {
    if (!live) return;
    bank(env.now());
    if (finishing && result) {
      levels += whole(result.levels);
      xp += whole(result.xp);
    }
    piece(finishing);
    live = false;
    stopTimer();
  }

  const onInput = (): void => {
    if (!live) return;
    const t = env.now();
    bank(t);
    lastInput = t;
  };

  const onVisibility = (): void => {
    const doc = env.document;
    if (!doc) return;
    const t = env.now();
    if (doc.hidden) {
      bank(t); // still counted as visible up to this moment
      visible = false;
      if (live && unsentMs() >= CONCEPT_HIDE_MIN_MS) piece(false); // best effort: the tab may not come back
    } else {
      visible = true;
      lastBank = t;
      lastInput = t;
    }
  };

  const safe =
    <A extends unknown[]>(fn: (...args: A) => void) =>
    (...args: A): void => {
      try {
        fn(...args);
      } catch (err) {
        warn(err);
      }
    };

  safe(() => {
    for (const type of INPUT_EVENTS) env.window?.addEventListener(type, onInput, INPUT_OPTS);
    env.document?.addEventListener('visibilitychange', onVisibility);
  })();

  return {
    start: safe(() => {
      if (disposed) return;
      if (live) endRun(false);
      runId = env.newId();
      live = true;
      paused = false;
      active = 0;
      sentMs = 0;
      correct = 0;
      levels = 0;
      xp = 0;
      conceptId = null; // a new run never inherits the last run's concept
      const t = env.now();
      lastInput = t;
      lastBank = t;
      if (timer === null) timer = env.setInterval(tick, CONCEPT_TICK_MS);
    }),
    pause: safe((p: boolean) => {
      const t = env.now();
      if (p && !paused) {
        bank(t);
        paused = true;
      } else if (!p && paused) {
        paused = false;
        lastBank = t;
        lastInput = t;
      }
    }),
    correct: safe((n: number = 1) => {
      if (live) correct += whole(n);
    }),
    add: safe((result: ConceptRunResult) => {
      if (!live || !result) return;
      levels += whole(result.levels);
      xp += whole(result.xp);
    }),
    setConcept: safe((id: string | null) => {
      perConcept = true;
      const next = typeof id === 'string' && id.length > 0 ? id : null;
      if (next === conceptId) return; // same sub-topic: the stretch just continues
      if (live) {
        bank(env.now());
        piece(false); // under the OLD concept (or dropped if there was none)
      }
      conceptId = next;
    }),
    abandon: safe(() => endRun(false)),
    finish: safe((result?: ConceptRunResult) => endRun(true, result)),
    dispose: safe(() => {
      if (disposed) return;
      disposed = true;
      live = false;
      stopTimer();
      for (const type of INPUT_EVENTS) env.window?.removeEventListener(type, onInput, INPUT_OPTS);
      env.document?.removeEventListener('visibilitychange', onVisibility);
    }),
  };
}
