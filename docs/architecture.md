# Architecture — how the game, the kit, the bridge, and the host fit together

This is the canonical "how it all works" explainer. It covers the four moving parts,
who holds security, the message contract between them, the six things a game must do,
what the kit is *for*, and the plan to move the right pieces into `chocabloc-questions`.

> **Canonical home.** Moved here from `chocabloc-game-template/docs/` on 2026-08-14 —
> it describes this library's contract, not the template's implementation, so it is
> versioned alongside the library. The template keeps a stub pointing here.

Grounded in the real code (read 2026-06-26):
- Host: `Chocabloc/client/src/pages/games/GamePageWrapper.tsx`
- Bridge: this repo's `src/bridge.ts`
- Host facade: this repo's `src/host.ts` (the `chocabloc-questions/host` entrypoint)
- Full message field detail: [`host-protocol.md`](./host-protocol.md)

---

## 1. The four parts

```
┌──────────────────────────────────────────────────────────────┐
│  HOST  —  GamePageWrapper.tsx  (the Chocabloc app)           │
│  • owns the API, cookies, CSRF, the database, the iframe     │
│  • checks origin + source on EVERY message (fail-closed)     │
│  • re-derives correctness on the SERVER from answerToken     │
└───────────────▲──────────────────────────┬───────────────────┘
                │   chocabloc:* postMessage  │
                │   (the only channel)       │  sandboxed iframe
┌───────────────┴──────────────────────────▼───────────────────┐
│  GAME iframe  (untrusted)                                     │
│                                                              │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │ chocabloc-questions / bridge   — the ADAPTER            │ │
│  │  speaks chocabloc:* · timeouts · standalone no-op       │ │
│  └───────────────▲─────────────────────────────────────────┘ │
│                  │  bridge.requestQuestions / validateAnswer  │
│  ┌───────────────┴─────────────────────────────────────────┐ │
│  │ chocabloc-questions / host  — BATTERIES & GUARDRAILS   │ │
│  │  whenHostReady · loadQuestions · checkAnswer · reporting│ │
│  └───────────────▲─────────────────────────────────────────┘ │
│                  │  plain function calls                      │
│  ┌───────────────┴─────────────────────────────────────────┐ │
│  │ the GAME  (rules, board, UI)                           │ │
│  └─────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

| Part | What it is | Where it lives |
|---|---|---|
| **Host** | `GamePageWrapper.tsx` — renders the game in a sandboxed iframe, owns the API and all security | `Chocabloc` repo |
| **Bridge** | `chocabloc-questions/bridge` — the game-side translator for the `chocabloc:*` protocol | `chocabloc-questions` lib |
| **Host facade** | thin convenience layer over the bridge (boot, question supply, answer-check, reporting) | **this lib — `chocabloc-questions/host`** (moved out of the template in v0.6.0-beta.5; see §7) |
| **Game** | the actual game (rules, board, UI) | per-game repo |

---

## 2. Who holds security (the key fact)

**Security is concentrated in the host. The kit holds none of it.**

- The game runs in `<iframe sandbox="allow-scripts allow-same-origin">` and is **never trusted**.
- On every message the host checks: type starts with `chocabloc:`, `e.origin` matches its own origin, and `e.source` is its *own* iframe window — and **fails closed** (only the `chocabloc:ready` boot handshake is allowed before the iframe is wired).
- The game **cannot reach the API directly** — it has no session cookies or CSRF token. The host fetches questions and validates answers *on the game's behalf*.
- Correctness is **re-derived on the server** from the question's `answerToken`. A game's self-reported `isCorrect` is ignored when a token is present, so a malicious iframe can't forge a right answer or inflate XP. Token-less authoritative attempts can be suppressed host-side (`SUPPRESS_TOKENLESS`).

**Why this matters for us:** moving kit code around (e.g. into `chocabloc-questions`) can't weaken security, because the kit was never what protected anything. The host doesn't trust the kit any more than the game.

---

## 3. The message contract

Every game→platform interaction is one of these `chocabloc:*` postMessages. Full field-level
detail is in [`host-protocol.md`](./host-protocol.md); this is the map.

| Direction | Message | Purpose |
|---|---|---|
| game → host | `chocabloc:ready` | "I'm loaded" — triggers the host's init reply |
| host → game | `chocabloc:init` | context: `{ isMobile, viewport:{w,h}, gradeBand, grade }` |
| game → host | `chocabloc:started` | gameplay actually began (precise signal) |
| game → host | `chocabloc:questions:request` | ask for a question pack (host pins `gameId` from the manifest) |
| host → game | `chocabloc:questions:deliver` | `{ requestId, questions, total, recipeSlug, gradeMap, … }` |
| game → host | `chocabloc:validate:request` | `{ requestId, answerToken, studentAnswer }` — grade this answer |
| host → game | `chocabloc:validate:deliver` | `{ requestId, isCorrect, expected, distractorMatched }` |
| game → host | `chocabloc:attempt` | record one attempt (forward the `answerToken` so the server grades it) |
| game → host | `chocabloc:score` | `{ score, stars, xp }` at a level boundary |
| game → host | `chocabloc:exit` | leave the game |

The **bridge** is the game-side implementation of this table: `bridge.onReady` (init),
`requestQuestions`/`requestNextQuestion`, `validateAnswer`, `attempt`, `score`, `started`,
`saveNotify`. Each is a no-op when standalone.

---

## 4. What a game must do — the six things

To be a well-behaved ChocaBLOC game, the game needs exactly these. The kit exists so the
game author doesn't hand-write any of them.

| # | The game must… | What does it (`chocabloc-questions/host`) |
|---|---|---|
| 1 | **Boot safely** — handshake with the host, or detect "no host" and run standalone | `whenHostReady()`, `hostContext()`, `notifyStarted()` |
| 2 | **Get questions that never run dry** — bank → fixture → generate | `loadQuestions()` (engine here; fixture + generator injected by the game) |
| 3 | **Check answers correctly** — local compare if the answer is present; else server-validate via token | `checkAnswer()` |
| 4 | **Report without crashing** — attempt/score/save, forwarding the `answerToken` | `reportAttempt()`, `reportScore()`, `notifySave()` — fire-and-forget, never throw |
| 5 | **Degrade offline** — for dev and ungraded fallback rounds | the fixture/generator tiers + standalone context |
| 6 | **Obey the chrome rules** — no header/title, `base: './'`, never write `localStorage` directly | conventions, not code — see the template's `CLAUDE.md` |

Everything else — board, rules, art, menus, scoring — is the game's own business.

---

## 5. What the kit is *for* (one line)

**The kit answers "what do I have to do to be a well-behaved ChocaBLOC game?" — packaged so
each game doesn't re-derive it from the host protocol.**

It is *batteries and guardrails*, not security and not game logic:
- a **safe boot** (works embedded or standalone),
- a **question supply** that never comes up empty,
- a **correctness check** that does the right thing for graded vs ungraded questions,
- **fail-safe reporting**,
- and the **guardrails** (don't touch chrome, don't store directly, `base: './'`).

---

## 6. Where each piece should live

The kit isn't one thing, so it doesn't get one home. Split by coupling — ask of each piece:
**will every game share fixes to this, or fork it?**

| Piece | Home | Why |
|---|---|---|
| Host glue: `context`, `checkAnswer`, `reporting`, `requestBankQuestions` | **`chocabloc-questions`** | Pure bridge-wrapping. Must change when the protocol changes → version it with the bridge. Fix once, every game bumps the tag. |
| Question loader **engine** (3-tier top-up) | **`chocabloc-questions`** (generic part) | Reusable mechanism… |
| Loader **defaults** (which fixture, which generator) | **template** | …but the *content* is the game's choice — inject it. |
| Save engine (`src/kit/save/`) | **not the questions lib** | Protocol-independent. A *questions* lib is the wrong home; keep as template scaffold or a separate package. |
| `Modal` / any UI | **template** | The lib is framework-agnostic; a Preact component can't live there. |

This resolves the disagreement between `docs/HANDOFF-math-bingo-port.md` ("put it in `src/kit/`")
and `docs/shared-kit-findings.md` ("lift into a `game-kit` entrypoint"): **both, split by coupling.**

---

## 7. Move spec — host glue → `chocabloc-questions`

> **✅ Status (shipped 2026-06-29, `chocabloc-questions` v0.6.0-beta.5).** Done: the bridge is
> import-safe; the normalizer preserves the F6 `answerToken`; the **`chocabloc-questions/host`**
> entrypoint ships context (`hostContext`/`whenHostReady`/`notifyStarted`), fail-safe reporting
> (`reportAttempt`/`reportScore`/`notifySave`), `checkAnswer`, and the question APIs
> (`requestBankQuestions` / `requestNextBankQuestion` / `loadQuestions`). The template now consumes
> the boot + answer-check glue from `/host` and **keeps its own loader** — the arithmetic example
> isn't a lib question format, so the loader stays per-game (see §6). The spec below is the as-built record.

The lib is already set up for this: multi-entrypoint Vite build, an `exports` map, vitest,
size-limit, the same CI shape. Its bridge already exposes every method the glue wraps.

### Target
A new entrypoint **`chocabloc-questions/host`** (named `host`, **not** `game-kit` — the latter
invites the save engine and UI to creep in, which we explicitly don't want here).

### Moves vs stays
| Piece | Move? | Note |
|---|---|---|
| `context.ts` (incl. fixing the `whenHostReady` timeout bug) | ✅ | wraps `bridge.ctx`/`onReady`/`started` |
| `checkAnswer.ts` | ✅ | wraps `validateAnswer` + local compare |
| `reporting.ts` | ✅ | build it here, not in the template |
| `requestBankQuestions` | ✅ | calls local bridge + lib's own `normalizeQuestion` |
| loader **engine** | ✅ split | generic top-up/dedupe |
| loader **defaults** (fixture, `genArithmetic`) | ❌ stay | injected by the game |
| save kit, `Modal` | ❌ stay | §6 |

### The one hard problem: node-import safety
The template's whole `src/kit/host/` design exists because `chocabloc-questions/bridge`
**touches `window` at import and crashes node tests.** If the new `/host` entrypoint statically
imports the bridge, any node test that imports `/host` inherits that crash. Pick one:
- **Minimal:** `/host` reaches the bridge via lazy `import('./bridge')` (as `questionSource.ts` already does).
- **Robust (preferred):** make the bridge import-safe — guard its `window` listener/timer behind
  `typeof window !== 'undefined'` / first-use. Benefits the whole library.

**Phase 0 done (2026-06-29): Option B confirmed safe.** The bridge's module-load `window` access is contained in ~3 top-level statements (compute `inIframe`, `window.addEventListener('message', …)`, the `if (inIframe) … postMessage('chocabloc:ready') / setTimeout(enterStandalone)` boot block). Wrapping them in `if (typeof window !== 'undefined')` makes import-in-Node a no-op and leaves the in-handler security gates untouched.

### Lib-side work (`chocabloc-questions`)
1. Fix/verify bridge node-import safety (above).
2. Add `src/host.ts` — port `context`, `checkAnswer`, `reporting`, loader engine, `requestBankQuestions` (framework-free).
3. Fix `whenHostReady` to mark resolved + cache the snapshot on the timeout path.
4. Register the entrypoint: add `host` to `vite.config.ts` `build.lib.entry`; add `./host` to `package.json` `exports` (+ `sideEffects` if it sets up listeners).
5. Tests (vitest/jsdom; fake timers for `whenHostReady`).
6. `npm run ci` green → cut a tag (e.g. `v0.7.0-beta.0`).

### Template-side work (this repo)
1. Bump the pin via the documented force-reinstall (`npm install "…#v0.7.0-beta.0" --force` — npm caches the git sha). See `docs/chocabloc-questions-upgrades.md`.
2. Delete the moved files; import from `chocabloc-questions/host`.
3. Keep the fixture + `genArithmetic`; inject them into the loader.
4. Revisit the eslint `no-restricted-imports` fence — the bridge is now mostly the lib's concern.
5. Replace template glue unit-tests with thin import/run checks; keep the loader-injection tests.
6. `npm run ci` green.

### Risks & cost
- **Biggest risk:** node-import safety. If unsolved, template tests break.
- **Coupling:** reporting/context now release on the questions-lib cadence — fine, since they track the protocol.
- **Cross-repo:** needs lib-repo work + a release before the template can consume it.
- **No security risk** (§2).
- **Effort:** lib side is the bulk; template side is mostly deletion + re-import. A couple of focused TDD sessions.

### Decisions (settled 2026-06-29)
1. **Entrypoint name: `chocabloc-questions/host`.** (`/game-kit` rejected — too broad; it invites the save engine and UI to creep in, which §6 says don't belong in a *questions* library.)
2. **Node-safety: robust bridge fix (Option B) — phase 0 done, confirmed safe.** The bridge's only module-load `window` touches are a small number of top-level statements: computing `inIframe`, registering `window.addEventListener('message', …)`, and the `if (inIframe) { postMessage('chocabloc:ready'); setTimeout(enterStandalone) }` boot block. Guarding these with `typeof window !== 'undefined'` makes import-in-Node a no-op **without changing any security logic** — the `e.source === window.parent` / origin checks live *inside* the handler and stay byte-for-byte. Do it in the lib repo with tests (onReady still fires; standalone fallback still triggers; gates still reject). Fall back to Option A only if that PR proves harder than expected.
3. **Sequence: fix `whenHostReady` in the template now (Option A) — done.** Committed `fix: whenHostReady stays resolved after standalone timeout`. The fixed `context.ts` is exactly what later moves to the lib.
