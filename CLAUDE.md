# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# choai

A PWA for keeping hledger journals in a GitHub repository. The accounting is done
by hledger itself — hledger-lib compiled to WebAssembly — and the code in this
repository carries its input and output, and the screens around it.

## How to write here

Even where the shape of the work is imperative, write it with functions wherever
functions will do.

- **Write functionally as a matter of course.** Pure functions, immutability,
  composition, exhaustive matching. Not as a technique being applied, just as how
  the code is written. Anything that can fail returns `Result<T, E>` rather than
  throwing. Branches are exhausted through discriminated unions. Avoid `throw`,
  avoid mutation, avoid a `let` that exists to be assigned once and forgotten;
  build from small pure functions composed together. Do not write comments
  announcing that something is functional — that is assumed. SolidJS signals and
  derivations are the vessels effects live in, but the logic inside them stays
  pure. **Where the effect is itself the subject — time, timers, subscriptions —
  shut it inside a vessel as a state machine.**

- **Do not flatten a failure into a string meant for display.** Carry what
  happened; let the screen decide the wording. Returning a string leaves the
  caller with nothing to do but print the sentence it was handed — it cannot,
  say, keep the input around for this one reason and not others.

- **`null` and `undefined`.** `undefined` is the default: absence that arose on
  its own. No value, not yet initialised, not found, omitted — all `undefined`.
  **`null` is for when a developer meant to put it there**, so a `null` in the
  code is always a statement of intent. A `null` arriving from a boundary — the
  DOM, a regular expression, localStorage, someone else's JSON — is turned into
  `undefined` at that boundary before it travels inward. **The same going out:**
  a field that is not being touched is omitted, not set to `null`. When in doubt,
  `undefined`.

- **Comments are JSDoc and GoDoc only.** Not inline inside a function body.
  Intent is carried by descriptive names and by breaking work into small
  functions — names growing somewhat longer for that reason is fine, though
  length is not itself the goal. **Write above a declaration only when the "why"
  cannot be said in the code.**

- **Keep scope small, always.** In English, written on the assumption it will be
  grown.

## Commands

From `apps/web`. There is no linter; `tsc` is the check that runs over everything.

```sh
bun install      # bun is the package manager and the script runner
bun run dev      # licences, then vite on :8396      bun run build   # + tsc -b
bun run dev:jp   # the same as the Japan edition       bun run build:jp
bunx tsc -b      # typecheck alone: src, vite.config, tests and e2e
bun run test     # bun test over tests/ — the pure functions only
bun run e2e      # playwright over e2e/ — drives window.choai, not the screen
bun run e2e:jp   # the Japan edition's own, against a jp build
bun scripts/vendor-ui.mjs <name>...    # re-fetch a solid-ui component
```

`playwright.config.ts` starts its own dev server with `CHOAI_TEST=1`, which
turns the service worker off: it precaches the ~7 MB engine and updates itself,
which is right on a phone and wrong under a test.

The engine — `public/hledger.wasm` and the `src/core/hledger/ghc-jsffi.mjs` the worker
imports — is committed, so a fresh clone runs. It is the one wasm here that is
not a measurement, and it is checked in because rebuilding it needs the ghc-wasm
toolchain, which the machine that deploys will not have. Everything under
`wasm/out/` stays ignored. To move the engine to a new hledger:

```sh
../../wasm/scripts/build.sh hledger-bindings   # needs the ghc-wasm toolchain
bun scripts/sync-hledger.mjs                   # -> public/hledger.wasm, src/core/hledger/ghc-jsffi.mjs
```

Both land in the same commit as the `wasm/` source they came from, which is what
records which source the published binary was built from.

`wasm/README.md` has the rest (`setup.sh`, benching, `serve.sh`).

The page that explains the app is its own Astro project in `docs/`, beside the
app rather than inside it — where Vite keeps its own site. Its own dependencies,
nothing of the app's, two names, two deployments:

```sh
bun --cwd=docs run dev           # astro on :45720 (ASTRO in digits)
scripts/build-site.sh            # apps/web/dist and docs/dist, side by side
```

