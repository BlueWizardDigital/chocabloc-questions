// Import-safety guarantee: the bridge must be importable where there is no
// `window` — node unit tests, SSR, and the future host-kit entrypoint consumed
// from node. The bridge's host wiring (message listener + boot handshake) only
// switches on in a browser.
//
// NOTE: vitest's node environment here happens to define a `window`, so the
// crash never shows up naturally. We remove `window` explicitly to model the
// real windowless condition consumers (e.g. the game template's node tests) hit.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

describe('bridge — windowless import safety', () => {
  let savedWindow: PropertyDescriptor | undefined;

  beforeEach(() => {
    vi.resetModules();
    savedWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
    Object.defineProperty(globalThis, 'window', {
      value: undefined,
      configurable: true,
      writable: true,
    });
  });

  afterEach(() => {
    if (savedWindow) Object.defineProperty(globalThis, 'window', savedWindow);
    else delete (globalThis as { window?: unknown }).window;
  });

  it('imports without throwing when there is no window', async () => {
    expect(typeof window).toBe('undefined');
    await expect(import('../src/bridge')).resolves.toBeDefined();
  });

  it('still exposes the bridge API object', async () => {
    const mod = await import('../src/bridge');
    expect(typeof mod.bridge.requestQuestions).toBe('function');
    expect(typeof mod.bridge.validateAnswer).toBe('function');
  });
});
