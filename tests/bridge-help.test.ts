// @vitest-environment jsdom
// Strategy help (Task 8): bridge.requestStrategyPicks and bridge.reportHelpEvents.
// Embedded setup mirrors tests/bridge-sound.test.ts: stub window.top so
// inIframe === true, replace window.parent with a postMessage spy, then send a
// chocabloc:init from window.parent (the F1 gate) so ctx is non-standalone.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { HelpEventReport } from '../src/bridge';
import { STRATEGIES } from '../src/help/catalog';

const originalTop = window.top;
const originalParent = window.parent;
let postSpy: ReturnType<typeof vi.fn>;

function embed(): void {
  postSpy = vi.fn();
  const parentStub = { postMessage: postSpy };
  Object.defineProperty(window, 'top', { configurable: true, get: () => ({ stub: true }) });
  Object.defineProperty(window, 'parent', { configurable: true, get: () => parentStub });
}

function restore(): void {
  Object.defineProperty(window, 'top', { configurable: true, get: () => originalTop });
  Object.defineProperty(window, 'parent', { configurable: true, get: () => originalParent });
}

function fromHost(data: unknown, source: unknown = window.parent): void {
  window.dispatchEvent(new MessageEvent('message', { data, source: source as Window }));
}

async function loadEmbedded(): Promise<typeof import('../src/bridge')> {
  embed();
  const mod = await import('../src/bridge');
  fromHost({
    type: 'chocabloc:init',
    payload: { isMobile: false, viewport: { w: 1024, h: 768 }, gradeBand: null, grade: 3, player: null },
  });
  return mod;
}

function request(type: string): { requestId: string } & Record<string, unknown> {
  const call = postSpy.mock.calls.find(([m]) => m && m.type === type);
  if (!call) throw new Error(`no ${type} posted`);
  return call[0].payload;
}

const deliver = (type: string, requestId: string, extra: Record<string, unknown>) =>
  fromHost({ type, payload: { requestId, ...extra } });

const EVENT: HelpEventReport = {
  eventId: 'e1',
  family: 'mult-facts',
  strategy: 'mult.skip-count',
  thumb: 'up',
  fact: '7x8',
  beforeAnswer: true,
  triesBefore: 0,
};

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.useRealTimers();
  restore();
});

// The bridge keeps its own copy of the catalog (Ruling 17). Every catalog id is
// tried under every family: it must survive exactly where STRATEGIES lists it,
// so an id missing from the bridge's copy, or filed under the wrong family, fails.
describe('the bridge’s strategy list matches STRATEGIES in src/help/catalog.ts', () => {
  const families = [...new Set(STRATEGIES.map((s) => s.family))];
  const cases = STRATEGIES.flatMap((s) =>
    families.map((family) => [s.id, family, s.family === family] as const)
  );

  it('covers both help families', () => {
    expect([...families].sort()).toEqual(['div-facts', 'mult-facts']);
  });

  it.each(cases)('%s under %s is kept: %s', async (id, family, kept) => {
    const { bridge } = await loadEmbedded();
    const p = bridge.requestStrategyPicks();
    const req = request('chocabloc:strategy:request');
    deliver('chocabloc:strategy:deliver', req.requestId, { picks: { [family]: id } });
    await expect(p).resolves.toEqual(kept ? { [family]: id } : {});
  });
});

describe('chocabloc:ready', () => {
  it('ready advertises help', async () => {
    embed();
    await import('../src/bridge');
    expect(postSpy).toHaveBeenCalledWith(
      { type: 'chocabloc:ready', payload: { features: ['sound', 'help'] } },
      '*'
    );
  });
});