`choai.dev` serves `apps/web/dist`, `docs.choai.dev` serves `docs/dist`. Where
the app lives is `PUBLIC_APP` in `docs/.env`, so development links to a local
app rather than to the published one.

Each is published as a Cloudflare Worker serving static assets, built from
`main`. The `wrangler.jsonc` beside each directory says what is served and how;
what the dashboard is set to is in `README.md`. A `_redirects` cannot carry the
app's fallback — the reason is written where it is handled instead.

## Architecture

`wasm/` makes hledger reachable from JavaScript; `apps/web` is everything around
it. They meet only at the two files `sync-hledger.mjs` copies. `~` aliases `src/`,
which has four directories and no loose files:

```
src/
├── core/       plain text accounting. Belongs to nowhere and knows of no edition
├── edition/    the contract (types.ts), the roll, and the door core knows one by
├── editions/   global/ and jp/, one module each
└── app/        the entry, the shell, and the table of every screen there is
```

`src/edition/README.md` is the standing policy: the rules an edition is added
under, what is deliberately not built, and what holds each of them. Read it
before putting anything in `editions/jp/`. Two of the rules are not prose:
`tsconfig.boundary.json` is core, the app and the contract over **no edition at
all**, and `composite` makes that list binding — so naming any edition module
from any of them is `TS6307` and takes the build down before vite runs. There
is no exception for the seam, because `~/edition/chosen` is a name with no file:
vite points it at the edition being built, `paths` points it at the global one,
and the check points it at `edition/none.ts`, which declares an edition without
being one. `tests/boundary.test.ts` holds what no type can say — that the list
of modules naming an edition is empty rather than nearly empty, and that the
three tsconfigs agree on where the seam resolves.

- **The app is built twice from one tree**, as the global edition at `choai.dev`
  and the Japan edition at `jp.choai.dev`. Core is plain text accounting and
  does not know Japan exists — there is no `if (edition ===` in it and there is
  not to be one. What an edition adds is two tables and a
  paragraph (`edition/types.ts`): `views`, screens with an address and a place
  on the rail; `capabilities`, the same offered by name through `describe()` and
  `call`; and `guidance`, how these books are kept, said to a model. Three doors,
  not two — a model arrives through both tables at once, handed the capabilities
  as tools and told what it is doing, and the second half of that was missing
  until an edition needed to say that entries here carry a classification.
  `guidance` is appended to core's instructions and can never replace them. **An edition adds; it cannot replace or
  take away** — a view at an address core has is dropped and a name core uses
  stays core's, so what a balance sheet means cannot come to depend on which
  name the app was reached by.
- **`~/edition/chosen` is the hole the build fills**, and `edition/index.ts` is
  the one door core knows an edition by — `chosen` is imported there and nowhere
  else, and always through the alias, because the build swaps a *name* and a
  relative path is a name it has no way to recognise. `vite.config.ts` points it
  at whichever of `editions/` `CHOAI_EDITION` asks for, so the other one's code
  is not in the bundle rather than in it and unreachable. `edition/roll.ts` is
  the roll of the two and is plain data with no imports, because the build reads
  it as well as the app does. Japanese tax work goes under `editions/jp/`, one
  directory per subject, and nothing in core ever imports it.
- **`editions/jp/` is the Japan edition**, and its `README.md` is its constitution:
  what the books say versus what Japanese tax makes of it, one division that every
  module and every screen follows. Nothing there writes an accounting entry —
  depreciation and the year-end adjustments go through `propose()` like anything
  else. Numbers from the law are data in `rules/`, with the page they were read
  off named beside them, and anything needing a judgement declines by name rather
  than guessing. Its pure modules import no screens, because `bun test` has no JSX
  runtime and the reasoning has to stay testable.
- **`app/views.ts` is every screen there is**, and both the rail and the router
  are read off it — written as two lists, a page could be reachable from the
  rail without being routed, or routed with nothing leading to it, and neither
  shows up until somebody presses the thing. A view carries its own label as a
  function rather than a dictionary key, so an edition can bring words the
  dictionary has never heard of and still follow the language being switched —
  and `reached: { from: "rail", group }` puts a run of them under one heading, so
  an edition bringing five screens does not silently make the rail nine of equal
  standing.
