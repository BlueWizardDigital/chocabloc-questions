// @vitest-environment jsdom
// bridge.validateAnswer tests — F6 host-proxy round-trip + all 5 error
// classes. No MM equivalent; new for v0.5.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const VALIDATE_TIMEOUT_MS = 5000;

interface PostedMessage {
  type: string;
  payload?: { requestId?: string; [k: string]: unknown };
}

/**
 * Common setup: simulate iframe + capture postMessage. Returns the
 * postSpy + restore. Caller imports the bridge afterward.
 *
 * IMPORTANT: window.parent must return a STABLE object across accesses
 * so the bridge's `e.source === window.parent` source check matches the
 * source we set on dispatched MessageEvents (which also reads window.parent).
 * A `get() { return {...}; }` getter creates a new object per access and
 * the identity check fails.
 */
function setupIframe(): {
  postSpy: ReturnType<typeof vi.fn>;
  restore: () => void;
} {
  const originalTop = window.top;
  Object.defineProperty(window, 'top', {
    configurable: true,
    get() {
      return { stub: true };
    },
  });
  const postSpy = vi.fn();
  const fakeParent = { postMessage: postSpy };
  Object.defineProperty(window, 'parent', {
    configurable: true,
    get() {
      return fakeParent;
    },
  });
  return {
    postSpy,
    restore: () => {
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
    },
  };
}

/** Pulls the first chocabloc:validate:request payload from the post spy. */
function lastValidateRequest(
  spy: ReturnType<typeof vi.fn>
): PostedMessage | null {
  for (let i = spy.mock.calls.length - 1; i >= 0; i--) {
    const [msg] = spy.mock.calls[i] as [PostedMessage];
    if (msg?.type === 'chocabloc:validate:request') return msg;
  }
  return null;
}

/** Dispatch a deliver message with the given payload. */
function dispatchDeliver(payload: Record<string, unknown>): void {
  window.dispatchEvent(
    new MessageEvent('message', {
      data: { type: 'chocabloc:validate:deliver', payload },
      source: window.parent,
    })
  );
}

describe('bridge.validateAnswer — success path', () => {
  let teardown: () => void = () => {};

  beforeEach(() => {
    vi.resetModules();
    const { postSpy: _spy, restore } = setupIframe();
    teardown = restore;
    // Stash the spy on the module's parent for the test to read.
    (globalThis as { __postSpy?: ReturnType<typeof vi.fn> }).__postSpy = _spy;
  });

  afterEach(() => {
    teardown();
    delete (globalThis as { __postSpy?: ReturnType<typeof vi.fn> }).__postSpy;
  });

  it('round-trips an answer through chocabloc:validate:request/deliver', async () => {
    const { bridge } = await import('../src/bridge');
    const spy = (globalThis as { __postSpy: ReturnType<typeof vi.fn> })
      .__postSpy;

    const promise = bridge.validateAnswer({
      answerToken: 'tok.abc',
      studentAnswer: 35,
    });
    const req = lastValidateRequest(spy);
    expect(req).not.toBeNull();
    expect(req?.payload?.answerToken).toBe('tok.abc');
    expect(req?.payload?.studentAnswer).toBe(35);
    const requestId = req?.payload?.requestId as string;
    expect(typeof requestId).toBe('string');
    expect(requestId.length).toBeGreaterThan(0);

    dispatchDeliver({
      requestId,
      isCorrect: true,
      expected: 35,
      distractorMatched: null,
    });

    const result = await promise;
    expect(result.isCorrect).toBe(true);
    expect(result.expected).toBe(35);
    expect(result.distractorMatched).toBeNull();
  });

  it('returns distractorMatched when server identifies a wrong-answer pool match', async () => {
    const { bridge } = await import('../src/bridge');
    const spy = (globalThis as { __postSpy: ReturnType<typeof vi.fn> })
      .__postSpy;
    const promise = bridge.validateAnswer({
      answerToken: 'tok.x',
      studentAnswer: 30,
    });
    const requestId = lastValidateRequest(spy)?.payload?.requestId as string;
    dispatchDeliver({
      requestId,
      isCorrect: false,
      expected: 35,
      distractorMatched: { value: 30, errorType: 'off-by-nickel' },
    });

    const result = await promise;
    expect(result.isCorrect).toBe(false);
    expect(result.expected).toBe(35);
    expect(result.distractorMatched).toEqual({
      value: 30,
      errorType: 'off-by-nickel',
    });
  });

  it('ignores deliveries with a mismatching requestId (no resolve)', async () => {
    const { bridge } = await import('../src/bridge');
    const spy = (globalThis as { __postSpy: ReturnType<typeof vi.fn> })
      .__postSpy;

    const promise = bridge.validateAnswer({
      answerToken: 'tok.y',
      studentAnswer: 1,
    });
    // Capture the real requestId so we can dispatch the wrong one.
    const realId = lastValidateRequest(spy)?.payload?.requestId as string;
    expect(realId).toBeDefined();

    // Fire a deliver with a different id — should be ignored.
    dispatchDeliver({
      requestId: 'forged-id',
      isCorrect: true,
      expected: 1,
      distractorMatched: null,
    });
    let settled = false;
    promise
      .then(() => {
        settled = true;
      })
      .catch(() => {
        settled = true;
      });
    await Promise.resolve();
    await Promise.resolve();
    expect(settled).toBe(false);

    // Now deliver the real one to unblock + assert clean unwind.
    dispatchDeliver({
      requestId: realId,
      isCorrect: true,
      expected: 1,
      distractorMatched: null,
    });
    const result = await promise;
    expect(result.isCorrect).toBe(true);
  });
});

