# Stacked math: operator row and decimal support

Two defects in the whiteboard's stacked-math template, found while wiring Adventure 101's
Card 41 (`setMathExpression` driven from the live question).

Source of truth: `src/helpers/stacked-math.ts`, `src/elements/ChocaWhiteboard.ts`.

---

## Defect 1 — the operator sits on the wrong row

`_drawStackedLayout` draws the operator beside operand index 1:

```ts
if (i === 1) {
  ctx.textAlign = 'left';
  ctx.fillText(layout.operator, rightEdge - digitWidth - opWidth, y);
}
```

For three or more operands that puts the sign beside the **middle** row. Column arithmetic
puts it beside the **last**:

```
    4          4
  + 5   not  + 5      <- today
    5          5
  -----      -----
```

### Fix

`i === layout.operands.length - 1`.

For a 2-operand stack `length - 1 === 1`, so existing behaviour is **unchanged**. That
back-compat property is the point — verify it rather than assume it.

---

## Defect 2 — decimals are rejected

`parseMathExpression` is integer-only (`\d+` in both regexes), so `4.39 + 26.86` returns
`null` and the board stays blank. Column addition is exactly the support a child wants for
decimal arithmetic, and the bank ships a `decimal_addition` format.

### Fix, part A — parser

Accept an optional fractional part on each operand. Reject a bare or trailing point
(`.5`, `4.`) and a second point (`4.3.9`) — those are malformed, not decimals.

### Fix, part B — renderer, and this is the part that can teach the wrong thing

Today's layout right-aligns every operand. That is correct for integers and for decimals
that happen to share a decimal-place count, but it is **wrong** the moment they differ:

```
   4.5        4.5
+ 26.86    + 26.86     <- right-aligned: the 5 lands under the 8. Wrong.
```

Operands must align on the **decimal point**, so ones sit under ones and tenths under tenths.

Do **not** zero-pad the short operand (`4.5` -> `4.50`). Padding puts digits on screen that
the question did not ask, and the template is a scaffold, not a restatement of the problem.
Align and leave the right edge ragged.

The rule line must still span the full width of the widest rendered row, including the
operator column and the carry gutter it already reserves.

### Fix, part C — the public layout type

`StackedMathLayout.maxDigits` is exported in `dist/helpers/stacked-math.d.ts` and consumers
read it. Do not repurpose it.

- `maxDigits` keeps its meaning for the **integer part**. For integer-only input that is
  byte-identical to today's value, so nothing downstream moves.
- Add `maxDecimals: number` (0 when no operand has a fractional part).

---

## Out of scope

- The `+`/`-` guard in `setMathExpression`. `×` and `÷` stay rejected.
- `long-division` layout, which is still parsed and still unsupported by the renderer.
- Version bump, changelog, release, `dist/` vendoring into Adventure 101.

## Constraints

- **No new runtime dependencies and no bare import specifiers.** Adventure 101 vendors
  `dist/` as static files with no bundler and renames `.mjs` -> `.js`; a bare specifier
  cannot be resolved there and would break the page.
- Test first. `tests/helpers/stacked-math.test.ts` (vitest) and
  `tests/elements/ChocaWhiteboard.browser.test.ts` (web-test-runner) already cover this area.
- Canvas output is asserted by spying on the 2D context's `fillText` / `moveTo` / `lineTo`
  arguments, not by reading pixels.
- `npm run ci` must pass (`typecheck && lint && test && build && size`).