- **`core/journal/companions.ts` is how a non-journal file travels with a book.**
  A line reading `; choai-file: fixed-assets.jsonl` is a comment to hledger and a
  declaration to this app, written under the title so a rename cannot overwrite
  it. Push already sent every file the book had; `take()` in `github/sync.ts`
  fetches the declared ones after the includes, because hledger never asks for a
  file it does not `include` and a companion pushed and never returned is lost.
  `store.putFiles` is the one write that does not refuse an unknown path, and
  takes several at once so making the file and declaring it are one act.
- **The worker holds the journal.** `core/hledger/worker.ts` keeps one reactor
  instance alive across calls — parsing costs ~290 ms, queries 10–25 ms. Files go
  into a WASI `PreopenDirectory` rather than as strings, because hledger's text
  entry point needs `createPipe` and because `include` then resolves itself.
- **`core/hledger/client.ts` is the only way in**, answering `Result<T, Trouble>`;
  nothing throws or rejects, and a dead worker settles everyone stranded.
- **`core/hledger/turn.ts` is the one queue.** hledger holds a single parsed journal,
  so `ask` and every open wait their turn. A trial — read a candidate, then put
  the old one back — is one turn, which is why `openJournal` is left ungated and
  its callers take the turn instead. The worker takes its messages one at a time
  for the same reason.
- **`core/api/` is the app without a screen.** One table in `core/api/table.ts` yields all
  three faces: the typed `window.choai.report.balance(...)`, the by-name
  `call(name, args)`, and the manifest `describe()` — so none can drift from
  another. It sits strictly on `core/journal/store.ts`, `core/compose/commit.ts` and
  `core/hledger/client.ts`; nothing there reaches `core/lib/idb.ts` or the worker, no
  capability writes raw text or reads back a token, and answers are rebuilt in
  `core/api/answered.ts` rather than passed through, because what is published is a
  promise and hledger's floats are not part of it. `README.md` documents it.
- **`core/journal/proposals.ts` is the write path for anything without a screen.**
  Changes are trialled as one candidate (hledger re-reads the whole journal per
  open, so one call per change is two orders of magnitude of waiting), the files
  are derived from the items every time rather than stored, and `apply` compares
  every touched file to what it was before handing over — **with no `await` in
  between**, which is the only thing stopping a concurrent write from being
  replaced by text composed before it. A removal is an item like an addition, so
  a correction is one shown, atomic write; removals are applied bottom-up
  because every line taken out shifts the ones below it.
- **`core/ai/` sits on `core/api/` and nowhere else.** The tools are `describe()` filtered
  to `offered`, which is a fact of its own and not derivable from `writes`:
  `transaction.create` writes one entry nobody saw first and is withheld, while
  `proposal.apply` writes many and is offered, because they were shown.
- **`core/ai/talker.ts` is the seam between providers.** `loop.ts`, `prompt.ts` and
  the panels are written against it and against nobody's API; `anthropic.ts`,
  `gemini.ts` and `openai.ts` are each one provider's spelling of it,
  `openai-compatible.ts` is one spelling shared by everyone who answers to
  OpenAI's older chat-completions shape (DeepSeek, Qwen, OpenRouter — a
  hostname and a default apart), and `talkers.ts` is the table the settings
  picker and the per-provider key are read off. A turn's blocks stay opaque all the way through because all three
  keep things in a turn that must come back byte for byte. The host a key is
  sent to is a field on the talker, so a provider cannot be added without the
  page saying where what is typed will go. **A conversation belongs to one
  provider** — `core/ai/store.ts` starts again on a switch rather than handing one
  provider's blocks to another. Gemini takes only a subset of JSON Schema and
  refuses `additionalProperties`, so `gemini.ts` trims it on the way out; that
  is why the schema is not written twice. `core/ai/kept.ts` holds the key and names its
  only two permitted importers; nothing under `core/api/` may read it. A turn goes
  back to the model exactly as it arrived — thinking and tool blocks unedited —
  which is why `anthropic.ts` holds blocks opaque instead of parsing them into a
  union. Leave adaptive thinking on: with it off, a tool call is sometimes
  written out as ordinary text and silently runs nothing. OpenAI goes through
  the Responses API, whose conversation is one flat list of items with no roles
  at the top, and with `store: false` so nothing of the journal is kept at their
  end — which is also what makes reasoning items come back carrying their own
  encrypted contents, so they can be handed back.
