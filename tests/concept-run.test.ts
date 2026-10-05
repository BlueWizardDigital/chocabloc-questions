import { describe, it, expect, vi } from 'vitest';
import {
  createConceptRun,
  defaultRunId,
  CONCEPT_TICK_MS,
  type ConceptRunOptions,
} from '../src/conceptRun';
import type { ConceptSessionPayload } from '../src/bridge';

const SEC = 1000;
const MIN = 60 * SEC;
type Fn = () => void;

// Drives a saver the way a game and a browser would: a controllable clock, a
// 5-second timer fired as the clock passes each tick, fake window/document listeners.
function harness(opts: Partial<ConceptRunOptions> = {}) {
  let t = 1000;
  let interval: Fn | null = null;
  let ids = 0;
  const reports: ConceptSessionPayload[] = [];
  const winL = new Map<string, { fn: Fn; opts: unknown }>();
  const docL = new Map<string, Fn>();
  const doc = {
    hidden: false,
    addEventListener: (k: string, fn: Fn) => void docL.set(k, fn),
    removeEventListener: (k: string) => void docL.delete(k),
  };
  const win = {
    addEventListener: (k: string, fn: Fn, o: unknown) => void winL.set(k, { fn, opts: o }),
    removeEventListener: (k: string) => void winL.delete(k),
  };
  const saver = createConceptRun({
    report: (p) => {
      reports.push(p);
      return Promise.resolve(null);
    },
    concept: { concept_id: 'C' },
    ...opts,
    env: {
      now: () => t,
      window: win,
      document: doc,
      setInterval: (fn) => {
        interval = fn;
        return 1;
      },
      clearInterval: () => {
        interval = null;
      },
      newId: () => `run-${++ids}`,
      ...opts.env,
    },
  });
  const h = {
    saver,
    reports,
    winL,
    docL,
    get timerRunning() {
      return interval !== null;
    },
    /** Let time pass with no input; the timer fires every full 5 s. */
    wait(ms: number) {
      const end = t + ms;
      while (t < end) {
        const step = Math.min(CONCEPT_TICK_MS, end - t);
        t += step;
        if (step === CONCEPT_TICK_MS && interval) interval();
      }
    },
    tap() {
      winL.get('pointerdown')!.fn();
    },
    /** Play: a tap every 10 s. */
    play(ms: number) {
      const end = t + ms;
      while (t < end) {
        h.wait(Math.min(10 * SEC, end - t));
        h.tap();
      }
    },
    hide() {
      doc.hidden = true;
      docL.get('visibilitychange')!();
    },
    show() {
      doc.hidden = false;
      docL.get('visibilitychange')!();
    },
  };
  return h;
}
const flush = () => new Promise((r) => setTimeout(r, 0));
const sum = (rs: ConceptSessionPayload[], k: keyof ConceptSessionPayload) =>
  rs.reduce((a, r) => a + (r[k] as number), 0);

