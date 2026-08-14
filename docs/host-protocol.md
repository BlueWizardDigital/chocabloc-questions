# ChocaBLOC Host Bridge Protocol — reference for game developers

This is the **full contract** between a ChocaBLOC game and the host portal: what data
the host gives you, what you report back, and how the wiring works. It's written so a
new game developer can understand everything available — questions, scoring/XP, saves,
grade, and player identity — without reading the platform source.

> **Canonical home.** Moved here from `chocabloc-game-template/docs/` on 2026-08-14.
> It documents *this library's* contract, so it is versioned with the library: a game
> pinned to a tag reads that tag's protocol. The template keeps a stub pointing here.
> Companion: [`architecture.md`](./architecture.md) (how the parts fit),
> [`MIGRATING-A-GAME.md`](./MIGRATING-A-GAME.md) (porting an existing game).

> **Source of truth.** This documents the live behavior of the host
> (`GamePageWrapper.tsx`) and the bridge SDK (`chocabloc-questions/bridge`).
> Where this doc and the SDK disagree, the SDK wins — and tell us, because it means
> this doc drifted. **Re-review this doc whenever the `chocabloc-questions` pin changes.**
>
> ⚠️ **A re-review is currently due.** The audited baseline is **`v0.6.0-beta.7`**; the
> pin is now **`v0.6.0-beta.8`** (Chocabloc and the game template are both on beta.8).
> The beta.7→beta.8 delta has **not** been audited against this document. Treat anything
> here as beta.7-accurate until someone does that pass.
>
> `v0.6.0-beta.6` added the
> **[Concepts](#concepts-grade-tiered-game-loop-rules)** channel (grade-tiered game-loop
> rules + play-session reporting). `v0.6.0-beta.7` added an optional client-side
> `chocabloc-questions/word-problems` text-rewriter — it is **not** part of this host
> contract (no `chocabloc:*` channel), so nothing here changed. The rest of the contract is
> unchanged from beta.4/beta.5.

---

## How a game talks to the host

Games run inside a **sandboxed same-origin iframe** (`sandbox="allow-scripts
allow-same-origin"`). All communication is `window.postMessage` using the `chocabloc:*`
message protocol. You don't call ChocaBLOC APIs directly — you ask the host, and the
host (which holds the session cookies + CSRF token) does it for you.

You consume the protocol through this library, not raw `postMessage`:

```bash
npm install chocabloc-questions@github:BlueWizardDigital/chocabloc-questions#v0.6.0-beta.8
```

