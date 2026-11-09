// Help's own pictures: the lesson's counted rows and animals, without anything that could name the
// answer. The lesson's pictures label every row and write out the long division; here a rows picture
// labels totals up to `counted` only, and a deal or take prints no number at all. Every number printed
// carries data-help-role, so tests/elements/help-drawn-check.ts can check it by role.
import { pickAnimals } from '../../lesson/animals';
import { CSS as ROWS_CSS, h } from '../../lesson/dom/counted-rows';
import type { HelpPicture } from '../types';

export type HelpRole = 'given' | 'anchor' | 'partial';

/** What a picture needs to know about the kid. */
export interface HelpLook {
  young: boolean;
  /** Where the animals live; goes null for the rest of the run once one fails. */
  base: string | null;
  /** Picks the animal, the same each time for the same key. */
  key: string;
}

type Item = () => HTMLElement;
type Pic<K extends HelpPicture['kind']> = Extract<HelpPicture, { kind: K }>;

const MOST_ANIMALS = 30;
const ROLE = 'data-help-role';

/**
 * On top of the counted rows' rules. `--crow-item` is the size of one object; rows shrink to fit, so
 * twelve rows of twelve fit a 320 px phone. Above 30 objects the lines close up as well.
 */
export const PICTURE_CSS = `${ROWS_CSS}
.hpic { --crow-item: 14px; display: flex; flex-direction: column; align-items: center; gap: 6px; min-width: 0; max-width: 100%; }
.young .hpic { --crow-item: 20px; }
.hpic.ani { --crow-item: 30px; }
.hpic.many { --crow-item: 12px; }
.hpic.many .crows { gap: 2px; }
.hpic.many .crows [part~="row"] { padding: 1px 4px; border-width: 2px; gap: 2px; }
.hpic.many .crows [part~="row-total"] { font-size: 15px; }
.hpic .crows [part~="row"] { min-height: var(--crow-item); }
.hdeal.crows { align-items: flex-start; }
.hdeal [part~="row"] { border-color: currentColor; min-width: calc(var(--crow-item) * 2); }
.htake { display: flex; flex-direction: column; align-items: center; gap: 6px; max-width: 100%; }
.hgroups, .hpool { display: flex; flex-wrap: wrap; justify-content: center; gap: 3px; max-width: 100%; }
.hgroups { gap: 6px; }
.hgroups:empty { display: none; }
.hgroup { display: flex; flex-wrap: wrap; gap: 3px; padding: 3px; border: 2px dashed currentColor; border-radius: 10px; }
.hpool.off > * { opacity: 0.35; }
.hgroup > *, .hpool > * { flex: none; width: var(--crow-item); aspect-ratio: 1 / 1; }
.hpic .blk { box-sizing: border-box; border-radius: 3px; background: #42a5f5; border: 1.5px solid #1976d2; }
.hpic img { display: block; object-fit: contain; }
`;

/** The line's words as nodes, each number it has a role for in its own span, by the params' names. */
export function roleNodes(line: string, params: Record<string, number>): Node[] {
  const roles = new Map<number, HelpRole>();
  for (const [name, value] of Object.entries(params)) {
    const role = /^(given|anchor|partial)/.exec(name)?.[1] as HelpRole | undefined;
    // Roles go by value, so one number can have two. The non-given one wins: a running total that
    // equals the unknown must not pass as given because the question also shows that number (1 × 6).
    if (role && (role !== 'given' || !roles.has(value))) roles.set(value, role);
  }
  return line.split(/(\d+)/).map((piece, i) => {
    const role = i % 2 === 1 ? roles.get(Number(piece)) : undefined;
    if (!role) return document.createTextNode(piece);
    const span = h('span', undefined, undefined, piece);
    span.setAttribute(ROLE, role);
    return span;
  });
}

const many = (n: number, item: Item): HTMLElement[] =>
  Array.from({ length: Math.max(0, n) }, () => item());

