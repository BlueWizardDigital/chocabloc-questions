import { describe, test, expect, vi } from 'vitest';
import { createAnswerGuard } from '../../src/lesson/guard';
import type { GuardResult, GuardState } from '../../src/lesson/guard';
import type { NormalizedQuestion, ValidationResult } from '../../src/types';

const question = { id: 'q1' } as unknown as NormalizedQuestion;

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function setup() {
  const replies: ReturnType<typeof deferred<ValidationResult>>[] = [];
  const host = vi.fn(() => {
    const d = deferred<ValidationResult>();
    replies.push(d);
    return d.promise;
  });
  const states: GuardState[] = [];
  const results: GuardResult[] = [];
  const failures: unknown[] = [];
  const guard = createAnswerGuard({
    question,
    host,
    onState: (s) => states.push(s),
    onResult: (r) => results.push(r),
    onFailed: (e) => failures.push(e),
  });
  return { guard, host, replies, states, results, failures };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('answer guard', () => {
  test('two quick calls reach host once and report the first answer once', async () => {
    const { guard, host, replies, results } = setup();
    void guard.validator(question, 'A');
    void guard.validator(question, 'B');
    expect(host).toHaveBeenCalledTimes(1);
    replies[0].resolve({ correct: true });
    await flush();
    expect(results).toEqual([{ studentAnswer: 'A', outcome: 'right', expected: null }]);
  });

  test('state is checking synchronously and unsure is refused', () => {
    const { guard, states } = setup();
    expect(guard.state).toBe('waiting');
    void guard.validator(question, 'A');
    expect(guard.state).toBe('checking');
    expect(states).toEqual(['checking']);
    expect(guard.unsure()).toBe(false);
  });

  test('a call for a different question object never reaches host', () => {
    const { guard, host } = setup();
    void guard.validator({ id: 'q1' } as unknown as NormalizedQuestion, 'A');
    expect(host).not.toHaveBeenCalled();
    expect(guard.state).toBe('waiting');
  });

  test('out of order: the second call settling first changes nothing', async () => {
    const { guard, replies, results } = setup();
    const first = guard.validator(question, 'A');
    const second = guard.validator(question, 'B');
    const secondSettled = vi.fn();
    void second.then(secondSettled, secondSettled);
    await flush();
    expect(secondSettled).not.toHaveBeenCalled();
    expect(results).toEqual([]);
    replies[0].resolve({ correct: false, expected: 'C' });
    await expect(first).resolves.toEqual({ correct: false, expected: 'C' });
    expect(results).toEqual([{ studentAnswer: 'A', outcome: 'wrong', expected: 'C' }]);
    expect(secondSettled).not.toHaveBeenCalled();
  });

  test('dispose silences results and failures', async () => {
    const a = setup();
    void a.guard.validator(question, 'A');
    a.guard.dispose();
    a.replies[0].resolve({ correct: true });
    await flush();
    expect(a.results).toEqual([]);
    const b = setup();
    const p = b.guard.validator(question, 'A');
    p.catch(() => {});
    b.guard.dispose();
    b.replies[0].reject(new Error('x'));
    await flush();
    expect(b.failures).toEqual([]);
  });

  test('lost reply: failed, other answers ignored, checkAgain resends the first', async () => {
    const { guard, host, replies, results, failures } = setup();
    const err = new Error('lost');
    const p = guard.validator(question, 'A');
    replies[0].reject(err);
    await expect(p).rejects.toBe(err);
    expect(guard.state).toBe('failed');
    expect(failures).toEqual([err]);

    const other = vi.fn();
    void guard.validator(question, 'B').then(other, other);
    await flush();
    expect(host).toHaveBeenCalledTimes(1);
    expect(other).not.toHaveBeenCalled();
    expect(guard.unsure()).toBe(false);

    guard.checkAgain();
    expect(guard.state).toBe('checking');
    expect(host).toHaveBeenCalledTimes(2);
    expect(host).toHaveBeenLastCalledWith(question, 'A');
    replies[1].resolve({ correct: true });
    await flush();
    expect(results).toEqual([{ studentAnswer: 'A', outcome: 'right', expected: null }]);
    expect(guard.state).toBe('done');
  });

  test('checkAgain that fails again returns to failed', async () => {
    const { guard, replies, failures } = setup();
    const p = guard.validator(question, 'A');
    p.catch(() => {});
    replies[0].reject(new Error('1'));
    await flush();
    guard.checkAgain();
    replies[1].reject(new Error('2'));
    await flush();
    expect(guard.state).toBe('failed');
    expect(failures).toHaveLength(2);
  });

  test('checkAgain outside failed does nothing', () => {
    const { guard, host } = setup();
    guard.checkAgain();
    void guard.validator(question, 'A');
    guard.checkAgain();
    expect(host).toHaveBeenCalledTimes(1);
  });

  test('expected 0 is kept and a missing expected is null', async () => {
    const a = setup();
    void a.guard.validator(question, 3);
    a.replies[0].resolve({ correct: false, expected: 0 });
    await flush();
    expect(a.results[0].expected).toBe(0);
    const b = setup();
    void b.guard.validator(question, 3);
    b.replies[0].resolve({ correct: false });
    await flush();
    expect(b.results[0].expected).toBeNull();
  });

  test('unsure while waiting reports unsure and closes the guard', async () => {
    const { guard, host, results, states } = setup();
    expect(guard.unsure()).toBe(true);
    expect(guard.state).toBe('done');
    expect(states).toEqual(['done']);
    expect(results).toEqual([{ studentAnswer: null, outcome: 'unsure', expected: null }]);
    void guard.validator(question, 'A');
    await flush();
    expect(host).not.toHaveBeenCalled();
    expect(guard.unsure()).toBe(false);
  });
});
