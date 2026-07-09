// @vitest-environment jsdom
// requestConcept / reportConceptSession tests. Mirrors bridge-request.test.ts:
// embedded games use the host postMessage channel (host pins gameId + conceptId);
// host-less same-origin games can resolve a concept via a relative fetch. A
// session report has NO fetch fallback (POST needs the host's CSRF/session).

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Embedded (in-host) setup — identical to bridge-request.test.ts: stub
// window.top so inIframe === true, replace window.parent with a postMessage spy,
// dispatch a synthetic chocabloc:init (source = window.parent, per the F1 gate)
// so ctx is non-standalone.
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

function lastRequest(
  postSpy: ReturnType<typeof vi.fn>,
  type: string
): { type: string; payload: Record<string, unknown> } | null {
  const call = postSpy.mock.calls.find((c) => c[0] && c[0].type === type);
  return call ? (call[0] as { type: string; payload: Record<string, unknown> }) : null;
}

function deliver(type: string, requestId: string, extra: Record<string, unknown>): void {
  window.dispatchEvent(
    new MessageEvent('message', {
      data: { type, payload: { requestId, ...extra } },
      source: window.parent,
    })
  );
}

const SAMPLE_CONCEPT = {
  concept_id: 'COMPARE-TENS',
  category_id: 'comparison',
  common: { title: 'Compare tens' },
  archetype: 'compare-to-reference',
  params: { relations: ['>', '<', '='] },
  validity: { rule: 'satisfies_relation' },
  seeds: [],
  resolved: { via: 'category', grade: '2', matchedGrade: 2 },
};

describe('requestConcept — host channel', () => {
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

  it('posts a concept request (no gameId) and resolves the delivered concept', async () => {
    const { mod, postSpy, restore } = await loadEmbeddedBridge();
    restoreFn = restore;

    const p = mod.bridge.requestConcept();
    const req = lastRequest(postSpy, 'chocabloc:concept:request');
    expect(req).toBeTruthy();
    expect(req!.payload.gameId).toBeUndefined();
    expect(typeof req!.payload.requestId).toBe('string');

    deliver('chocabloc:concept:deliver', req!.payload.requestId as string, SAMPLE_CONCEPT);
    await expect(p).resolves.toMatchObject(SAMPLE_CONCEPT);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('host wins: ignores a caller gameId when embedded (no fetch)', async () => {
    const { mod, postSpy, restore } = await loadEmbeddedBridge();
    restoreFn = restore;

    const p = mod.bridge.requestConcept({ gameId: 'gator' });
    const req = lastRequest(postSpy, 'chocabloc:concept:request');
    expect(req!.payload.gameId).toBeUndefined();
    expect(globalThis.fetch).not.toHaveBeenCalled();

    deliver('chocabloc:concept:deliver', req!.payload.requestId as string, SAMPLE_CONCEPT);
    await expect(p).resolves.toMatchObject({ concept_id: 'COMPARE-TENS' });
  });

  it('resolves null when the host replies with an error envelope', async () => {
    const { mod, postSpy, restore } = await loadEmbeddedBridge();
    restoreFn = restore;

    const p = mod.bridge.requestConcept();
    const req = lastRequest(postSpy, 'chocabloc:concept:request');
    deliver('chocabloc:concept:deliver', req!.payload.requestId as string, {
      error: { code: 'NO_CONCEPT', message: 'none' },
    });
    await expect(p).resolves.toBeNull();
  });

  it('ignores a non-matching requestId (resolves null only on timeout, Map drains)', async () => {
    vi.useFakeTimers();
    const { mod, postSpy, restore } = await loadEmbeddedBridge();
    restoreFn = restore;

    const p = mod.bridge.requestConcept();
    const req = lastRequest(postSpy, 'chocabloc:concept:request');

    deliver('chocabloc:concept:deliver', 'not-the-id', SAMPLE_CONCEPT);
    await vi.advanceTimersByTimeAsync(4001);
    await expect(p).resolves.toBeNull();
    expect(req!.payload.requestId).not.toBe('not-the-id');
  });

  it('drops a deliver from a non-parent source (F1 gate) → times out to null', async () => {
    vi.useFakeTimers();
    const { mod, postSpy, restore } = await loadEmbeddedBridge();
    restoreFn = restore;

    const p = mod.bridge.requestConcept();
    const req = lastRequest(postSpy, 'chocabloc:concept:request');

    window.dispatchEvent(
      new MessageEvent('message', {
        data: {
          type: 'chocabloc:concept:deliver',
          payload: { requestId: req!.payload.requestId, ...SAMPLE_CONCEPT },
        },
        source: { stub: 'attacker' } as unknown as Window,
        origin: 'https://evil.example',
      })
    );

    await vi.advanceTimersByTimeAsync(4001);
    await expect(p).resolves.toBeNull();
  });
});

describe('requestConcept — fetch fallback (no host)', () => {
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
      json: async () => SAMPLE_CONCEPT,
    });
    const mod = await import('../src/bridge'); // jsdom not-in-iframe → standalone
    const result = await mod.bridge.requestConcept({ gameId: 'gator' });
    expect(result).toMatchObject({ concept_id: 'COMPARE-TENS' });
    const [url, init] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe('/api/v1/games/gator/concept');
    expect(init?.credentials).toBe('include');
    expect(init?.signal).toBeDefined();
  });

  it('returns null when standalone and no gameId (no fetch)', async () => {
    const mod = await import('../src/bridge');
    await expect(mod.bridge.requestConcept()).resolves.toBeNull();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('returns null for an invalid gameId without fetching', async () => {
    const mod = await import('../src/bridge');
    await expect(mod.bridge.requestConcept({ gameId: 'Bad_Game!' })).resolves.toBeNull();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('returns null on non-ok HTTP (e.g. 404 NO_CONCEPT)', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: async () => ({ error: { code: 'NO_CONCEPT' } }),
    });
    const mod = await import('../src/bridge');
    await expect(mod.bridge.requestConcept({ gameId: 'gator' })).resolves.toBeNull();
  });

  it('returns null on fetch error', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('network'));
    const mod = await import('../src/bridge');
    await expect(mod.bridge.requestConcept({ gameId: 'gator' })).resolves.toBeNull();
  });
});