describe('bridge.validateAnswer — error envelopes', () => {
  let teardown: () => void = () => {};
  beforeEach(() => {
    vi.resetModules();
    const { postSpy, restore } = setupIframe();
    teardown = restore;
    (globalThis as { __postSpy?: ReturnType<typeof vi.fn> }).__postSpy = postSpy;
  });
  afterEach(() => {
    teardown();
    delete (globalThis as { __postSpy?: ReturnType<typeof vi.fn> }).__postSpy;
  });

  // Pattern note: every test below registers `expect.rejects` BEFORE
  // dispatching the deliver event. Reversing the order causes the rejection
  // to fire before any catch handler is attached, which Node flags as a
  // PromiseRejectionHandledWarning even though the test ultimately passes.
  // The fix here is purely lifecycle, not semantic.

  it('throws InvalidTokenError on server { error: { code: "INVALID_TOKEN" } }', async () => {
    const { bridge, InvalidTokenError } = await import('../src/bridge');
    const spy = (globalThis as { __postSpy: ReturnType<typeof vi.fn> })
      .__postSpy;
    const promise = bridge.validateAnswer({
      answerToken: 'tok',
      studentAnswer: 1,
    });
    const assertion = expect(promise).rejects.toBeInstanceOf(InvalidTokenError);
    const requestId = lastValidateRequest(spy)?.payload?.requestId as string;
    dispatchDeliver({
      requestId,
      error: { code: 'INVALID_TOKEN', message: 'token bad' },
    });
    await assertion;
  });

  it('throws ExpiredTokenError on server { error: { code: "EXPIRED_TOKEN" } }', async () => {
    const { bridge, ExpiredTokenError } = await import('../src/bridge');
    const spy = (globalThis as { __postSpy: ReturnType<typeof vi.fn> })
      .__postSpy;
    const promise = bridge.validateAnswer({
      answerToken: 'tok',
      studentAnswer: 1,
    });
    const assertion = expect(promise).rejects.toBeInstanceOf(ExpiredTokenError);
    const requestId = lastValidateRequest(spy)?.payload?.requestId as string;
    dispatchDeliver({ requestId, error: { code: 'EXPIRED_TOKEN' } });
    await assertion;
  });

  it('throws MalformedResponseError on unknown server error code', async () => {
    const { bridge, MalformedResponseError } = await import('../src/bridge');
    const spy = (globalThis as { __postSpy: ReturnType<typeof vi.fn> })
      .__postSpy;
    const promise = bridge.validateAnswer({
      answerToken: 'tok',
      studentAnswer: 1,
    });
    const assertion = expect(promise).rejects.toBeInstanceOf(
      MalformedResponseError
    );
    const requestId = lastValidateRequest(spy)?.payload?.requestId as string;
    dispatchDeliver({ requestId, error: { code: 'WEIRD_FUTURE_CODE' } });
    await assertion;
  });

  it('throws MalformedResponseError when isCorrect missing', async () => {
    const { bridge, MalformedResponseError } = await import('../src/bridge');
    const spy = (globalThis as { __postSpy: ReturnType<typeof vi.fn> })
      .__postSpy;
    const promise = bridge.validateAnswer({
      answerToken: 'tok',
      studentAnswer: 1,
    });
    const assertion = expect(promise).rejects.toBeInstanceOf(
      MalformedResponseError
    );
    const requestId = lastValidateRequest(spy)?.payload?.requestId as string;
    dispatchDeliver({ requestId, expected: 1, distractorMatched: null });
    await assertion;
  });

  it('throws MalformedResponseError when expected missing', async () => {
    const { bridge, MalformedResponseError } = await import('../src/bridge');
    const spy = (globalThis as { __postSpy: ReturnType<typeof vi.fn> })
      .__postSpy;
    const promise = bridge.validateAnswer({
      answerToken: 'tok',
      studentAnswer: 1,
    });
    const assertion = expect(promise).rejects.toBeInstanceOf(
      MalformedResponseError
    );
    const requestId = lastValidateRequest(spy)?.payload?.requestId as string;
    dispatchDeliver({ requestId, isCorrect: true, distractorMatched: null });
    await assertion;
  });
});

