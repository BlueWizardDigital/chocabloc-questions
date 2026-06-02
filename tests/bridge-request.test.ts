// @vitest-environment jsdom
// requestNextQuestion tests — ported from MM's chocablocBridgeRequest.test.js.
// TS conversion only; assertions unchanged.
//
// NOTE: bridge.requestNextQuestion still hardcodes the gameId
// "/api/v1/games/monkey-money/questions/next" because the port is verbatim.
// Tests preserve that URL expectation; when the bridge generalizes the gameId
// (separate follow-up), these assertions update with it.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// HTTP-path coverage. We follow the same module-reset + simulated chocabloc:init
// handshake pattern used by bridge.test.ts: override window.top so
// inIframe === true, import the bridge fresh, dispatch a synthetic init message
// with source = window.parent, then await onReady.
async function loadBridgeInIframeWithCtx(): Promise<{
  mod: typeof import('../src/bridge');
  restore: () => void;
}> {
  const originalTop = window.top;
  Object.defineProperty(window, 'top', {
    configurable: true,
    get() {
      return { stub: true };
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
          player: { displayName: 'Tester' },
        },
      },
      source: window.parent, // F1 guard requires this
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
  };
  return { mod, restore };
}

describe('bridge.requestNextQuestion — canonical shape', () => {
  let restoreTop = () => {};

  beforeEach(() => {
    vi.resetModules();
    (globalThis as { fetch?: unknown }).fetch = vi.fn();
  });

  afterEach(() => {
    restoreTop();
    restoreTop = () => {};
    vi.useRealTimers();
  });

  it('returns server question as-is (no adapter transformation)', async () => {
    const canonical = {
      id: 'CANON-1',
      skillIds: ['MONEY-COIN-VALUE-CAD'],
      content: { coins: { dime: 1, quarter: 1 } },
      answer: 35,
      distractors: [{ value: 30, error_type: 'off-by-nickel' }],
      format: 'money',
      imageType: 'coins',
      difficulty: 'easy',
      questionText: 'How much money is shown?',
    };
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ question: canonical }),
    });
    const { mod, restore } = await loadBridgeInIframeWithCtx();
    restoreTop = restore;

    const result = await mod.bridge.requestNextQuestion({
      recipeSlug: 'currency',
    });
    expect(result).toEqual(canonical); // bit-exact pass-through
  });

  it('returns null on fetch error', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('network')
    );
    const { mod, restore } = await loadBridgeInIframeWithCtx();
    restoreTop = restore;
    const result = await mod.bridge.requestNextQuestion({
      recipeSlug: 'currency',
    });
    expect(result).toBeNull();
  });

  it('returns null when server omits question', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({}),
    });
    const { mod, restore } = await loadBridgeInIframeWithCtx();
    restoreTop = restore;
    const result = await mod.bridge.requestNextQuestion({
      recipeSlug: 'currency',
    });
    expect(result).toBeNull();
  });

  it('returns null on non-ok HTTP response', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 503,
      json: async () => ({}),
    });
    const { mod, restore } = await loadBridgeInIframeWithCtx();
    restoreTop = restore;
    const result = await mod.bridge.requestNextQuestion({
      recipeSlug: 'currency',
    });
    expect(result).toBeNull();
  });

  it('includes skillId and recipeSlug in the request URL', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({}),
    });
    const { mod, restore } = await loadBridgeInIframeWithCtx();
    restoreTop = restore;

    await mod.bridge.requestNextQuestion({
      skillId: 'MONEY-1',
      recipeSlug: 'mm-default',
    });
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [calledUrl, calledInit] = fetchMock.mock.calls[0];
    expect(calledUrl).toContain('/api/v1/games/monkey-money/questions/next?');
    expect(calledUrl).toContain('skillId=MONEY-1');
    expect(calledUrl).toContain('recipeSlug=mm-default');
    expect(calledInit?.credentials).toBe('include');
    expect(calledInit?.signal).toBeDefined();
  });

  it('does not leak abort timers across successful fetches', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        question: {
          id: 'Z',
          skillIds: ['Z'],
          content: {},
          answer: 1,
          distractors: [{ value: 2, error_type: 'x' }],
          format: 'money',
          imageType: 'coins',
          difficulty: null,
          questionText: 'p',
        },
      }),
    });
    const { mod, restore } = await loadBridgeInIframeWithCtx();
    restoreTop = restore;

    vi.useFakeTimers();
    const before = vi.getTimerCount();
    await mod.bridge.requestNextQuestion();
    await mod.bridge.requestNextQuestion();
    const after = vi.getTimerCount();
    expect(after).toBe(before);
  });
});

describe('bridge.requestNextQuestion — standalone short-circuit', () => {
  beforeEach(() => {
    (globalThis as { fetch?: unknown }).fetch = vi.fn();
  });

  it('returns null when ctx is null (no init yet)', async () => {
    // Fresh import, no init handshake → ctx is null → short-circuit.
    vi.resetModules();
    const mod = await import('../src/bridge');
    const result = await mod.bridge.requestNextQuestion();
    expect(result).toBeNull();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
