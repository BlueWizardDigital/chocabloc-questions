# Changelog

All notable changes to chocabloc-questions are documented here.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

## [0.6.0-beta.19] — 2026-10-05

**Patch**: six pictures no longer show the child the answer, and four pictures that pointed at a
wrong answer, mislabelled their measures or were too small to read are redrawn. No export,
attribute, part or CSS var added, renamed or removed. Recipes named below are from server-new's
`recipes.json`.

### Fixed

- **`geometry_symmetry` no longer draws the lines of symmetry.** "How many lines of symmetry does
  a hexagon have?" drew `lines_of_symmetry` dashed lines through the shape, so the child could
  count the answer. It now draws the shape only, the same picture as "What shape is this?",
  except the trapezoid: the usual one is isosceles (1 line of symmetry) but the bank's trapezoid
  rows answer 0, so these questions draw a right trapezoid, which has none. The other seven
  shapes already had exactly as many lines as their answer. **Visible change for games serving
  GEOM-SYMMETRY-BASIC** (`bloc-hero-geo`, `geometry-blocs-default`).
- **`base10_block_count` has no picture.** "How many tens blocks are in 6378?" drew 6378 in blocks
  with the tens highlighted, so counting the highlighted blocks gave the answer. The stem names
  the number, so the canvas is now cleared and hidden, as for `geometry_attributes` in beta.18.
  A row with no question text gets a stem that names the number ("How many tens blocks are in
  347?"). **Visible change:** no picture on these questions; no recipe serves BASE10-BLOCK-COUNT
  today. A page that sets `display` on `::part(canvas)` overrides `hidden` and shows an empty box.
- **`geometry_face_identify` highlights the face it asks about, and never names it.** The stem is
  "What shape is the highlighted face of this pyramid?". Only the cube and the rectangular prism
  had a highlighted face; the other six rows (pyramid ×2, triangular prism ×2, cylinder, cone)
  printed `face: <answer>` under the shape instead. Every row now fills and outlines its face,
  and nothing is written. A pyramid and a triangular prism have two kinds of face, so
  `face_shape` picks which one: the pyramid's square base or a triangular side, the prism's
  triangular end or a rectangular side. Without the highlight those rows can't be answered,
  because each offers the shape's other real face as a wrong choice. A face the shape doesn't
  have gets no highlight. **Visible change for games serving GEOM-3D-FACES-IDENTIFY**
  (`bloc-hero-geo`, `geometry-blocs-default`).
- **`geometry_circle_convert` labels the measure the question gives.** It always drew a radius
  labelled `r=`, halving the value when the row gave a diameter, so "A circle has a diameter of
  48. What is the radius?" showed `r=24`. Half of GEOM-CIRCLE-RADIUS-DIAMETER's rows give a
  diameter. A given diameter now draws the diameter, labelled `d=48`; a given radius still draws
  `r=`. An unknown `given_type` draws the circle with no label. **Visible change for games
  serving GEOM-CIRCLE-RADIUS-DIAMETER** (`geometry-blocs-default`).
- **`geometry_angle_classify` draws every angle in one colour.** Acute was green, right blue,
  obtuse orange and straight purple, so after a few rounds the colour was the answer. Every angle
  is now green. The degree label stays: the stem gives it, and 89° and 90° look the same.
  **Visible change for games serving GEOM-ANGLE-CLASSIFY** (`geometry-blocs-default`).
- **A number-line multiplication no longer prints the product.** Every tick was labelled, and
  the last jump lands on the product, so "(-6) × 4 = ?" ended at `-24`. That tick now reads `?`;
  the others keep their values. A product of 0 lands on the start tick, which keeps its `0`.
  **Visible change for INT-MULT-NUMBER-LINE rows**; no recipe serves that skill today.
- **`geometry_classify_triangle` draws the triangle its row describes.** "Classify this triangle
  by its sides." drew the same unlabelled equilateral triangle for every row, which pointed at a
  wrong answer for 12 of GEOM-CLASSIFY-TRIANGLES' 18 rows. It now draws the triangle the three
  sides or three angles make, to scale and sitting on its longest side, with each side or angle
  labelled. The type is never written. Sides that can't close, angles that don't add to 180, or
  an unknown `classify_by` get no picture (canvas hidden) rather than a wrong one. **Visible
  change for games serving GEOM-CLASSIFY-TRIANGLES** (`geometry-blocs-default`).
- **`geometry_area` draws triangles, parallelograms and trapezoids as themselves.** All three were
  drawn as a rectangle from the first two numbers. Each is now its own shape, to scale, with its
  base (or both bases) labelled and its height drawn as a labelled dashed line. A parallelogram's
  slant side is not labelled, because the question doesn't give it. The area is never drawn.
  Rectangles, circles and compound shapes are unchanged. **Visible change for games serving
  GEOM-AREA-TRIANGLE, -PARALLELOGRAM or -TRAPEZOID** (`geometry-blocs-default`).
- **Volume and surface-area pictures label what the question gives.** Every shape but a cylinder,
  cone or sphere was labelled `l=`, `w=`, `h=` in order. A triangular prism's volume ("base area 16
  and height 10") now reads `base area=16` and `h=10`; its surface area ("base 7, height 2, and
  length 3") reads `b=7`, `h=2` on a dashed triangle height, and `l=3`; a pyramid's surface area
  ("base side 10 and slant height 5") reads `side=10` and `slant=5` on a dashed slant line. A
  box's `l`, `w` and `h` now sit on the edges they measure, and every label stays on the canvas.
  A pyramid's volume has no rows yet, so it gets no labels rather than a guess. **Visible change
  for games serving these skills** (`geometry-blocs-default`).
- **The pyramid is drawn at a readable size.** It filled half the canvas height and its base was an
  18px strip. It now fills about 70% of the height, with a parallelogram base about 40px deep, so
  the face-identify base highlight reads as a face. **Visible change wherever a pyramid is drawn**
  (name, properties, face identify, surface area: `bloc-hero-geo`, `geometry-blocs-default`).

## [0.6.0-beta.18] — 2026-10-05

**Patch**: two shape-picture fixes. No export, attribute, part or CSS var added, renamed or
removed.

### Fixed

- **`geometry_attributes` no longer draws the answer.** "Which shape has …?" drew `answer` as
  its picture. Bank rows are choices-only and carry no `answer`, so the draw threw before the
  choices rendered, and the child saw the question with no buttons. Rows that do carry `answer`
  (assignment snapshots) drew the correct shape under the question. This format now has no
  picture: the canvas is cleared and gets the `hidden` attribute, so there is no empty box
  between the prompt and the choices. **Visible change:** no picture on these questions. A page
  that sets `display` on `::part(canvas)` overrides `hidden` and will show an empty box.
- **`geometry_perimeter` draws the shape its sides describe.** It always drew a rectangle from
  the first two operands, so "Side lengths: 2, 6, 17, 3" showed a 2 × 6 rectangle. Two operands
  (GEOM-PERIMETER-RECTANGLE and -DECIMAL: length and width) still draw a rectangle to scale.
  Three to six (GEOM-PERIMETER-POLYGON: triangle to hexagon) now draw an outline with that many
  sides, each labelled with its length, in order. The outline is not to scale, because bank side
  lists often can't close a real shape (a triangle with sides 20, 2, 9). The perimeter is never
  drawn. **Visible change for games serving GEOM-PERIMETER-POLYGON** (`geometry-blocs-default`).

## [0.6.0-beta.17] — 2026-10-05

**Minor**: new exports and an optional field; nothing renamed or removed.

### Added

- **`chocabloc-questions/concept-run`: a shared concept saver.** `createConceptRun({ report,
  concept, perConcept? })` counts active play only (2-minute input-gap cap; nothing while
  hidden or paused). It reports in pieces (1-minute checkpoints, tab hide, abandon, finish)
  under one `clientSessionId` per run, with whole numbers only, at most once per piece, and
  never throws into the game. It replaces each game's own report code.
- `ConceptSessionPayload.conceptId` (optional), for per-sub-topic filing. The host already
  forwarded it.
- `<chocabloc-question>` re-exports its inner renderer's `container`, `prompt`, `canvas` and
  `choices` parts (`exportparts`), so a page's `::part` theme reaches them. Upstreamed from
  Greater Gator's local patch. **Visible change:** an existing
  `chocabloc-question::part(prompt|container|canvas|choices)` rule now also styles canvas and
  coin-pile questions, not just text-only ones. Check consumers that theme those parts;
  Adventure 101 does (`overlay.css`).

### Fixed

- Docs said the server **clamps** session values; it **rejects** them (400). Corrected in the
  `ConceptSessionPayload` comment and `docs/host-protocol.md`. That page also no longer
  says the host pins the conceptId; it pins the gameId.

## [0.6.0-beta.16] — 2026-09-30

beta.14 and beta.15 were tested against hand-built rows. The platform's real
choices-only wire is different: `answer` and `distractors` are TEXT columns, so
every choice value is a **string**. Coin sets arrive comma-joined
(`"loonie,quarter,toonie"`, `""` for none), money arrives as cents (`"975"`), and
the content allow-list drops `currency`. The server checks a pick with an exact
string compare, so every fix below is display-only and reports the value
unchanged. Found by checking Monkey Money (Trello 312) against
`serializeQuestionForGame` output.

### Fixed

- **Choices-only `money` / `money_count_mixed` rows draw their coins.** They
  skipped `normalizeMoneyRow`, kept their raw format, and went to the canvas
  renderer, which drew nothing ("2 loonies = ?" with no coins). They now normalize
  to `money` the same way, with currency from `content.currency` or the
  `-USD`/`-CAD` skill id (still an error when neither says). `choices` and
  `answerToken` are kept.
- **Money labels format cents sent as strings.** `formatAnswerForDisplay('975',
  'money')` printed `975`; it now prints the same as `975` the number. Only
  whole-number strings count. CAD keeps the existing `CA$` convention.
- **Coin-set answers draw as coins on the real wire.** With `coin-choices`, the pad
  reads a comma-joined string of coin names as a set, so `"loonie,toonie"` draws two
  coins, `"loonie"` one, and `""` reads "None" (it was a blank button).

### Changed

- **`coin-choices` is now set only for `money_coin_colour`.** The normalizer marks it
  with the new `TextOnlyQuestion.content.coinChoices`, and `<choca-coin-pile>` reads
  that flag instead of turning the mode on for every coin scene. On the real wire a
  colour answer of one coin (`"toonie"`) looks the same as a coin-name answer, so
  only the format can tell them apart. Coin-name, -size and -denomination answers
  stay text.

## [0.6.0-beta.15] — 2026-09-30

### Fixed

- **`formatAnswerForDisplay` only formats a pair of numbers as a coordinate.** Any
  two-item list became `(a, b)`, so a two-coin `money_coin_colour` answer read like a
  point: `(toonie, toonie)`. 27 of that skill's 100 bank questions have two coins.
  Other lists printed with no spaces (`nickel,dime,quarter`). Lists now read
  `toonie, toonie` and `nickel, dime, quarter`, and an empty list reads `None` (it was
  blank; every `money_coin_colour` row ships an empty-list distractor). `[8, -4]` still
  formats as `(8, -4)`. Bank coordinate answers are strings like `"(9, 10)"` and pass
  through unchanged. **Visible change** in choice labels for list answers. Coin
  scenes already draw coin lists as coins (beta.14); this covers the text path, e.g.
  a coin question that arrives with no usable coins.

## [0.6.0-beta.14] — 2026-09-30

"Which of these coins are silver?" (`money_coin_colour`) showed its answers as
`nickel,quarter,toonie,nickel`. Its answers are lists of coins, and the choice pad
printed every value with `String()`. Reported from Monkey Money (Trello 312).

### Added

- **`coin-choices` attribute on `<choca-choice-pad>`.** A choice whose value is a list
  of coin names draws as a row of coins, in pile order with repeats kept, using the
  game's existing `--cq-coin-<denom>-img` vars. The button's `aria-label` names the
  coins; an empty list reads "None" (it rendered a blank button). Single coin names and
  lists holding anything else stay text. New parts `choice-coins`, `choice-coin`,
  `choice-coin-<denom>`; new vars `--cq-choice-coin-size` (32px) and
  `--cq-choice-coin-gap` (4px). See `PARTS-AND-VARS.md`.
- **`<choca-coin-pile>` turns it on for coin scenes** (text questions with a
  `coinScene`). Money questions (numeric answers) and every other format are
  unchanged. **Visible change for games serving `money_coin_colour`.**

## [0.6.0-beta.13] — 2026-09-24

A `geometry_properties` question about a 2D shape drew a grey "?" instead of the shape. Grade K
is the only grade that serves these, so this is the first grade whose geometry content renders.

### Fixed

- **`geometry_properties` routes on `imageType`, not unconditionally to 3D.**
  `ChocaCanvasQuestion` sent every `geometry_properties` row to `drawShape3D`, whose shape list
  is cube / rectangular prism / sphere / cylinder / cone / pyramid / triangular prism. `circle`
  and `square` fell through to its `fillText('?')` default, so "How many sides does a circle
  have?" showed no circle. A row with `imageType: 'shape_2d'` now draws with `drawShape2D`;
  everything else still draws with `drawShape3D`, so "How many faces does a cube have?" is
  unchanged.
- **The normalizer keeps the `image_type` the bank sent.** `normalizeGeometryPropertiesRow`
  hardcoded `imageType: 'shape_3d'`, discarding `shape_2d` before the renderer could see it. It
  now resolves it the way `geometry_classify` does — `resolveImageType(r, ['shape_2d',
  'shape_3d'])`, falling back to `shape_3d` when the row carries none or carries an unrecognised
  value. Rows that arrive on the choices-only (F6) path were already passing `shape_2d` through
  untouched, so the renderer fix alone is what moves the live Adventure 101 build; this one
  fixes the answer-bearing path.

### Changed

- **`GeometryPropertiesQuestion['imageType']` widens from `'shape_3d'` to `'shape_2d' |
  'shape_3d'`.** Type-level only and additive — existing `shape_3d` values still typecheck. A
  consumer that narrowed on the old literal (e.g. assigned `q.imageType` to a `'shape_3d'`
  variable) will need to widen with it.

## [0.6.0-beta.12] — 2026-09-24

Two defects in the whiteboard's stacked-math template, found while wiring Adventure 101's
whiteboard to the live question.

### Added

- **`StackedMathLayout.maxDecimals`.** Decimals in the longest fractional part, `0` when no
  operand has one. `maxDigits` keeps its name and meaning but now counts the **integer part
  only** — the same number for integer-only input, so no existing consumer moves.

### Fixed

- **The operator is drawn beside the last operand, not operand index 1.** A three-addend stack
  put the sign next to the middle row. Two-operand stacks are unaffected (`length - 1` is still
  `1`), and the canonical 2-operand draw sequence is asserted unchanged as a back-compat golden.
- **Decimal operands parse and render.** `parseMathExpression` was integer-only, so
  `4.39 + 26.86` returned `null` and the board stayed blank. Operands now take an optional
  fractional part; a bare point (`.5`), a trailing point (`4.`) and a second point (`4.3.9`)
  are still malformed and still reject.
- **Decimal operands align on the decimal point, not the right edge.** Right-aligning `4.5`
  under `26.86` put the 5 in the hundredths column, so adding down the columns gave a wrong
  answer by construction. The shorter operand is **not** zero-padded — annexing the zero is the
  step the child is practising. An integer mixed into a decimal stack parks its units digit on
  the ones column.

### Note

- Widening the operand pattern also widened the long-division branch: `5.5 / 2` now parses as
  `long-division` where it returned `null`. **Inert** — nothing renders that layout, and
  `setMathExpression` rejects every non-stacked kind, so this changes only which error reason a
  consumer sees.

## [0.6.0-beta.11] — 2026-09-23

Grade K–2 rendering gaps reported by Adventure 101 (2026-09-23). Grade K lost ~60% of its
bank pool to these.

### Added

- **`TextOnlyQuestion.content.coinScene?: MoneyContent`.** `money_coin_colour`, `_denomination`,
  `_name` and `_size` rows still normalize to `text` (string answers, plain choice labels), but
  now carry the coins to show. `<chocabloc-question>` renders a text question that has a
  `coinScene` through `<choca-coin-pile>`, so "Which of these coins is the largest?" shows the
  coins. The game still supplies coin images through the existing per-denomination CSS vars.
  The bank's `coins: ["nickel", ...]` list becomes a name → count map; unknown names are
  dropped; currency comes from `content.currency`, else the skill-id suffix. No coins, or no
  currency → no scene (text only, as before). In a scene, coins are labelled "coin" for
  screen readers, not by name, since the name is often the answer.

### Fixed

- **F6 (`choices`-only) rows now get the same format routing as answer-bearing rows.** They
  used to keep their raw `format`, so plain arithmetic (`addition`, `multiplication` with no
  visual `imageType`, …) went to the canvas renderer instead of rendering as text. Stem formats
  and non-visual multiplication now normalize to `text`; `choices` and `answerToken` are kept.
  Unknown formats still pass through unchanged. **Visible change for F6 consumers.**
- **A pattern row with no `sequence` no longer crashes the renderer.** The normalizer turns it
  into a `text` question when it has `questionText` (the bank puts the pattern there), and still
  throws when it has neither. `<choca-pattern-question>` also guards on its own: with no
  sequence it hides the sequence row, shows the prompt and choices, and `console.warn`s.

## [0.6.0-beta.10] — 2026-09-23

### Fixed

- **A repeated placeholder now names the same thing twice.** `resolveContext` excluded
  already-used words per *base* key, so a template using `{ingredient}` twice rendered two
  different words — "gathered 34 enchanted berries ... How many moonpetal were collected?".
  The choice is now memoised per full placeholder name, while distinct keys sharing a base
  (`{item}` vs `{item2}`) keep preferring distinct words. 229 of 830 templates repeat a
  placeholder, across 78 of 142 skills; `{name}` repeats in 85 of them, so the character
  could change mid-question.
- **Singular/plural no longer inherits a cue from the previous sentence.** `pluralCount`
  scanned back over the whole stem, so "... added 1 more. How many {item} ...?" and
  "... more for the potion. How many {ingredient} ...?" both rendered singular. The scan now
  stops at the nearest `.`, `!` or `?`. The word lists were not at fault: only 3 of 429 pool
  entries lack a slash form, and two of those (`deer`, `fish`) are correct invariant plurals.
- **A role directly before a person's name is treated as a title, so it stays singular.**
  "cartographers Olivia" now renders "cartographer Olivia". The name pool is derived from
  `characters.names` rather than a hard-coded `{name}`, so any name slot the data defines is
  recognised. This also corrects six templates that were already wrong before the plural
  change ("explorers Emma was tallying ...").

## [0.6.0-beta.9] — 2026-08-17

### Added

- **The library now owns the host protocol and architecture docs.** `docs/host-protocol.md`
  (the full `chocabloc:*` contract), `docs/architecture.md` (how host / bridge / `/host`
  facade / game fit together, and who holds security) and `docs/MIGRATING-A-GAME.md` moved
  here from the game template. They describe *this library's* contract rather than any one
  game's implementation of it, so they now version with the pin: a game on a given tag reads
  that tag's protocol doc. The template keeps stubs at both paths, so existing references
  still resolve.
- The move corrected drift the template had accumulated: `architecture.md` §7 was a spec for
  lifting the host glue out of the template and into this library, which shipped in
  `v0.6.0-beta.5` — so §1, §4 and §5 still described a `src/kit/` layout that no longer
  matched. They now describe the `chocabloc-questions/host` entrypoint that actually does
  the work.

### Fixed

- **The contract docs are now included in the published package.** `files[]` excluded
  `docs/`, so `node_modules/chocabloc-questions/docs/` did not exist and the package-relative
  paths consumers are pointed at would not have resolved at any tag. The three contract docs
  are listed explicitly, keeping the internal `docs/superpowers/` plans and specs out of
  every consumer's install.

## [0.6.0-beta.8] — 2026-07-17

### Fixed

- **Text-format (choices-only) stem was invisible inside a light-colored host
  container.** `ChocablocQuestion`'s `text`-format fallback render path never
  pinned a text `color`, so the stem inherited the surrounding cascade — e.g. a
  host "Try Again" modal that set a near-white content color made the stem
  disappear, while the choice pad (its own shadow root already pins `--cq-text`)
  stayed readable. The fallback `:host` now sets `color: var(--cq-text, #222)`,
  matching every other format element. Hosts can still override via `--cq-text`.

## [0.6.0-beta.7] — 2026-07-15

### Added
- **Word-problem support (optional, tree-shakeable).** New `chocabloc-questions/word-problems`
  subpath: `createWordProblemEngine(data).applyWordProblem(rawRow)` rewrites a raw question's
  `questionText` into a themed, seeded word problem without changing the math. A compatibility
  gate rejects any template that would drop an operand or reveal the answer, so numbers, answer,
  distractors, skill, and format always pass through untouched. Data is injected and agnostic —
  bring your own templates + context, or import `chocabloc-questions/word-problems/sample-data`.
  `loadWordProblemData()` fetches per-project data by URL. No compatible template → the original
  question is returned unchanged (or `strict: true` throws `WordProblemError`). `analyzeDataset()`
  and `npm run wp:validate` statically check a dataset.

## [0.6.0-beta.6] — 2026-07-09

### Added

- **Concept channel (grade-tiered, open-ended game content).** A concept is NOT
  a question — it carries game-loop *rules* (`archetype` + `params` + `validity`
  + `seeds`) the game consumes to generate and client-side-validate its own
  rounds. New bridge + host-kit surface:
  - `bridge.requestConcept(opts?)` — resolve the grade-appropriate concept for
    this game over the host's `chocabloc:concept:request` / `:deliver` channel
    (host-pinned gameId; the endpoint takes NO client grade — the server resolves
    it from the session). Same-origin relative-fetch fallback for host-less
    deployments. Returns `ResolvedConcept | null` (null on standalone / timeout /
    `NO_CONCEPT`; never throws).
  - `bridge.reportConceptSession(payload)` — report a play-session over the
    `chocabloc:concept-session:report` / `:deliver` channel and get back the
    rolled-up `progress` block. Host pins the conceptId + gameId (an iframe can't
    report against another game's concept). NO fetch fallback — the write needs
    the host's CSRF/session. Returns `ConceptProgress | null`.
  - Host-kit: `requestGameConcept()` + fail-safe `reportConceptSession()`.
  - Types exported from `chocabloc-questions/bridge` + `/host`:
    `RequestConceptOptions`, `ResolvedConcept`, `ConceptResolvedMeta`,
    `ConceptSessionPayload`, `ConceptProgress`.

## [0.6.0-beta.5] — 2026-06-29

### Added

- `chocabloc-questions/host` — new framework-free **host-kit** entrypoint that
  wraps the bridge with the glue every game needs: `hostContext` /
  `whenHostReady` / `notifyStarted` (safe boot, standalone-synthesized),
  `reportAttempt` / `reportScore` / `notifySave` (fail-safe progress reporting —
  telemetry never crashes the game), `checkAnswer` (local compare vs F6 server
  validation; a missing validator or transport failure never counts as correct),
  and `requestBankQuestions` / `requestNextBankQuestion` / `loadQuestions` (bulk
  + adaptive-single fetch, plus a bank → fixture → generate loader with the
  fixture/generator injected per game). Lets games consume the host glue as a
  versioned dependency instead of copying it per-game. Import-safe without a
  `window`.

### Changed

- `normalizeQuestion` now preserves the F6 `answerToken` on the normalized
  question (added optional `answerToken?: string` to `BaseQuestion`; reads the
  `answerToken` / `answer_token` wire keys). The lib still does **not** consume
  it (its built-in validator returns `correct:false` — a host validator is
  required); preserving it lets consumers (e.g. `chocabloc-questions/host`)
  forward graded attempts instead of silently dropping the token. Absent/empty →
  omitted; never affects row validity. Additive optional field.

### Fixed

- `chocabloc-questions/bridge` is now safe to `import` without a `window` (node
  tests, SSR, and the new `./host` entrypoint). Its message-listener
  registration and boot handshake are deferred behind a `typeof window` guard;
  the in-handler security gates (`e.source === window.parent`, origin check) are
  unchanged — only listener registration is now conditional.

## [0.6.0-beta.4] — 2026-06-24

### Added

- `bridge.requestQuestions(opts)` — bulk question batch over the host's
  `chocabloc:questions:request` channel (host-pinned gameId) with a same-origin
  relative-fetch fallback for host-less same-origin deployments. Returns the
  canonical questions array verbatim, or `[]` on any failure (never throws).
- `RequestQuestionsOptions` type exported from `chocabloc-questions/bridge`
  (`count` / `recipe` / `grade` / `gameId`). Note bulk uses `recipe` while the
  adaptive path uses `recipeSlug`, matching the host's `fetchGameQuestions`
  contract.
- `gameId` option on `requestNextQuestion` / `requestQuestions` — used **only**
  by the no-host fetch fallback. When embedded, the host pins the gameId and any
  caller-supplied `gameId` is ignored.

### Fixed

- `bridge.requestNextQuestion` hardcoded the `monkey-money` gameId, so every
  non-money game fetched monkey-money's question bank. It now routes through the
  host postMessage channel (`chocabloc:questions:request` → `:deliver`, host
  pins gameId) when embedded, and a same-origin relative fetch
  (`/api/v1/games/:gameId/questions/next`) when given a `gameId` with no host.
  Games no longer need to hand-roll a custom question bridge.

## [0.6.0-beta.3] — 2026-06-11

### Added

- `./elements/whiteboard` — public side-effect export that registers the
  standalone `<choca-whiteboard>` scratchpad element. Additive; no existing
  export changed.

## [0.6.0-beta.2] — 2026-06-03

### Added

- **7 visual geometry format renderers** in `ChocaCanvasQuestion`:
  `geometry_face_identify`, `geometry_identify`, `geometry_symmetry`,
  `geometry_classify_triangle`, `geometry_volume`, `geometry_surface_area`,
  `geometry_circle_convert`. These formats previously rendered as text-only
  despite carrying visual data (`image_type`, `shape`). Now render canvas
  diagrams matching the question's visual intent.
- `drawLabeled3D` — 3D shapes with dimension labels (for volume/surface area)
- `drawFaceHighlight` — 3D shape with highlighted face (for face identify)
- `drawSymmetryLines` — 2D shape with symmetry line overlay
- 7 new normalizer functions and `FORMAT_NORMALIZERS` entries
- 7 new TypeScript content + question types exported from `helpers-only`

### Changed

- Removed 7 formats from `STEM_FORMATS` — they now route through dedicated
  normalizers that preserve `imageType` and structured content instead of
  stripping them to text-only.

## [0.6.0-beta.1] — 2026-06-03

### Added

- **Stacked math template overlay** in `<choca-whiteboard>` — column-aligned
  scratchpad layout for addition and subtraction.

### Fixed

- `<choca-whiteboard>` now re-attaches its cached tool panel after a shadow-DOM
  rebuild in `_render()` (the cached panel had kept a stale `parentNode`).

## [0.5.0] — 2026-06-02

Graduates the `chocabloc-questions/bridge` line to a stable release. No code
changes since `0.5.0-beta.2`.

## [0.5.0-beta.2] — 2026-06-02

### Security

- **P0 — parent-side origin check.** The bridge now rejects any message whose
  `e.origin` doesn't match `window.location.origin`, closing a defense-in-depth
  gap if the iframe sandbox is ever tightened to a null origin.
- **P0 — choices-only "fail-not-wrong".** When a canonical question has no
  `answer` field and the host validator rejects / is unavailable, the pad no
  longer falls through to the built-in helper (which marks every pick wrong
  because `answer` is undefined). It dispatches `chocabloc-validation-unavailable`
  and leaves the pad enabled so the host can render a retry UX — preventing silent
  mass-wrong-marking during a `/answer/validate` outage. Applied in both the
  choice-pad (`shared-pad.ts`) and input-mode (`ChocablocQuestion.ts`) paths.
- **P1 — attempt-token forwarding.** `AttemptPayload` gains an optional
  `answerToken` that `bridge.attempt()` forwards so the host can re-derive
  `is_correct` server-side, closing the `chocabloc:attempt` cheat channel.

## [0.5.0-beta.1] — 2026-06-02

### Fixed

- Normalizer coerces a numeric-string money `answer` (e.g. `"5"`) to a number so
  money-format validation compares correctly.

## [0.5.0-beta.0] — 2026-06-02

### Added

- **`chocabloc-questions/bridge` subpath** — the postMessage host channel, a 1:1
  TypeScript port of Monkey Money's `chocablocBridge.js` into `src/bridge.ts`.
  Phase 1.5 security invariants preserved verbatim (source check, parent-origin
  capture-after-gate, explicit switch allow-list, 2s standalone timeout). Adds
  the `./bridge` subpath export.
- `bridge.validateAnswer()` — F6 host-validation proxy.
- `bridge.attachValidator()` — convenience sugar for wiring the element's
  `validateAnswer` hook.
- Bridge test suite (Phase 2).

## [0.4.0-beta.0] — 2026-06-01

Pre-release for chocabloc's Phase F6 stage 5 (server-validated question delivery). The lib now accepts a new "choices-only" wire shape that lets a server emit pre-shuffled choice values WITHOUT shipping the correct `answer` field or per-distractor metadata. Builds on v0.3.0's `validateAnswer` hook — a host MUST wire that hook for choices-only questions, since the built-in client validator can't determine correctness without `answer`.

### Added

- **`BaseQuestion.choices?: { value: AnswerValue }[]`** — optional, server-emitted choice pool. When present, `buildChoicePool` returns these entries verbatim (all `correct: false`); the lib does not shuffle, dedupe, or relabel. Server is the source of truth for pool composition + ordering.
- **`normalizeQuestion` accepts the choices-only shape for any format**. When `choices` is in the input, the per-format normalizer is bypassed entirely — no per-format `answer` / `distractors` validation runs. Malformed choice entries (non-object, missing `value`, non-AnswerValue `value`) are dropped silently so a partial server glitch degrades to fewer choices rather than a blank screen.
- **`validateLocal` returns `{correct: false, distractorMatched: null, expected: undefined}`** when `question.answer` is missing, with a one-time `console.warn` per call to surface the misconfiguration. Hosts MUST set `validateAnswer` to determine correctness in choices-only mode.

### Changed (breaking type-shape)

- **`MoneyQuestion.answer`, `TextOnlyQuestion.answer`, `VisualQuestion<>.answer` are now optional.** Same for `distractors`. Existing consumers reading these fields without an `undefined` guard need to add one. The legacy shape (server emits both `answer + distractors`) continues to work end-to-end; only TypeScript projects with `strict` mode see the breaking surface.

### Tests

- New `tests/helpers/choices-only.test.ts` — 8 cases covering normalize, buildChoicePool fallback, validate fail-safe warning.

### Migration

Server emits the new shape:

```json
{
  "id": "Q-001",
  "format": "multiplication",
  "imageType": "array",
  "skillIds": ["MULT-SINGLE-3X"],
  "questionText": "What is 3 x 4?",
  "content": { "operands": [3, 4] },
  "choices": [{ "value": 12 }, { "value": 7 }, { "value": 11 }, { "value": 15 }],
  "answerToken": "..."
}
```

Wire the host validator on the element:

```ts
el.validateAnswer = async (q, sa) => {
  const res = await fetch('/api/v1/answer/validate', {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrf },
    body: JSON.stringify({ answerToken: q.answerToken, studentAnswer: sa }),
  }).then(r => r.json());
  return {
    correct: res.isCorrect, expected: res.expected,
    distractorMatched: res.distractorMatched, skillTags: q.skillIds,
  };
};
```

Review-mode painting in choices-only mode: the lib won't paint the correct choice green (no `answer` to compare against). Use the `expected` field returned in the `answered` event detail for custom post-pick feedback.

---

## [0.3.0-beta.0] — 2026-06-01

Pre-release for chocabloc's Phase F6 (server-side answer validation). Adds an opt-in host-provided validator hook so a chocabloc host can route validation through `POST /api/v1/answer/validate` without forking the element. Default behavior unchanged — every existing consumer keeps working with no flag flip.

### Added

- **`<chocabloc-question>` `validateAnswer` property** (`ValidateAnswer` type exported from `chocabloc-questions`). When set, replaces the built-in client-side compare for every MC pick and every input-mode submission. Same `Promise<ValidationResult>` contract as the built-in `validateAnswer` helper. Host is responsible for preserving the existing `answered` event-detail shape so analytics + review-mode painting don't need to branch.
- Forwarding: when the host assigns `validateAnswer` to the root element, the dispatcher copies the function reference to whatever inner format element renders (`<choca-coin-pile>`, `<choca-canvas-question>`, `<choca-table-question>`, `<choca-pattern-question>`, `<choca-number-line-question>`). `shared-pad.handlePick` reads it off the immediate host — no shadow-DOM hops required.
- `ValidateAnswer` type export in `src/types.ts`.

### Tests

- New `tests/elements/host-validate.browser.test.ts` — 4 cases covering MC pick with host validator, fallback to built-in when absent, validator forwarding to inner format elements, input-mode submissions.

### Migration

No required migration. Existing consumers continue to use the built-in client-validate path. To opt into server-validate:

```ts
import 'chocabloc-questions/full';
const el = document.querySelector('chocabloc-question') as HTMLElement & {
  validateAnswer?: (q, sa) => Promise<{ correct, expected?, distractorMatched? }>;
};
el.validateAnswer = async (q, sa) => {
  const res = await fetch('/api/v1/answer/validate', {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrf },
    body: JSON.stringify({ answerToken: q.answerToken, studentAnswer: sa }),
  }).then(r => r.json());
  return {
    correct: res.isCorrect,
    expected: res.expected,
    distractorMatched: res.distractorMatched,
    skillTags: q.skillIds,
  };
};
```

`answerToken` ships on the canonical wire shape (chocabloc server v0.2.0+ when called with a user session).

---

## [0.2.0] — 2026-05-29

This release graduates the lib from alpha. Input contract conforms to the canonical chocabloc DB question shape — no shim adapters required by consumers. Monkey Money, brainbites, and assignment surfaces all consume the same spec. Includes the full 99-format mathSkills expansion that landed on `feat/mathskills-full-coverage`.

### BREAKING CHANGES

- **`BaseQuestion.prompt` renamed to `questionText`** to match canonical chocabloc DB question shape (mirrors `questions.question_text` column). `questionText` is now required (was optional). Migrate consumers: replace `question.prompt` reads with `question.questionText`.
- **`normalizeQuestion()` throws on `correctIndex` input.** Legacy bank-row shape (`{ id, prompt, choices, correctIndex, choiceMeta }`) is no longer accepted. Pass `answer` + `distractors` and let the lib build choices internally via `choice-builder`.
- **Legacy fallback chain in `extractBase` removed.** Now reads ONLY `questionText`. Removed silent reads of `prompt`, `content.question`, `content.prompt`. Rows lacking `questionText` ship empty string; format-specific normalizers may compute a stem via `buildStem()`.

### Added

- **`<chocabloc-question answer-mode="review">`** — read-only display with correct-answer highlight. All choice buttons disabled (`aria-disabled="true"`, `tabIndex=-1`). Pointer events suppressed.
- **`student-answer` attribute** on `<chocabloc-question>` — string-coerced comparison against `answer` and `distractor.value`. Per PC-3, the underlying `choiceValue()` helper extracts `.value` from object-shaped choices so `"5"` correctly matches numeric `5` (no `"[object Object]"` stringify trap).
- **Review-mode forwarding** through dispatcher (`ChocablocQuestion._passAttrs`) → visual wrappers → `<choca-choice-pad>` via `shared-pad.syncChoicePad`. All 5 visual wrappers observe `student-answer`.
- **New parts:** `choice-correct`, `choice-wrong`, `choice-other`.
- **New theming vars:** `--cq-choice-correct-border` (default `#10b981`), `--cq-choice-wrong-border` (default `#ef4444`), `--cq-choice-disabled-opacity` (default `0.5`).
- **`sideEffects` field** in `package.json` — enables consumer bundlers to
  tree-shake unused exports from `helpers-only` and `index` entry points.
  Side-effectful entries (`full`, `coin-pile`, `canvas-question`) are listed
  explicitly so `customElements.define()` calls are preserved.
- **Tree-shake verification script** at `tests/tree-shake-test.mjs` — builds
  a helpers-only import via Vite and asserts no Web Component code leaks into
  the output.
- **`base10_blocks` format** — full pipeline: types, normalizer, canvas renderer,
  CSS custom properties. Handles 4 DB operations (`base10_count`, `base10_block_count`,
  `base10_regroup`, `base10_compare`) under single normalized `format: 'base10_blocks'`.
  Thousands cubes render with 3D faces; place highlighting (pink stroke) for
  `base10_block_count`; side-by-side comparison layout for `base10_compare`;
  auto-scaling to fit canvas.
- **CSS vars for base10 block colors**: `--cq-b10-ones`, `--cq-b10-tens`,
  `--cq-b10-hundreds`, `--cq-b10-thousands`, `--cq-b10-stroke`.
- `base10_blocks` added to DB snapshot script and vanilla HTML example.

### Changed

- `NormalizedQuestion` union expanded to 20 formats.
- Coin-pile size budget bumped 16 → 17 KB (shared normalizer growth via dispatcher).

### Removed

- `prompt` field from public types (renamed to `questionText`).
- `correctIndex` input path on `normalizeQuestion()`.
- Legacy fallback reads (`prompt`, `content.question`, `content.prompt`) in `extractBase`.

### Internal

- `<chocabloc-question answer-mode="X">` public API translates to internal `<choca-choice-pad mode="X">`. Consumers should not read child `mode` directly; the public surface is the parent attribute.

### Tests

- 204 unit specs passing (Vitest), including 2 new `correctIndex` rejection specs.
- 111 browser specs passing (web-test-runner + Playwright Chromium), including 10 new `review-mode` specs covering correct/wrong marking, PC-3 string-vs-number coercion, PC-3 object-shape choice handling, full aria-disabled coverage, student-answer absent fallback, and per-wrapper forwarding.
- Smoke test: **21,415/21,415 real mathSkills bank questions normalize, 0 malformed.**

## [0.1.0-alpha.6] — 2026-05-27

### Added (full format expansion)

- **17 new question formats** with full pipeline coverage: types → normalizer →
  validator → choice-builder → Web Component renderer. `NormalizedQuestion` is
  now a 19-member discriminated union (up from 2).
- **`ChocaCanvasQuestion`** — single canvas component rendering 13 formats:
  geometry (attributes, classify, properties, area, angles, perimeter,
  circumference, angle classify, circle parts), data graphs (bar + pictograph),
  fractions, analog clock, coordinate plane, multiplication arrays.
- **`ChocaTableQuestion`** — DOM-based real HTML `<table>` for
  `money_budget_adjust` format. Solve-for cell highlighted via `part="solve-for"`.
- **`ChocaPatternQuestion`** — DOM flexbox for `pattern` format. Renders colors
  as filled circles, animals as emoji (🐄🐕🐱🐸🐢🦊), shapes as unicode, letters
  as text. CSS vars for item size, colors, borders.
- **`ChocaNumberLineQuestion`** — SVG-in-DOM for `multiplication` with
  `number_line` imageType. Quadratic-curve arc jumps with arrowheads, tick marks,
  labels. CSS vars for line/arc colors.
- **`elements/canvas-question`** build entry point for tree-shaking visual
  formats separately from money.
- **Bar graph Y-axis** with scale numbers and light gridlines.
- **Pictograph emoji** — maps common labels (fruits, animals) to emoji instead
  of generic circles.
- **`question_id` field support** in normalizer/parser — raw DB rows accepted
  without renaming.
- **Empty distractor filtering** in `buildChoicePool` — blank `""` values no
  longer produce empty choice buttons.
- **DB snapshot script** tracked at `scripts/db-snapshot/snapshot.sh` (JSON
  output gitignored).
- **All-format example page** at `examples/vanilla-html/` with Prev/Next cycling
  through 10 questions per format from snapshot data.
- 17 format types via `VisualQuestion<F, I, C>` generic (internal).
- Map-based normalizer dispatch (`FORMAT_NORMALIZERS`) with shared utilities.
- `VISUAL_FORMAT_STRINGS` set in parsers for validation.
- Test fixtures: `tests/fixtures/visual-format-samples.json` (16 formats).
- 76 visual normalizer tests + 34 browser tests for new components.
- Total: 179 unit tests + 78 browser tests.

### Changed

- `NormalizedQuestion` union expanded from `MoneyQuestion | TextOnlyQuestion`
  to all 19 formats.
- `ChocablocQuestion` dispatcher routes to format-specific components instead
  of logging unsupported-format warnings.
- Build outputs 5 bundles (was 4): added `elements/canvas-question`.
- Size budgets updated: helpers-only 12 KB (was 8), full 40 KB (was 25),
  new canvas-question 20 KB.
- `isQuestionLike` accepts `question_id` as alias for `id`.
- `choice-builder` accesses `q.content.currency` via typed path instead of cast.

### Removed

- `src/internal/future-formats.ts` — all formats now promoted to public surface.

## [0.1.0-alpha.5] — 2026-05-15

### Fixed (`<choca-coin-pile>` — Phase D follow-up)

- Same-denom overlap previously used `margin-left: -25%`, which CSS resolves
  against the flex container's width (not the coin's own width). Result:
  rows with mixed/many coins collapsed leftward — coins disappeared off the
  left edge and z-index stacking visually inverted because all coins piled
  on top of each other near x=0.
- Switched to `margin-left: calc(var(--cq-coin-px) * var(--cq-coin-overlap-frac, -0.25))`
  where `--cq-coin-px` is a per-denomination size set by each
  `[part~="coin-<denom>"]` selector. Overlap is now a unitless multiplier
  of the coin's own width — predictable across rows of any denomination.
- Added `flex: 0 0 auto` to coin spans so flex can't shrink them when the
  row exceeds available width.

### Changed (breaking, theming surface)

- Var renamed: `--cq-coin-overlap-pct` → `--cq-coin-overlap-frac` (value
  semantics changed from percentage string to unitless number, e.g. `-0.25`
  instead of `-25%`). Consumers overriding the old name need to update.

## [0.1.0-alpha.4] — 2026-05-15

### Changed (`<choca-coin-pile>` — Phase D visual refinement)

- Coin pile now lays out one denomination per row in high-to-low canonical
  order (toonie → loonie → quarter → dime → nickel → penny), replacing the
  previous flex-wrap single row.
- Per-denomination size defaults reflect physical scale: dime 40px, nickel
  43px, penny 43px; toonie/loonie/quarter inherit `--cq-coin-size` (now
  56px, up from 48px).
- Same-denom coins overlap horizontally by `--cq-coin-overlap-pct` (default
  `-25%`) so high-count rows stay readable. Each coin gets an inline
  ascending `z-index` so later coins layer over earlier.

### Added (theming surface)

- Parts: `coin-row`, `coin-row-<denom>` for each emitted row.
- CSS vars:
  - `--cq-coin-{toonie,loonie,quarter,dime,nickel,penny}-size` per-denom overrides
  - `--cq-coin-row-gap` (default `8px`) — vertical gap between rows
  - `--cq-coin-overlap-pct` (default `-25%`) — same-denom horizontal overlap
  - `--cq-canvas-align` (default `flex-start`) — cross-axis row alignment

### Removed

- `--cq-coin-gap` (replaced by `--cq-coin-row-gap` for column-direction
  rhythm; intra-row spacing now controlled by `--cq-coin-overlap-pct`).
  Breaking only for consumers that set `--cq-coin-gap` directly; no known
  consumers do.

## [0.1.0-alpha.0] — 2026-05-12

Initial alpha release. Lib reaches consumers via `npm link` only; no npm
publish yet. Tier 1 helpers + Tier 2 elements ship the money-format pipeline
end-to-end.

### Added

- Tier 1 helpers: `parseQuestion`, `isQuestionLike`, `isNormalizedQuestion`,
  `normalizeQuestion`, `normalizeBatch`, `validateAnswer`, `matchesDistractor`,
  `buildChoicePool`, `shuffleChoices`, `computeCoinTotal`, `formatCurrency`,
  `formatAnswerForDisplay`, `formatCoinCountForScreenReader`, `isValidSkillId`,
  `matchesGradeFilter`
- Tier 2 elements: `<chocabloc-question>`, `<choca-coin-pile>`,
  `<choca-choice-pad>`
- Discriminated union `NormalizedQuestion = MoneyQuestion | TextOnlyQuestion`.
  Future formats are gated behind minor versions when their renderers ship.
- Currency-specific narrow coin types: `USDCoinName` (penny/nickel/dime/quarter),
  `CADCoinName` (nickel/dime/quarter/loonie/toonie)
- Async `validateAnswer(): Promise<ValidationResult>` from day one
- Strict-dev / lenient-prod normalizer with `onMalformed` event hook
- Accessibility: roving tabindex, ArrowLeft/Right/Up/Down + Home/End +
  Space/Enter keyboard nav, `aria-checked`, `aria-disabled`,
  `aria-live="polite"` coin-count summary, container `aria-label`,
  `:focus-visible` outlines, reduced-motion-aware hover
- XSS hardening: ESLint forbids `innerHTML` / `outerHTML` /
  `insertAdjacentHTML` assignment in `src/`. User content via `textContent`.
  Regression tests cover malicious prompts in both coin pile and text fallback.
- Multi-entry build: `index`, `helpers-only`, `full`, `elements/coin-pile`
- TypeScript declarations emitted via `vite-plugin-dts`
- Bundle size limits enforced via `size-limit`:
  - `helpers-only.mjs`: 8 KB gzip budget (actual 2.73 KB)
  - `elements/coin-pile.mjs`: 15 KB gzip budget (actual 3.82 KB)
  - `full.mjs`: 25 KB gzip budget (actual 5.59 KB)
- Unit tests (98) + browser tests (36) via Vitest + @web/test-runner + Playwright
- Coverage thresholds: lines >= 90%, branches >= 85%, functions >= 90%

### Known limitations (deferred to later versions)

- Slot composition (`prompt`, `canvas`, `choices`) not yet implemented
- Theme presets (`theme="chocabloc"` etc.) deferred
- Image-based question assets path deferred
- Server-authoritative answer checking deferred (validator already async
  to enable this without API churn)
- IIFE bundle for CDN deferred
- npm + CDN publishing deferred
