# Contributing

## Branch

All work happens on `develop`. The new repo's `main` is empty and not used.

## Local dev with a consumer game (e.g. Monkey Money)

The lib needs to be exercised against a real consumer. Use `npm link`:

```bash
# Terminal 1, in chocabloc-questions:
npm run build:watch       # rebuild on every change

# Terminal 2, still in chocabloc-questions:
npm link                  # register global symlink

# Terminal 3, in the consumer repo (e.g. monkeymoney):
npm link chocabloc-questions
npm run dev               # consumer picks up live lib changes
```

If `npm install` blows the link away in the consumer, repeat
`npm link chocabloc-questions` in the consumer repo.

## Tests

```bash
npm run test          # Vitest unit tests (Tier 1)
npm run test:browser  # @web/test-runner + Playwright Chromium (Tier 2)
npm run ci            # full pipeline: typecheck + lint + tests + build + size
```

## Security rule

All user content (question stems, choice labels, distractor labels, prompts)
must be set via `textContent` or `innerText`. Never `innerHTML`,
`outerHTML`, `insertAdjacentHTML`, or template-string interpolation that
produces HTML. ESLint enforces this via `no-restricted-syntax` rule with
an exception only for static template literal initialization in
`src/elements/*.ts` (where templates contain zero user-data interpolation).

If you find a legitimate need to bypass, add an inline
`// eslint-disable-next-line no-restricted-syntax` comment with a one-line
reason. Reviewers will scrutinize these.

## Tag pattern (for future release work)

When release pipelines come online (currently deferred), tags will follow
the pattern:

```
v<MAJOR>.<MINOR>.<PATCH>(-(alpha|beta|rc).<N>)?
```

Stable tags (`vX.Y.Z`) publish to npm dist-tag `latest` and CDN path
`/question-lib/v<MAJOR>/`. Prerelease tags publish to dist-tag `next` and
CDN path `/question-lib/v<MAJOR>-next/`. Never use `npm unpublish` —
rollback via re-pointing dist-tags only.

## Adding a new format (Tier 1)

1. Extend `NormalizedQuestion` discriminated union in `src/types.ts`
2. Add a per-format parser branch in `src/helpers/parsers.ts`
3. Add a per-format normalizer branch in `src/helpers/normalizer.ts`
4. Add format math helper in `src/helpers/computers/<format>.ts`
5. Add format-specific validator branch in `src/helpers/validators.ts`
6. Add fixtures in `tests/fixtures/`
7. Write tests in `tests/helpers/`
8. Update barrel in `src/helpers-only.ts`

## Adding a new format (Tier 2 renderer)

1. Finish Tier 1 first (above)
2. Create `src/elements/Choca<Format>.ts` extending `HTMLElement`
3. Update root dispatcher in `src/elements/ChocablocQuestion.ts`
4. Add browser tests in `tests/elements/`
5. Add entry point in `src/elements/<format>.ts`
6. Update `vite.config.ts` multi-entry
7. Add bundle limit to `.size-limit.cjs`
8. Document new parts + vars in `PARTS-AND-VARS.md`
