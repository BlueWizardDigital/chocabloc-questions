// Format conformance: every format the normalizer accepts must be drawable.
//
// Three bugs in one week (Adventure 101, 2026-09-23/24) were the same shape —
// a format the normalizer happily accepted that the renderer could not actually
// draw: geometry_properties 2D shapes hit drawShape3D's fillText('?'),
// money_coin_* rendered as bare text with no coins, pattern rows with no
// sequence crashed. Nothing checked the gap between the normalizer's dispatch
// map (102 formats) and what the renderers can paint.
//
// This test enumerates DISPATCH_FORMATS — the real map, not a copy — and for
// each format renders one representative row through <chocabloc-question>,
// then asserts the result is not one of the three silent failures:
//
//   1. the "?" glyph  (drawShape2D / drawShape3D default arm)
//   2. a blank canvas (ChocaCanvasQuestion._renderCanvas default: break)
//   3. bare text      (a visual that quietly lost its visual)
//
// A format may render as bare text only if it is listed in TEXT_ONLY_BY_DESIGN
// below, with a reason. A format in neither bucket fails. Adding a format
// therefore forces a deliberate choice: wire a renderer, or say why none is
// needed. A canvas format may paint nothing only if it is listed in
// NO_PICTURE_BY_DESIGN, and then its canvas must be hidden, not a blank box.
// A picture may show text equal to its row's answer only if the format is in
// PRINTS_ANSWER_BY_DESIGN.

import { expect } from '@esm-bundle/chai';
import '../../src/full';
import { DISPATCH_FORMATS, normalizeQuestion } from '../../src/helpers/normalizer';
import type { NormalizedQuestion } from '../../src/types';
import { NO_PICTURE_BY_DESIGN, REPRESENTATIVE_ROWS, stemRow } from './support/conformance-rows';

/* ================================================================
   Text-only allowlist — the ONE place a format is excused a visual
   ================================================================ */

// A format here renders through the built-in stem fallback: prompt + choices,
// no picture. The reason must say why the stem alone is answerable.
const TEXT_ONLY_BY_DESIGN: Record<string, string> = {
  // The canonical text format — the stem is the question.
  text: 'the row ships its own stem and nothing else',

  // Arithmetic: both operands and the operator are in the stem.
  addition: 'both addends are in the stem',
  addition_three: 'all three addends are in the stem',
  subtraction: 'minuend and subtrahend are in the stem',
  division: 'dividend and divisor are in the stem',
  integer_addition: 'signed addends are in the stem',
  integer_subtraction: 'signed operands are in the stem',
  decimal_addition: 'decimal addends are in the stem',
  decimal_multiplication: 'decimal factors are in the stem',
  decimal_division: 'decimal dividend and divisor are in the stem',
  missing_addend: 'the stem shows the blank: "3 + ___ = 7"',
  missing_subtrahend: 'the stem shows the blank: "7 − ___ = 3"',
  order_of_operations: 'the whole expression is in the stem',
  exponent: 'base and exponent are in the stem',
  square_root: 'the radicand is in the stem',

  // Comparison and number properties: the numbers are in the stem.
  comparison: 'both numbers are in the stem',
  integer_comparison: 'both signed numbers are in the stem',
  prime_composite: 'the number to classify is in the stem',
  odd_even: 'the number to classify is in the stem',
  absolute_value: 'the signed number is in the stem',
  place_value: 'the numeral and the place are in the stem',
  rounding: 'the numeral and the place to round to are in the stem',
  gcf: 'both numbers are in the stem',
  lcm: 'both numbers are in the stem',
  skip_count: 'the run so far is in the stem',

  // Algebra: expression and variable are in the stem.
  algebra_eval: 'expression and the value of the variable are in the stem',
  algebra_solve: 'the equation is in the stem',
  algebra_write: 'the sentence to translate is the stem',

  // Fractions as symbols, not as shaded area (fraction_concept is the visual one).
  fraction_addition: 'both fractions are written in the stem',
  fraction_subtraction: 'both fractions are written in the stem',
  fraction_multiplication: 'both fractions are written in the stem',
  fraction_division: 'both fractions are written in the stem',
  fraction_of_quantity: 'fraction and quantity are in the stem',
  fraction_to_decimal: 'the fraction is in the stem',
  decimal_to_fraction: 'the decimal is in the stem',
  decimal_to_percent: 'the decimal is in the stem',
  percent_to_decimal: 'the percent is in the stem',

  // Rates, ratios, measurement: purely numeric relationships.
  ratio: 'both quantities are in the stem',
  proportion: 'the proportion is written in the stem',
  unit_rate: 'total and count are in the stem',
  percent_of: 'percent and whole are in the stem',
  conversion: 'the amount and both units are in the stem',

  // Statistics: the data set is short enough to list in the stem.
  statistics_mean: 'the data set is listed in the stem',
  statistics_median: 'the data set is listed in the stem',
  statistics_mode: 'the data set is listed in the stem',

  // Geometry stated in words or numbers rather than drawn.
  pythagorean_converse: 'the three side lengths are in the stem',
  geometry_angle_pairs: 'the angle relationship is named in the stem',
  geometry_classify_quad: 'the quadrilateral properties are described in the stem',
  geometry_formula_identify: 'the question asks which formula, not about a drawn shape',
  geometry_interior_angles: 'the polygon is named in the stem',

  // Money as arithmetic — prices and amounts are written out.
  money_best_buy: 'both offers are priced in the stem',
  money_compare_buys: 'both purchases are priced in the stem',
  money_compare_savings: 'both savings amounts are in the stem',
  money_decimal_calc: 'the amounts are in the stem',
  money_round: 'the amount and the place to round to are in the stem',
  money_unit_price: 'price and quantity are in the stem',
  money_simple_interest_amount: 'principal, rate and time are in the stem',
  money_simple_interest_final_balance: 'principal, rate and time are in the stem',
  money_count_single: 'the single coin or note is named in the stem',
  money_make_change: 'amount paid and price are in the stem',
  money_purchase_find_difference: 'both amounts are in the stem',
  money_budget_balance: 'income and expenses are listed in the stem',
  money_budget_plan: 'the budget lines are listed in the stem',
  money_financial_records: 'the record entries are listed in the stem',
  money_price_list: 'the price list is in the stem',

  // Coordinates and number lines stated numerically. NOT coordinate_distance
  // (which draws a plane) or multiplication/number_line (which draws jumps).
  coordinate: 'the ordered pair is in the stem',
  number_line: 'the position is described in the stem',

  // money_coin_* are deliberately NOT here. They normalize to `text` but carry a
  // synthesised content.coinScene that routes them to the coin pile, and their
  // representative rows below all have usable coins. Allowlisting them would
  // excuse exactly the bug that shipped: "What coin is this?" with no coins.
};

