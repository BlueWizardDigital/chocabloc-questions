import type { LessonPicture } from '../types';

type NumberLine = Extract<LessonPicture, { kind: 'numberLine' }>;

const STEPS = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000];
const MAX_TICKS = 20;
const FULL_LABEL_TICKS = 11;
const PAD = 16;
/** One character of the 14px bold label font is about 8.5px wide ("1000" and "−150" come to about 34px). */
const CHAR_W = 8.5;
const AIR = 2;
/** Least distance between two label centres on one row: half of each label's width, plus a little air. */
export function labelGap(a: number, b: number): number {
  const chars = (n: number) => (n < 0 ? 1 : 0) + String(Math.abs(n)).length;
  return ((chars(a) + chars(b)) / 2) * CHAR_W + AIR;
}

export function numberLineLayout(
  pic: NumberLine,
  width: number,
): {
  ticks: { value: number; x: number; label: boolean; row: number }[];
  /** Labels for marks and jump ends that fall between ticks. Row 1 sits below row 0 when two would touch. */
  ends: { value: number; x: number; row: number }[];
  /** How many label rows were used (1 unless forced labels crowd). */
  rows: number;
  marks: { value: number; x: number }[];
  jumps: { fromX: number; toX: number; label: string }[];
} {
  const { from, to } = pic;
  const span = to - from;
  const inner = width - PAD * 2;
  const xOf = (v: number) => (span === 0 ? width / 2 : PAD + ((v - from) / span) * inner);

  // The largest step is the fallback when nothing fits in 20 ticks.
  const step = STEPS.find((s) => Math.ceil(span / s) + 1 <= MAX_TICKS) ?? 1000;
  const values: number[] = [];
  if (span === 0) values.push(to);
  else if (Number.isFinite(span) && span > 0 && from + step > from) {
    // Bounded by index, not by value, so no span can make this loop run long.
    for (let i = 0; i < MAX_TICKS && from + i * step < to; i++) values.push(from + i * step);
    values.push(to);
  }

  const everyLabel = values.length <= FULL_LABEL_TICKS;
  const last = values.length - 1;
  const ticks = values.map((value, i) => ({
    value,
    x: xOf(value),
    label: everyLabel || i % 2 === 0 || i === last,
    row: 0,
  }));

  // Every mark and jump end keeps its number; a plain tick label beside one gives way.
  const forced = [...new Set([...(pic.marks ?? []), ...(pic.jumps ?? []).flatMap((j) => [j.from, j.to])])]
    .map((value) => ({ value, x: xOf(value) }))
    .sort((p, q) => p.x - q.x);
  const rowsUsed: { value: number; x: number }[][] = [];
  const ends: { value: number; x: number; row: number }[] = [];
  for (const f of forced) {
    // First row where this label clears every label already placed there.
    let row = rowsUsed.findIndex((r) => r.every((o) => Math.abs(f.x - o.x) >= labelGap(f.value, o.value)));
    if (row < 0) row = rowsUsed.length;
    (rowsUsed[row] ??= []).push(f);
    const tick = ticks.find((t) => t.value === f.value);
    if (tick) {
      tick.label = true;
      tick.row = row;
    } else ends.push({ ...f, row });
  }
  for (const t of ticks) {
    // Forced ticks keep their label; a plain one beside a forced label drops.
    if (!forced.some((f) => f.value === t.value) && forced.some((f) => Math.abs(f.x - t.x) < labelGap(f.value, t.value))) {
      t.label = false;
    }
  }

  return {
    ticks,
    ends,
    rows: Math.max(1, rowsUsed.length),
    marks: (pic.marks ?? []).map((value) => ({ value, x: xOf(value) })),
    jumps: (pic.jumps ?? []).map((j) => ({
      fromX: xOf(j.from),
      toX: xOf(j.to),
      label: j.to >= j.from ? `+${j.to - j.from}` : `−${j.from - j.to}`,
    })),
  };
}
