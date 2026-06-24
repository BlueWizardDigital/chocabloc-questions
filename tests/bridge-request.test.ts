// @vitest-environment jsdom
// requestNextQuestion / requestQuestions tests. The bridge no longer hardcodes
// a gameId: embedded games use the host postMessage channel (host pins gameId);
// host-less same-origin games use a relative fetch with a caller-supplied gameId.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Embedded (in-host) setup: stub window.top so inIframe === true, replace
// window.parent with a postMessage spy so we can capture + match the outbound
// chocabloc:questions:request, then dispatch a synthetic chocabloc:init
// (source = window.parent, per the F1 gate) so ctx is non-standalone.
async function loadEmbeddedBridge(): Promise<{
  mod: typeof import('../src/bridge');
  postSpy: ReturnType<typeof vi.fn>;
  restore: () => void;
}> {
  const originalTop = window.top;
  const originalParent = window.parent;
  Object.defineProperty(window, 'top', {
    configurable: true,
    get() {
      return { stub: true };
    },
  });
  const postSpy = vi.fn();
  // Stable reference: the F1 gate (e.source !== window.parent) does an identity
  // check, so the getter MUST return the same object every access — otherwise
  // the synthetic init/deliver (source = window.parent) gets dropped.
  const parentStub = { postMessage: postSpy };
  Object.defineProperty(window, 'parent', {
    configurable: true,
    get() {
      return parentStub;
    },
  });

  const mod = await import('../src/bridge');
  const readyP = new Promise<void>((resolve) =>
    mod.bridge.onReady(() => resolve())
  );
  window.dispatchEvent(
    new MessageEvent('message', {
      data: {
        type: 'chocabloc:init',
        payload: {
          isMobile: false,
          viewport: { w: 1024, h: 768 },
          gradeBand: 'sprout',
          grade: 2,
          player: null,
        },
      },
      source: window.parent, // F1 gate requires this
    })
  );
  await readyP;

  const restore = () => {
    Object.defineProperty(window, 'top', {
      configurable: true,
      get() {
        return originalTop;
      },
    });
    Object.defineProperty(window, 'parent', {
      configurable: true,
      get() {
        return originalParent;
      },
    });
  };
  return { mod, postSpy, restore };
}

// Find the outbound chocabloc:questions:request among all postMessage calls
// (boot also posts chocabloc:ready).
function lastQuestionsRequest(
  postSpy: ReturnType<typeof vi.fn>
): { type: string; payload: Record<string, unknown> } | null {
  const call = postSpy.mock.calls.find(
    (c) => c[0] && c[0].type === 'chocabloc:questions:request'
  );
  return call ? (call[0] as { type: string; payload: Record<string, unknown> }) : null;
}

// Dispatch a host deliver carrying the given requestId + extra fields.
function deliver(requestId: string, extra: Record<string, unknown>): void {
  window.dispatchEvent(
    new MessageEvent('message', {
      data: {
        type: 'chocabloc:questions:deliver',
        payload: { requestId, ...extra },
      },
      source: window.parent,
    })
  );
}

