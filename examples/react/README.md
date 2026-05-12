# React Example

Consumes `chocabloc-questions` via `npm link` (mirrors the Monkey Money
integration pattern).

## Run

From the **parent lib repo** (`chocabloc-questions/`):

```bash
npm run build      # ensure dist/ exists
npm link           # register global symlink
```

Then from this directory:

```bash
cd examples/react
npm install
npm link chocabloc-questions
npm run dev
```

Open the URL Vite prints. You should see the question render, and clicking
a choice shows the `answered` event payload.

## What this demonstrates

- React 18 consuming Web Components
- Type augmentation for `<chocabloc-question>` in JSX
- `npm link` workflow for cross-repo development
- `useRef` + `useEffect` for property assignment + event listener cleanup
