// Host kit — question loader (bank → fixture → generate). Node env.
// requestBankQuestions wraps the bridge's bulk call + normalizes (tokens kept).
// loadQuestions is the generic tiering engine: try each source in order, stop
// when full, dedupe by id. Fixture/generate are injected per game (optional).
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NormalizedQuestion } from '../src/types';

const requestQuestions = vi.fn();

vi.mock('../src/bridge', () => ({
  bridge: {
    ctx: undefined,
    onReady: () => {},
    started: vi.fn(),
    attempt: vi.fn(),
    score: vi.fn(),
    saveNotify: vi.fn(),
    validateAnswer: vi.fn(),
    requestQuestions,
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

// Minimal stand-ins; the loader only touches `.id` for dedup.
const nq = (id: string): NormalizedQuestion => ({ id }) as unknown as NormalizedQuestion;

describe('requestBankQuestions', () => {
  it('asks the bridge for a batch and normalizes the rows (token preserved)', async () => {
    requestQuestions.mockResolvedValue([
      {
        id: 'a',
        format: 'multiplication',
        skillIds: ['M'],
        questionText: 'q',
        choices: [{ value: 1 }],
        answerToken: 'tok-a',
      },
    ]);
    const { requestBankQuestions } = await import('../src/host');
    const qs = await requestBankQuestions(5);
    expect(requestQuestions).toHaveBeenCalledWith({ count: 5 });
    expect(qs[0]!.id).toBe('a');
    expect(qs[0]!.answerToken).toBe('tok-a');
  });
});

describe('loadQuestions — bank → fixture → generate', () => {
  it('returns bank questions when the bank fills the count', async () => {
    const { loadQuestions } = await import('../src/host');
    const fetchBank = vi.fn().mockResolvedValue([nq('a'), nq('b'), nq('c')]);
    const out = await loadQuestions(3, {}, { fetchBank });
    expect(out.map((q) => q.id)).toEqual(['a', 'b', 'c']);
  });

  it('falls back to fixture then generate to reach the count', async () => {
    const { loadQuestions } = await import('../src/host');
    const fetchBank = vi.fn().mockResolvedValue([nq('a')]);
    const loadFixture = vi.fn().mockResolvedValue([nq('b')]);
    const generate = vi.fn().mockReturnValue([nq('c'), nq('d')]);
    const out = await loadQuestions(3, {}, { fetchBank, loadFixture, generate });
    expect(out.map((q) => q.id)).toEqual(['a', 'b', 'c']);
  });

  it('dedupes by id across tiers', async () => {
    const { loadQuestions } = await import('../src/host');
    const fetchBank = vi.fn().mockResolvedValue([nq('a')]);
    const loadFixture = vi.fn().mockResolvedValue([nq('a'), nq('b')]);
    const out = await loadQuestions(2, {}, { fetchBank, loadFixture });
    expect(out.map((q) => q.id)).toEqual(['a', 'b']);
  });

  it('skips the bank when standalone', async () => {
    const { loadQuestions } = await import('../src/host');
    const fetchBank = vi.fn();
    const generate = vi.fn().mockReturnValue([nq('g1'), nq('g2')]);
    const out = await loadQuestions(2, { standalone: true }, { fetchBank, generate });
    expect(fetchBank).not.toHaveBeenCalled();
    expect(out.map((q) => q.id)).toEqual(['g1', 'g2']);
  });

  it('survives a bank fetch error by falling through to the next tier', async () => {
    const { loadQuestions } = await import('../src/host');
    const fetchBank = vi.fn().mockRejectedValue(new Error('down'));
    const loadFixture = vi.fn().mockResolvedValue([nq('f1'), nq('f2')]);
    const out = await loadQuestions(2, {}, { fetchBank, loadFixture });
    expect(out.map((q) => q.id)).toEqual(['f1', 'f2']);
  });

  it('skips tiers a game does not provide', async () => {
    const { loadQuestions } = await import('../src/host');
    // Only a generator supplied; bank default is skipped via standalone.
    const generate = vi.fn().mockReturnValue([nq('g1')]);
    const out = await loadQuestions(3, { standalone: true }, { generate });
    expect(out.map((q) => q.id)).toEqual(['g1']);
  });
});
