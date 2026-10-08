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
