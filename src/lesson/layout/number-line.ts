import type { LessonPicture } from '../types';

type NumberLine = Extract<LessonPicture, { kind: 'numberLine' }>;

const STEPS = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000];
const MAX_TICKS = 20;
const FULL_LABEL_TICKS = 11;
const PAD = 16;

export function numberLineLayout(
  pic: NumberLine,
  width: number,
): {
  ticks: { value: number; x: number; label: boolean }[];
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
  }));

  return {
    ticks,
    marks: (pic.marks ?? []).map((value) => ({ value, x: xOf(value) })),
    jumps: (pic.jumps ?? []).map((j) => ({
      fromX: xOf(j.from),
      toX: xOf(j.to),
      label: j.to >= j.from ? `+${j.to - j.from}` : `−${j.from - j.to}`,
    })),
  };
}