function pool(n: number, item: Item, off: boolean): HTMLElement {
  const box = h('div', undefined, off ? 'hpool off' : 'hpool');
  box.append(...many(n, item));
  return box;
}

/**
 * One line per row. Rows 1 to `counted` are circled, each with its running total; the newest has a
 * light fill and the rest are faded, as in the lesson's counted rows. The total places are always
 * there, so the picture keeps its size. The last total is always the kid's, whatever `counted` says.
 */
function rowsPicture(pic: Pic<'rows'>, item: Item): HTMLElement {
  const box = h('div', undefined, 'crows');
  const counted = Math.min(pic.counted, pic.rows - 1);
  for (let n = 1; n <= pic.rows; n++) {
    const on = n <= counted;
    const row = h(
      'div',
      'row',
      on ? (n === counted ? 'on now' : 'on') : counted > 0 ? 'faded' : undefined,
    );
    row.append(...many(pic.perRow, item));
    const total = h('span', 'row-total');
    if (on) {
      total.textContent = String(n * pic.perRow);
      total.setAttribute(ROLE, 'partial');
    }
    const line = h('div', undefined, 'cline');
    line.append(row, total);
    box.append(line);
  }
  return box;
}

/** `rows` rows with what has been dealt so far, and the rest still to give. Nothing is labelled. */
function dealPicture(pic: Pic<'deal'>, item: Item): HTMLElement {
  const box = h('div', undefined, 'htake');
  const lines = h('div', undefined, 'crows hdeal');
  const each = Math.floor(pic.dealt / pic.rows);
  const extra = pic.dealt % pic.rows;
  for (let r = 0; r < pic.rows; r++) {
    const row = h('div', 'row');
    row.append(...many(each + (r < extra ? 1 : 0), item));
    lines.append(row);
  }
  box.append(lines, pool(pic.total - pic.dealt, item, true));
  return box;
}

/** The groups taken out so far, and what is left. Nothing is labelled: the count of groups is the kid's. */
function takePicture(pic: Pic<'take'>, item: Item): HTMLElement {
  const box = h('div', undefined, 'htake');
  const groups = h('div', undefined, 'hgroups');
  for (let g = 0; g < pic.taken; g++) {
    const group = h('div', undefined, 'hgroup');
    group.append(...many(pic.size, item));
    groups.append(group);
  }
  box.append(groups, pool(pic.total - pic.taken * pic.size, item, false));
  return box;
}

const drawn = (pic: HelpPicture, item: Item): HTMLElement =>
  pic.kind === 'rows'
    ? rowsPicture(pic, item)
    : pic.kind === 'deal'
      ? dealPicture(pic, item)
      : takePicture(pic, item);

const block: Item = () => h('span', undefined, 'blk');

/**
 * Animals for a young kid and 30 objects or fewer; grouped blocks otherwise, and from the moment any
 * animal fails, with the same labels. The failure lasts the run (`look.base` goes null).
 */
export function drawPicture(pic: HelpPicture, look: HelpLook): HTMLElement {
  const box = h('div', undefined, 'hpic');
  const objects = pic.kind === 'rows' ? pic.rows * pic.perRow : pic.total;
  if (objects > MOST_ANIMALS) box.classList.add('many');
  if (!look.young || look.base == null || objects > MOST_ANIMALS) {
    box.append(drawn(pic, block));
    return box;
  }
  const src = `${look.base}${pickAnimals(look.key, 1)[0]}.webp`;
  box.classList.add('ani');
  box.append(
    drawn(pic, () => {
      const img = document.createElement('img');
      img.alt = '';
      img.src = src;
      return img;
    }),
  );
  box.addEventListener(
    'error',
    () => {
      look.base = null;
      box.classList.remove('ani');
      box.replaceChildren(drawn(pic, block));
    },
    { once: true, capture: true },
  );
  return box;
}
