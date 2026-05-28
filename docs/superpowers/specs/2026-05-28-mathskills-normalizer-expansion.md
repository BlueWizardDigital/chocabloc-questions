# mathSkills Normalizer Expansion

**Date**: 2026-05-28
**Scope**: Expand chocabloc-questions normalizer + renderers to accept all 99 format strings from the mathSkills question bank.
**Branch**: `feat/mathskills-full-coverage` (off `develop`)

## Problem

The mathSkills question generator produces 99 distinct `format` strings. The chocabloc-questions normalizer only handles 21. Any unrecognized format throws `NormalizeError`, blocking the question from rendering. This prevents using chocabloc-questions as the renderer for the mathSkills Skill Explorer or any game consuming mathSkills data.

## Solution

Three groups of changes, totaling 78 new format strings:

- **Group A** (1 format): Alias to existing normalizer
- **Group B** (20 formats): New normalizer functions + renderer cases for visual formats
- **Group C** (57 formats): Stem builder + route to TextOnlyQuestion for text-only formats

No existing normalizers, types, or rendering behavior changes. Strictly additive.

## Group A — Direct Alias

| Format | Alias to | Rationale |
|---|---|---|
| `money_count_mixed` | `normalizeMoneyRow` | `content.coins` is same `{denom: count}` dict. `inferCurrency` works from skill_ids. |

Implementation: one line in `FORMAT_NORMALIZERS`.

## Group B — New Visual Normalizers (20 formats)

### B1: Coin formats → ChocaCoinPile (7 new formats)

All have `image_type: 'coins'`. Need new type definitions because content shapes differ from `MoneyQuestion`.

| Format | Content shape | Answer type | Notes |
|---|---|---|---|
| `money_count_single` | `{coin: string, count: number}` | number (cents) | Synthesize coins dict from `{[coin]: count}` |
| `money_make_change` | `{payment_cents, item_price_cents, payment_display, item_price_display}` | number (cents) | No coins in content — render text prompt only, use choice pad |
| `money_purchase_find_difference` | `{coins: string[], price_cents, price_display, direction, diff_cents, currency}` | number (cents) | Coins is array, convert to dict for rendering |
| `money_coin_colour` | `{coins: string[], attribute, target_value, currency}` | string[] | Answer is filtered coin list |
| `money_coin_denomination` | `{coins: string[], attribute, target_value, currency}` | string | Answer is coin name |
| `money_coin_name` | `{coins: string[], attribute_hint, target_value, framing, currency}` | string | Answer is denomination string like "10¢" |
| `money_coin_size` | `{coins: string[], attribute, target_value, currency}` | string | Answer is coin name |

**Types needed**: `MoneyCountSingleQuestion`, `MoneyMakeChangeQuestion`, `MoneyPurchaseQuestion`, `MoneyCoinAttributeQuestion` (shared for colour/denomination/name/size — discriminated on `content.attribute`).

**Renderer changes**:
- `ChocablocQuestion._render`: route formats starting with `money_` + `imageType === 'coins'` to ChocaCoinPile
- `ChocaCoinPile`: accept new question types. For array-based coins, convert to dict internally. For `money_make_change` (no coins), render prompt-only with choice pad.

### B2: Table formats → ChocaTableQuestion (4 new formats)

All have `image_type: 'table'`.

| Format | Content shape | Answer type |
|---|---|---|
| `money_budget_balance` | `{income_cents, rows: [{category, amount_cents}], direction, currency}` | number (cents) |
| `money_budget_plan` | `{income_cents, rows: [{category, amount_cents|null}], solve_for, currency}` | number (cents) |
| `money_financial_records` | `{starting_balance_cents, transactions: [{date, type, amount_cents}], currency}` | number (cents) |
| `money_price_list` | `{rows: [{item, qty, unit_price_cents}], currency}` | number (cents) |

**Types needed**: `MoneyBudgetBalanceQuestion`, `MoneyBudgetPlanQuestion`, `MoneyFinancialRecordsQuestion`, `MoneyPriceListQuestion`.

**Renderer changes**:
- `ChocablocQuestion._render`: route these 4 formats to ChocaTableQuestion
- `ChocaTableQuestion._render`: add cases for each format's table layout (currently only handles `money_budget_adjust`)

### B3: Geometry canvas formats → ChocaCanvasQuestion (7 new formats)