Prefer the **`/host`** entrypoint (import-safe, fail-safe wrappers) over **`/bridge`**
(the raw adapter) — see [Use `chocabloc-questions/host`](#use-chocabloc-questionshost-not-raw-postmessage).
The one exception is `bridge.attachValidator`, which lives on `/bridge` only.

> Installing or bumping this Git-tagged pin has npm caching gotchas — see
> [`chocabloc-questions-upgrades.md`](chocabloc-questions-upgrades.md).

```ts
import { bridge } from 'chocabloc-questions/bridge';
```

Every bridge method is a **no-op when there's no host** (game opened directly, or host
didn't answer within 2s). The same code runs embedded and standalone — there is no
"standalone branch" to write.

### Handshake / lifecycle

```
game boots
  └─ bridge auto-posts  chocabloc:ready                       (game → host)
       └─ host replies   chocabloc:init { ...context }        (host → game)
            └─ bridge.onReady(ctx) fires with the context
  ...gameplay...
  bridge.started()       chocabloc:started                    (round begins)
  bridge.attempt(...)    chocabloc:attempt                    (each bank question answered)
  bridge.score(...)      chocabloc:score                      (level/round complete → XP)
  bridge.saveNotify()    chocabloc:save-notify                (after a localStorage write to sync)
  bridge.exit()          chocabloc:exit                       (optional, on explicit quit)
```

If `chocabloc:init` doesn't arrive within **2 seconds**, the bridge synthesizes a
standalone context (`standalone: true`) so the game never hangs.

---

## Minimum game responsibilities

A compliant game must, at minimum:

- [ ] **Boot standalone-safe** — playable with no host; never block waiting on `init`
  (the bridge falls back to standalone after 2s).
- [ ] **Signal round start** — `bridge.started()` when play begins (drives streaks).
- [ ] **Request questions through the host** — the `chocabloc:questions:request` channel
  (or `requestBankQuestions()` from `chocabloc-questions/host`), with a fixture fallback.
- [ ] **Emit attempts only for bank questions** — `bridge.attempt(...)` per answered bank
  question; never for game-local content.
- [ ] **Report score once** — `bridge.score(...)` exactly once, at terminal completion.
- [ ] **Persist to registered keys** — write progress to the `localStorageKeys` you
  declared, then `bridge.saveNotify()` after each write.
- [ ] **Clean up on exit** — stop timers, audio, and listeners.

Each item is detailed in the sections below.

---

## Inbound: what the host sends the game

### `chocabloc:init` — boot context

Sent once, in reply to `chocabloc:ready`. Delivered to your code via `bridge.onReady(ctx)`
and readable any time as `bridge.ctx`.

**What the host actually puts in the iframe `init` payload today:**

```ts
{
  isMobile: boolean,
  viewport: { w: number, h: number },
  gradeBand: string | null,   // ONLY "k2" | "3plus" — see note below
  grade:     number | string | null,   // fine grade, e.g. user.gradeLevel
}
```

The bridge normalizes this into `BridgeContext`:

```ts
interface BridgeContext {
  standalone: boolean;            // true = no host (degrade gracefully)
  isMobile: boolean;
  viewport: { w: number; h: number };
  gradeBand: string | null;
  grade: number | string | null;
  player: unknown;                // see "Player identity" — null for iframe games today
}
```

> **⚠️ Player identity is NOT delivered to iframe games.** The `player` field exists in
> the type, but the host's iframe `init` payload does **not** include it — so
> `bridge.ctx.player` is `null` for standalone/iframe games. A child's name/username is
> deliberately not pushed into the sandbox by default. See
> [Player identity](#player-identity-grade-name-xp) for what's available and what would
> need a platform change.

> **⚠️ `gradeBand` has exactly two values: `"k2"` and `"3plus"`.** Not `"3-5"`/`"6-8"`
> — those never existed. The host derives it with `deriveGradeBand()`
> (`Chocabloc/client/src/lib/game-config.ts:34`), which returns `"k2"` for kindergarten
> through grade 2 and `"3plus"` for everything else, defaulting to `"3plus"` when the
> grade is unknown. A game switching on `"6-8"` gets a branch that never fires. If you
> need finer granularity, read `ctx.grade` (the raw grade) instead.

### House rules a game must follow

Not protocol, but the host assumes them and nothing enforces them:

- **Don't touch the page around you.** No `document.title`, no viewport meta, no
  `window.location`, no browser-history writes. You are in a same-origin iframe, so a
  `window.location` write navigates *the game* out of itself, and a title change
  renames the portal's browser tab.
- **Render no header, title bar or back button.** The host supplies the chrome.
- **Audio needs a user gesture.** Browsers block autoplay, so a sound started on load
  simply won't play — the failure is silent and easy to mistake for broken audio.
  Start sound on the first tap/click/keypress, ship a mute control, and stop
  everything on teardown.
- **Clean up completely.** Timers, listeners, audio, `cancelAnimationFrame`, **and
  WebGL contexts** — browsers cap live contexts (~16), so leaking one per re-entry
  eventually kills the game with no obvious cause.
- **Not available, don't design around them:** real-time multiplayer (no socket
  infrastructure), cross-game progress sharing (each game's storage is its own world),
  custom XP curves (score→XP is platform-controlled), and trophies/badges (generic XP
  only).

**Use the context to *enhance*, never to *gate*.** If your game asks the player to pick a
grade/difficulty, prefer `ctx.grade`/`ctx.gradeBand` when present, but keep the manual
picker for standalone mode. Each game owns its own grade→difficulty mapping; the host
passes the raw signal through unchanged.

### `chocabloc:questions:deliver` — question pack

Reply to your `chocabloc:questions:request`. See [Questions](#questions).

### `chocabloc:validate:deliver` — server answer verdict

Reply to your `chocabloc:validate:request` (F6 server-side validation). See
[Answer validation](#answer-validation-f6).

### `chocabloc:concept:deliver` — resolved concept

Reply to your `chocabloc:concept:request`. Carries the grade-appropriate concept (game-loop
rules), or a `NO_CONCEPT` signal. See [Concepts](#concepts-grade-tiered-game-loop-rules).

### `chocabloc:concept-session:deliver` — rolled-up concept progress

Reply to your `chocabloc:concept-session:report`. Carries the player's accumulated
progress for the concept. See [Concepts](#concepts-grade-tiered-game-loop-rules).

---

## Outbound: what the game reports to the host

| Bridge call | Message | Payload | Send when |
|---|---|---|---|
| `bridge.started()` | `chocabloc:started` | — | Each round begins (after intro). Drives daily-streak tracking. |
| `bridge.attempt(p)` | `chocabloc:attempt` | `{ questionId, isCorrect, skillIds?, timeToAnswerMs?, studentAnswer?, answerToken? }` | A **bank** question was answered. **Skip for game-local quizzes** — only emit for questions that came from `questions:deliver`. |
| `bridge.score(p)` | `chocabloc:score` | `{ score, stars?, xp? }` | Level/round complete. Host treats this as "level complete" and **awards XP**. |
| `bridge.saveNotify()` | `chocabloc:save-notify` | — | After a `localStorage.setItem` you want mirrored to the `game_saves` table. |
| `bridge.exit()` | `chocabloc:exit` | — | Optional, on explicit "quit". Host also handles its own back button. |

Field notes the host enforces:
- `studentAnswer` on an attempt is only forwarded if it's a **string**.
- `answerToken` on an attempt makes the server **re-derive** `isCorrect` from the
  token-verified question and ignore the client flag (anti-cheat — see below).
- **Token-less attempts are non-authoritative.** Only **bank** questions (from
  `questions:deliver`) carry an `answerToken`; fixture-loaded and runtime-generated
  questions do not. For a signed-in player the host treats a token-less attempt as
  unverifiable and **will not record it as progress** (host-side `ATTEMPT_REQUIRE_TOKEN`
  enforcement, rolling out flag-first — currently off). So forward the `answerToken`
  whenever you have one, and design fallback rounds (fixture/generated) as **ungraded** —
  show an "offline — progress won't be saved" message rather than implying the round counts.
  This gate lives entirely host-side; **never re-implement attempt security in a game.**

---

## Questions

You never fetch questions directly. You ask the host; it resolves the game's recipe
(`games.default_recipe_slug` or `questionRecipe.slug`) and replies with **canonical
questions** ready to render with `<chocabloc-question>` or to read in your own renderer.

As of **`v0.6.0-beta.4`** the bridge owns question acquisition — call its methods rather
than posting raw messages:

- `bridge.requestQuestions({ count })` — **bulk** batch (board/pack games). Returns
  `Promise<unknown[]>`; `[]` on standalone / timeout / error / empty (never throws).
- `bridge.requestNextQuestion({ skillId?, recipeSlug? })` — **adaptive**, one at a time.
  Returns `Promise<unknown | null>`.

Embedded, the bridge runs the host question channel for you (pinning this game's gameId +
default recipe — you send neither); host-less but same-origin, it falls back to a relative
`fetch(/api/v1/games/:gameId/...)`. Both return canonical, **un-normalized** questions, so
keep applying your own `normalizeQuestion`. (Through `v0.6.0-beta.3` the bridge couldn't do
this — `requestNextQuestion()` hardcoded one game's URL and `requestQuestions()` wasn't on
the interface — so games hand-rolled the `postMessage` channel shown below; that's no longer
necessary.)

The raw `chocabloc:questions:*` protocol below is the **underlying contract** the bridge
implements, and the path for games built without the SDK.

> **Prefer `/host`** — you don't normally call the bridge directly. Use
> `requestBankQuestions(...)` (or `loadQuestions(...)` for the bank → fixture → generator
> top-up) from `chocabloc-questions/host`, which wraps `bridge.requestQuestions()` and
> adds the fallback chain.

### Bulk mode (request a batch up front)

```ts
// game → host
window.parent.postMessage(
  { type: 'chocabloc:questions:request', payload: { requestId, count: 20 } },
  '*'
);

// host → game
// { type: 'chocabloc:questions:deliver',
//   payload: { requestId, questions: CanonicalQuestion[], total, recipeSlug, gradeMap, ... } }
```

### Adaptive mode (one at a time, re-request after each answer)

```ts
window.parent.postMessage(
  { type: 'chocabloc:questions:request',
    payload: { requestId, mode: 'adaptive', skillId?, recipeSlug? } },
  '*'
);
// reply payload: { requestId, question: CanonicalQuestion, masteryState, gradeMap, source, ... }
```

The host **pins the gameId from its own registry manifest** — you cannot request another
game's questions. On error the deliver payload carries `{ requestId, error: { code, message } }`.

> **About `targetOrigin: '*'`.** These raw examples pass `'*'` for brevity. That's acceptable
> for an *outbound request* whose payload carries no secret. The **bridge does better**: it
> captures the parent origin from `init` and targets *that* (never `'*'`) for every subsequent
> post. Don't cargo-cult `'*'` into code that sends sensitive data — prefer the bridge/host
> facade, which pins the origin for you.

### Matching the reply to your request

Only treat a `questions:deliver` whose `payload.requestId` equals the `requestId` you
sent as yours; ignore everything else (concurrent/foreign messages). An empty
`questions` array or an `error` envelope means **fall back to your bundled fixture** —
and log loudly so a silent fallback never hides broken embedded delivery.

### Rendering

Render with the shared element (handles choice-building, theming, a11y):

```ts
import 'chocabloc-questions/full';
const el = document.createElement('chocabloc-question');
el.question = canonicalQuestion;     // PROPERTY, not setAttribute — objects stringify to "[object Object]"
el.addEventListener('answered', (e) => {
  const { isCorrect, choice } = e.detail;
  bridge.attempt({ questionId: canonicalQuestion.id, isCorrect,
                   skillIds: canonicalQuestion.skillIds, studentAnswer: choice.value,
                   timeToAnswerMs: performance.now() - shownAt });
});
```

Or read the canonical fields yourself (`normalizeQuestion` / `buildChoicePool` /
`validateAnswer` from `chocabloc-questions/helpers`) for a canvas/Phaser renderer.

---

## Concepts (grade-tiered game-loop rules)

> Added in **`v0.6.0-beta.6`**. Consumed via `requestGameConcept()` /
> `reportConceptSession()` from `chocabloc-questions/host`. Use it for a game built on
> open-ended generated content rather than a fixed question bank —
> `greater-than-gator` is the reference consumer. `chocabloc-game-template`'s example
> quiz uses [Questions](#questions), not concepts, so it is not a worked example of this
> channel.

A **concept is not a question.** Where the question channel hands you ready-made items to render,
a concept hands you the **rules of a game loop** — an `archetype` plus `params`, `validity`
constraints, and optional `seeds` — that your game consumes to *generate and client-side-validate
its own rounds*. Use it when the mechanic is open-ended (endless-generator, sandbox, level builder)
rather than a bank of pre-authored questions.

Like questions, both calls are **no-ops without a host** (return `null`) and **never throw**.

### Resolve the concept

```ts
import { bridge } from 'chocabloc-questions/bridge';
const concept = await bridge.requestConcept();   // ResolvedConcept | null
```

Posts `chocabloc:concept:request`; the host replies `chocabloc:concept:deliver`. The endpoint
takes **no client-supplied grade** — the server resolves the grade-appropriate concept from the
session (`req.user.gradeLevel`). Returns `null` on standalone, timeout, or `NO_CONCEPT`. Host-less
but same-origin, it falls back to a relative `fetch(/api/v1/games/:gameId/concept)`; the `gameId`
option is used **only** by that fallback and is ignored when embedded (the host pins it).

```ts
interface ResolvedConcept {
  concept_id: string;
  category_id: string | null;
  common: Record<string, unknown>;
  archetype: string;                      // which game-loop template
  params: Record<string, unknown>;        // knobs the game reads
  validity: Record<string, unknown>;      // client-side answer constraints
  seeds: unknown[];                        // optional starting content
  resolved: { via: 'pinned' | 'category'; grade: string | null; matchedGrade: number | null };
}
```

> **Deliberate mixed casing.** The top-level fields are **snake_case** (the server emits them
> verbatim); the `resolved` sub-object is **camelCase**. This is the raw wire shape — do **not**
> add a camelCase transform (adapters are forbidden). `grade` is the player's effective grade
> (session-derived); `matchedGrade` is the concept's own `grade_suggestion`.

### Report a play-session

```ts
const progress = await bridge.reportConceptSession({
  timePlayedMs, levelsCompleted, xpEarned, correctCombos, clientSessionId,
});   // ConceptProgress | null
```

Posts `chocabloc:concept-session:report`; the host replies `chocabloc:concept-session:deliver` with
the rolled-up progress. **Requires a prior `requestConcept`** so the host has a resolved conceptId to
attribute the session to — the host **pins the conceptId + gameId**; an iframe cannot report against
another game's concept. **No fetch fallback** (the write needs the host's session + CSRF), so this
returns `null` when standalone. Every field is optional and **server-clamped** (`timePlayedMs`
0–24h, `levelsCompleted` 0–10000, `xpEarned` 0–1M, `correctCombos` 0–100000).

```ts
interface ConceptProgress {
  totalTimePlayedMs: number;
  totalLevelsCompleted: number;
  totalXp: number;
  sessionsCount: number;
  lastPlayedAt: string | null;
}
```

> **XP note.** As with `bridge.score` (see [Scoring & XP](#scoring--xp)), `xpEarned` here is
> game-supplied and server-authoritative XP is still a pending redesign — don't build a
> leaderboard-grade feature on it without coordinating with the platform team.

### Via the host kit

`chocabloc-questions/host` re-exports both as fail-safe wrappers: `requestGameConcept(opts?)` and
`reportConceptSession(payload)` (thin pass-throughs for host-kit symmetry).

---

## Answer validation (F6)

When the server drops local answers (`F6_DROP_ANSWER=true`), questions arrive with
`choices` + an opaque `answerToken` (15-min TTL) and **no `answer`**. You can't compare
locally — the host validates server-side on your behalf:

```ts
// Easiest: let the element do it
bridge.attachValidator(el, canonicalQuestion);   // no-op if no answerToken (pre-F6) — safe to always call

// Custom renderer: call it yourself
const { isCorrect, expected, distractorMatched } =
  await bridge.validateAnswer({ answerToken, studentAnswer });
```

Under the hood: `bridge.validateAnswer` posts `chocabloc:validate:request`; the host
POSTs `/api/v1/answer/validate` with its own session + CSRF and replies with
`chocabloc:validate:deliver`. The iframe never needs cookies or CSRF.

**Handle the failure classes** (import from `chocabloc-questions/bridge`) — never treat a
transport failure as "answer was wrong":

| Class | Meaning | UX |
|---|---|---|
| `InvalidTokenError` | Token forged / wrong question / wrong user | Refetch question + retry |
| `ExpiredTokenError` | 15-min TTL elapsed | Refetch question + retry |
| `BridgeTimeoutError` | Host didn't reply in 5s | Retry button + log to monitoring |
| `BridgeStandaloneError` | No host present | Disable F6 flow (standalone has no tokens anyway) |
| `MalformedResponseError` | Reply shape unexpected | Visible failure + alert |

> Same-origin iframes only (introduced in v0.5, still in effect as of v0.6.0-beta.4). F6
> cross-origin (externally hosted games) is deferred.

---

## Scoring & XP

```ts
const { stars, xp } = deriveStarsAndXp(score, XP_REWARD);   // your pure helper
bridge.score({ score, stars, xp });
```

- The host treats `chocabloc:score` as **level complete** and fires the XP pop animation.
  Signed-in players get real XP awarded; guests get an incentive pop (no XP stored).
- **Send `score` only at the terminal state** — sending early awards XP while the player
  keeps going.
- **Derive `stars`/`xp` game-side** with a pure, testable helper. Normalize to
  `score` 0–100, `stars` 1–3.
- **Trust caveat:** today the host trusts game-supplied `xp` (server-authoritative XP is
  a pending redesign — `GAME-XP-TRUST.md`). Don't build a leaderboard-grade feature on
  this number without coordinating with the platform team.

Per-question analytics go through `bridge.attempt(...)` and feed **skill mastery**. Only
emit attempts for **bank** questions. If you send `answerToken` on the attempt, the
server re-derives correctness from the token (closes the forge-`isCorrect:true` hole).

---

## Saves (resume)

Saves are a **two-layer model**: your game always writes `localStorage`; the host
*additively mirrors* registered keys to the server **only for authenticated child
accounts**.

```ts
localStorage.setItem('my-game-progress', JSON.stringify(state));
bridge.saveNotify();   // call after every write you want synced; never on read paths
```

Your game does only this. It does **not** know whether the player is signed in — the host
decides whether to persist server-side.

**Who gets a server mirror:**

| Player | localStorage | Server (`game_saves`) |
|---|---|---|
| Guest (not signed in) | ✅ always | ❌ |
| Parent / teacher account | ✅ always | ❌ (not a `child` userType) |
| Child account | ✅ always | ✅ for keys in the manifest's `localStorageKeys` |

The gate is `user.userType === "child"` — **not** parent/classroom linkage. A child account
syncs regardless of whether a parent or classroom is attached.

**How the mirror works (host-side):**
- Registered keys are bundled into `{ keys, syncedAt }`, base64-encoded, and saved to an
  autosave slot per game per user.
- **Merge is last-write-wins by `syncedAt`.** On mount the host loads the server save; if
  it's newer than local, server keys overwrite `localStorage` (cross-device resume);
  otherwise local wins.
- Sync fires on exit, tab-hide, level-complete, and your `save-notify` (default
  `"lifecycle"` mode). Set `saveSync: "on-write"` in the manifest to also sync on every
  registered `localStorage.setItem` (debounced ~3s) for autosave-heavy games.
- Guest→child **migration** uploads existing local saves once on account creation/login;
  child **logout** clears registered keys (shared-device hygiene).
- Sync is fire-and-forget; a failed sync never blocks gameplay.

**Declare your keys.** List every key you want mirrored in the registry manifest's
`localStorageKeys`. Unlisted keys stay local-only for everyone.

> **Trust:** the server stores whatever blob the client sends (no server-side validation
> of save contents — same posture as game-supplied XP). Don't put anything
> security-sensitive in a save value. For a casual anti-tamper deterrent on
> currency/unlocks, sign the payload client-side (the template's `kit/save/integrity`
> does this) — but treat it as a speed bump, not a security control.

Standalone (no host / not a child account), the same `localStorage` round-trips locally.

---

## Player identity (grade, name, XP)

What you can know about the player, and from where:

| Field | iframe game (via this lib) | in-tree React-component game |
|---|---|---|
| `grade` | ✅ `bridge.ctx.grade` (from `init`) | ✅ `player.grade` prop |
| `gradeBand` | ✅ `bridge.ctx.gradeBand` | ✅ derived |
| `displayName` (name) | ❌ not sent | ✅ `player.displayName` (`= displayName ?? username`) |
| `realm` (sprout/adventure/thunder) | ❌ not sent | ✅ `player.realm` |
| `avatarIndex` | ❌ not sent | ✅ `player.avatarIndex` |
| `xp` (lifetime total) | ❌ not sent | ✅ `player.xp` |
| `userId` / raw PII | ❌ never | ❌ never |

**Grade is exposed; identity is not** — by design. The iframe is a sandbox and some games
are externally authored, so a child's name/username is not pushed in by default
(least-privilege, COPPA-shaped).

**If a game genuinely needs the player's name** (e.g. a greeting), that requires a
platform-side change: add `player` to the iframe `init` payload in `GamePageWrapper.tsx`.
Recommended constraints if/when that's done:
- send **`displayName` only**, never the raw `username`;
- gate it to **first-party** games;
- frame it as personalization, not identity, and never log it inside the game.

Until that change ships, design your game to work with **grade only** for identity, and
treat name/avatar as nice-to-have that's currently absent.

---

## Security model (what the platform enforces)

- **Source check both ways.** Host only accepts messages from its own iframe window;
  the bridge only accepts messages from `window.parent`. Blocks sibling iframes, popups,
  openers, extensions.
- **Origin pinning.** Same-origin only (the current bridge/host behavior, introduced in
  v0.5 and still in effect); the bridge captures the parent origin from `init` and targets
  it (not `*`) for subsequent posts.
- **gameId pinning.** The host pins your gameId from its registry manifest — payloads
  can't request another game's questions (no confused-deputy).
- **Answer integrity.** F6 `answerToken` lets the server re-derive correctness, so an
  iframe can't forge `isCorrect: true` to corrupt mastery/XP.

You don't implement any of this — it's the host + bridge. Your job is to **not** defeat
it: don't hard-code a parent origin, don't fabricate attempts, don't reach into the
question element's shadow DOM.

---

## Known rough edges (so they don't surprise you)

1. **Set `base: './'` in `vite.config.ts`.** Vite's default `base: '/'` makes built
   assets load from the portal root and the iframe dead-screens. This is the #1 pitfall.
2. **`question` is a property, not an attribute** on `<chocabloc-question>`.

> Resolved in `v0.6.0-beta.4`: `bridge.requestNextQuestion()` no longer hardcodes a single
> game's URL, and `bridge.requestQuestions()` is now a real `Bridge` method — so the old
> "post the raw message instead" guidance no longer applies. See [Questions](#questions).

---

## Use `chocabloc-questions/host`, not raw postMessage

Everything above is wrapped by the **`/host` entrypoint of this library** — a
framework-free, fail-safe facade. Prefer it over `/bridge`: `/bridge` is the raw
protocol adapter, `/host` is the API you're meant to build against.

```ts
import { whenHostReady, checkAnswer, reportAttempt } from 'chocabloc-questions/host';
```

Exports (`src/host.ts`):

```ts
hostContext(): BridgeContext                          // sync snapshot
whenHostReady(timeoutMs = 1500): Promise<BridgeContext>  // resolves on init, or falls back to standalone
notifyStarted()                                       // bridge.started
requestBankQuestions(count): Promise<NormalizedQuestion[]>
requestNextBankQuestion(...)                          // adaptive, one at a time
loadQuestions(deps, opts)                             // 3-tier top-up: bank → fixture → generator
checkAnswer(question, answer): Promise<boolean>       // local compare OR F6 server validation, transparently
reportAttempt(payload)                                // bridge.attempt — bank questions only
reportScore(payload)                                  // bridge.score
notifySave()                                          // bridge.saveNotify
requestGameConcept(...) / reportConceptSession(...)   // the concept channel
```

The reporting helpers are deliberately fire-and-forget: they never throw, so a host
outage cannot take the game down with it.

> **Why two entrypoints.** `/bridge` touches `window` at import and will crash a plain
> Node test runner. `/host` is import-safe and reaches the bridge lazily, so it can be
> imported from code under test. If you do import `/bridge` directly, confine it to a
> single module and fence it with a lint rule — that is what
> `chocabloc-game-template` does in `src/kit/host/bridge.ts`.
