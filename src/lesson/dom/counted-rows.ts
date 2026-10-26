// Rows counted one at a time, shared by the lazy chunks: the pictures chunk counts rows of dots, the
// young chunk rows of animals. Like those chunks it imports nothing Help loads (only types): a module
// Help also loads would make Rollup pull Help into a shared chunk behind a facade.
import type { Msg } from '../messages';

/**
 * An element with an optional part, class and text, as `h()` in pictures.ts, which this file can't
 * import (see above). Text only ever goes in through textContent.
 */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  part?: string,
  cls?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (part) e.setAttribute('part', part);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

const DISPLAY = 'var(--cl-font-display, var(--cl-font-body, var(--cq-font, system-ui)))';
const LEFT = 'var(--cl-left, #E8873A)';

/**
 * Counted rows, and the pop both chunks use. A line is 32 px tall at most (the ring: 20 px items,
 * 3 px padding and 3 px border on each side) and lines are 6 px apart: pictures.ts holds that height
 * while the chunk loads. Items shrink, keeping their shape, so 15 fit a 320 px phone.
 * The pop starts from the step's own start state, `.step.enter`, which ChocaLesson removes once the
 * step is drawn: so it plays as a step appears, never for a picture drawn later or redrawn. It serves
 * both pictures that pop, counted rows and the share (more-pictures.ts).
 * Every rule starts at the picture's root class: the young chunk's stylesheet shares the shadow root,
 * so a bare class here could restyle its pictures, or its rules ours.
 */
export const CSS = `
.crows { display: flex; flex-direction: column; align-items: center; gap: 6px; max-width: 100%; }
.crows .cline { display: flex; align-items: center; gap: 6px; max-width: 100%; }
.crows [part~="row-label"] { flex: none; width: 4.4em; text-align: right; font-weight: 800; font-size: 13px; white-space: nowrap; opacity: 0.75; }
.crows [part~="row-total"] { flex: none; width: 2em; font-family: ${DISPLAY}; font-weight: 700; font-size: 20px; color: ${LEFT}; }
.crows [part~="row"] {
  display: flex; align-items: center; gap: 3px; min-width: 0; padding: 3px 6px;
  border: 3px solid transparent; border-radius: 999px;
}
.crows [part~="row"] > * { flex: 0 1 auto; width: 20px; min-width: 0; aspect-ratio: 1 / 1; }
.crows [part~="row"].on { border-color: ${LEFT}; }
.crows [part~="row"].now { background: rgba(232, 135, 58, 0.18); }
.crows [part~="row"].faded { opacity: 0.4; }
.step.enter .crows .pop, .step.enter .share .pop { opacity: 0; transform: scale(0.6); }
@media (prefers-reduced-motion: no-preference) {
  .crows .pop, .share .pop { transition: opacity 0.3s ease-out, transform 0.3s ease-out; }
}
`;

/**
 * One row per `items[r]` (row r's dots or animals), `counted` of them counted so far. Rows 1 to
 * `counted` are circled, each with "n rows" on its left and its running total, n × `cols`, on its
 * right; the newest has a light fill and pops in as the step appears, and the rest are faded. At 0
 * nothing is circled or faded. The label and total places are always there, empty until counted, so
 * the picture keeps its size from the first step on.
 */
export function countedRows(items: HTMLElement[][], counted: number, cols: number, msg: Msg): HTMLElement {
  const box = h('div', undefined, 'crows');
  box.setAttribute('aria-hidden', 'true');
  items.forEach((things, r) => {
    const n = r + 1;
    const on = n <= counted;
    const row = h('div', 'row', on ? (n === counted ? 'on now' : 'on') : counted > 0 ? 'faded' : undefined);
    row.append(...things);
    const line = h('div', undefined, n === counted ? 'cline pop' : 'cline');
    line.append(
      h('span', 'row-label', undefined, on ? msg('rows', { count: n }) : ''),
      row,
      h('span', 'row-total', undefined, on ? String(n * cols) : ''),
    );
    box.append(line);
  });
  return box;
}
