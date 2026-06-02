// @vitest-environment jsdom
// bridge.attachValidator tests — verifies the sugar wrapper sets
// el.validateAnswer correctly and that the returned validator routes through
// bridge.validateAnswer + adapts the server response to the lib's
// ValidationResult shape.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type {
  AnswerValue,
  NormalizedQuestion,
  ValidationResult,
} from '../src/types';

interface PostedMessage {
  type: string;
  payload?: { requestId?: string; [k: string]: unknown };
}

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

function lastValidateRequest(
  spy: ReturnType<typeof vi.fn>
): PostedMessage | null {
  for (let i = spy.mock.calls.length - 1; i >= 0; i--) {
    const [msg] = spy.mock.calls[i] as [PostedMessage];
    if (msg?.type === 'chocabloc:validate:request') return msg;
  }
  return null;
}

function dispatchDeliver(payload: Record<string, unknown>): void {
  window.dispatchEvent(
    new MessageEvent('message', {
      data: { type: 'chocabloc:validate:deliver', payload },
      source: window.parent,
    })
  );
}

/** Minimal stand-in for ChocablocQuestion's settable validateAnswer slot. */
function makeStubElement(): {
  validateAnswer?:
    | ((q: NormalizedQuestion, sa: AnswerValue) => Promise<ValidationResult>)
    | undefined;
} {
  return {};
}

describe('bridge.attachValidator — no-op cases', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('leaves el.validateAnswer untouched when question has no answerToken', async () => {
    const { bridge } = await import('../src/bridge');
    const el = makeStubElement();
    bridge.attachValidator(el, {});
    expect(el.validateAnswer).toBeUndefined();
  });

  it('leaves el.validateAnswer untouched when answerToken is empty string', async () => {
    const { bridge } = await import('../src/bridge');
    const el = makeStubElement();
    bridge.attachValidator(el, { answerToken: '' });
    expect(el.validateAnswer).toBeUndefined();
  });

  it('does not overwrite a pre-existing validator when answerToken is missing', async () => {
    const { bridge } = await import('../src/bridge');
    const el = makeStubElement();
    const sentinel = vi.fn();
    el.validateAnswer = sentinel as unknown as typeof el.validateAnswer;
    bridge.attachValidator(el, {});
    expect(el.validateAnswer).toBe(sentinel);
  });
});

describe('bridge.attachValidator — F6 wiring + shape conversion', () => {
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

  it('assigns a validator when question has a non-empty answerToken', async () => {
    const { bridge } = await import('../src/bridge');
    const el = makeStubElement();
    bridge.attachValidator(el, { answerToken: 'tok.abc' });
    expect(typeof el.validateAnswer).toBe('function');
  });

  it('routes calls through bridge.validateAnswer with the captured token', async () => {
    const { bridge } = await import('../src/bridge');
    const spy = (globalThis as { __postSpy: ReturnType<typeof vi.fn> })
      .__postSpy;
    const el = makeStubElement();
    bridge.attachValidator(el, { answerToken: 'tok.captured' });

    const q = { id: 'Q-1', skillIds: ['SKILL-A'] } as NormalizedQuestion;
    const promise = el.validateAnswer!(q, 42);
    const req = lastValidateRequest(spy);
    expect(req?.payload?.answerToken).toBe('tok.captured');
    expect(req?.payload?.studentAnswer).toBe(42);
    const requestId = req?.payload?.requestId as string;

    dispatchDeliver({
      requestId,
      isCorrect: true,
      expected: 42,
      distractorMatched: null,
    });
    const result = await promise;
    expect(result.correct).toBe(true);
    expect(result.expected).toBe(42);
    expect(result.distractorMatched).toBeNull();
    expect(result.skillTags).toEqual(['SKILL-A']);
  });

  it('maps distractorMatched.errorType null → "" to satisfy the lib Distractor type', async () => {
    const { bridge } = await import('../src/bridge');
    const spy = (globalThis as { __postSpy: ReturnType<typeof vi.fn> })
      .__postSpy;
    const el = makeStubElement();
    bridge.attachValidator(el, { answerToken: 'tok.x' });
    const q = { id: 'Q-2', skillIds: ['SKILL-B'] } as NormalizedQuestion;
    const promise = el.validateAnswer!(q, 30);
    const requestId = lastValidateRequest(spy)?.payload?.requestId as string;
    dispatchDeliver({
      requestId,
      isCorrect: false,
      expected: 35,
      distractorMatched: { value: 30, errorType: null },
    });
    const result = await promise;
    expect(result.distractorMatched).toEqual({
      value: 30,
      errorType: '',
    });
  });

  it('forwards questionShape.skillIds verbatim as skillTags', async () => {
    const { bridge } = await import('../src/bridge');
    const spy = (globalThis as { __postSpy: ReturnType<typeof vi.fn> })
      .__postSpy;
    const el = makeStubElement();
    bridge.attachValidator(el, { answerToken: 'tok.y' });
    const q = {
      id: 'Q-3',
      skillIds: ['SKILL-X', 'SKILL-Y', 'SKILL-Z'],
    } as NormalizedQuestion;
    const promise = el.validateAnswer!(q, 'apple');
    const requestId = lastValidateRequest(spy)?.payload?.requestId as string;
    dispatchDeliver({
      requestId,
      isCorrect: true,
      expected: 'apple',
      distractorMatched: null,
    });
    const result = await promise;
    expect(result.skillTags).toEqual(['SKILL-X', 'SKILL-Y', 'SKILL-Z']);
  });

  it('propagates bridge errors (e.g. InvalidTokenError) to the el.validateAnswer caller', async () => {
    const { bridge, InvalidTokenError } = await import('../src/bridge');
    const spy = (globalThis as { __postSpy: ReturnType<typeof vi.fn> })
      .__postSpy;
    const el = makeStubElement();
    bridge.attachValidator(el, { answerToken: 'tok.bad' });
    const q = { id: 'Q-4', skillIds: [] } as unknown as NormalizedQuestion;
    const promise = el.validateAnswer!(q, 1);
    const assertion = expect(promise).rejects.toBeInstanceOf(InvalidTokenError);
    const requestId = lastValidateRequest(spy)?.payload?.requestId as string;
    dispatchDeliver({
      requestId,
      error: { code: 'INVALID_TOKEN' },
    });
    await assertion;
  });
});
