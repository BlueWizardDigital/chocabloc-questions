import { describe, it, expect } from 'vitest';
import {
  initLevelPicker,
  pickNext,
  recordAnswer,
  createLevelPicker,
  type LevelPickerState,
} from '../src/levelPicker';
import cases from './fixtures/level-step-cases.json';

interface Item {
  id: number;
  kidLevel?: number | null;
}

function deck(levels: number[], per = 10): Item[] {
  const out: Item[] = [];
  let id = 0;
  for (const l of levels) for (let i = 0; i < per; i++) out.push({ id: id++, kidLevel: l });
  return out;
}

describe('level picker: shared step cases', () => {
  for (const c of cases) {
    it(c.name, () => {
      const picker = createLevelPicker({ start: c.start });
      let pool = deck(c.levels);
      const served: number[] = [];
      const take = () => {
        const q = picker.next(pool) as Item;
        pool = pool.filter((x) => x !== q);
        served.push(q.kidLevel as number);
      };
      take();
      for (const a of c.answers) {
        picker.record(a);
        take();
      }
      expect(served).toEqual(c.served);
    });
  }
});

describe('level picker: edge cases', () => {
  it('serves the nearest level when the current one is used up, without moving', () => {
    const all = deck([8, 9, 10]);
    const first = pickNext(initLevelPicker({ start: 9 }), all, () => 0);
    expect(first.state.level).toBe(9);
    const rest = all.filter((q) => q.kidLevel !== 9);
    const next = pickNext(first.state, rest, () => 0);
    expect(rest[next.index].kidLevel).toBe(8); // tie: easier
    expect(next.state.level).toBe(9);
    const rest2 = rest.filter((q) => q.kidLevel !== 8);
    const next2 = pickNext(first.state, rest2, () => 0);
    expect(rest2[next2.index].kidLevel).toBe(10);
    expect(next2.state.level).toBe(9);
  });

  it('snaps an unseen start to the nearest seen level, easier on a tie', () => {
    const r = pickNext(initLevelPicker({ start: 7 }), deck([5, 9]), () => 0);
    expect(r.state.level).toBe(5);
  });

  it('starts at the lowest level when start is null', () => {
    const r = pickNext(initLevelPicker({ start: null }), deck([6, 4, 8]), () => 0);
    expect(r.state.level).toBe(4);
    expect(r.state.levels).toEqual([4, 6, 8]);
  });

  it('returns candidates in order when none has a kidLevel', () => {
    const items: Item[] = [{ id: 1 }, { id: 2 }, { kidLevel: null, id: 3 }];
    const p = createLevelPicker({ start: 5 });
    expect(p.next(items)).toBe(items[0]);
    expect(p.next(items.slice(1))).toBe(items[1]);
    expect(p.level).toBeNull();
  });

  it('serves levelled candidates before unlevelled ones', () => {
    const items: Item[] = [{ id: 1 }, { id: 2, kidLevel: 3 }, { id: 3 }];
    const p = createLevelPicker({ start: 3 });
    expect(p.next(items)).toBe(items[1]);
    expect(p.next([items[0], items[2]])).toBe(items[0]);
  });

  it('returns index -1 for no candidates', () => {
    const r = pickNext(initLevelPicker({ start: 3 }), [], () => 0);
    expect(r.index).toBe(-1);
    expect(createLevelPicker({ start: 3 }).next([])).toBeUndefined();
  });

  it('picks within a level using rng', () => {
    const items = deck([5], 4);
    const s = initLevelPicker({ start: 5 });
    expect(pickNext(s, items, () => 0).index).toBe(0);
    expect(pickNext(s, items, () => 0.999).index).toBe(3);
  });

  it('honours custom up and down', () => {
    let s: LevelPickerState = initLevelPicker({ start: 5, up: 3, down: 1 });
    s = pickNext(s, deck([4, 5, 6]), () => 0).state;
    s = recordAnswer(s, true);
    s = recordAnswer(s, true);
    expect(s.level).toBe(5);
    s = recordAnswer(s, true);
    expect(s.level).toBe(6);
    s = recordAnswer(s, false);
    expect(s.level).toBe(5);
  });

  it('does not mutate its inputs', () => {
    const items = Object.freeze(deck([4, 5, 6]).map((x) => Object.freeze(x)));
    const s0 = initLevelPicker({ start: 5 });
    const s = Object.freeze({ ...s0, levels: Object.freeze([]) as unknown as number[] });
    const r = pickNext(s, items, () => 0);
    expect(s.level).toBeNull();
    expect(s.levels).toEqual([]);
    const frozen = Object.freeze({ ...r.state, levels: Object.freeze([...r.state.levels]) as unknown as number[] });
    expect(() => recordAnswer(frozen, true)).not.toThrow();
    expect(frozen.run).toBe(0);
  });

  it('state is plain data', () => {
    const s = pickNext(initLevelPicker({ start: 5 }), deck([5]), () => 0).state;
    expect(JSON.parse(JSON.stringify(s))).toEqual(s);
  });
});
