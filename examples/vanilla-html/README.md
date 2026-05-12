# Vanilla HTML Example

Demonstrates `<chocabloc-question>` rendering a money question from raw bank data.

## Run

From the repo root:

```bash
npm run build
npx http-server examples/vanilla-html -p 8080
open http://localhost:8080
```

Pick any coin choice. Result panel shows the `answered` event detail.

## What this demonstrates

- Tier 1 `normalizeQuestion()` consuming raw bank-shape input
- Tier 2 `<chocabloc-question>` rendering via property assignment
- CSS Custom Property theming
- `::part()` selector for container styling
- `answered` event payload shape
- Keyboard-only navigation (Tab into pad → Arrow keys → Space/Enter)
