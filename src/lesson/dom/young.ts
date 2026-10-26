// The lazy young-look chunk: `count` pictures (both looks), animal arrays, the
// young text and the animal messages. Help loads it with one dynamic import when
// a lesson has a count picture or the kid is young. Like the practice chunk it
// imports nothing Help loads (Help passes what it shares), or Rollup would pull
// Help into a shared chunk behind a facade.
import { pickAnimals } from '../animals';
import { CSS as ROWS_CSS, countedDots, countedRows } from './counted-rows';
import { countCells } from '../layout/count';
import messages from '../messages/young.json';
import { fillYoung } from '../young-text';
import type { Msg } from '../messages';
import type { LessonPicture, LessonStep } from '../types';

type Count = Extract<LessonPicture, { kind: 'count' }>;
type Array2 = Extract<LessonPicture, { kind: 'array' }>;
/** What the chunk needs to know about the kid: animals come from `base`, picked by `skillId`. */
export interface YoungLook {
  young: boolean;
  base: string | null;
  skillId: string;
}

/** The chunk's own words, added to the player's English table so a translator can still override them. */
export function register(table: Record<string, unknown>): void {
  Object.assign(table, messages);
}

/** Rules for the cells, frames and the dim/cross/dash states. The element adds this once the chunk has loaded. */
export const CSS = `${ROWS_CSS}
.cnt { display: flex; flex-direction: column; align-items: center; gap: 10px; --cell: 42px; }
.probe { position: absolute; top: 0; left: 0; right: 0; height: 0; }
.cnt.apart { position: relative; flex-direction: row; align-items: flex-start; justify-content: center; gap: 28px; width: 100%; --cell: 30px; }
.grp { display: flex; flex-direction: column; align-items: center; gap: 10px; }
.frame {
  display: grid; grid-template-columns: repeat(5, var(--cell)); grid-auto-rows: var(--cell); gap: 3px; padding: 4px;
  background: rgba(255, 255, 255, 0.6); border: 2px solid currentColor; border-radius: 8px;
}
/* Every one of the frame's 10 places has a faint outline, filled or not. */
.slot { position: relative; display: block; box-sizing: border-box; border: 1px solid rgba(43, 33, 24, 0.25); border-radius: 6px; }
.cell { position: absolute; top: 0; right: 0; bottom: 0; left: 0; box-sizing: border-box; border-radius: 6px; }
.cell img { display: block; width: 100%; height: 100%; object-fit: contain; }
.cell:empty { border: 2px solid currentColor; }
.cell.g0:empty { background: #ffb74d; }
.cell.g1:empty { background: #64b5f6; }
.cell.g2:empty { background: #81c784; }
.cell.empty:empty { background: transparent; border: 2px dashed currentColor; }
.cell.taken { opacity: 0.45; }
.cell.taken::after {
  content: ''; position: absolute; top: 0; right: 0; bottom: 0; left: 0;
  background: linear-gradient(to top right, transparent calc(50% - 2px), currentColor calc(50% - 2px), currentColor calc(50% + 2px), transparent calc(50% + 2px));
}
.arr { display: grid; grid-template-columns: repeat(var(--c), minmax(0, 1fr)); gap: 3px; width: 100%; max-width: calc(var(--c) * 46px); }
.arr .cell, .cell.ani { position: relative; display: block; aspect-ratio: 1 / 1; }
`;

const el = (cls: string, tag: 'div' | 'span' = 'div'): HTMLElement => {
  const e = document.createElement(tag);
  e.className = cls;
  return e;
};

/** One animal, or a coloured block when `src` is null. */
function cellOf(cls: string, src: string | null): HTMLElement {
  const cell = el(`cell ${cls}`, 'span');
  if (src != null) {
    const img = document.createElement('img');
    img.alt = '';
    img.src = src;
    cell.append(img);
  }
  return cell;
}