- **What a model takes decides what is sent to it.** Anthropic answers the
  question in its listing, so `anthropic.ts` reads it per field — a model
  missing adaptive thinking is sent a budget instead, and one missing effort is
  sent none — and a field the listing does not answer is left unwritten rather
  than recorded as a no. Google and OpenAI answer nothing, so `gemini.ts` and
  `openai.ts` decide on the names and err towards leaving a model out — which is safe because the settings panel
  offers what they find as suggestions in a box you type in
  (`core/lib/ui/suggesting.tsx`), not as the whole of what can be said. A name missing
  from the list is an inconvenience, never a wall, and each talker carries a
  `modelsFrom` link to where its provider publishes the real answer. All three
  listings say how much a model will write, and no turn asks for more than that.
- **Attachments are read before they are sent.** A photograph is scaled to
  1568px and re-encoded (`core/ai/photo.ts`) — a phone writes 4000px and every model
  charges by area. A statement is parsed by `core/lib/csv.ts` only to know it is a
  table and how long; **the file's own text is what goes over**, because rows
  read out and written back is a chance to change somebody's figures on the way.
- **`core/lib/text.ts` decides a file's encoding rather than assuming it**, and is
  what every file read off the filesystem goes through — an attachment and a
  journal alike. Japanese banks and much of the accounting software here write
  Shift_JIS, and assuming UTF-8 does not fail: the commas and line endings
  survive, so it still parses, and the payees quietly become replacement
  characters. UTF-8 is tried strictly first because plenty of it decodes as
  Shift_JIS into nonsense, while almost no Shift_JIS is accidentally valid UTF-8.
- **What `describe()` promises, `core/lib/monad/shape.ts` keeps.** A name that was
  never asked for is refused rather than dropped, because the schema has always
  said `additionalProperties: false` and because a misspelling dropped quietly
  is unrecoverable: `query` written `qeury` answers about the whole journal and
  reads as the narrowed answer that was wanted. The fault names what the
  capability does take, so the second attempt needs no further asking. An e2e
  gives every capability a name it never asked for.
- **The trial balance is a check, so nothing here does its arithmetic.** It is
  the balance report asked for flat and with the empty accounts kept (`Listing`
  in `Bindings.hs`) — a parent counted beside its own children would be counted
  twice by a column that is added up — and what each column comes to is
  hledger's, the one answer not shaped by hledger's own `ToJSON`. `core/reports/columns.ts`
  only splits what is on the page, by sign alone: an overdrawn asset is a credit
  balance, and placing it by account type would hide the thing the report is run
  to find.
- **Tags come over on their own.** `ptags` and `ttags` are on the wire because
  hledger has always sent them — `postingKV` writes one by hand and the generic
  instance carries the other — and `api/answered.ts` republishes them named
  rather than as aeson's pairs. Posting-level tags are writable through
  `transaction.propose` as well as through the composer. A tag is how an edition
  says anything about an entry without core knowing what it means.
- **`core/hledger/wire.ts` mirrors `Bindings.hs`** — `Request`, `Answer`, `Trouble`
  against its `Request` parser and `Failure` type. A new report means editing
  both. Shapes are hledger's own `ToJSON`, so they follow upstream.
- **The text is what is true.** `core/journal/store.ts` alone owns the open journal,
  and every write is offered to hledger first and kept only if it reads.
  `openBringingMissing` fetches `include`d files as hledger asks for them.