// A picture must not print its own answer (beta.19: a radius label on "What is
// the radius?", the product at the end of a number line, "face: triangle").
// A format here may show text equal to the answer, because the text is part of
// the question itself. The reason must say why. Drawn giveaways (symmetry
// lines, a colour per answer) are not text; geometry-shape-routing pins those.
const PRINTS_ANSWER_BY_DESIGN: Record<string, string> = {
  data_graph: 'reading the graph is the question: its axis numbers and category names are what it asks about',
  coordinate_distance: 'the axis numbers label the grid the child counts on; the distance itself is never drawn',
  pattern: 'a repeating pattern shows its own items, so the next item already appears earlier in the sequence',
};

/* ================================================================
   Rendering + inspection
   ================================================================ */

function mount(html: string): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.innerHTML = html;
  document.body.appendChild(wrapper);
  return wrapper.firstElementChild as HTMLElement;
}

afterEach(() => {
  document.body.innerHTML = '';
});

// Painting primitives. clearRect / beginPath / save / restore are excluded —
// they are bookkeeping, and a renderer that only clears has drawn nothing.
const PAINT_CALLS = new Set([
  'arc', 'arcTo', 'ellipse', 'rect', 'roundRect', 'fillRect', 'strokeRect',
  'moveTo', 'lineTo', 'quadraticCurveTo', 'bezierCurveTo', 'fillText',
  'strokeText', 'drawImage', 'putImageData',
]);

type CanvasProto = { getContext: (...a: unknown[]) => unknown };

function spyCanvas(): { paints: string[]; glyphs: unknown[]; restore: () => void } {
  const paints: string[] = [];
  const glyphs: unknown[] = [];
  const proto = HTMLCanvasElement.prototype as unknown as CanvasProto;
  const orig = proto.getContext;
  proto.getContext = function (this: HTMLCanvasElement, ...args: unknown[]): unknown {
    const ctx = orig.apply(this, args) as CanvasRenderingContext2D | null;
    if (args[0] !== '2d' || !ctx) return ctx;
    return new Proxy(ctx, {
      get(target, prop) {
        const value = Reflect.get(target, prop, target) as unknown;
        if (typeof value !== 'function') return value;
        const fn = value as (...a: unknown[]) => unknown;
        return (...a: unknown[]): unknown => {
          const name = prop as string;
          if (PAINT_CALLS.has(name)) paints.push(name);
          if (name === 'fillText' || name === 'strokeText') glyphs.push(a[0]);
          return fn.apply(target, a);
        };
      },
      set(target, prop, value) {
        Reflect.set(target, prop, value, target);
        return true;
      },
    });
  };
  return { paints, glyphs, restore: () => { proto.getContext = orig; } };
}