| Format | image_type | Draw function | Content shape |
|---|---|---|---|
| `geometry_identify` | `shape_2d` / `shape_3d` | `drawShape2D` / `drawShape3D` | `{shape, operation}` |
| `geometry_classify_triangle` | `shape_2d` | `drawShape2D` (triangle) | `{operands: [sides], classify_by}` |
| `geometry_face_identify` | `shape_3d` | `drawShape3D` | `{shape, face_shape}` |
| `geometry_circle_convert` | `shape_2d` | `drawCircumference` (reuse circle drawing) | `{value, given_type, find_type}` |
| `geometry_symmetry` | `shape_2d` | `drawShape2D` | `{shape, lines_of_symmetry}` |
| `geometry_surface_area` | `shape_3d` | `drawShape3D` | `{shape, operands, radius?, height?}` |
| `geometry_volume` | `shape_3d` / `unit_cubes` | `drawShape3D` | `{shape, operands, radius?, height?}` |

**Types needed**: `GeometryIdentifyQuestion`, `GeometryClassifyTriangleQuestion`, `GeometryFaceIdentifyQuestion`, `GeometryCircleConvertQuestion`, `GeometrySymmetryQuestion`, `GeometrySurfaceAreaQuestion`, `GeometryVolumeQuestion`.

**Renderer changes**:
- `ChocaCanvasQuestion._renderCanvas`: add 7 `case` branches (1-3 lines each, calling existing draw functions)
- `ChocaCanvasQuestion._renderPrompt`: add default prompt text for each

### B4: Other visual formats → ChocaCanvasQuestion (2 new formats)

| Format | image_type | Draw function | Content shape |
|---|---|---|---|
| `coordinate` | `coordinate_plane` | `drawCoordinatePlane` (pass point as both args) | `{point: [x,y]}` |
| `number_line` | `number_line` | New `drawNumberLinePoint` function | `{number}` |

**Types needed**: `CoordinatePointQuestion`, `NumberLinePointQuestion`.

**New draw function**: `drawNumberLinePoint(ctx, w, h, value: number)` — horizontal line with single marked point. ~30 lines.

### B5: Fix existing normalizer

`geometry_angles` raw data has `image_type: 'right_triangle'` but normalizer currently sets `imageType: undefined`. Fix to preserve the raw value when present.

## Group C — Text-Only Stem Builder (57 formats)

All have no `image_type`. Route through a single `normalizeWithStem` function that:
1. Calls `buildStem(format, content)` to generate human-readable text
2. Returns a `TextOnlyQuestion` with `content: { stem }` + answer + distractors

### Stem patterns by category

**Arithmetic (operands-based)**:
```
addition:            "14 + 2 = ?"
addition_three:      "4 + 7 + 8 = ?"
subtraction:         "15 − 3 = ?"
division:            "75 ÷ 5 = ?"
integer_addition:    "(−12) + (−88) = ?"
integer_subtraction: "99 − (−28) = ?"
decimal_addition:    "30.04 + 55.34 = ?"
decimal_multiplication: "14 × 7.3 = ?"
decimal_division:    "18.9 ÷ 2.7 = ?"
```

**Missing number**:
```
missing_addend:      "0 + ___ = 1"
missing_subtrahend:  "1 − ___ = 0"
```

**Comparison**:
```
comparison:          "15 ___ 55  (< > =)"
integer_comparison:  "−56 ___ 34  (< > =)"
```

**Order of operations**:
```
order_of_operations: "(−46) × 37 + (−12) = ?"
```

**Algebra**:
```
algebra_eval:        "Evaluate 3x + 5 when x = 4"
algebra_solve:       "Solve: x + 14 = 31"
algebra_write:       "Write an expression: a number divided by 9"
```

**Fractions**:
```
fraction_addition:        "1/3 + 1/3 = ?"
fraction_subtraction:     "3/5 − 5/10 = ?"
fraction_multiplication:  "2/9 × 3/8 = ?"
fraction_division:        "1 ÷ 1/2 = ?"
fraction_of_quantity:     "2/5 of 40 = ?"
```

**Conversions**:
```
fraction_to_decimal:  "Convert 1/2 to a decimal"
decimal_to_fraction:  "Convert 0.5 to a fraction"
decimal_to_percent:   "Convert 0.01 to a percent"
percent_to_decimal:   "Convert 1% to a decimal"
conversion:           "Convert 1 cm to mm"
```