- **One line in the console, and no others.** `core/api/install.ts` says `window.choai`
  is there, because an agent driving a browser reads the console and sees
  nothing in the screens about it. Nothing else writes there — not hledger's own
  stdout, not what a model listing set aside — since a console with a running
  commentary in it has nowhere to put the one line meant to be read. An e2e test
  holds that count at one.
- **`core/lib/idb.ts` is the whole database** — name, version, stores, migrations —
  because IndexedDB versions all of it at once.
- **`core/github/sync.ts`** appends local entries after remote ones when both texts
  still begin with what was last agreed, and otherwise reports `diverged`
  untouched. Straight to api.github.com; there is no backend anywhere.
- **A window too narrow for both gives the left one screen.** Where the rail and
  the explorer would together take more than half the window (`overHalf` in
  `core/lib/narrow.ts`), they take all of it, the work goes behind them, and choosing
  in the explorer is how it is reached again — with a way back at the top of it.
  Nothing asks what kind of device it is, and the rule holds for a desktop window
  dragged thin. It is asked of the widths those two settle at, never of the width
  the explorer currently has: pinning a draggable width is a thing there is no
  dragging back out of. The pinning itself is `minWidth === maxWidth`, which
  `resize.ts` already clamps to.
- **The dock holds one thing at a time**, and `core/dock.ts` is that one piece of
  state — the name of whoever the panel is lent to. Not a flag per occupant with
  a rule about who wins: under that, opening the second does not close the first,
  it hides it, and pressing the loser does nothing. `core/lib/solid-workbench-ui`'s
  `createSlot` is the vessel; closing is never clearing, so a draft, a
  conversation and a proposal all survive it.
- **`app/app.tsx`** wires `core/lib/solid-workbench-ui` (MIT, kept app-agnostic); its
  `NAV`/`FOOT`/`INNER` tables pair each route with its explorer, and one query in
  the URL is shared by every view.
- **Choosing in the explorer lands on the view the explorer belongs to**, which
  is not always the page on screen: an `INNER` page borrows its rail's list and
  has no use for what it sets, so choosing there is how it is left. The explorer
  hands the query up rather than setting it, because the page and the query are
  one navigation — the router keeps only the last of two in a tick, so a query
  set first is dropped by the page that follows it.
- **`core/i18n/en.ts` is the type** every other dictionary is checked against, and
  `docs/src/words.ts` does the same for the landing page — which speaks to
  someone who has not opened the app, so it does not share the app's wording.
- **Generated or vendored, so don't hand-edit:** `src/core/generated/` (licences,
  rebuilt each dev/build), `src/core/components/ui/*` (solid-ui), `wasm/vendor/`.

## Constraints

- **GPL-3.0-or-later**, inherited by linking hledger-lib; publishing here is what
  satisfies it. Keep `core/lib/solid-workbench-ui` MIT and reusable.
- **`docs/` is GPL by choice and must stay separable.** It links against nothing
  of the app's — no shared config, no shared dependencies, no imports across the
  two — so the copyleft does not reach it on its own; it carries the same licence
  because that is what this project publishes under. It could still be lifted
  into a repository of its own without unpicking anything.
- **Upstream must stay followable.** Fix a wasm build failure as far from
  hledger's source as possible: `cabal.project` → `shims/` → a `.cabal` patch →
  its source last, recorded in `RESULTS.md`. Currently zero lines changed.
- **An update waits to be taken.** `registerType` is `prompt`, so a new service
  worker installs and stands by: the browser hands over when the last window on
  the old one closes, which makes shutting the app and opening it again an
  update. `core/lib/renewal.ts` is the only thing that reloads, and only when asked —
  a reload takes a half-typed entry, a conversation and every undecided proposal
  with it. It also does the asking, because a phone app is resumed rather than
  navigated to and a resume is not when a browser looks for a new worker.
- **The module is ~7 MB** against a 25 MiB Cloudflare limit, which is why
  `maximumFileSizeToCacheInBytes` is raised in `vite.config.ts`.
- **Money is never a float** — rendered from mantissa and scale in
  `core/hledger/amount.ts`; hledger's float field is left out of `Quantity`.

Commit subjects say what the app now does, not what was touched: "Let the journal
be edited as the text it is".

