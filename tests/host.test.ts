// Host kit — reporting + checkAnswer (node env; the bridge is mocked).
import { describe, it, expect, vi, beforeEach } from 'vitest';

const attempt = vi.fn();
const score = vi.fn();
const saveNotify = vi.fn();
const started = vi.fn();
const requestStrategyPicks = vi.fn();
const reportHelpEvents = vi.fn();

vi.mock('../src/bridge', () => ({
  bridge: {
    ctx: undefined,
    onReady: () => {},
    started,
    attempt,
    score,
    saveNotify,
    validateAnswer: vi.fn(),
    requestQuestions: vi.fn(),
    requestStrategyPicks,
    reportHelpEvents,
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('strategy help — fail-safe bridge wrappers', () => {
  const EVENT = {
    eventId: 'e1',
    family: 'div-facts' as const,
    strategy: 'div.share' as const,
    thumb: null,
    fact: '24÷4',
    beforeAnswer: false,
    triesBefore: 1,
  };

  it('passes the picks and the report result through', async () => {
    requestStrategyPicks.mockResolvedValueOnce({ 'div-facts': 'div.share' });
    reportHelpEvents.mockResolvedValueOnce({ ok: true });
    const host = await import('../src/host');
    await expect(host.requestStrategyPicks()).resolves.toEqual({ 'div-facts': 'div.share' });
    await expect(host.reportHelpEvents([EVENT])).resolves.toEqual({ ok: true });
    expect(reportHelpEvents).toHaveBeenCalledWith([EVENT]);
  });

  it('never throws: {} for picks and { ok: false } for a report when the bridge throws', async () => {
    requestStrategyPicks.mockRejectedValueOnce(new Error('boom'));
    reportHelpEvents.mockRejectedValueOnce(new Error('boom'));
    const host = await import('../src/host');
    await expect(host.requestStrategyPicks()).resolves.toEqual({});
    await expect(host.reportHelpEvents([EVENT])).resolves.toEqual({ ok: false });
  });
});

describe('reporting — fail-safe bridge wrappers', () => {
  it('forwards reportAttempt to the bridge', async () => {
    const { reportAttempt } = await import('../src/host');
    reportAttempt({ questionId: 'q1', isCorrect: true, answerToken: 'tok' });
    expect(attempt).toHaveBeenCalledWith({ questionId: 'q1', isCorrect: true, answerToken: 'tok' });
  });

  it('forwards reportScore and notifySave', async () => {
    const { reportScore, notifySave } = await import('../src/host');
    reportScore({ score: 100, stars: 3, xp: 50 });
    notifySave();
    expect(score).toHaveBeenCalledWith({ score: 100, stars: 3, xp: 50 });
    expect(saveNotify).toHaveBeenCalledTimes(1);
  });

  it('never throws when the bridge throws', async () => {
    attempt.mockImplementationOnce(() => {
      throw new Error('boom');
    });
    const { reportAttempt } = await import('../src/host');
    expect(() => reportAttempt({ questionId: 'q1', isCorrect: true })).not.toThrow();
  });
});

describe('checkAnswer — local compare vs server validation', () => {
  it('local: correct value matches the answer', async () => {
    const { checkAnswer } = await import('../src/host');
    expect(await checkAnswer({ answer: 5 }, 5)).toBe(true);
  });

  it('local: wrong value is not correct', async () => {
    const { checkAnswer } = await import('../src/host');
    expect(await checkAnswer({ answer: 5 }, 4)).toBe(false);
  });

  it('local: preserves an answer of 0', async () => {
    const { checkAnswer } = await import('../src/host');
    expect(await checkAnswer({ answer: 0 }, 0)).toBe(true);
  });

  it('token path: server says correct', async () => {
    const { checkAnswer } = await import('../src/host');
    const validator = { validateAnswer: vi.fn().mockResolvedValue({ isCorrect: true }) };
    expect(await checkAnswer({ answerToken: 'tok' }, 7, validator)).toBe(true);
    expect(validator.validateAnswer).toHaveBeenCalledWith({ answerToken: 'tok', studentAnswer: 7 });
  });

  it('token path: transport failure never counts as correct', async () => {
    const { checkAnswer } = await import('../src/host');
    const validator = { validateAnswer: vi.fn().mockRejectedValue(new Error('down')) };
    expect(await checkAnswer({ answerToken: 'tok' }, 7, validator)).toBe(false);
  });
});