describe('createConceptRun: clock and pieces', () => {
  it('a short run reports once, at finish, with its levels and xp', async () => {
    const h = harness();
    h.saver.start();
    h.play(30 * SEC);
    h.saver.correct(3);
    h.saver.finish({ levels: 1, xp: 50 });
    await flush();
    expect(h.reports).toEqual([
      { timePlayedMs: 30000, levelsCompleted: 1, xpEarned: 50, correctCombos: 3, clientSessionId: 'run-1' },
    ]);
  });

  it('checkpoints every minute; the pieces add up to the run, once each', async () => {
    const h = harness();
    h.saver.start();
    h.play(3.5 * MIN);
    h.saver.finish({ levels: 1, xp: 10 });
    await flush();
    expect(h.reports.map((r) => r.timePlayedMs)).toEqual([60000, 60000, 60000, 30000]);
    expect(h.reports.slice(0, 3).every((r) => r.levelsCompleted === 0 && r.xpEarned === 0)).toBe(true);
    expect(sum(h.reports, 'levelsCompleted')).toBe(1);
    expect(sum(h.reports, 'xpEarned')).toBe(10);
    expect(new Set(h.reports.map((r) => r.clientSessionId))).toEqual(new Set(['run-1']));
  });

  it('idle: only 2 minutes of an untouched 5-minute stretch count, and checkpoints do not reset the idle window', async () => {
    const h = harness();
    h.saver.start();
    h.wait(5 * MIN); // the timer fires all along; a checkpoint must not count as input
    h.saver.finish();
    await flush();
    expect(sum(h.reports, 'timePlayedMs')).toBe(2 * MIN);
  });

  it('a tap after an idle stretch counts again', async () => {
    const h = harness();
    h.saver.start();
    h.wait(5 * MIN);
    h.tap();
    h.play(1 * MIN);
    h.saver.finish();
    await flush();
    expect(sum(h.reports, 'timePlayedMs')).toBe(3 * MIN);
  });

  it('hidden time never counts; hiding sends a piece when at least 15 s is unsent', async () => {
    const h = harness();
    h.saver.start();
    h.play(30 * SEC);
    h.hide();
    await flush();
    expect(h.reports.map((r) => r.timePlayedMs)).toEqual([30000]);
    h.wait(5 * MIN);
    h.tap(); // a tap while hidden adds nothing
    h.show();
    h.play(20 * SEC);
    h.saver.finish();
    await flush();
    expect(sum(h.reports, 'timePlayedMs')).toBe(50000);
  });

  it('a hide with under 15 s unsent sends nothing then', async () => {
    const h = harness();
    h.saver.start();
    h.play(10 * SEC);
    h.hide();
    await flush();
    expect(h.reports).toHaveLength(0);
    h.show();
    h.saver.finish();
    await flush();
    expect(sum(h.reports, 'timePlayedMs')).toBe(10000);
  });

  it('paused time never counts', async () => {
    const h = harness();
    h.saver.start();
    h.play(20 * SEC);
    h.saver.pause(true);
    h.wait(5 * MIN);
    h.tap(); // a tap while paused adds nothing
    h.saver.pause(false);
    h.play(20 * SEC);
    h.saver.finish();
    await flush();
    expect(sum(h.reports, 'timePlayedMs')).toBe(40000);
  });

  it('add() levels and xp ride once, on the next piece', async () => {
    const h = harness();
    h.saver.start();
    h.saver.add({ levels: 2, xp: 30 });
    h.play(1 * MIN); // the 60 s checkpoint carries them
    h.play(30 * SEC);
    h.saver.finish();
    await flush();
    expect(h.reports.map((r) => [r.levelsCompleted, r.xpEarned])).toEqual([
      [2, 30],
      [0, 0],
    ]);
  });

  it('start() over a live run abandons it first, under its own run id', async () => {
    const h = harness();
    h.saver.start();
    h.play(20 * SEC);
    h.saver.start();
    h.play(10 * SEC);
    h.saver.finish();
    await flush();
    expect(h.reports.map((r) => [r.clientSessionId, r.timePlayedMs])).toEqual([
      ['run-1', 20000],
      ['run-2', 10000],
    ]);
  });

  it('abandon with nothing unsent sends nothing', async () => {
    const h = harness();
    h.saver.start();
    h.saver.abandon();
    h.saver.start();
    h.saver.start();
    h.saver.abandon();
    await flush();
    expect(h.reports).toHaveLength(0);
  });

  it('finish and abandon end the run; repeats and calls outside a run do nothing', async () => {
    const h = harness();
    h.saver.correct(5); // before start: ignored
    h.saver.add({ levels: 9 });
    h.saver.start();
    h.play(10 * SEC);
    h.saver.finish();
    h.saver.finish();
    h.saver.abandon();
    h.saver.correct();
    await flush();
    expect(h.reports).toHaveLength(1);
    expect(h.reports[0]).toMatchObject({ timePlayedMs: 10000, correctCombos: 0, levelsCompleted: 0 });
    expect(h.timerRunning).toBe(false);
  });

  it('every piece is whole numbers within the server bounds', async () => {
    let k = 0;
    const h = harness({ env: { now: () => 1000.37 + (k += 3333.71) } });
    h.saver.start();
    h.play(2 * MIN);
    h.saver.correct(2.7);
    h.saver.correct(Number.NaN);
    h.saver.correct(-4);
    h.saver.add({ xp: 5e6, levels: -3 });
    h.saver.finish({ levels: 1.9 });
    await flush();
    for (const r of h.reports) {
      for (const key of ['timePlayedMs', 'levelsCompleted', 'xpEarned', 'correctCombos'] as const) {
        expect(Number.isInteger(r[key])).toBe(true);
        expect(r[key]!).toBeGreaterThanOrEqual(0);
      }
      expect(r.timePlayedMs!).toBeLessThanOrEqual(86_400_000);
      expect(r.xpEarned!).toBeLessThanOrEqual(1_000_000);
    }
    const last = h.reports[h.reports.length - 1];
    expect(last.correctCombos).toBe(2);
    expect(last.xpEarned).toBe(1_000_000);
    expect(last.levelsCompleted).toBe(1);
  });

  it('a report that throws or rejects never escapes', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const throwing = harness({
      report: () => {
        throw new Error('boom');
      },
    });
    throwing.saver.start();
    throwing.play(10 * SEC);
    expect(() => throwing.saver.finish()).not.toThrow();
    const rejecting = harness({ report: () => Promise.reject(new Error('nope')) });
    rejecting.saver.start();
    rejecting.play(10 * SEC);
    rejecting.saver.finish();
    await flush();
    await flush();
    expect(warn).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });

  it('listens for input as a passive capture listener on window; dispose removes everything and sends nothing', async () => {
    const h = harness();
    expect(h.winL.get('pointerdown')?.opts).toEqual({ capture: true, passive: true });
    expect(h.winL.get('keydown')?.opts).toEqual({ capture: true, passive: true });
    expect(h.docL.has('visibilitychange')).toBe(true);
    h.saver.start();
    h.play(30 * SEC);
    h.saver.dispose();
    expect(h.winL.size).toBe(0);
    expect(h.docL.size).toBe(0);
    expect(h.timerRunning).toBe(false);
    h.saver.start(); // after dispose: does nothing
    expect(h.timerRunning).toBe(false);
    await flush();
    expect(h.reports).toHaveLength(0);
  });

  it('defaultRunId is a string under 255 characters and differs on each call', () => {
    const a = defaultRunId();
    const b = defaultRunId();
    expect(typeof a).toBe('string');
    expect(a.length).toBeGreaterThan(0);
    expect(a.length).toBeLessThanOrEqual(255);
    expect(a).not.toBe(b);
  });

  it('works on the real defaults without window or document', async () => {
    const reports: ConceptSessionPayload[] = [];
    const saver = createConceptRun({
      report: (p) => void reports.push(p),
      concept: true,
      env: { window: null, document: null },
    });
    saver.start();
    saver.finish({ levels: 1 });
    saver.dispose();
    // No env at all: whatever globals this environment has.
    const bare = createConceptRun({ report: (p) => void reports.push(p), concept: true });
    bare.start();
    bare.finish();
    bare.dispose();
    await flush();
    expect(reports).toHaveLength(2);
    expect(Number.isInteger(reports[0].timePlayedMs)).toBe(true);
    expect(typeof reports[0].clientSessionId).toBe('string');
  });
});

