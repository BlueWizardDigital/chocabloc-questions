// @vitest-environment jsdom
// Trello 383 — the host's Mute and Full screen buttons: what the context
// carries (Task 2) and the sound channel (Task 3). Embedded setup mirrors
// tests/bridge-concept.test.ts: stub window.top so inIframe === true and
// replace window.parent with a postMessage spy.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const originalTop = window.top;
const originalParent = window.parent;
let postSpy: ReturnType<typeof vi.fn>;
let parentStub: { postMessage: ReturnType<typeof vi.fn> };

function embed(): void {
  postSpy = vi.fn();
  parentStub = { postMessage: postSpy };
  Object.defineProperty(window, 'top', { configurable: true, get: () => ({ stub: true }) });
  Object.defineProperty(window, 'parent', { configurable: true, get: () => parentStub });
}

function restore(): void {
  Object.defineProperty(window, 'top', { configurable: true, get: () => originalTop });
  Object.defineProperty(window, 'parent', { configurable: true, get: () => originalParent });
}

function fromHost(data: unknown): void {
  window.dispatchEvent(new MessageEvent('message', { data, source: window.parent }));
}

function init(extra: Record<string, unknown> = {}): void {
  fromHost({
    type: 'chocabloc:init',
    payload: { isMobile: false, viewport: { w: 1024, h: 768 }, gradeBand: null, grade: null, player: null, ...extra },
  });
}

const sent = (type: string) => postSpy.mock.calls.filter(([m]) => m && m.type === type);

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.useRealTimers();
  restore();
});

describe('context — controls and muted (Trello 383)', () => {
  it('reads controls and muted from chocabloc:init', async () => {
    embed();
    const { bridge } = await import('../src/bridge');
    init({ muted: true, controls: { mute: true, fullscreen: true } });
    expect(bridge.ctx?.controls).toEqual({ mute: true, fullscreen: true });
    expect(bridge.ctx?.muted).toBe(true);
  });

  it('defaults both to false under an older host that sends neither', async () => {
    embed();
    const { bridge } = await import('../src/bridge');
    init();
    expect(bridge.ctx?.controls).toEqual({ mute: false, fullscreen: false });
    expect(bridge.ctx?.muted).toBe(false);
  });

  it('treats anything but true as false', async () => {
    embed();
    const { bridge } = await import('../src/bridge');
    init({ muted: 'yes', controls: { mute: 1, fullscreen: 'true' } });
    expect(bridge.ctx?.controls).toEqual({ mute: false, fullscreen: false });
    expect(bridge.ctx?.muted).toBe(false);
  });

  it('gives a standalone game no host controls', async () => {
    // jsdom default: window.self === window.top, so the bridge goes standalone.
    const { bridge } = await import('../src/bridge');
    const ctx = await new Promise<import('../src/bridge').BridgeContext>((r) => bridge.onReady(r));
    expect(ctx.standalone).toBe(true);
    expect(ctx.controls).toEqual({ mute: false, fullscreen: false });
    expect(ctx.muted).toBe(false);
  });
});

describe('bridge.onSound (Trello 383)', () => {
  it('announces the sound feature in chocabloc:ready', async () => {
    embed();
    await import('../src/bridge');
    expect(postSpy).toHaveBeenCalledWith({ type: 'chocabloc:ready', payload: { features: ['sound'] } }, '*');
  });

  it('a handler registered before init fires once init says the host shows Mute', async () => {
    embed();
    const { bridge } = await import('../src/bridge');
    const cb = vi.fn();
    bridge.onSound(cb);
    expect(cb).not.toHaveBeenCalled();
    expect(sent('chocabloc:sound:listening')).toHaveLength(0);
    init({ muted: true, controls: { mute: true, fullscreen: false } });
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenLastCalledWith(true);
    expect(sent('chocabloc:sound:listening')).toHaveLength(1);
  });

  it('a late handler gets the latest state, not the init state', async () => {
    embed();
    const { bridge } = await import('../src/bridge');
    init({ muted: false, controls: { mute: true, fullscreen: false } });
    fromHost({ type: 'chocabloc:sound', payload: { muted: true } });
    const cb = vi.fn();
    bridge.onSound(cb);
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenLastCalledWith(true);
  });

  it('follows every chocabloc:sound and drops a malformed one', async () => {
    embed();
    const { bridge } = await import('../src/bridge');
    init({ muted: false, controls: { mute: true, fullscreen: false } });
    const cb = vi.fn();
    bridge.onSound(cb);
    fromHost({ type: 'chocabloc:sound', payload: { muted: true } });
    fromHost({ type: 'chocabloc:sound', payload: { muted: 'yes' } });
    fromHost({ type: 'chocabloc:sound' });
    expect(cb.mock.calls.map(([m]) => m)).toEqual([false, true]);
  });

  it('sends listening once however many handlers register', async () => {
    embed();
    const { bridge } = await import('../src/bridge');
    init({ controls: { mute: true, fullscreen: false } });
    bridge.onSound(vi.fn());
    bridge.onSound(vi.fn());
    expect(sent('chocabloc:sound:listening')).toHaveLength(1);
  });

  it('stops calling a handler after it unsubscribes', async () => {
    embed();
    const { bridge } = await import('../src/bridge');
    init({ controls: { mute: true, fullscreen: false } });
    const cb = vi.fn();
    const off = bridge.onSound(cb);
    off();
    fromHost({ type: 'chocabloc:sound', payload: { muted: true } });
    expect(cb).toHaveBeenCalledTimes(1); // only the call on registration
  });

  it('never fires, and never sends listening, when the host shows no Mute', async () => {
    embed();
    const { bridge } = await import('../src/bridge');
    init({ muted: true, controls: { mute: false, fullscreen: true } });
    const cb = vi.fn();
    bridge.onSound(cb);
    fromHost({ type: 'chocabloc:sound', payload: { muted: false } });
    expect(cb).not.toHaveBeenCalled();
    expect(sent('chocabloc:sound:listening')).toHaveLength(0);
  });

  it('never fires standalone', async () => {
    const { bridge } = await import('../src/bridge');
    await new Promise((r) => bridge.onReady(r));
    const cb = vi.fn();
    bridge.onSound(cb);
    expect(cb).not.toHaveBeenCalled();
  });

  it('ignores an init that arrives after the standalone fallback', async () => {
    vi.useFakeTimers();
    embed();
    const { bridge } = await import('../src/bridge');
    const cb = vi.fn();
    bridge.onSound(cb);
    await vi.advanceTimersByTimeAsync(2000); // INIT_TIMEOUT_MS: the bridge goes standalone
    expect(bridge.ctx?.standalone).toBe(true);
    init({ muted: true, controls: { mute: true, fullscreen: true } });
    expect(cb).not.toHaveBeenCalled();
    expect(sent('chocabloc:sound:listening')).toHaveLength(0);
    expect(bridge.ctx?.controls).toEqual({ mute: false, fullscreen: false });
  });

  it("keeps calling the other handlers when one throws", async () => {
    embed();
    const { bridge } = await import('../src/bridge');
    init({ muted: false, controls: { mute: true, fullscreen: false } });
    const good = vi.fn();
    bridge.onSound(() => {
      throw new Error('game bug');
    });
    bridge.onSound(good);
    fromHost({ type: 'chocabloc:sound', payload: { muted: true } });
    expect(good).toHaveBeenLastCalledWith(true);
  });
});
