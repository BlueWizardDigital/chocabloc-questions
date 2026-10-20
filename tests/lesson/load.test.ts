import { describe, it, expect, afterEach, vi } from 'vitest';
import fixture from '../fixtures/lesson-compare-100.json';
import { loadLesson, loadLessonIndex } from '../../src/lesson/load';

function stub(res: Partial<Response> & { json?: () => Promise<unknown> }) {
  globalThis.fetch = vi.fn().mockResolvedValue(res) as unknown as typeof fetch;
}

afterEach(() => vi.restoreAllMocks());

describe('loadLesson', () => {
  it('200 with the fixture is ok', async () => {
    stub({ ok: true, status: 200, json: async () => fixture });
    const r = await loadLesson('/l.json');
    expect(r.ok).toBe(true);
    expect(globalThis.fetch).toHaveBeenCalledWith('/l.json');
  });
  it('404 is not-found', async () => {
    stub({ ok: false, status: 404 });
    expect(await loadLesson('/l.json')).toEqual({ ok: false, reason: 'not-found' });
  });
  it('500 is network', async () => {
    stub({ ok: false, status: 500 });
    expect(await loadLesson('/l.json')).toEqual({ ok: false, reason: 'network' });
  });
  it('a rejected fetch is network', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new TypeError('x')) as unknown as typeof fetch;
    expect(await loadLesson('/l.json')).toEqual({ ok: false, reason: 'network' });
  });
  it('a body that is not JSON is invalid', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response('{', { status: 200 })) as unknown as typeof fetch;
    expect(await loadLesson('/l.json')).toEqual({ ok: false, reason: 'invalid' });
  });
  it('formatVersion 9 is unsupported-version', async () => {
    stub({ ok: true, status: 200, json: async () => ({ ...fixture, formatVersion: 9 }) });
    expect(await loadLesson('/l.json')).toEqual({ ok: false, reason: 'unsupported-version' });
  });
});

describe('loadLessonIndex', () => {
  it('returns the index', async () => {
    const index = { formatVersion: 1, lang: 'en', lessons: {}, concepts: {} };
    stub({ ok: true, status: 200, json: async () => index });
    expect(await loadLessonIndex('/i.json')).toEqual({ ok: true, index });
  });
  it('404 is not-found', async () => {
    stub({ ok: false, status: 404 });
    expect(await loadLessonIndex('/i.json')).toEqual({ ok: false, reason: 'not-found' });
  });
});