describe('createConceptRun: concept gating', () => {
  it('a concept that arrives late gets the whole run, in order', async () => {
    let resolve!: (v: unknown) => void;
    const concept = new Promise((r) => (resolve = r));
    const h = harness({ concept });
    h.saver.start();
    h.play(2.5 * MIN);
    await flush();
    expect(h.reports).toHaveLength(0); // nothing goes out before the concept
    resolve({ concept_id: 'C' });
    await flush();
    expect(h.reports.map((r) => r.timePlayedMs)).toEqual([60000, 60000]);
    h.saver.finish();
    await flush();
    expect(sum(h.reports, 'timePlayedMs')).toBe(150000);
  });

  // Factories, not values: a Promise.reject() built at table time is an unhandled
  // rejection before the test attaches to it.
  it.each([
    ['null', () => null],
    ['a promise of null', () => Promise.resolve(null)],
    ['a rejected promise', () => Promise.reject(new Error('no concept'))],
  ])('no concept (%s) means nothing is ever sent', async (_label, makeConcept) => {
    const h = harness({ concept: makeConcept() });
    h.saver.start();
    h.play(2 * MIN);
    h.saver.finish({ levels: 1 });
    await flush();
    expect(h.reports).toHaveLength(0);
  });

  it('setConcept files each stretch under its own concept, levels and xp included', async () => {
    const h = harness();
    h.saver.start();
    h.saver.setConcept('SMS');
    h.play(30 * SEC);
    h.saver.add({ levels: 1, xp: 10 });
    h.saver.setConcept('EMAIL');
    h.play(20 * SEC);
    h.saver.finish({ levels: 1, xp: 10 });
    await flush();
    expect(h.reports.map((r) => [r.conceptId, r.timePlayedMs, r.levelsCompleted, r.xpEarned])).toEqual([
      ['SMS', 30000, 1, 10],
      ['EMAIL', 20000, 1, 10],
    ]);
  });

  it('setConcept with an unchanged concept sends nothing: the stretch just continues', async () => {
    const h = harness();
    h.saver.start();
    for (let i = 0; i < 5; i++) {
      h.saver.setConcept('SMS');
      h.play(6 * SEC);
    }
    h.saver.finish();
    await flush();
    expect(h.reports.map((r) => [r.conceptId, r.timePlayedMs])).toEqual([['SMS', 30000]]);
  });

  it('with perConcept, a stretch with no concept is dropped, never sent without one', async () => {
    const h = harness({ perConcept: true });
    h.saver.start();
    h.play(20 * SEC); // before the first setConcept: dropped
    h.saver.setConcept('SMS');
    h.play(10 * SEC);
    h.saver.setConcept(null); // an unknown channel: dropped
    h.play(30 * SEC);
    h.saver.setConcept('DM');
    h.play(10 * SEC);
    h.saver.finish();
    await flush();
    expect(h.reports.map((r) => [r.conceptId, r.timePlayedMs])).toEqual([
      ['SMS', 10000],
      ['DM', 10000],
    ]);
    expect(h.reports.every((r) => typeof r.conceptId === 'string')).toBe(true);
  });

  it('a new run never inherits the last run’s concept', async () => {
    const h = harness({ perConcept: true });
    h.saver.start();
    h.saver.setConcept('SMS');
    h.play(10 * SEC);
    h.saver.finish();
    h.saver.start();
    h.play(20 * SEC); // run 2, before its first setConcept: dropped, NOT filed under SMS
    h.saver.setConcept('DM');
    h.play(10 * SEC);
    h.saver.finish();
    await flush();
    expect(h.reports.map((r) => [r.clientSessionId, r.conceptId, r.timePlayedMs])).toEqual([
      ['run-1', 'SMS', 10000],
      ['run-2', 'DM', 10000],
    ]);
  });

  it('without perConcept or setConcept, pieces carry no conceptId (the host resolves it)', async () => {
    const h = harness();
    h.saver.start();
    h.play(10 * SEC);
    h.saver.finish();
    await flush();
    expect(h.reports[0]).not.toHaveProperty('conceptId');
  });
});