/** Cells small enough that two frames, 10 cells and their gaps, fit the box: never a sideways scroll. */
function fitCells(root: HTMLElement): void {
  // Watch a zero-height probe as wide as the box, not the box: changing the cells changes the box's
  // height, and observing that would loop.
  const probe = el('probe');
  root.append(probe);
  const ro = new ResizeObserver(() => {
    // A removed box reports one last size; stop watching it then.
    if (!root.isConnected) return ro.disconnect();
    root.style.setProperty('--cell', `${Math.max(12, Math.min(30, (probe.clientWidth - 76) / 10))}px`);
  });
  ro.observe(probe);
}

/** Ten frames (two rows of 5) of equal cells. `names` are the animals per group, or null for blocks. */
function frames(pic: Count, names: string[] | null, base: string | null): HTMLElement {
  const root = el(pic.apart ? 'cnt apart' : 'cnt');
  const cells = countCells(pic);
  const all: HTMLElement[] = [];
  for (const n of pic.apart ? pic.groups : [cells.length]) {
    const grp = el('grp');
    for (let i = 0; i < Math.max(1, Math.ceil(n / 10)); i++) {
      const fr = el('frame');
      for (let k = 0; k < 10; k++) fr.append(el('slot', 'span'));
      all.push(fr);
      grp.append(fr);
    }
    root.append(grp);
  }
  if (pic.apart) fitCells(root);
  for (const c of cells) {
    const name = names?.[c.group];
    const src = name && c.state !== 'empty' ? `${base}${name}.webp` : null;
    all[c.frame]!.children[c.slot]!.append(cellOf(c.state === 'item' ? `g${c.group}` : `g${c.group} ${c.state}`, src));
  }
  return root;
}

/**
 * Animals in a box that turns to `blocks` as a whole if any one fails to load: never a mix. The failure
 * is remembered for the run (`look.base` goes null), so later screens start with blocks.
 */
function withAnimals(look: YoungLook, animals: () => HTMLElement, blocks: () => HTMLElement): HTMLElement {
  const box = el('animals');
  box.style.display = 'contents';
  box.append(animals());
  box.addEventListener(
    'error',
    () => {
      look.base = null;
      box.replaceChildren(blocks());
    },
    { once: true, capture: true },
  );
  return box;
}

/** A count in ten frames: animals for a young kid with a `base`, else coloured blocks. */
export function count(pic: Count, look: YoungLook): HTMLElement {
  if (!look.young || look.base == null) return frames(pic, null, null);
  const { base } = look;
  const names = pickAnimals(look.skillId, pic.groups.length as 1 | 2 | 3);
  return withAnimals(look, () => frames(pic, names, base), () => frames(pic, null, null));
}

/**
 * A young array of up to 30 places: one animal in each, in rows with rings and a running total once
 * `counted` is set. If an animal fails, counted rows turn to counted dots, so the normal words that
 * come back still match the picture; other arrays to `squares`, Help's canvas drawing.
 */
export function array(pic: Array2, look: YoungLook, squares: () => HTMLElement, msg: Msg): HTMLElement {
  const src = `${look.base}${pickAnimals(look.skillId, 1)[0]}.webp`;
  return withAnimals(look, () => {
    if (pic.counted != null) {
      const rows = Array.from({ length: pic.rows }, () => Array.from({ length: pic.cols }, () => cellOf('ani', src)));
      const box = countedRows(rows, pic.counted, pic.cols, msg);
      // Animals are drawn bigger than the dots the rows were sized for; they still shrink to fit.
      box.style.setProperty('--crow-item', '40px');
      return box;
    }
    const grid = el('arr');
    grid.style.setProperty('--c', String(pic.cols));
    for (let i = 0; i < pic.rows * pic.cols; i++) grid.append(cellOf('', src));
    return grid;
  }, pic.counted != null ? () => countedDots(pic, msg) : squares);
}

/** A step's `young` line with its animals filled in. */
export function line(skillId: string, step: LessonStep, msg: Msg): string {
  const pic = step.picture;
  const groups = pic?.kind === 'count' ? pic.groups : [2];
  return fillYoung(step.young!, pickAnimals(skillId, groups.length as 1 | 2 | 3), groups, msg);
}
