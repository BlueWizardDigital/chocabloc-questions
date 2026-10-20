/**
 * Level picker: moves a kid up a level after `up` right first tries in a row
 * and down after `down` wrong ones, inside one batch of questions. Pure: no
 * window, no document, no mutation of inputs. State is plain data so a game
 * can keep it inside its own round state.
 *
 * A step is one level the picker has SEEN, never +/-1 on the number.
 */

export interface LevelPickerState {
  /** null until the first pickNext */
  level: number | null;
  /** every kidLevel seen in candidates so far, ascending */
  levels: number[];
  start: number | null;
  up: number;
  down: number;
  /** +n = n right in a row, -n = n wrong in a row */
  run: number;
}

export interface Levelled {
  kidLevel?: number | null;
}

export interface LevelPickerOptions {
  start: number | null;
  up?: number;
  down?: number;
}

export function initLevelPicker(opts: LevelPickerOptions): LevelPickerState {
  return {
    level: null,
    levels: [],
    start: opts.start,
    up: opts.up === undefined ? 2 : opts.up,
    down: opts.down === undefined ? 2 : opts.down,
    run: 0,
  };
}

function levelOf(q: Levelled): number | null {
  const l = q.kidLevel;
  return typeof l === 'number' && isFinite(l) ? l : null;
}

/** Nearest value in a list by number; the lower one on a tie. */
function nearest(values: readonly number[], target: number): number {
  let best = values[0] as number;
  for (const v of values) {
    const d = Math.abs(v - target);
    const bd = Math.abs(best - target);
    if (d < bd || (d === bd && v < best)) best = v;
  }
  return best;
}

export function pickNext<T extends Levelled>(
  state: LevelPickerState,
  candidates: readonly T[],
  rng: () => number = Math.random,
): { state: LevelPickerState; index: number } {
  const seen: number[] = state.levels.slice();
  for (const q of candidates) {
    const l = levelOf(q);
    if (l !== null && seen.indexOf(l) === -1) seen.push(l);
  }
  seen.sort((a, b) => a - b);

  let level = state.level;
  if (level === null && seen.length > 0) {
    level = state.start === null ? (seen[0] as number) : nearest(seen, state.start);
  }
  const next: LevelPickerState = { ...state, level, levels: seen };

  // candidate levels that still have something to serve
  const available: number[] = [];
  let firstUnlevelled = -1;
  for (let i = 0; i < candidates.length; i++) {
    const l = levelOf(candidates[i] as T);
    if (l === null) {
      if (firstUnlevelled === -1) firstUnlevelled = i;
    } else if (available.indexOf(l) === -1) {
      available.push(l);
    }
  }

  if (available.length > 0 && level !== null) {
    const target = available.indexOf(level) !== -1 ? level : nearest(available, level);
    const at: number[] = [];
    for (let i = 0; i < candidates.length; i++) {
      if (levelOf(candidates[i] as T) === target) at.push(i);
    }
    const pick = Math.min(at.length - 1, Math.floor(rng() * at.length));
    return { state: next, index: at[pick] as number };
  }
  return { state: next, index: firstUnlevelled };
}

export function recordAnswer(state: LevelPickerState, correctFirstTry: boolean): LevelPickerState {
  let run: number;
  if (correctFirstTry) run = state.run > 0 ? state.run + 1 : 1;
  else run = state.run < 0 ? state.run - 1 : -1;

  let level = state.level;
  if (level !== null && (run >= state.up || run <= -state.down)) {
    const i = state.levels.indexOf(level);
    if (i !== -1) {
      const j = run > 0 ? Math.min(i + 1, state.levels.length - 1) : Math.max(i - 1, 0);
      level = state.levels[j] as number;
    }
    run = 0;
  } else if (level === null && (run >= state.up || run <= -state.down)) {
    run = 0;
  }
  return { ...state, level, run };
}

export function createLevelPicker(opts: LevelPickerOptions): {
  next<T extends Levelled>(candidates: readonly T[]): T | undefined;
  record(correctFirstTry: boolean): void;
  readonly level: number | null;
} {
  let state = initLevelPicker(opts);
  return {
    next<T extends Levelled>(candidates: readonly T[]): T | undefined {
      const r = pickNext(state, candidates);
      state = r.state;
      return r.index === -1 ? undefined : (candidates[r.index] as T);
    },
    record(correctFirstTry: boolean): void {
      state = recordAnswer(state, correctFirstTry);
    },
    get level(): number | null {
      return state.level;
    },
  };
}