const RENDERER_TAGS = [
  'choca-coin-pile', 'choca-canvas-question', 'choca-table-question',
  'choca-pattern-question', 'choca-number-line-question',
] as const;

// How many things each renderer actually put on screen. Zero means the format
// reached a renderer that had nothing to draw for it.
const VISUAL_NODES: Record<string, (root: ShadowRoot) => number> = {
  'choca-coin-pile': (r) => r.querySelectorAll('[part~="coin"]').length,
  'choca-table-question': (r) => r.querySelectorAll('[part~="table-cell"]').length,
  'choca-pattern-question': (r) => r.querySelectorAll('[part~="pattern-item"]').length,
  'choca-number-line-question': (r) => r.querySelectorAll('svg *').length,
};

// The text each DOM renderer shows as part of its picture (not the prompt, not
// the choices). The canvas renderer's text is whatever it passed to fillText.
const PICTURE_TEXT: Record<string, string> = {
  'choca-coin-pile': '[part="canvas"] *',
  'choca-table-question': '[part="table"] td, [part="table"] th, [part="change-event"]',
  'choca-pattern-question': '[part~="pattern-item"]',
  'choca-number-line-question': 'svg text',
};

/** Words and numbers in a label: "r=3" → r, 3; "face: square" → face, square; "-24" → -24. */
function tokens(text: string): string[] {
  return text.split(/[^0-9A-Za-z.-]+/).filter(Boolean);
}

type Rendered = {
  renderer: string;
  visualNodes: number;
  /** True when the only thing painted was a "?" — the shape-fallback signature. */
  drewOnlyFallbackGlyph: boolean;
  /** The canvas renderer's `[part="canvas"]` carries `hidden`. */
  canvasHidden: boolean;
  /** Every piece of text drawn or shown as part of the picture. */
  pictureText: string[];
  stem: string;
};

// drawShape2D / drawShape3D's default arm clears the canvas, paints a single
// "?" and returns, so the fallback is "one paint call, and it was a ?".
// pythagorean and geometry_angles also draw a "?", but as the label on the
// unknown side beside a fully drawn triangle — many paint calls, not one. The
// test must tell those apart or it flags a correct render.
function isFallbackGlyph(paints: string[], glyphs: unknown[]): boolean {
  return paints.length === 1 && glyphs.length === 1 && glyphs[0] === '?';
}

async function render(q: NormalizedQuestion): Promise<Rendered> {
  const spy = spyCanvas();
  try {
    const el = mount('<chocabloc-question answer-mode="mc" seed="42"></chocabloc-question>');
    (el as HTMLElement & { question: NormalizedQuestion }).question = q;
    await new Promise((r) => requestAnimationFrame(r));

    const outer = el.shadowRoot!;
    const inner = outer.querySelector(RENDERER_TAGS.join(', ')) as HTMLElement | null;
    const stem = (outer.querySelector('[part="prompt"]')?.textContent ?? '').trim();

    const fallbackGlyph = isFallbackGlyph(spy.paints, spy.glyphs);

    if (!inner) {
      return {
        renderer: 'text-fallback', visualNodes: 0, drewOnlyFallbackGlyph: false, canvasHidden: false,
        pictureText: [], stem,
      };
    }

    const tag = inner.tagName.toLowerCase();
    const innerStem = (inner.shadowRoot?.querySelector('[part="prompt"]')?.textContent ?? '').trim();
    const count = tag === 'choca-canvas-question'
      ? spy.paints.length
      : VISUAL_NODES[tag]!(inner.shadowRoot!);

    const canvas = inner.shadowRoot?.querySelector('[part="canvas"]') as HTMLElement | null;
    const pictureText = tag === 'choca-canvas-question'
      ? spy.glyphs.map(String)
      : [...inner.shadowRoot!.querySelectorAll(PICTURE_TEXT[tag]!)].map((n) => n.textContent ?? '');

    return {
      renderer: tag, visualNodes: count,
      drewOnlyFallbackGlyph: fallbackGlyph, canvasHidden: canvas?.hidden ?? false,
      pictureText, stem: stem || innerStem,
    };
  } finally {
    spy.restore();
  }
}

