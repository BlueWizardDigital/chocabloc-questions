import type { LessonPicture } from '../types';

type NumberLine = Extract<LessonPicture, { kind: 'numberLine' }>;

const STEPS = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000];
const MAX_TICKS = 20;
const FULL_LABEL_TICKS = 11;
const PAD = 16;
/** Least distance between two label centres on one row: a 3-digit label in the 14px bold font is about 26px wide. */
export const LABEL_GAP = 28;

export function numberLineLayout(
  pic: NumberLine,
  width: number,
): {
  ticks: { value: number; x: number; label: boolean; row: number }[];
  /** Labels for marks and jump ends that fall between ticks. Row 1 sits below row 0 when two would touch. */
  ends: { value: number; x: number; row: number }[];
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
  let lastRow0 = -Infinity;
  const ends: { value: number; x: number; row: number }[] = [];
  for (const f of forced) {
    const row = f.x - lastRow0 >= LABEL_GAP ? 0 : 1;
    if (row === 0) lastRow0 = f.x;
    const tick = ticks.find((t) => t.value === f.value);
    if (tick) {
      tick.label = true;
      tick.row = row;
    } else ends.push({ ...f, row });
  }
  for (const t of ticks) {
    if (forced.some((f) => f.value !== t.value && Math.abs(f.x - t.x) < LABEL_GAP)) {
      // Forced ticks keep their label; only plain ones drop.
      if (!forced.some((f) => f.value === t.value)) t.label = false;
    }
  }

  return {
    ticks,
    ends,
    marks: (pic.marks ?? []).map((value) => ({ value, x: xOf(value) })),
    jumps: (pic.jumps ?? []).map((j) => ({
      fromX: xOf(j.from),
      toX: xOf(j.to),
      label: j.to >= j.from ? `+${j.to - j.from}` : `−${j.from - j.to}`,
    })),
  };
}