describe('requestNextQuestion — host channel (adaptive)', () => {
  let restoreFn = () => {};
  beforeEach(() => {
    vi.resetModules();
    (globalThis as { fetch?: unknown }).fetch = vi.fn();
  });
  afterEach(() => {
    restoreFn();
    restoreFn = () => {};
    vi.useRealTimers();
  });

  it('posts an adaptive request and resolves the delivered question', async () => {
    const { mod, postSpy, restore } = await loadEmbeddedBridge();
    restoreFn = restore;

    const p = mod.bridge.requestNextQuestion({ recipeSlug: 'currency' });
    const req = lastQuestionsRequest(postSpy);
    expect(req).toBeTruthy();
    expect(req!.payload.mode).toBe('adaptive');
    expect(req!.payload.recipeSlug).toBe('currency');
    expect(typeof req!.payload.requestId).toBe('string');

    const question = { id: 'Q1', format: 'money', questionText: 'How much?' };
    deliver(req!.payload.requestId as string, { question });
    await expect(p).resolves.toEqual(question);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('host wins: ignores a caller gameId when embedded (no fetch, no gameId sent)', async () => {
    const { mod, postSpy, restore } = await loadEmbeddedBridge();
    restoreFn = restore;

    const p = mod.bridge.requestNextQuestion({ gameId: 'math-bingo', skillId: 'MONEY-1' });
    const req = lastQuestionsRequest(postSpy);
    expect(req!.payload.mode).toBe('adaptive');
    expect(req!.payload.skillId).toBe('MONEY-1');
    expect(req!.payload.gameId).toBeUndefined();
    expect(globalThis.fetch).not.toHaveBeenCalled();

    deliver(req!.payload.requestId as string, { question: { id: 'X' } });
    await expect(p).resolves.toEqual({ id: 'X' });
  });

  it('ignores a deliver with a non-matching requestId (resolves null only on timeout)', async () => {
    vi.useFakeTimers();
    const { mod, postSpy, restore } = await loadEmbeddedBridge();
    restoreFn = restore;

    const p = mod.bridge.requestNextQuestion();
    const req = lastQuestionsRequest(postSpy);

    deliver('not-the-id', { question: { id: 'WRONG' } });
    await vi.advanceTimersByTimeAsync(4001);
    await expect(p).resolves.toBeNull();
    // Sanity: the real requestId would have resolved it, proving the guard.
    expect(req!.payload.requestId).not.toBe('not-the-id');
  });

  it('drops a deliver from a non-parent source (F1 gate) → times out to null', async () => {
    vi.useFakeTimers();
    const { mod, postSpy, restore } = await loadEmbeddedBridge();
    restoreFn = restore;

    const p = mod.bridge.requestNextQuestion();
    const req = lastQuestionsRequest(postSpy);

    window.dispatchEvent(
      new MessageEvent('message', {
        data: {
          type: 'chocabloc:questions:deliver',
          payload: { requestId: req!.payload.requestId, question: { id: 'EVIL' } },
        },
        source: { stub: 'attacker' } as unknown as Window,
        origin: 'https://evil.example',
      })
    );

    await vi.advanceTimersByTimeAsync(4001);
    await expect(p).resolves.toBeNull();
  });
});

describe('requestNextQuestion — fetch fallback (no host)', () => {
  beforeEach(() => {
    vi.resetModules();
    (globalThis as { fetch?: unknown }).fetch = vi.fn();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('does a same-origin relative fetch when given a gameId and no host', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ question: { id: 'MB-1' } }),
    });
    const mod = await import('../src/bridge'); // jsdom not-in-iframe → standalone ctx
    const result = await mod.bridge.requestNextQuestion({
      gameId: 'math-bingo',
      skillId: 'MULT-1',
    });
    expect(result).toEqual({ id: 'MB-1' });
    const [url, init] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe('/api/v1/games/math-bingo/questions/next?skillId=MULT-1');
    expect(init?.credentials).toBe('include');
    expect(init?.signal).toBeDefined();
  });

  it('returns null when standalone and no gameId (no fetch)', async () => {
    const mod = await import('../src/bridge');
    const result = await mod.bridge.requestNextQuestion();
    expect(result).toBeNull();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('returns null for an invalid gameId without fetching', async () => {
    const mod = await import('../src/bridge');
    const result = await mod.bridge.requestNextQuestion({ gameId: 'Bad_Game!' });
    expect(result).toBeNull();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('returns null on non-ok HTTP', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 503,
      json: async () => ({}),
    });
    const mod = await import('../src/bridge');
    const result = await mod.bridge.requestNextQuestion({ gameId: 'math-bingo' });
    expect(result).toBeNull();
  });

  it('returns null on fetch error', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('network')
    );
    const mod = await import('../src/bridge');
    const result = await mod.bridge.requestNextQuestion({ gameId: 'math-bingo' });
    expect(result).toBeNull();
  });

  it('rejects an invalid skillId without fetching', async () => {
    const mod = await import('../src/bridge');
    const result = await mod.bridge.requestNextQuestion({
      gameId: 'math-bingo',
      skillId: 'bad lower',
    });
    expect(result).toBeNull();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('rejects an invalid recipeSlug without fetching', async () => {
    const mod = await import('../src/bridge');
    const result = await mod.bridge.requestNextQuestion({
      gameId: 'math-bingo',
      recipeSlug: 'BAD SLUG',
    });
    expect(result).toBeNull();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('includes a valid recipeSlug in the relative URL', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ question: { id: 'R-1' } }),
    });
    const mod = await import('../src/bridge');
    const result = await mod.bridge.requestNextQuestion({
      gameId: 'math-bingo',
      recipeSlug: 'mb-default',
    });
    expect(result).toEqual({ id: 'R-1' });
    const [url] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe('/api/v1/games/math-bingo/questions/next?recipeSlug=mb-default');
  });
});

