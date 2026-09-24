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
// needed.

import { expect } from '@esm-bundle/chai';
import '../../src/full';
import { DISPATCH_FORMATS, normalizeQuestion } from '../../src/helpers/normalizer';
import type { NormalizedQuestion } from '../../src/types';

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

/* ================================================================
   Representative rows
   ================================================================ */

// A generic answer-bearing row. Every stem format takes this: the normalizer
// prefers `questionText` over buildStem(), so no per-format content is needed.
const stemRow = (format: string): Record<string, unknown> => ({
  id: `CONFORMANCE-${format}`,
  format,
  skillIds: [`${format.toUpperCase()}-SKILL`],
  questionText: `representative stem for ${format}`,
  content: { operation: format, operands: [3, 4] },
  answer: '7',
  distractors: [{ value: '8', errorType: 'off-by-one' }],
});

const row = (format: string, extra: Record<string, unknown>): Record<string, unknown> => ({
  ...stemRow(format),
  ...extra,
});

// Formats whose normalizer needs real content. A format missing from here falls
// back to stemRow(), which either normalizes to text (and must then be in the
// allowlist) or throws — both of which fail loudly rather than silently.
//
// A format whose `imageType` selects a DIFFERENT draw function needs one row per
// branch, given as an array. One row per format would have missed the bug this
// file exists for: geometry_properties with a cube renders fine, and only the
// shape_2d branch was broken.
type Row = Record<string, unknown>;

