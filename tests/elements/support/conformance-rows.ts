// The conformance representatives, shared by format-conformance and
// server-content-contract.
import { FIGURE_EXAMPLE } from '../../helpers/figure-fixture';


// A format here reaches <choca-canvas-question> but must paint nothing and hide
// the canvas, because any picture would give the answer away. The reason must
// say why, and the stem must be answerable alone.
export const NO_PICTURE_BY_DESIGN: Record<string, string> = {
  geometry_attributes: '"Which shape has …?" asks for a shape, so drawing one shows the answer',
  base10_block_count: '"How many tens blocks are in 6378?" names the number; drawing it in blocks counts out the answer',
};

// A generic answer-bearing row. Every stem format takes this: the normalizer
// prefers `questionText` over buildStem(), so no per-format content is needed.
export const stemRow = (format: string): Record<string, unknown> => ({
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
export type Row = Record<string, unknown>;

export const REPRESENTATIVE_ROWS: Record<string, Row | Row[]> = {
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
  // A pyramid, not a cube: the cube always showed its face highlighted, and the
  // other shapes printed "face: <answer>" instead.
  geometry_face_identify: row('geometry_face_identify', {
    imageType: 'shape_3d', content: { shape: 'pyramid', face_shape: 'triangle' }, answer: 'triangle',
  }),
  geometry_symmetry: row('geometry_symmetry', {
    content: { shape: 'square', lines_of_symmetry: 4 }, answer: 4,
  }),
  // Choices-only, as the bank serves it: the lettered answer is never in the row.
  geometry_figure: row('geometry_figure', {
    imageType: 'shape_2d',
    questionText: 'Which dashed line is a line of symmetry?',
    content: FIGURE_EXAMPLE,
    answer: undefined,
    distractors: undefined,
    choices: ['A', 'B', 'C', 'D'].map((value) => ({ value })),
    answerToken: 'test-token-not-real',
  }),
  geometry_classify_triangle: row('geometry_classify_triangle', {
    content: { operands: [3, 3, 3], classify_by: 'sides' }, answer: 'equilateral',
  }),
  geometry_area: row('geometry_area', {
    content: { shape: 'rectangle', operands: [4, 5] }, answer: 20,
  }),
  // The operand count picks the draw: two are length and width, three or more
  // are the sides of a polygon.
  geometry_perimeter: [
    row('geometry_perimeter', {
      content: { shape: 'rectangle', operands: [4, 5] }, answer: 18,
    }),
    row('geometry_perimeter', {
      imageType: 'shape_2d', content: { shape: 'triangle', operands: [13, 17, 20] }, answer: 50,
    }),
  ],
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
  pythagorean: [
    row('pythagorean', { content: { operands: [3, 4] }, answer: 5 }),
    row('pythagorean', { content: { operands: [4, 5], known_leg: 4 }, answer: 3 }),
  ],

  data_graph: [
    row('data_graph', {
      imageType: 'bar_graph', content: { data: { apples: 3, pears: 5 } }, answer: 5,
    }),
    // A pictograph draws category names, not counts: "Which has the most?".
    row('data_graph', {
      imageType: 'pictograph', content: { data: { apples: 3, pears: 5 } }, answer: 'pears',
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
  // Trello 427. One row per operation family. More than two models stack.
  fraction_models: [
    row('fraction_models', {
      imageType: 'fraction_models', answer: '3/4',
      content: { operation: 'fraction_read', layout: 'row', models: [{ shape: 'bar', d: 4, n: 3, wholes: 1 }] },
    }),
    row('fraction_models', {
      imageType: 'fraction_models', answer: '5/6',
      content: { operation: 'fraction_read', layout: 'row', models: [{ shape: 'circle', d: 6, n: 5, wholes: 1 }] },
    }),
    row('fraction_models', {
      imageType: 'fraction_models', answer: '1 3/4',
      content: { operation: 'fraction_read_mixed', layout: 'row', models: [{ shape: 'bar', d: 4, n: 7, wholes: 2 }] },
    }),
    row('fraction_models', {
      imageType: 'fraction_models', answer: 'B',
      content: {
        operation: 'fraction_pick', layout: 'stack',
        models: [{ shape: 'bar', d: 4, n: 1, wholes: 1, label: 'A' }, { shape: 'bar', d: 4, n: 3, wholes: 1, label: 'B' }, { shape: 'bar', d: 8, n: 2, wholes: 1, label: 'C' }, { shape: 'bar', d: 3, n: 1, wholes: 1, label: 'D' }],
      },
    }),
    row('fraction_models', {
      imageType: 'fraction_models', answer: 'C',
      content: {
        operation: 'fraction_equal_parts', layout: 'stack',
        models: [
          { shape: 'bar', d: 4, n: 0, wholes: 1, label: 'A', split: [1, 2, 3, 2] },
          { shape: 'bar', d: 4, n: 0, wholes: 1, label: 'B', split: [3, 1, 2, 1] },
          { shape: 'bar', d: 4, n: 0, wholes: 1, label: 'C' },
        ],
      },
    }),
    row('fraction_models', {
      imageType: 'fraction_models', answer: 'A',
      content: {
        operation: 'fraction_compare_models', layout: 'row',
        models: [{ shape: 'bar', d: 4, n: 3, wholes: 1, label: 'A', caption: '3/4' }, { shape: 'bar', d: 4, n: 2, wholes: 1, label: 'B', caption: '2/4' }],
      },
    }),
    row('fraction_models', {
      imageType: 'fraction_models', answer: 'A',
      content: {
        operation: 'fraction_compare_mixed', layout: 'row',
        models: [{ shape: 'bar', d: 4, n: 6, wholes: 2, label: 'A', caption: '6/4' }, { shape: 'bar', d: 3, n: 4, wholes: 2, label: 'B', caption: '4/3' }],
      },
    }),
    row('fraction_models', {
      imageType: 'fraction_models', answer: '4/8',
      content: {
        operation: 'fraction_equivalent_strips', layout: 'stack', guide: [1, 2],
        models: [{ shape: 'bar', d: 2, n: 1, wholes: 1, caption: '1/2' }, { shape: 'bar', d: 8, n: 0, wholes: 1 }],
      },
    }),
  ],
  fraction_number_line: [
    row('fraction_number_line', {
      imageType: 'fraction_number_line', answer: '3/4',
      content: { operation: 'fraction_line_read', tick_labels: false, lines: [{ max: 1, d: 4 }], points: [{ line: 0, n: 3 }] },
    }),
    row('fraction_number_line', {
      imageType: 'fraction_number_line', answer: 'B',
      content: {
        operation: 'fraction_line_pick', tick_labels: false, lines: [{ max: 2, d: 4 }],
        points: [{ line: 0, n: 1, label: 'A' }, { line: 0, n: 5, label: 'B' }, { line: 0, n: 3, label: 'C' }, { line: 0, n: 6, label: 'D' }],
      },
    }),
    row('fraction_number_line', {
      imageType: 'fraction_number_line', answer: '2/4',
      content: {
        operation: 'fraction_line_equivalent', tick_labels: false, lines: [{ max: 1, d: 2 }, { max: 1, d: 4 }],
        points: [{ line: 0, n: 1 }],
      },
    }),
    row('fraction_number_line', {
      imageType: 'fraction_number_line', answer: 'B',
      content: {
        operation: 'fraction_line_greatest', tick_labels: false, lines: [{ max: 1, d: 6 }],
        points: [{ line: 0, n: 1, label: 'A' }, { line: 0, n: 5, label: 'B' }, { line: 0, n: 3, label: 'C' }],
      },
    }),
  ],
  // No picture: the stem is the question. The server ships only `operation`.
  fraction_text: row('fraction_text', {
    questionText: 'Is 3/8 less than, equal to, or greater than 1/2?',
    content: { operation: 'fraction_half_benchmark' }, answer: 'less than',
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
    content: { operation: 'base10_block_count', number: 41, place: 'tens' },
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
