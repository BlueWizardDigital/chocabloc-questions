import { describe, it, expect, vi, afterEach } from 'vitest';
import { loadWordProblemData, RECOMMENDED_TEMPLATES_PATH, RECOMMENDED_CONTEXT_PATH } from '../../src/word-problems/loader';

afterEach(() => vi.unstubAllGlobals());

describe('loadWordProblemData', () => {
  it('fetches the recommended paths by default and returns data', async () => {
    const urls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (u: string) => {
      urls.push(u);
      const body = u.includes('templates') ? { ADD: { beginner: ['{a}'] } } : { themes: {} };
      return { ok: true, json: async () => body } as Response;
    }));
    const data = await loadWordProblemData();
    expect(urls).toEqual([RECOMMENDED_TEMPLATES_PATH, RECOMMENDED_CONTEXT_PATH]);
    expect(data.templates).toHaveProperty('ADD');
    expect(data.context).toHaveProperty('themes');
  });

  it('uses custom urls when given', async () => {
    const urls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (u: string) => { urls.push(u); return { ok: true, json: async () => ({}) } as Response; }));
    await loadWordProblemData({ templatesUrl: '/t.json', contextUrl: '/c.json' });
    expect(urls.sort()).toEqual(['/c.json', '/t.json']);
  });

  it('throws a clear error on a failed fetch', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404 } as Response)));
    await expect(loadWordProblemData()).rejects.toThrow(/404/);
  });
});