describe('bridge.validateAnswer — transport failures', () => {
  let teardown: () => void = () => {};
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    teardown();
    vi.useRealTimers();
  });

  it('rejects with BridgeStandaloneError when not in an iframe', async () => {
    // jsdom default: window.self === window.top → standalone.
    // BridgeStandaloneError rejects synchronously inside the Promise body,
    // so attaching expect.rejects after the call is still safe — there is
    // no async gap between schedule and rejection.
    const { bridge, BridgeStandaloneError } = await import('../src/bridge');
    const promise = bridge.validateAnswer({
      answerToken: 'tok',
      studentAnswer: 1,
    });
    await expect(promise).rejects.toBeInstanceOf(BridgeStandaloneError);
  });

  it('rejects with BridgeTimeoutError when host never replies', async () => {
    const { restore } = setupIframe();
    teardown = restore;
    vi.useFakeTimers();
    const { bridge, BridgeTimeoutError } = await import('../src/bridge');
    const promise = bridge.validateAnswer({
      answerToken: 'tok',
      studentAnswer: 1,
    });
    // Register catch handler BEFORE advancing timers — otherwise the
    // rejection fires before any handler is attached.
    const assertion = expect(promise).rejects.toBeInstanceOf(BridgeTimeoutError);
    await vi.advanceTimersByTimeAsync(VALIDATE_TIMEOUT_MS + 10);
    await assertion;
  });

  it('rejects with BridgeTimeoutError when postMessage throws (parent gone)', async () => {
    const originalTop = window.top;
    Object.defineProperty(window, 'top', {
      configurable: true,
      get() {
        return { stub: true };
      },
    });
    Object.defineProperty(window, 'parent', {
      configurable: true,
      get() {
        return {
          postMessage: () => {
            throw new Error('parent gone');
          },
        };
      },
    });
    teardown = () => {
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
    };
    const { bridge, BridgeTimeoutError } = await import('../src/bridge');
    await expect(
      bridge.validateAnswer({ answerToken: 'tok', studentAnswer: 1 })
    ).rejects.toBeInstanceOf(BridgeTimeoutError);
  });
});