/* ================================================================
   The conformance sweep
   ================================================================ */

describe('format conformance — every dispatched format renders something', () => {
  it('the dispatch map is non-trivial (guards against an empty sweep)', () => {
    expect(DISPATCH_FORMATS.length).to.be.greaterThan(50);
  });

  for (const format of DISPATCH_FORMATS) {
    const entry = REPRESENTATIVE_ROWS[format] ?? stemRow(format);
    const variants = Array.isArray(entry) ? entry : [entry];

    for (const raw of variants) {
      const label = variants.length > 1 ? `${format} [${String(raw['imageType'])}]` : format;

      it(`${label} renders without the "?" fallback, a blank canvas, or a lost visual`, async () => {

        let q: NormalizedQuestion | null = null;
        try {
          q = normalizeQuestion(raw);
        } catch (err) {
          expect.fail(
            `${label}: the representative row does not normalize (${String(err)}). ` +
            'Add a usable row to REPRESENTATIVE_ROWS.',
          );
        }
        expect(q, `${label}: normalizeQuestion returned null`).to.not.be.null;

        const out = await render(q!);

        if (out.renderer === 'text-fallback') {
          expect(
            TEXT_ONLY_BY_DESIGN[format],
            `${label} rendered as bare text with no picture. Either wire a renderer, ` +
            'or add it to TEXT_ONLY_BY_DESIGN with a reason.',
          ).to.be.a('string');
          expect(out.stem, `${label}: text fallback with an empty stem`).to.not.equal('');
          return;
        }

        if (NO_PICTURE_BY_DESIGN[format]) {
          expect(out.renderer, `${label}: expected the canvas renderer`).to.equal('choca-canvas-question');
          expect(out.visualNodes, `${label}: painted a picture that gives the answer away`).to.equal(0);
          expect(out.canvasHidden, `${label}: an unused canvas must be hidden, not an empty box`).to.equal(true);
          expect(out.stem, `${label}: no picture and an empty stem`).to.not.equal('');
          return;
        }

        expect(
          out.drewOnlyFallbackGlyph,
          `${label}: the renderer drew the "?" fallback and nothing else — ` +
          `${out.renderer} has no case for this shape`,
        ).to.equal(false);

        expect(
          out.visualNodes,
          `${label}: ${out.renderer} painted nothing at all`,
        ).to.be.greaterThan(0);
      });

      const exempt = PRINTS_ANSWER_BY_DESIGN[format] !== undefined;
      it(`${label} ${exempt ? 'prints its answer, as its exemption says' : 'does not print its answer on the picture'}`, async () => {
        let q: NormalizedQuestion | null = null;
        try { q = normalizeQuestion(raw); } catch { /* the test above reports a row that won't normalize */ }
        const answer = q?.answer;
        if (!q || answer === undefined || typeof answer === 'object') {
          expect(exempt, `${label}: an exempt format needs a row with an answer to check`).to.equal(false);
          return;
        }

        const out = await render(q);
        const printed = out.pictureText.filter((t) => tokens(t).includes(String(answer)));
        if (exempt) {
          expect(
            printed,
            `${label}: PRINTS_ANSWER_BY_DESIGN says this picture shows its answer (${String(answer)}), ` +
            'but it no longer does. Remove the stale exemption',
          ).to.not.have.lengthOf(0);
          return;
        }
        expect(
          printed,
          `${label}: the picture shows the answer (${String(answer)}). Remove it, or add the ` +
          'format to PRINTS_ANSWER_BY_DESIGN with a reason',
        ).to.have.lengthOf(0);
      });
    }
  }
});

describe('the allowlist itself', () => {
  const allowlisted = { ...TEXT_ONLY_BY_DESIGN, ...NO_PICTURE_BY_DESIGN, ...PRINTS_ANSWER_BY_DESIGN };

  it('every allowlisted format is still a dispatched format', () => {
    const dispatched = new Set(DISPATCH_FORMATS);
    const stale = Object.keys(allowlisted).filter((f) => !dispatched.has(f));
    expect(stale, `allowlist entries for formats that no longer exist: ${stale.join(', ')}`)
      .to.have.lengthOf(0);
  });

  it('every allowlist entry carries a reason', () => {
    const empty = Object.entries(allowlisted)
      .filter(([, reason]) => reason.trim().length === 0)
      .map(([f]) => f);
    expect(empty, `allowlist entries with no reason: ${empty.join(', ')}`).to.have.lengthOf(0);
  });
});
