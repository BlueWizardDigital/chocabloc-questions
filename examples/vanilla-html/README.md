# Vanilla HTML Example

Renders all supported question formats from real DB snapshot data. Each card cycles through 10 questions per format via the **Next** button.

## Setup

From the repo root:

```bash
# 1. Generate snapshot data (requires local Postgres with questor_games_dev)
./scripts/db-snapshot/snapshot.sh

# 2. Build the library
npm run build

# 3. Serve from project root
npx serve . -l 3000
open http://localhost:3000/examples/vanilla-html/
```

If you don't have the DB running, the page still loads — cards for missing snapshot files are skipped.

## What this demonstrates

- Tier 1 `normalizeQuestion()` consuming raw bank-shape input (snake_case fields, `question_id`)
- Tier 2 `<chocabloc-question>` dispatching to format-specific components
- All 4 renderers: `ChocaCanvasQuestion`, `ChocaTableQuestion`, `ChocaPatternQuestion`, `ChocaNumberLineQuestion`
- CSS Custom Property theming + `::part()` styling
- `answered` event payload (correct/wrong, distractor matching, timing)
- `rendered` event lifecycle
- Keyboard navigation (Tab into pad, Arrow keys, Space/Enter)
