# Migrating an existing game to ChocaBLOC

> **Audience:** you have a working, standalone HTML5 game in its own repo, and you
> want it playable inside ChocaBLOC — earning XP, saving progress, and serving
> curated questions or concepts.
>
> **Not for you if** you're starting a new game from scratch. Use
> `chocabloc-game-template` instead; it ships everything below pre-wired.

**This document is the source of truth for migration.** Where it disagrees with
any other doc, this wins — see [What this supersedes](#what-this-supersedes).

Every rule below carries its enforcement point in brackets:

| Marker | Meaning |
|---|---|
| `[CI]` | The deploy workflow fails if you get it wrong |
| `[test]` | A test in your repo catches it |
| `[review]` | A human catches it, or nobody does |
| `[⚠ silent]` | **Nothing catches it.** It ships broken and looks fine |

The `[⚠ silent]` items are the ones that have actually bitten us. Read those twice.

---

## 0. Preflight — can this game migrate?

Answer these before writing code. A "no" is not fatal, but it changes the plan.

| Question | If no |
|---|---|
| Can you control the build config (set `base: './'` or equivalent)? | The game will dead-screen in the iframe. Must be fixed first. |
| Does it play standalone with no backend of its own? | The game can't reach any API from inside the iframe — it has no cookies and no CSRF token. Server-dependent games need their calls proxied through the host, which is not a supported path today. |
| Is it in a repo in the `BlueWizardDigital` org? | Org deploy secrets and reusable workflows won't reach it. Move it, or set repo-level secrets by hand. |
| Does it have a terminal "round over" moment? | Without one there's nowhere to report score, and XP never lands. |
| Do you know whether it wants **bank questions**, the **concepts layer**, or both? | This is the biggest fork in the whole migration. Decide before Milestone 2. |

---

## 1. The model, in 60 seconds

Four parts. You are only responsible for the fourth.

```
HOST (Chocabloc app)  — owns the API, cookies, CSRF, the database, the iframe
   │  chocabloc:* postMessage — the ONLY channel
   ▼
GAME iframe (untrusted)
   ├─ chocabloc-questions/bridge — speaks the protocol, no-ops when standalone
   ├─ chocabloc-questions/host   — batteries: boot, questions, answers, reporting
   └─ YOUR GAME                  — rules, board, art, UI
```

**Security lives entirely in the host.** Your game is never trusted. The host
checks origin and source on every message and fails closed. Correctness is
re-derived server-side from the question's `answerToken` — a game's self-reported
`isCorrect` is ignored when a token is present. This is why you can't cheat the
integration by accident, and why you should never try to compensate for it.

**You never hand-write the protocol.** Import from `chocabloc-questions/host`.
Reach for `/bridge` directly only for `attachValidator` and the error classes.

---

## 2. Install the dependency

```bash
npm install chocabloc-questions@github:BlueWizardDigital/chocabloc-questions#v0.6.0-beta.8
```

**Pin the tag.** [review] Games do not float on `main`. The pin is what stops a
lib release from breaking your game — but see §9, it does **not** protect you from
server-side protocol changes.

> **npm caches git SHAs.** Bumping a pin later needs
> `npm install "…#v0.7.0-beta.0" --force`, or you'll silently keep the old code.

**Zero-build games** (no bundler): you cannot resolve a bare specifier. Vendor
`node_modules/chocabloc-questions/dist/*` into your repo, commit it, and wire an
import map. The lib's `dist/` is pure relative-import ESM with zero bare imports,
so browsers resolve it natively. See the appendix.

---

## 3. Milestone 1 — become a host-aware game

**Ship this before you touch questions.** It's small, independently verifiable,
and it means a broken Milestone 2 can't take the whole port down with it.

### 3.1 Boot

```js
import { whenHostReady, hostContext } from 'chocabloc-questions/host';

const ctx = await whenHostReady();   // resolves ~1.5s with standalone ctx if no host
if (!ctx.standalone) { /* embedded */ }
```

Use host context to **enhance**, never to **gate**. [⚠ silent] If your game asks
the player for a grade on first run, prefill it from `ctx.grade` / `ctx.gradeBand`
— but keep the manual picker for standalone. A game that hard-requires host
context is broken the moment it's opened directly, and nothing tells you.

### 3.2 The three reports

Stamp these **next to code that already exists**. [review] Never restructure your
game loop to fit them — if there's no natural "round started" moment, add your own
analytics event first, then put `notifyStarted()` beside it.

```js
import { notifyStarted, reportScore, notifySave } from 'chocabloc-questions/host';

notifyStarted();                                  // each round begins
reportScore({ score, stars, xp });                // round/level ENDS — terminal state only
notifySave();                                     // after each localStorage.setItem you want synced
```

- `notifyStarted()` — after intro, when play actually begins.
- `reportScore()` — [⚠ silent] **only at the terminal state.** Call it early and the
  host awards XP while the player keeps playing. Nothing errors; the numbers are
  just wrong.
- `notifySave()` — [⚠ silent] after every write you want mirrored to `game_saves`.
  Miss one and host-side progress is quietly stale. Audit by grepping
  `localStorage.setItem` and confirming a `notifySave()` next to each write site.
  Don't call it on reads.

Derive `stars` / `xp` in a **pure game-side helper** so standalone stays honest.
Keep that logic out of the bridge.

> The host currently trusts game-supplied `xp`. Server-authoritative XP is a
> pending redesign — don't build anything leaderboard-grade on this.

### 3.3 Verify Milestone 1

- [test] Standalone: open the built game in a top-level tab. It plays. Console clean.
- [test] Two rounds back to back emit **exactly 2** `started` and **exactly 2** `score`.
- [review] In the portal, wiretap the console:
  ```js
  window.addEventListener('message', e =>
    e.data?.type?.startsWith('chocabloc:') && console.log('[bridge]', e.data.type, e.data.payload));
  ```

Ship it here. Milestone 1 is a complete, useful integration on its own.

---

## 4. Milestone 2 — questions and/or concepts

Every ChocaBLOC game needs one of these. Pick deliberately.

| | **Bank questions** | **Concepts layer** |
|---|---|---|
| You get | Curated `CanonicalQuestion` objects | Grade-tiered rules for your own loop |
| Use when | Your game *asks questions* | Your game *is* the exercise |
| Binding | `games.default_recipe_slug` | `games.default_concept_category` |
| Entry point | `requestBankQuestions()` | `requestGameConcept()` |

Both, if the game quizzes *and* tiers its difficulty.

### 4.1 Bank questions

```js
import { requestBankQuestions, checkAnswer, reportAttempt } from 'chocabloc-questions/host';

const questions = await requestBankQuestions(5);
```

Render with the shared element, or your own renderer:

```js
import 'chocabloc-questions/full';          // registers <chocabloc-question>
import { bridge } from 'chocabloc-questions/bridge';

const el = document.createElement('chocabloc-question');
el.question = q;                             // [⚠ silent] PROPERTY, not attribute
bridge.attachValidator(el, q);               // F6 wire — no-op pre-F6, safe always
container.appendChild(el);

el.addEventListener('answered', (e) => {
  reportAttempt({
    questionId: q.id,
    isCorrect: e.detail.isCorrect,
    skillIds: q.skillIds,
    studentAnswer: e.detail.choice.value,
    timeToAnswerMs: performance.now() - startedAt,
    answerToken: q.answerToken,              // forward it — the server grades
  });
});
```

Three traps:

- [⚠ silent] **`el.setAttribute('question', q)` renders nothing.** The object
  stringifies to `"[object Object]"` and the element silently shows blank. Use the
  property.
- [⚠ silent] **Only report attempts for questions that came from the host.**
  Game-local quizzes stay silent — fabricated attempts pollute skill mastery.
- [⚠ silent] **`attachValidator` is mandatory before F6 flips.** When
  `F6_DROP_ANSWER=true`, payloads stop carrying `answer`/`distractors` and
  correctness only comes from `POST /api/v1/answer/validate`. A game without a
  validator wired **deadlocks its quiz** the moment the flag turns on. Custom
  renderers call `bridge.validateAnswer({ answerToken, studentAnswer })` themselves.

Handle the bridge error classes — `BridgeTimeoutError`, `InvalidTokenError`,
`ExpiredTokenError`, `BridgeStandaloneError`, `MalformedResponseError`. Surface a
retry to the player and log it. [⚠ silent] Without telemetry on these, a real
outage silently marks correct answers wrong.

### 4.2 Concepts

```js
import { requestGameConcept, reportConceptSession } from 'chocabloc-questions/host';

const concept = await requestGameConcept({ /* … */ });
// concept carries the grade-tiered rules; run your own loop against them
await reportConceptSession({ /* … */ });
```

Field-level detail: `chocabloc-questions/docs/host-protocol.md` §Concepts.

### 4.3 Standalone fallback

[⚠ silent] When `ctx.standalone === true` the host never replies. Fall back to
your existing local question pool or default rules. This is not optional — it's
how the game stays playable for you during development, before any binding exists.

### 4.4 The binding must actually resolve

[⚠ silent] **This has failed twice, in two different ways.**

- A `default_concept_category` pointing at a category with no concepts in the
  **Chocabloc** DB resolves to nothing. Check before binding.
- A brand-new question `format` needs its keys whitelisted in
  `server-new/services/recipeResolver.js` `RENDER_CONTENT_KEYS`, or `content`
  ships as `{}` and the question renders empty.

Neither errors. Both look like a broken lib. Verify the binding returns real rows
before you call Milestone 2 done.

---

## 5. Build conventions

These land automatically in a new game from the template. **A migrating game gets
none of them**, and every one is silent.

| Setting | Why | Marker |
|---|---|---|
| `base: './'` in your bundler | Absolute `/assets/…` gets intercepted by the parent SPA → blank iframe | `[CI]` |
| `build.assetsInlineLimit: 0` | Vite's 4KB default base64-inlines small images into JS. Took one port from 19KB → 51KB gz | `[⚠ silent]` |
| `src/assets.d.ts` — `declare module '*.webp'` | tsconfig uses `types:["node"]`; asset imports fail typecheck without it | `[CI]` |
| `.size-limit.cjs` with **two** globs | One glob for the entry chunk, one for total JS. A single glob sums lazy chunks and mis-reports "initial JS" | `[⚠ silent]` |
| eslint `no-restricted-imports` fence on `chocabloc-questions/elements/*` | Static-importing an element crashes node tests and bloats the entry chunk. Exempt only your one dynamic-import wrapper | `[CI]` |

Copy these from the template. They are not in the lib and nothing will remind you.

---

## 6. Deploy

Your repo deploys itself. Add `.github/workflows/deploy.yml`:

```yaml
name: Deploy to ChocaBLOC
on:
  push: { branches: [main] }
  workflow_dispatch:
jobs:
  deploy:
    uses: BlueWizardDigital/.github/.github/workflows/game-deploy.yml@v1
    with:
      game_slug: your-game-id
      build: true          # false for zero-build games
    secrets: inherit       # org secrets flow through automatically
```

> **Status: planned, not built.** The central workflow is specced in
> `Chocabloc/TODO.md` — pin the `@v1` tag, not `@main`, so a central edit can't
> silently change every game's deploy. Until it lands:
>
> - **Built games:** copy `.github/workflows/deploy.yml` from the
>   **`chocabloc-game-template`** repo and fill its two top-of-file placeholders,
>   `__GAME_SLUG__` and `__DEPLOY_BRANCH__`. It stays dormant until both are
>   replaced, so it can't half-deploy.
> - **Zero-build games:** `Chocabloc/docs/games/templates/deploy.yml.static.template`.
>
> The older `deploy.yml.template` in that folder was stale and was deleted
> 2026-08-14.

Then, operator-side (needs credentials you don't have):

1. **Grant the org secrets.** [⚠ silent] `node scripts/grant-game-deploy-secrets.mjs --repo <name>`
   An org secret your repo isn't scoped to is **not denied — it's delivered empty.**
   The run reaches rsync with blank inputs and dies with
   `Error loading key "(stdin)": error in libcrypto`, naming neither the secret nor
   the permission. Two games have lost a run to this.
2. **Pre-create the slot:** `ssh deploy@<host> "mkdir -p /home/deploy/develop/games/<id>/dist"`
3. **Zero-build games only:** the host needs `.mjs` mapped to a JS MIME type once.
   [⚠ silent] Stock nginx serves `.mjs` as `application/octet-stream`; browsers
   refuse to execute it as a module, the boot file never runs, and it looks exactly
   like a dead API. One-time per server.

### The `/dist/` rule

[⚠ silent] Deploy **under** `dist/`, and set `iframeSrc` to
`/games/<id>/dist/index.html`. This is routing, not cosmetics: nginx serves
`/games/<id>/` as static files, so an `index.html` at the folder root shadows the
React SPA route. A direct hit or refresh then loads the **raw standalone game** —
no wrapper, no handshake, no XP, no questions. It looks like it works.

---

## 7. Register in the catalog (operator)

Three edits, two repos. All three are required; miss one and the game is
half-registered.

1. **`Chocabloc/shared/games.json`** — catalog entry. `integration: "iframe"`,
   `iframeSrc: "/games/<id>/dist/index.html"`, plus `repo` / `branch`.
2. **`Chocabloc/client/src/games/presentation.ts`** — visuals, and **`featured: true`**.
3. **`questor-api/scripts/migrations/NNN_add_<id>_game.sql`** — the `games` row,
   `ON CONFLICT (game_id) DO UPDATE`.

Then `npm run gen:games && npm run check`. Never hand-edit `registry.ts` — it's generated.

### The three invisibility gates

[⚠ silent] Each of these makes a fully working, deployed, correctly-registered game
**invisible, with no error anywhere.**

- **`featured: true` missing** → the dashboard renders `featuredGames` only.
- **`realm: "thunder"`** → retired. `HIDDEN_REALMS` drops it everywhere. Only
  `sprout` and `adventure` are reachable.
- **`gradeRange` that overlaps neither `0-2` nor `3-6`** → the dashboard filters
  featured games by the active realm's range. A `"7-9"` game shows to nobody.
  A game for older kids needs a range reaching into `3-6` (crossbird is `2-8`).

One game shipped with the third — deployed, playable, `featured: true`, correct in
`/api/v1/games`, unreachable at every grade — and needed a migration to move it.

**Why is the migration needed when `gen:games` writes a seed file?** Deploy runs
`migrate.js` only, not `seed-games.js`. A game that exists solely in
`games.seed.generated.json` works perfectly on the machine where you tested it and
is absent from the deployed `/api/v1/games`.

---

## 8. Done means

- [test] Standalone build plays in a top-level tab, console clean.
- [test] Two rounds → exactly 2 `started`, 2 `score`.
- [test] Attempts resolve their `question_attempts` FK.
- [review] Bank/concept binding returns real rows against the real DB.
- [review] Direct URL `…/games/<id>/dist/index.html` plays.
- [review] Portal → tile → iframe renders, plays, bridge events fire.
- [review] Screenshots compared against the pre-migration game. **jsdom asserts
  presence, not layout.** During one port, components shipped twice with broken CSS
  and green tests — once with a decorative layer eating taps.
- [review] Bundle size checked against the pre-migration baseline.

---

## 9. What pinning does and does not buy you

Pinning `chocabloc-questions` protects you from **build-time API breakage**. It
does **not** protect you from **runtime protocol changes**, because the host is
shared and server-side flags are global.

F6 is the live example: when `F6_DROP_ANSWER` flips, every game in the fleet is
affected at once regardless of which lib version it pinned. A pinned game with no
`attachValidator` deadlocks.

**So:** pin for stability, but treat §4.1's validator wiring as mandatory today,
not when the flag flips.

---

## What this supersedes

Docs describing a **versioned contract** belong with the thing they describe. Docs
describing **platform operations** belong with the platform. Same "split by
coupling" rule the kit already follows.

| Topic | Home | Status |
|---|---|---|
| Migration (this doc) | `chocabloc-questions` | **SSOT** |
| Protocol field detail | [`host-protocol.md`](./host-protocol.md) | **SSOT** — moved into this repo 2026-08-14 |
| How the parts fit, the six things | [`architecture.md`](./architecture.md) | **SSOT** — moved into this repo 2026-08-14 |
| Element API, parts & vars | `chocabloc-questions/README.md`, `PARTS-AND-VARS.md` | Authoritative |
| Catalog, realms, DB, deploy infra | `Chocabloc` + `.claude/skills/chocabloc-add-game` | Authoritative |
| Starting a **new** game | `chocabloc-game-template/README.md` | Authoritative |
| `Chocabloc/docs/games/IFRAME-GAME-INTEGRATION-GUIDE.md` | — | **Superseded for migration.** Retains value for host-side context; its protocol table is behind `host-protocol.md` |
| ~~`Chocabloc/docs/games/templates/deploy.yml.template`~~ | — | **Deleted 2026-08-14.** Use `chocabloc-game-template/.github/workflows/deploy.yml`. (`deploy.yml.static.template` stays — zero-build games have no other option.) |
| `Chocabloc/docs/games/INTEGRATION-GUIDE.md` | — | Covers React/vanilla **in-app** games — a different model. Not superseded, but its §10 (grade/realm) and §20 (question banks) now duplicate this doc |

### Known drift, unresolved

`IFRAME-GAME-INTEGRATION-GUIDE.md` documents `chocabloc:init` as carrying
`{ isMobile, viewport, gradeBand, grade, player }`. `architecture.md` omits
`player`. One of them is wrong. Resolve against `GamePageWrapper.tsx` and fix the
loser.

---

## Appendix — zero-build games

```html
<script type="importmap">
{ "imports": {
  "chocabloc-questions":        "./assets/vendor/chocabloc-questions/full.mjs",
  "chocabloc-questions/bridge": "./assets/vendor/chocabloc-questions/bridge.mjs",
  "chocabloc-questions/host":   "./assets/vendor/chocabloc-questions/host.mjs"
}}
</script>
```

Vendored `.mjs` files **must be committed** — CI does not re-vendor. Add a
`vendor:questions` npm script so a lib bump is one command. The lib touches
`window` at module eval, so if you run node tests, wrap it in a browser-only
dynamic-import shim. And see §6 for the nginx `.mjs` MIME requirement.
