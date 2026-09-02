# choai

A PWA for keeping [hledger](https://hledger.org/) journals in a GitHub repository.

The goal is a fully client-side application: the journal is parsed and reported
by hledger's own logic compiled to WebAssembly, served as static assets from
Cloudflare Pages, with no backend. That keeps the running cost near zero, which
is what makes it possible to offer the service free of charge and free of ads.

The UI is built with SolidJS, Solid Router, TailwindCSS and Kobalte. Components
adapted from solid-ui are vendored into the source tree rather than taken as a
runtime dependency.

## The name

Western bookkeeping reached Japan under a borrowed name. In 1873, Fukuzawa
Yukichi translated Bryant and Stratton's *Common School Book-keeping* and
published it as 帳合之法, *Chōai no Hō* — the method of chōai. He did not coin
the word for the occasion: chōai was already what the merchant houses called
the work of setting the books against what was there until the two agreed.
Double-entry arrived in the country under a name it found waiting for it,
imported whole rather than invented anew.

This is the same kind of carrying across. The accounting here is hledger's own,
compiled and brought into the browser intact, not reimplemented in it. So the
app is named for the crossing rather than for the cargo: **choai**.

## What it does

The journal is kept as the text file it is, and hledger itself -- compiled to
WebAssembly and running in a worker -- reads it and answers every question the
screens ask. Nothing is uploaded anywhere by the app.

- **Read**: the daily journal, the balance sheet, the income statement, and a
  trial balance -- every account the books have, in the two columns they are
  checked in. One hledger query applies to whichever is open.
- **Write**: entries are composed beside the journal, with accounts suggested
  from what the books already contain -- by the same code `hledger add` uses --
  and a posting left blank for hledger to work out. Text is appended, never
  rewritten.
- **Edit**: the journal's own text, one file at a time. hledger reads it before
  it is kept, so text that will not parse never replaces text that does.
- **Keep**: the files stay on the device, one record per path, and the journal
  left open comes back on the next visit.
- **Take away**: the share sheet on a phone, a download elsewhere.
- **Ask**: questions in a sentence, answered by hledger. Attach a photograph of
  a receipt or a bank statement and get entries back, offered rather than
  written: what is confident is ticked, what is not is set aside with a reason,
  and nothing joins the journal until you press. The browser talks to the model
  directly with a key of your own -- ChatGPT, Claude, Gemini, DeepSeek, Qwen or OpenRouter -- and what it may call is
  the same table `window.choai` publishes, minus anything that could change the
  books without showing you first, and minus anything that leaves the device.
- **Sync**: a path in a GitHub repository, reached from the browser straight to
  api.github.com. Entries written in two places are laid one after the other;
  when the same part changed on both sides, nothing is merged and it says so.

## `window.choai`

Everything above is reachable without a screen. Opening the app puts a
`window.choai` in the page: the same core, answering a script, a test, or an
agent instead of a person.

```js
await window.choai.ready                                 // which journal is open, decided
window.choai.describe()                                  // every capability, with its JSON Schema
await window.choai.report.balance({ query: "date:lastmonth acct:expenses" })
await window.choai.call("journal.similar", { descriptions: ["Amazon", "Starbucks"] })
await window.choai.idle()                                // everything asked has been answered
```

`describe()` returns a manifest with a `version` that names this promise. Adding
a capability, or an argument that may be left out, leaves anything already
written against it working; taking one away, or narrowing one, does not, and
that is what the version moves for.

- **Two doors, one table.** `choai.report.balance(...)` is for names known when
  the code is written; `choai.call(name, args)` is for anything that read
  `describe()` and chose. Both are read off one table, so what a capability
  takes cannot drift from what it says it takes.
- **Nothing throws.** Every call answers `{ok: true, value}` or
  `{ok: false, error}`, and the error is a case with its particulars rather than
  a sentence — a missing field comes back with the path to it and the whole
  schema, so a correction can be made without asking again.
- **Figures are exact.** Amounts cross as a mantissa and a scale, with the same
  figure written out. hledger's floating-point copy is left behind.
- **Writing is two acts.** `transaction.propose` writes changes down without
  making them and says whether hledger read the result; `proposal.apply` keeps
  them, or the ones named and no others. Taking an entry out is a proposal like
  putting one in — an addition nobody wanted can be deleted afterwards, a
  deletion nobody wanted is gone — so a correction is a removal and an addition
  shown together and written at once. A diff exists before anything is decided,
  a hundred entries with three doubtful ones is one glance and one press, and a
  proposal made against a journal that has since moved is refused rather than
  applied over the top of it.
- **What is deliberately absent.** No way to run code, no way to write a file as
  text, and no way to read back the tokens this app keeps. A capability names an
  act, and the acts are the ones the screens also perform — so an agent goes
  through the same door as a person, and hledger reads everything before it is
  kept.

Being reachable is the point: this is a local application with no server, and
what it can do it can be asked to do. So it says so where something that is not
a person would look: `choai.dev/llms.txt` and `docs.choai.dev/llms.txt`, and a
line on the console when the app loads. None of the three writes the capability
list down — they point at `describe()`, which is derived from the one table and
cannot disagree with what runs.

The feasibility spike that decided all this lives in [`wasm/`](wasm/); its
answer -- that hledger-lib can be compiled to `wasm32-wasi`, kept small enough
for a Cloudflare Pages asset, kept fast enough to be usable, and kept close
enough to upstream to follow future releases -- is recorded with its
measurements in `wasm/RESULTS.md`. See `wasm/README.md` for how to reproduce
them.

Not one line of hledger's source is modified. What we write is the binding that
exports its functions to JavaScript, in `wasm/hledger-wasm/src/Bindings.hs`.

## Editions

The app is built twice from one source tree. `choai.dev` is the **global
edition** and `jp.choai.dev` the **Japan edition** — the same core, the same
screens, and somewhere for Japanese tax work to go without any of it reaching
the books everyone else keeps.

The dependency runs one way:

```
global ─┐
        ├──> core
jp ─────┘
```

`apps/web/src` has four directories and no loose files:

```
src/
├── core/       plain text accounting. Belongs to nowhere and knows of no edition
├── edition/    the contract (types.ts), the roll, and the seam the build fills
├── editions/   global/ and jp/, one module each
└── app/        the entry, the shell, and the table of every screen there is
```

Core is plain text accounting: the journal, hledger, the reports, the screens,
`window.choai`. It has no idea Japan exists, and there is no `if (edition ===`
anywhere in it. What an edition adds is two tables and nothing else —
`src/edition/types.ts`:

- **`views`** — screens with an address of their own and a place on the rail.
  The door a person comes through.
- **`capabilities`** — the same thing offered by name, described by
  `describe()` and given to a model as a tool by the same rules as everything
  else. The door a script or an agent comes through.

An edition adds; it cannot replace or take away. A view at an address core
already has is dropped, and a capability core already names stays core's, so no
edition can quietly change what a balance sheet means.

Which one a build is comes from `CHOAI_EDITION`, never from anything the running
app asks:

```sh
bun run build            # the global edition — the default
bun run build:global     # the same, said out loud
bun run build:jp         # the Japan edition
bun run dev:jp           # and the same while developing
```

`vite.config.ts` points `~/edition/chosen` at whichever edition was named, so
the other one's code is not in the bundle at all rather than in it and
unreachable — a global build carries no Japanese tax law even after there is
some to carry. A `CHOAI_EDITION` it does not recognise stops the build rather
than falling back, because the fallback would be a global build published at a
name that promised something else.

The Japan edition adds nothing yet, and that is the point: what has been built
is the boundary, not what will stand inside it. Consumption tax, qualified
invoices, a fixed asset register, the adjustments a corporate return is made of,
an e-Tax export — each goes in a directory of its own under
`apps/web/src/editions/jp/`, reaching core the way any code here does and
reaching the app only through those two tables.

Which edition you have open is on the manifest — `describe().edition` — and on
the one line the app writes to the console.

## Three sites

- **`choai.dev`** — the app itself, from `apps/web/dist`.
- **`jp.choai.dev`** — the same app built as the Japan edition, from the same
  directory: `bun run build:jp` and the `wrangler.jp.jsonc` beside it.
- **`docs.choai.dev`** — the page that explains it, from `docs/dist`:
  a separate Astro project, English at the root and Japanese at `/ja/`. It loads
  no fonts and ships no script of its own.

The names are counted by the host as it serves them, rather than by anything
written into any of them: page views, and where they were reached from. Nothing
is kept on the device to recognise a return by, so there is no monthly total and
nobody is followed from one name to the next — which is the counting the privacy
page describes, on the app's behalf as well as its own.

`scripts/build-site.sh` builds the app and the docs locally; the Japan edition
is `bun --cwd=apps/web run build:jp`, which writes to the same `apps/web/dist`.

Each is published on its own as a Cloudflare Worker serving static assets, built
from this repository on a push to `main`. What the directory is and how it is
served is in the `wrangler.jsonc` beside it — `wrangler.jp.jsonc` for the Japan
edition, which is the same file but for the worker's name. The rest lives in the
dashboard, where each is configured the same way but for its own directory and
its own build:

| | `choai` | `choai-jp` | `choai-docs` |
| --- | --- | --- | --- |
| Root directory | `apps/web` | `apps/web` | `docs` |
| Build command | `bun install && bun run build` | `bun install && bun run build:jp` | `bun install && bun run build` |
| Deploy command | `bunx wrangler deploy` | `bunx wrangler deploy -c wrangler.jp.jsonc` | `bunx wrangler deploy` |
| `BUN_VERSION` | `1.3.14` | `1.3.14` | `1.3.14` |
| Custom domain | `choai.dev` | `jp.choai.dev` | `docs.choai.dev` |

No output directory is set in any of them, because `assets.directory` already says
it. Nothing else is needed: the engine is committed, so the build wants no
Haskell toolchain, and `docs` needs no `PUBLIC_APP` because a build that is not
a development one already points at the published app.

The names are attached in the dashboard, on the worker's own Domains & Routes,
and each name's record is written by attaching it. They are deliberately not in
the `wrangler.jsonc` files, though a `routes` entry would put them there: a name
is not part of what this software is, only of where this one copy of it happens
to live. Anyone is free to run their own, and a `wrangler deploy` that opened by
demanding a domain somebody else owns would refuse to do anything at all.

## License

GPL-3.0-or-later.

This is not a preference so much as a consequence: the application ships
hledger-lib compiled into its WebAssembly module, and hledger is
GPL-3.0-or-later, so the combined work is too. Publishing the source here is
what satisfies the corresponding-source obligation for the binary that browsers
download.

`apps/web/src/core/lib/solid-workbench-ui` is the author's own work under MIT, which
is compatible with the above and leaves it reusable outside this project.
Components under `apps/web/src/core/components/ui` are adapted from
[solid-ui](https://github.com/stefan-karger/solid-ui) (MIT). Icons are from
[lucide](https://lucide.dev) (ISC).