describe('requestStrategyPicks — host channel', () => {
  it('resolves the delivered picks for the matching requestId only', async () => {
    const { bridge } = await loadEmbedded();
    const p = bridge.requestStrategyPicks();
    const req = request('chocabloc:strategy:request');
    expect(typeof req.requestId).toBe('string');
    expect(Object.keys(req)).toEqual(['requestId']);

    let settled = false;
    void p.then(() => (settled = true));
    deliver('chocabloc:strategy:deliver', 'not-the-id', { picks: { 'mult-facts': 'mult.groups' } });
    await Promise.resolve();
    expect(settled).toBe(false);

    deliver('chocabloc:strategy:deliver', req.requestId, {
      picks: { 'mult-facts': 'mult.skip-count', 'div-facts': 'div.share' },
    });
    await expect(p).resolves.toEqual({ 'mult-facts': 'mult.skip-count', 'div-facts': 'div.share' });
  });

  it('ignores a reply with no payload or a non-string requestId', async () => {
    const { bridge } = await loadEmbedded();
    const p = bridge.requestStrategyPicks();
    const req = request('chocabloc:strategy:request');
    fromHost({ type: 'chocabloc:strategy:deliver' });
    fromHost({ type: 'chocabloc:strategy:deliver', payload: { requestId: 7, picks: { 'mult-facts': 'mult.groups' } } });
    deliver('chocabloc:strategy:deliver', req.requestId, { picks: { 'div-facts': 'div.groups' } });
    await expect(p).resolves.toEqual({ 'div-facts': 'div.groups' });
  });

  it('requestStrategyPicks resolves {} on timeout', async () => {
    vi.useFakeTimers();
    const { bridge } = await loadEmbedded();
    const p = bridge.requestStrategyPicks();
    await vi.advanceTimersByTimeAsync(4001);
    await expect(p).resolves.toEqual({});
  });

  it('resolves {} on an error reply', async () => {
    const { bridge } = await loadEmbedded();
    const p = bridge.requestStrategyPicks();
    const req = request('chocabloc:strategy:request');
    deliver('chocabloc:strategy:deliver', req.requestId, {
      error: { code: 'UNAUTHENTICATED', message: 'no session' },
    });
    await expect(p).resolves.toEqual({});
  });

  it('keeps only known strategy ids for their own family', async () => {
    const { bridge } = await loadEmbedded();
    const p = bridge.requestStrategyPicks();
    const req = request('chocabloc:strategy:request');
    deliver('chocabloc:strategy:deliver', req.requestId, {
      picks: {
        'mult-facts': 'div.share', // a real id, but the other family's
        'div-facts': 'div.array',
        'add-facts': 'mult.groups', // not a help family
        toString: 'mult.groups',
      },
    });
    await expect(p).resolves.toEqual({ 'div-facts': 'div.array' });
  });

  it.each([
    ['an unknown id', { 'mult-facts': 'mult.guess' }],
    ['a non-string id', { 'mult-facts': 7 }],
    ['an array', ['mult.groups']],
    ['a string', 'mult.groups'],
    ['null', null],
    ['no picks field', undefined],
  ])('resolves {} for %s', async (_label, picks) => {
    const { bridge } = await loadEmbedded();
    const p = bridge.requestStrategyPicks();
    const req = request('chocabloc:strategy:request');
    deliver('chocabloc:strategy:deliver', req.requestId, picks === undefined ? {} : { picks });
    await expect(p).resolves.toEqual({});
  });

  it('returns a fresh object the host cannot reach into', async () => {
    const { bridge } = await loadEmbedded();
    const p = bridge.requestStrategyPicks();
    const req = request('chocabloc:strategy:request');
    const picks = JSON.parse('{"__proto__": {"polluted": "yes"}, "mult-facts": "mult.groups"}');
    deliver('chocabloc:strategy:deliver', req.requestId, { picks });
    const out = await p;
    expect(out).toEqual({ 'mult-facts': 'mult.groups' });
    expect(Object.getPrototypeOf(out)).toBe(Object.prototype);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('drops a deliver from a non-parent source (F1 gate) and times out to {}', async () => {
    vi.useFakeTimers();
    const { bridge } = await loadEmbedded();
    const p = bridge.requestStrategyPicks();
    const req = request('chocabloc:strategy:request');
    fromHost(
      { type: 'chocabloc:strategy:deliver', payload: { requestId: req.requestId, picks: { 'mult-facts': 'mult.groups' } } },
      { stub: 'attacker' }
    );
    await vi.advanceTimersByTimeAsync(4001);
    await expect(p).resolves.toEqual({});
  });

  it('resolves {} when postMessage throws', async () => {
    const { bridge } = await loadEmbedded();
    postSpy.mockImplementation(() => {
      throw new Error('parent gone');
    });
    await expect(bridge.requestStrategyPicks()).resolves.toEqual({});
  });
});

describe('requestStrategyPicks — standalone', () => {
  it('resolves {} at once, posts nothing and fetches nothing', async () => {
    const fetchSpy = vi.fn();
    (globalThis as { fetch?: unknown }).fetch = fetchSpy;
    const { bridge } = await import('../src/bridge'); // jsdom: not in an iframe
    await expect(bridge.requestStrategyPicks()).resolves.toEqual({});
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('reportHelpEvents', () => {
  it('reportHelpEvents resolves null standalone and {ok} when hosted', async () => {
    const standalone = await import('../src/bridge');
    await expect(standalone.bridge.reportHelpEvents([EVENT])).resolves.toBeNull();

    vi.resetModules();
    const { bridge } = await loadEmbedded();
    const p = bridge.reportHelpEvents([EVENT]);
    const req = request('chocabloc:help-event:report');
    expect(req.events).toEqual([EVENT]);
    expect(typeof req.requestId).toBe('string');
    deliver('chocabloc:help-event:deliver', req.requestId, { ok: true });
    await expect(p).resolves.toEqual({ ok: true });
  });

  it('passes on a refusal as { ok: false }', async () => {
    const { bridge } = await loadEmbedded();
    const p = bridge.reportHelpEvents([EVENT]);
    const req = request('chocabloc:help-event:report');
    deliver('chocabloc:help-event:deliver', req.requestId, { ok: false, code: 'HELP_EVENT_INVALID' });
    await expect(p).resolves.toEqual({ ok: false });
  });

  it('treats a reply without a boolean ok as { ok: false }', async () => {
    const { bridge } = await loadEmbedded();
    const p = bridge.reportHelpEvents([EVENT]);
    const req = request('chocabloc:help-event:report');
    deliver('chocabloc:help-event:deliver', req.requestId, { ok: 'yes' });
    await expect(p).resolves.toEqual({ ok: false });
  });

  it('ignores a non-matching requestId and resolves { ok: false } on timeout', async () => {
    vi.useFakeTimers();
    const { bridge } = await loadEmbedded();
    const p = bridge.reportHelpEvents([EVENT]);
    deliver('chocabloc:help-event:deliver', 'not-the-id', { ok: true });
    await vi.advanceTimersByTimeAsync(5001);
    await expect(p).resolves.toEqual({ ok: false });
  });

  it('resolves { ok: false } when postMessage throws', async () => {
    const { bridge } = await loadEmbedded();
    postSpy.mockImplementation(() => {
      throw new Error('parent gone');
    });
    await expect(bridge.reportHelpEvents([EVENT])).resolves.toEqual({ ok: false });
  });
});

describe('the two help channels never answer each other', () => {
  it('ignores a strategy deliver carrying a report requestId, and the reverse', async () => {
    const { bridge } = await loadEmbedded();
    const picks = bridge.requestStrategyPicks();
    const report = bridge.reportHelpEvents([EVENT]);
    const pickId = request('chocabloc:strategy:request').requestId;
    const reportId = request('chocabloc:help-event:report').requestId;

    let settled = 0;
    void picks.then(() => settled++);
    void report.then(() => settled++);
    deliver('chocabloc:strategy:deliver', reportId, { picks: { 'mult-facts': 'mult.groups' }, ok: true });
    deliver('chocabloc:help-event:deliver', pickId, { ok: true, picks: { 'mult-facts': 'mult.groups' } });
    await Promise.resolve();
    expect(settled).toBe(0);

    deliver('chocabloc:strategy:deliver', pickId, { picks: { 'div-facts': 'div.array' } });
    deliver('chocabloc:help-event:deliver', reportId, { ok: false, code: 'HELP_EVENT_INVALID' });
    await expect(picks).resolves.toEqual({ 'div-facts': 'div.array' });
    await expect(report).resolves.toEqual({ ok: false });
  });
});
