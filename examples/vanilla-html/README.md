# Vanilla HTML Example

Renders all supported question formats from real DB snapshot data. Each card cycles through 10 questions per format via the **Next** button.

Two pages:
- **`index.html`** — all formats, from DB snapshot data (needs the snapshot step below).
- **`word-problems.html`** — the optional word-problem engine, self-contained (no DB needed). Toggle **Word problem** on/off to watch the same `<chocabloc-question>` re-word its stem while the multiple-choice pad, **Input** mode, and **Whiteboard** keep working. Difficulty + theme selectors and a **Re-roll** button show seeded determinism; one card has no template and stays symbolic to show graceful fallback.

## Setup

From the repo root:

```bash
# 1. Generate snapshot data (requires local Postgres with questor_games_dev)
#    Only needed for index.html — word-problems.html is self-contained.
./scripts/db-snapshot/snapshot.sh

# 2. Build the library
npm run build

# 3. Serve from project root
npx serve . -l 4173
open http://localhost:4173/examples/vanilla-html/               # all formats
open http://localhost:4173/examples/vanilla-html/word-problems.html   # word problems
```

If you don't have the DB running, `index.html` still loads (cards for missing snapshot files are skipped); `word-problems.html` needs no data at all — just `npm run build` + serve.

## What this demonstrates

- Tier 1 `normalizeQuestion()` consuming raw bank-shape input (snake_case fields, `question_id`)
- Tier 2 `<chocabloc-question>` dispatching to format-specific components
- All 5 renderers: `ChocaCanvasQuestion`, `ChocaCoinPile`, `ChocaTableQuestion`, `ChocaPatternQuestion`, `ChocaNumberLineQuestion`
- CSS Custom Property theming + `::part()` styling
- `answered` event payload (correct/wrong, distractor matching, timing)
- `rendered` event lifecycle
- Keyboard navigation (Tab into pad, Arrow keys, Space/Enter)
- **Input Mode** toggle — swaps choice pad for typed answer input per card
- **Whiteboard** tool — freehand drawing overlay via `whiteboard` attribute