const REPRESENTATIVE_ROWS: Record<string, Row | Row[]> = {
  text: row('text', { content: { stem: 'What is 3 + 4?' } }),

  money: row('money', {
    skillIds: ['MONEY-COUNT-CAD'],
    content: { coins: { loonie: 1, dime: 2 } },
    answer: 120,
  }),
  money_count_mixed: row('money_count_mixed', {
    skillIds: ['MONEY-COUNT-MIXED-USD'],
    content: { coins: { quarter: 2, dime: 1 } },
    answer: 60,
  }),
  money_budget_adjust: row('money_budget_adjust', {
    content: {
      currency: 'CAD', solve_for: 'entertainment', answer_cents: 100,
      change_event: { type: 'income_drop', new_income_cents: 1135 },
      original_rows: [
        { category: 'utilities', amount_cents: 185 },
        { category: 'entertainment', amount_cents: 300 },
      ],
      original_income_cents: 1335,
    },
    answer: 100,
  }),

  // money_coin_* carry a coin list the normalizer turns into content.coinScene.
  money_coin_name: row('money_coin_name', {
    skillIds: ['MONEY-COIN-ID-CAD'],
    content: { operation: 'money_coin_name', currency: 'CAD', coins: ['loonie', 'dime'] },
    answer: 'loonie',
  }),
  money_coin_size: row('money_coin_size', {
    skillIds: ['MONEY-COIN-ID-CAD'],
    content: { operation: 'money_coin_size', currency: 'CAD', coins: ['dime', 'quarter'] },
    answer: 'quarter',
  }),
  money_coin_colour: row('money_coin_colour', {
    skillIds: ['MONEY-COIN-ID-USD'],
    content: { operation: 'money_coin_colour', currency: 'USD', coins: ['penny', 'dime'] },
    answer: 'penny',
  }),
  money_coin_denomination: row('money_coin_denomination', {
    skillIds: ['MONEY-COIN-ID-USD'],
    content: { operation: 'money_coin_denomination', currency: 'USD', coins: ['quarter'] },
    answer: 'quarter',
  }),

  geometry_attributes: row('geometry_attributes', {
    content: { attribute: 'no sides and no corners' }, answer: 'circle',
  }),
  // dimension picks the draw function here, not imageType.
  geometry_classify: [
    row('geometry_classify', {
      imageType: 'shape_3d', content: { shape: 'cone', dimension: '3D' }, answer: '3D',
    }),
    row('geometry_classify', {
      imageType: 'shape_2d', content: { shape: 'circle', dimension: '2D' }, answer: '2D',
    }),
  ],
  geometry_properties: [
    row('geometry_properties', {
      imageType: 'shape_3d', content: { shape: 'cube', property: 'edges' }, answer: '12',
    }),
    row('geometry_properties', {
      imageType: 'shape_2d', content: { shape: 'circle', property: 'sides' }, answer: '0',
    }),
  ],
  geometry_identify: [
    row('geometry_identify', {
      imageType: 'shape_2d', content: { shape: 'circle' }, answer: 'circle',
    }),
    row('geometry_identify', {
      imageType: 'shape_3d', content: { shape: 'cube' }, answer: 'cube',
    }),
  ],
  geometry_face_identify: row('geometry_face_identify', {
    content: { shape: 'cube', face_shape: 'square' }, answer: 'square',
  }),
  geometry_symmetry: row('geometry_symmetry', {
    content: { shape: 'square', lines_of_symmetry: 4 }, answer: 4,
  }),
  geometry_classify_triangle: row('geometry_classify_triangle', {
    content: { operands: [3, 3, 3], classify_by: 'sides' }, answer: 'equilateral',
  }),
  geometry_area: row('geometry_area', {
    content: { shape: 'rectangle', operands: [4, 5] }, answer: 20,
  }),
  geometry_perimeter: row('geometry_perimeter', {
    content: { shape: 'rectangle', operands: [4, 5] }, answer: 18,
  }),
  geometry_circumference: row('geometry_circumference', {
    content: { radius: 3 }, answer: 18.85,
  }),
  geometry_circle_convert: row('geometry_circle_convert', {
    content: { value: 6, given_type: 'diameter', find_type: 'radius' }, answer: 3,
  }),
  geometry_circle_parts: row('geometry_circle_parts', {
    content: { part: 'radius' }, answer: 'radius',
  }),
  geometry_angles: row('geometry_angles', {
    content: { known_angles: [60, 70], missing_angle: 50 }, answer: 50,
  }),
  geometry_angle_classify: row('geometry_angle_classify', {
    content: { angle: 45 }, answer: 'acute',
  }),
  geometry_volume: row('geometry_volume', {
    content: { shape: 'cube', operands: [2, 2, 2] }, answer: 8,
  }),
  geometry_surface_area: row('geometry_surface_area', {
    content: { shape: 'cube', operands: [2, 2, 2] }, answer: 24,
  }),
  pythagorean: row('pythagorean', {
    content: { legs: [3, 4], hypotenuse: 5, operands: [3, 4] }, answer: 5,
  }),

  data_graph: [
    row('data_graph', {
      imageType: 'bar_graph', content: { data: { apples: 3, pears: 5 } }, answer: 5,
    }),
    row('data_graph', {
      imageType: 'pictograph', content: { data: { apples: 3, pears: 5 } }, answer: 5,
    }),
  ],
  // number_line routes to a different element entirely (ChocaNumberLineQuestion).
  multiplication: [
    row('multiplication', {
      imageType: 'array', content: { operands: [3, 4] }, answer: 12,
    }),
    row('multiplication', {
      imageType: 'number_line', content: { operands: [3, 4] }, answer: 12,
    }),
  ],
  fraction_concept: row('fraction_concept', {
    content: { fraction: [1, 2] }, answer: '1/2',
  }),
  time: row('time', {
    content: { hour: 3, minute: 30, time: '3:30' }, answer: '3:30',
  }),
  pattern: row('pattern', {
    content: { sequence: ['A', 'B', 'A', 'B'] }, answer: 'A',
  }),
  coordinate_distance: row('coordinate_distance', {
    content: { point1: [0, 0], point2: [3, 4] }, answer: 5,
  }),

  base10_blocks: row('base10_blocks', {
    content: { operation: 'base10_count', blocks: { tens: 3, ones: 4 }, number: 34 }, answer: 34,
  }),
  base10_count: row('base10_count', {
    content: { operation: 'base10_count', blocks: { tens: 2, ones: 5 }, number: 25 }, answer: 25,
  }),
  base10_block_count: row('base10_block_count', {
    content: { operation: 'base10_block_count', blocks: { tens: 4, ones: 1 }, place: 'tens' },
    answer: 4,
  }),
  base10_regroup: row('base10_regroup', {
    content: { operation: 'base10_regroup', blocks: { tens: 1, ones: 12 }, tens_shown: 1, ones_shown: 12 },
    answer: 22,
  }),
  base10_compare: row('base10_compare', {
    content: {
      operation: 'base10_compare',
      set_a: { number: 23, blocks: { tens: 2, ones: 3 } },
      set_b: { number: 31, blocks: { tens: 3, ones: 1 } },
    },
    answer: 31,
  }),
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

type Rendered = {
  renderer: string;
  visualNodes: number;
  /** True when the only thing painted was a "?" — the shape-fallback signature. */
  drewOnlyFallbackGlyph: boolean;
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
      return { renderer: 'text-fallback', visualNodes: 0, drewOnlyFallbackGlyph: false, stem };
    }

    const tag = inner.tagName.toLowerCase();
    const innerStem = (inner.shadowRoot?.querySelector('[part="prompt"]')?.textContent ?? '').trim();
    const count = tag === 'choca-canvas-question'
      ? spy.paints.length
      : VISUAL_NODES[tag]!(inner.shadowRoot!);

    return {
      renderer: tag, visualNodes: count,
      drewOnlyFallbackGlyph: fallbackGlyph, stem: stem || innerStem,
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
    }
  }
});

describe('the allowlist itself', () => {
  it('every allowlisted format is still a dispatched format', () => {
    const dispatched = new Set(DISPATCH_FORMATS);
    const stale = Object.keys(TEXT_ONLY_BY_DESIGN).filter((f) => !dispatched.has(f));
    expect(stale, `allowlist entries for formats that no longer exist: ${stale.join(', ')}`)
      .to.have.lengthOf(0);
  });

  it('every allowlist entry carries a reason', () => {
    const empty = Object.entries(TEXT_ONLY_BY_DESIGN)
      .filter(([, reason]) => reason.trim().length === 0)
      .map(([f]) => f);
    expect(empty, `allowlist entries with no reason: ${empty.join(', ')}`).to.have.lengthOf(0);
  });
});