describe('requestQuestions — bulk', () => {
  let restoreFn = () => {};
  beforeEach(() => {
    vi.resetModules();
    (globalThis as { fetch?: unknown }).fetch = vi.fn();
  });
  afterEach(() => {
    restoreFn();
    restoreFn = () => {};
    vi.useRealTimers();
  });

  it('posts a bulk request (no mode) and resolves delivered questions', async () => {
    const { mod, postSpy, restore } = await loadEmbeddedBridge();
    restoreFn = restore;

    const p = mod.bridge.requestQuestions({ count: 24, recipe: 'mb-default' });
    const req = lastQuestionsRequest(postSpy);
    expect(req!.payload.mode).toBeUndefined();
    expect(req!.payload.count).toBe(24);
    expect(req!.payload.recipe).toBe('mb-default');

    const questions = [{ id: 'A' }, { id: 'B' }];
    deliver(req!.payload.requestId as string, { questions });
    await expect(p).resolves.toEqual(questions);
  });

  it('resolves [] when the host replies with an error envelope', async () => {
    const { mod, postSpy, restore } = await loadEmbeddedBridge();
    restoreFn = restore;

    const p = mod.bridge.requestQuestions({ count: 10 });
    const req = lastQuestionsRequest(postSpy);
    deliver(req!.payload.requestId as string, {
      error: { code: 'FETCH_ERROR', message: 'x' },
    });
    await expect(p).resolves.toEqual([]);
  });

  it('fetch fallback: relative bulk URL when given gameId and no host', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ questions: [{ id: 'Z' }] }),
    });
    const mod = await import('../src/bridge');
    const result = await mod.bridge.requestQuestions({ gameId: 'math-bingo', count: 12 });
    expect(result).toEqual([{ id: 'Z' }]);
    const [url] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe('/api/v1/games/math-bingo/questions?count=12');
  });

  it('returns [] when standalone and no gameId (no fetch)', async () => {
    const mod = await import('../src/bridge');
    await expect(mod.bridge.requestQuestions({ count: 5 })).resolves.toEqual([]);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('rejects an invalid recipe in the fetch fallback without fetching', async () => {
    const mod = await import('../src/bridge');
    const result = await mod.bridge.requestQuestions({
      gameId: 'math-bingo',
      recipe: 'BAD RECIPE',
    });
    expect(result).toEqual([]);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('includes recipe + grade and omits a non-finite count in the bulk URL', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ questions: [{ id: 'G' }] }),
    });
    const mod = await import('../src/bridge');
    const result = await mod.bridge.requestQuestions({
      gameId: 'math-bingo',
      recipe: 'mb-default',
      grade: 2,
      count: Number.NaN,
    });
    expect(result).toEqual([{ id: 'G' }]);
    const [url] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe('/api/v1/games/math-bingo/questions?grade=2&recipe=mb-default');
  });
});
