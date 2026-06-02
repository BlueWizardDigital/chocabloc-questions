// @vitest-environment jsdom
// Bridge tests — boot, init handshake, outbound helpers, source-check.
// Ported 1:1 from chocabloc/client/public/games/monkey-money/src/__tests__/
// chocablocBridge.test.js (MM Phase 1.5 bridge tests). TS conversion only;
// assertions unchanged so we prove no regression vs MM behavior.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

describe('bridge — standalone detection', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('enters standalone mode when window.self === window.top', async () => {
    // jsdom default: window.self === window.top
    const mod = await import('../src/bridge');
    const ctx = await new Promise<unknown>((resolve) =>
      mod.bridge.onReady((c) => resolve(c))
    );
    expect((ctx as { standalone: boolean }).standalone).toBe(true);
    expect((ctx as { player: unknown }).player).toBe(null);
    expect((ctx as { grade: unknown }).grade).toBe(null);
  });
});

describe('bridge — init handshake', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('resolves ctx from chocabloc:init message', async () => {
    // Simulate iframe context: override window.top so inIframe === true
    const originalTop = window.top;
    Object.defineProperty(window, 'top', {
      configurable: true,
      get() {
        return { stub: true };
      },
    });

    const mod = await import('../src/bridge');
    const readyP = new Promise<unknown>((resolve) =>
      mod.bridge.onReady((c) => resolve(c))
    );

    window.dispatchEvent(
      new MessageEvent('message', {
        data: {
          type: 'chocabloc:init',
          payload: {
            isMobile: true,
            viewport: { w: 375, h: 667 },
            gradeBand: 'sprout',
            grade: 2,
            player: { displayName: 'Tester' },
          },
        },
        // Correction F1: bridge requires e.source === window.parent.
        source: window.parent,
      })
    );

    const ctx = (await readyP) as {
      standalone: boolean;
      isMobile: boolean;
      grade: number;
      gradeBand: string;
      player: unknown;
    };
    expect(ctx.standalone).toBe(false);
    expect(ctx.isMobile).toBe(true);
    expect(ctx.grade).toBe(2);
    expect(ctx.gradeBand).toBe('sprout');
    expect(ctx.player).toEqual({ displayName: 'Tester' });

    Object.defineProperty(window, 'top', {
      configurable: true,
      get() {
        return originalTop;
      },
    });
  });
});

describe('bridge — outbound helpers', () => {
  let postSpy: ReturnType<typeof vi.fn>;
  let originalTop: typeof window.top;

  beforeEach(() => {
    vi.resetModules();
    originalTop = window.top;
    Object.defineProperty(window, 'top', {
      configurable: true,
      get() {
        return { stub: true };
      },
    });
    postSpy = vi.fn();
    Object.defineProperty(window, 'parent', {
      configurable: true,
      get() {
        return { postMessage: postSpy };
      },
    });
  });

  afterEach(() => {
    Object.defineProperty(window, 'top', {
      configurable: true,
      get() {
        return originalTop;
      },
    });
    Object.defineProperty(window, 'parent', {
      configurable: true,
      get() {
        return window;
      },
    });
  });

  it('sends chocabloc:started with no payload', async () => {
    const { bridge } = await import('../src/bridge');
    postSpy.mockClear();
    bridge.started();
    expect(postSpy).toHaveBeenCalledWith({ type: 'chocabloc:started' }, '*');
  });

  it('sends chocabloc:attempt with payload', async () => {
    const { bridge } = await import('../src/bridge');
    postSpy.mockClear();
    bridge.attempt({ questionId: 'q1', isCorrect: true, timeToAnswerMs: 1200 });
    expect(postSpy).toHaveBeenCalledWith(
      {
        type: 'chocabloc:attempt',
        payload: { questionId: 'q1', isCorrect: true, timeToAnswerMs: 1200 },
      },
      '*'
    );
  });

  it('sends chocabloc:score with payload', async () => {
    const { bridge } = await import('../src/bridge');
    postSpy.mockClear();
    bridge.score({ score: 400, stars: 2, xp: 80 });
    expect(postSpy).toHaveBeenCalledWith(
      {
        type: 'chocabloc:score',
        payload: { score: 400, stars: 2, xp: 80 },
      },
      '*'
    );
  });

  it('sends chocabloc:save-notify with no payload', async () => {
    const { bridge } = await import('../src/bridge');
    postSpy.mockClear();
    bridge.saveNotify();
    expect(postSpy).toHaveBeenCalledWith(
      { type: 'chocabloc:save-notify' },
      '*'
    );
  });

  it('sends chocabloc:exit with no payload', async () => {
    const { bridge } = await import('../src/bridge');
    postSpy.mockClear();
    bridge.exit();
    expect(postSpy).toHaveBeenCalledWith({ type: 'chocabloc:exit' }, '*');
  });

  it('silently no-ops when window.parent.postMessage throws', async () => {
    Object.defineProperty(window, 'parent', {
      configurable: true,
      get() {
        return {
          postMessage: () => {
            throw new Error('gone');
          },
        };
      },
    });
    const { bridge } = await import('../src/bridge');
    expect(() => bridge.started()).not.toThrow();
    expect(() => bridge.score({ score: 1, stars: 0, xp: 0 })).not.toThrow();
  });
});

describe('bridge — boot handshake', () => {
  let postSpy: ReturnType<typeof vi.fn>;
  let originalTop: typeof window.top;

  beforeEach(() => {
    vi.resetModules();
    originalTop = window.top;
    Object.defineProperty(window, 'top', {
      configurable: true,
      get() {
        return { stub: true };
      },
    });
    postSpy = vi.fn();
    Object.defineProperty(window, 'parent', {
      configurable: true,
      get() {
        return { postMessage: postSpy };
      },
    });
  });

  afterEach(() => {
    Object.defineProperty(window, 'top', {
      configurable: true,
      get() {
        return originalTop;
      },
    });
    Object.defineProperty(window, 'parent', {
      configurable: true,
      get() {
        return window;
      },
    });
  });

  it('posts chocabloc:ready to parent on module load when in iframe context', async () => {
    await import('../src/bridge');
    expect(postSpy).toHaveBeenCalledWith({ type: 'chocabloc:ready' }, '*');
  });
});

describe('bridge — inbound source check (F1)', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('ignores chocabloc:init from a non-parent source', async () => {
    const originalTop = window.top;
    Object.defineProperty(window, 'top', {
      configurable: true,
      get() {
        return { stub: true };
      },
    });

    const mod = await import('../src/bridge');
    let resolved: unknown = null;
    mod.bridge.onReady((c) => {
      resolved = c;
    });

    // Dispatch init with a source that is NOT window.parent
    const attackerWindow = { stub: 'attacker' } as unknown as Window;
    window.dispatchEvent(
      new MessageEvent('message', {
        data: {
          type: 'chocabloc:init',
          payload: {
            isMobile: false,
            gradeBand: 'sprout',
            grade: 2,
            player: { displayName: 'Eve' },
          },
        },
        source: attackerWindow,
        origin: 'https://evil.example',
      })
    );

    // Give the listener a microtask to run
    await Promise.resolve();
    expect(resolved).toBeNull(); // onReady should NOT have fired

    Object.defineProperty(window, 'top', {
      configurable: true,
      get() {
        return originalTop;
      },
    });
  });
});
