// @vitest-environment jsdom
// Host kit — context/whenHostReady. No host: onReady never fires, so the
// standalone-timeout path is exercised with fake timers.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../src/bridge', () => ({
  bridge: {
    ctx: undefined,
    onReady: () => {}, // never fires → forces the timeout path
    started: () => {},
    attempt: () => {},
    score: () => {},
    saveNotify: () => {},
    validateAnswer: vi.fn(),
    requestQuestions: vi.fn(),
  },
}));

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('whenHostReady', () => {
  it('resolves to standalone after the timeout and stays resolved (no re-wait)', async () => {
    const { whenHostReady } = await import('../src/host');

    const first = whenHostReady(1500);
    await vi.advanceTimersByTimeAsync(1500);
    const ctx1 = await first;
    expect(ctx1.standalone).toBe(true);

    let secondResolved = false;
    const second = whenHostReady(1500).then((c) => {
      secondResolved = true;
      return c;
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(secondResolved).toBe(true);
    await second;
  });
});