describe('reportConceptSession — host channel', () => {
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

  const PROGRESS = {
    totalTimePlayedMs: 1200,
    totalLevelsCompleted: 3,
    totalXp: 40,
    sessionsCount: 2,
    lastPlayedAt: '2026-07-09T00:00:00.000Z',
  };

  it('posts a report and resolves the delivered progress block', async () => {
    const { mod, postSpy, restore } = await loadEmbeddedBridge();
    restoreFn = restore;

    const p = mod.bridge.reportConceptSession({ xpEarned: 20, levelsCompleted: 1 });
    const req = lastRequest(postSpy, 'chocabloc:concept-session:report');
    expect(req).toBeTruthy();
    expect(req!.payload.xpEarned).toBe(20);
    expect(req!.payload.levelsCompleted).toBe(1);
    expect(typeof req!.payload.requestId).toBe('string');

    deliver('chocabloc:concept-session:deliver', req!.payload.requestId as string, {
      progress: PROGRESS,
    });
    await expect(p).resolves.toEqual(PROGRESS);
  });

  it('resolves null when the host replies with an error envelope', async () => {
    const { mod, postSpy, restore } = await loadEmbeddedBridge();
    restoreFn = restore;

    const p = mod.bridge.reportConceptSession({ xpEarned: 5 });
    const req = lastRequest(postSpy, 'chocabloc:concept-session:report');
    deliver('chocabloc:concept-session:deliver', req!.payload.requestId as string, {
      error: { code: 'EPHEMERAL_BLOCKED', message: 'blocked' },
    });
    await expect(p).resolves.toBeNull();
  });

  it('resolves null on timeout when the host never delivers (Map drains)', async () => {
    vi.useFakeTimers();
    const { mod, postSpy, restore } = await loadEmbeddedBridge();
    restoreFn = restore;

    const p = mod.bridge.reportConceptSession({ xpEarned: 5 });
    const req = lastRequest(postSpy, 'chocabloc:concept-session:report');

    deliver('chocabloc:concept-session:deliver', 'not-the-id', { progress: PROGRESS });
    await vi.advanceTimersByTimeAsync(5001);
    await expect(p).resolves.toBeNull();
    expect(req!.payload.requestId).not.toBe('not-the-id');
  });

  it('returns null when standalone (no host) without posting a report', async () => {
    const mod = await import('../src/bridge'); // standalone
    await expect(mod.bridge.reportConceptSession({ xpEarned: 5 })).resolves.toBeNull();
  });
});