**Number theory**:
```
exponent:         "1² = ?"
square_root:      "√1 = ?"
gcf:              "GCF of 35 and 88"
lcm:              "LCM of 6 and 18"
prime_composite:  "Is 2 prime or composite?"
odd_even:         "Is 1 odd or even?"
absolute_value:   "|−50| = ?"
```

**Place value / rounding**:
```
place_value: "What digit is in the ones place of 102?"
rounding:    "Round 4 to the nearest 10"
```

**Ratios / rates**:
```
ratio:       "Simplify 10 : 6"
proportion:  "2 students per 7 teachers. How many teachers for 4 students?"
unit_rate:   "192 words in 6 minutes = ? words per minute"
```

**Statistics**:
```
statistics_mean:    "Find the mean: [43, 46, 48, 47, 51, 54, 40]"
statistics_median:  "Find the median: [39, 35, 5, 12, 3, 50, 32]"
statistics_mode:    "Find the mode: [26, 26, 36, 33, 26, 29, 14]"
```

**Skip counting**:
```
skip_count: "10, 8, 6, 4, ___"
```

**Geometry text-only**:
```
pythagorean_converse:      "Do sides 12, 16, 20 form a right triangle?"
geometry_angle_pairs:      "The supplement of 98° is ___"
geometry_classify_quad:    "4 equal sides, 4 right angles → ?"
geometry_formula_identify: "Formula for circumference (using radius)?"
geometry_interior_angles:  "Sum of interior angles of a triangle?"
```

**Money text-only**:
```
money_best_buy:                      "7 pencils for $3.64 or 11 pencils for $15.62. Unit price of cheaper?"
money_compare_buys:                  "11 pencils at $19.58 vs 12 at $6.00 (10% off). Cheaper unit price?"
money_compare_savings:               "$1164 at 9% for 5yr vs 6% for 3yr. Which earns more?"
money_decimal_calc:                  "$54.32 + $14.76 = ?"
money_round:                         "Round $323.67 to the nearest 10 cents"
money_unit_price:                    "4 stickers for $13.12. Price per sticker?"
money_simple_interest_amount:        "Simple interest on $2517 at 7% for 4 years?"
money_simple_interest_final_balance: "Final balance: $2877 at 3% for 5 years?"
```

## Files Changed

| File | Change |
|---|---|
| `src/types.ts` | ~15 new question type definitions, expand `NormalizedQuestion` union |
| `src/helpers/normalizer.ts` | ~78 new `FORMAT_NORMALIZERS` entries, ~20 normalizer functions, `buildStem()` function |
| `src/helpers-only.ts` | Export new types |
| `src/elements/ChocablocQuestion.ts` | Expand dispatcher for new money/table formats |
| `src/elements/ChocaCanvasQuestion.ts` | 9 new `case` branches in `_renderCanvas` + `_renderPrompt` |
| `src/elements/ChocaTableQuestion.ts` | 4 new table layout renderers |
| `src/elements/ChocaCoinPile.ts` | Accept array-based coins, handle attribute questions |
| `src/elements/canvas-draws.ts` | `drawNumberLinePoint()` function (~30 lines) |

## Estimated size

~800-1000 lines of new code across 8 files. No breaking changes to existing API.

## Testing strategy

1. Vitest unit tests for each new normalizer function (verify NormalizedQuestion output shape)
2. Vitest unit tests for `buildStem()` (verify stem text for each format)
3. Vanilla HTML example page updated with snapshot data for new formats
4. Manual verification: serve example page, cycle through all format cards
5. Existing tests must continue to pass (`npm run ci`)

## Edge case: multiplication without image_type

The existing `normalizeMultiplicationRow` requires `image_type` to be `array` or `number_line` and throws otherwise. 1,004 multiplication questions have no `image_type` (text-only arithmetic). The normalizer must check for `image_type` first — if absent, route to Group C stem builder (`"6 × 4 = ?"`). If present, use existing `normalizeMultiplicationRow`.

Implementation: replace the single `multiplication` entry in `FORMAT_NORMALIZERS` with a dispatcher function that checks `image_type` before delegating.

## Out of scope

- Word problem template system (deferred)
- Bills rendering in ChocaCoinPile (money_count_mixed with bills — coins render, bills ignored)
- `unit_cubes` image_type visual renderer (geometry_volume with unit_cubes falls back to shape_3d draw)
