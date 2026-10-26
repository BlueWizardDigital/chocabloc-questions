// The lazy pictures chunk: `share` pictures (rows of dots, with the long division beside them) and
// counted arrays drawn as rows of dots. Help loads it with one dynamic import when a lesson has a
// share or a counted array. Like the young chunk it imports nothing Help loads (only types), or Rollup
// would pull Help into a shared chunk behind a facade.
import { CSS as ROWS_CSS, countedRows, h } from './counted-rows';
import { longDivision, shareParts, shareRow } from '../layout/share';
import type { LdNote, Tone } from '../layout/share';
import messages from '../messages/pictures.json';
import type { Msg } from '../messages';
import type { LessonPicture } from '../types';

/** The chunk's own words, added to the player's English table so a translator can still override them. */
export function register(table: Record<string, unknown>): void {
  Object.assign(table, messages);
}

type Share = Extract<LessonPicture, { kind: 'share' }>;
type Counted = Extract<LessonPicture, { kind: 'array' }>;

const DISPLAY = 'var(--cl-font-display, var(--cl-font-body, var(--cq-font, system-ui)))';
const BODY = 'var(--cl-font-body, var(--cq-font, system-ui))';
const INK = 'var(--cl-ink, #2b2118)';
const SHARE_1 = 'var(--cl-share-1, #1C2B45)';
const SHARE_2 = 'var(--cl-share-2, #1f8a7a)';
const LEFT = 'var(--cl-left, #E8873A)';
const SPOT = 'var(--cl-spot, #c9bda9)';

/**
 * Counted rows, dots, and the long division. Heights pictures.ts holds while the chunk loads: a share's
 * dots take 13 px a row plus 14 px for the part labels; the long division 28 px a written line and 7 px
 * a rule. Array dots look like the canvas array's.
 */
export const CSS = `${ROWS_CSS}
.crows .dot { box-sizing: border-box; border-radius: 50%; background: #42a5f5; border: 1.5px solid #1976d2; }
.share { display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 16px; max-width: 100%; }
.sgrid { display: grid; gap: 4px 8px; justify-items: center; }
.srow { display: contents; }
.grp { display: flex; gap: 3px; }
.share .dot { box-sizing: border-box; flex: none; width: 9px; height: 9px; border-radius: 50%; }
.dot.p0 { background: ${SHARE_1}; }
.dot.p1 { background: ${SHARE_2}; }
.dot.left { background: ${LEFT}; }
.dot.spot { border: 1.5px dashed ${SPOT}; }
.lg .dot.spot { border-color: ${LEFT}; }
.slab { height: 14px; font-size: 11px; line-height: 14px; font-weight: 700; white-space: nowrap; }
.t0 { color: ${SHARE_1}; }
.t1 { color: ${SHARE_2}; }
.tl { color: ${LEFT}; }
.ld {
  display: flex; flex-direction: column; color: ${INK};
  font-family: ${DISPLAY}; font-weight: 700; font-size: 22px; line-height: 28px; font-variant-numeric: tabular-nums;
}
.ld-line { display: grid; grid-template-columns: 22px 22px 22px 36px auto; height: 28px; }
.ld-line > span { box-sizing: border-box; text-align: center; border-top: 3px solid transparent; }
.ld-line.rule { height: 3px; margin: 2px 0; }
.ld .r { border-top-color: currentColor; }
.ld .dd { border-top-color: ${INK}; }
.ld .dd1 { border-left: 3px solid ${INK}; border-top-left-radius: 10px; }
.ld-line > .ld-note {
  padding-left: 6px; text-align: left; white-space: nowrap; opacity: 0.75;
  font-family: ${BODY}; font-size: 11px; font-weight: 600;
}
`;

/** A counted array: `rows` rows of `cols` dots, with rows 1 to `counted` circled. */
export function countedDots(pic: Counted, msg: Msg): HTMLElement {
  const items = Array.from({ length: pic.rows }, () => Array.from({ length: pic.cols }, () => h('span', undefined, 'dot')));
  return countedRows(items, pic.counted ?? 0, pic.cols, msg);
}

