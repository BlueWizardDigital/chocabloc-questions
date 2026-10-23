import type { LessonPicture } from '../types';

type Count = Extract<LessonPicture, { kind: 'count' }>;

/** One place in a ten frame: `frame`, then `slot` 0 to 9 (two rows of 5). `empty` places have group -1. */
export interface Cell {
  frame: number;
  slot: number;
  group: number;
  state: 'item' | 'taken' | 'empty';
}

/** Where every animal or block goes. Together, the groups flow in order through the frames; apart, each group has its own. */
export function countCells(pic: Count): Cell[] {
  const cells: Cell[] = [];
  if (pic.apart) {
    let frame = 0;
    pic.groups.forEach((n, group) => {
      for (let i = 0; i < n; i++) cells.push({ frame: frame + Math.floor(i / 10), slot: i % 10, group, state: 'item' });
      frame += Math.max(1, Math.ceil(n / 10));
    });
    return cells;
  }
  const items = pic.groups.flatMap((n, g) => new Array<number>(n).fill(g));
  const kept = items.length - (pic.takeAway ?? 0);
  items.forEach((group, i) =>
    cells.push({ frame: Math.floor(i / 10), slot: i % 10, group, state: i < kept ? 'item' : 'taken' }),
  );
  for (let i = 0; i < (pic.empty ?? 0); i++) {
    const k = items.length + i;
    cells.push({ frame: Math.floor(k / 10), slot: k % 10, group: -1, state: 'empty' });
  }
  return cells;
}