const toneClass = (t: Tone): string => (t === 'left' ? 'tl' : t == null ? '' : `t${t}`);

function noteText(n: LdNote, msg: Msg): string {
  if (n.key === 'ldTens') return msg('longDivision.tens', { count: n.count, value: n.value });
  if (n.key === 'ldLeft') return msg('longDivision.left', { count: n.count });
  return msg('longDivision.times', { a: n.a, b: n.b });
}

/**
 * `total` shared into `rows` rows of dots, `shown` parts given out so far, and the long division of
 * `total` ÷ `rows` beside it, one written step per part. Each part has its own colour, in the dots, its
 * label and its lines. `left` adds the leftovers: a dot in a new column for each row that gets one, a
 * dashed spot for each that misses out, and R after the quotient. What this step gives pops in.
 */
export function share(pic: Share, msg: Msg): HTMLElement {
  const { total, rows, shown } = pic;
  const left = pic.left === true;
  const parts = shareParts(total, rows);
  const rem = total % rows;
  const dots = shareRow(total, rows, shown);
  // What this step gives: the leftovers, or the newest part.
  const fresh: Tone | undefined = left ? 'left' : shown > 0 ? ((shown - 1) as 0 | 1) : undefined;

  const grid = h('div', undefined, 'sgrid');
  grid.style.gridTemplateColumns = `repeat(${parts.length + (left ? 1 : 0)}, auto)`;
  for (let r = 0; r < rows; r++) {
    // The row has no box of its own: its groups sit in the grid's columns, lined up with the labels.
    const row = h('div', 'row', 'srow');
    let k = 0;
    parts.forEach((p, i) => {
      const grp = h('span', undefined, i === fresh ? 'grp pop' : 'grp');
      for (let j = 0; j < p; j++, k++) {
        const d = dots[k];
        grp.append(h('span', undefined, d === 'spot' ? 'dot spot' : `dot p${d}`));
      }
      row.append(grp);
    });
    if (left) {
      const grp = h('span', undefined, 'grp lg pop');
      grp.append(h('span', undefined, r < rem ? 'dot left' : 'dot spot'));
      row.append(grp);
    }
    grid.append(row);
  }
  parts.forEach((p, i) => {
    const text = i >= shown ? '' : i ? msg('share.more', { count: p }) : msg('share.each', { count: p });
    grid.append(h('span', undefined, i === fresh ? `slab t${i} pop` : `slab t${i}`, text));
  });
  if (left) grid.append(h('span', undefined, 'slab tl pop', msg('share.left', { count: rem })));

  const ld = h('div', 'long-division', 'ld');
  const lines = longDivision(total, rows, shown, left);
  lines.forEach((line, i) => {
    const rule = line.kind === 'rule';
    // A part's three lines pop in with its dots; the leftovers add only R.
    const fresher = !left && fresh != null && i >= lines.length - 3;
    const row = h('div', undefined, `ld-line${rule ? ' rule' : ''}${fresher ? ' pop' : ''}`);
    // A rule is the colour of the product it underlines.
    const ruleTone = rule ? lines[i - 1]!.cells[0]!.tone : null;
    line.cells.forEach((c, col) => {
      const cls: string[] = [];
      // Blank cells carry their line's tone too; only a cell with text is coloured.
      if (c.text) cls.push(toneClass(rule ? ruleTone : c.tone));
      if (rule && c.text) cls.push('r');
      if (line.kind === 'dividend' && col > 0 && col < 3) cls.push(col === 1 ? 'dd dd1' : 'dd');
      if (line.kind === 'quotient' && c.text && c.tone === fresh) cls.push('pop');
      row.append(h('span', undefined, cls.join(' '), rule ? '' : c.text));
    });
    if (line.note) row.append(h('span', undefined, 'ld-note', noteText(line.note, msg)));
    ld.append(row);
  });

  const box = h('div', undefined, 'share');
  box.setAttribute('aria-hidden', 'true');
  box.append(grid, ld);
  return box;
}
