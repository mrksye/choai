# Editions

choai is published twice from this one tree. `choai.dev` is the **global
edition**, which belongs to no jurisdiction, and `jp.choai.dev` is the **Japan
edition**, which is where Japanese tax work goes. They share a core, and the
core does not know either of them exists.

This file is the standing policy, kept beside the code it governs. The root
`README.md` says what an edition is and how to build one; this says what must
stay true while they are added to, and what holds each rule — two of them are
held by the build rather than by anybody remembering.

```
global ─┐
        ├──> core
jp ─────┘
```

## The tree

```
src/
├── core/       plain text accounting. Belongs to nowhere and knows of no edition
├── edition/    the contract (types.ts), the roll, and the door core knows an
│               edition by
├── editions/   global/ and jp/, one module each
└── app/        the entry, the shell, and the table of every screen there is
```

## The rules

**Core belongs to nowhere.** Everything under `core/` is plain text accounting:
the journal, hledger, the reports, the screens, `window.choai`. Consumption
tax, qualified invoices, a fixed asset register, the adjustments a corporate
return is made of, an e-Tax export — none of these is missing from core. None
of them was ever core's to have. `core -> editions/jp` is the one import that
must never exist, and nothing under `core/` may name an edition at all.

**No conditionals on the edition.** Not `if (isJapan)`, not
`if (import.meta.env.VITE_JP)`, not a `country === "JP"` in a report. A
jurisdiction that is expressed as branches spreads through everything it
touches and can never be taken out again; one that is expressed as a module is
either linked or it is not. If you find yourself wanting the branch, the thing
you want belongs on the other side of the seam.

**One tree, never two repositories.** A fork would drift within a month, and
the drift would be silent — the same bug fixed once, the same screen improved
in one of them. Whatever is true of bookkeeping is true in both editions, so it
is written once.

**Build time, not run time.** `CHOAI_EDITION` decides which edition a build is.
An edition is a fact about a deployment, not a setting somebody turns on, and
nothing in the running app asks. This is also what keeps the other edition's
code out of the bundle: a runtime flag would ship both and choose between them.

**An edition adds; it cannot replace or take away.** A view at an address core
already has is dropped, and a capability name core already uses stays core's.
Neither is a check to be remembered — the first is a filter in `viewsWith`, the
second is the order of a spread in `capabilitiesWith`. So no edition can
quietly change what a balance sheet means, and reading core tells you the whole
of what core does.

**The contract stays small.** Two tables and a paragraph, because this app has
three doors: `views` is how a person arrives, `capabilities` is how a script or
a test arrives, and a model arrives through both of them at once — it is handed
the capabilities as tools, and it is told what it is doing. `guidance` is the
second half of that third door.

It was added after the first half proved to be half. An edition could give a
model a consumption tax report to call and could not tell it that entries in
these books carry a classification, so a model writing an entry wrote it without
one and the report it had just been given came back saying so. That is not a
hook and not a lifecycle; it is the contract catching up with a door it already
had part of.

Do not grow it further into a plugin framework — no hooks, no lifecycle, no
registry, no dependency injection. If something genuinely cannot be said as a
view, a capability or a paragraph, that is worth a conversation, not a fourth
abstraction added in advance.

**What an edition says to a model is added, never in place of anything.** It
goes after core's instructions and cannot remove or contradict them: what a
model is told about offering an entry before it is kept is core's, in every
edition. This is the same rule `viewsWith` and `capabilitiesWith` keep, in the
form a paragraph can keep it — and `tests/pure.test.ts` holds it, because
appending is the only thing `prompt.ts` is allowed to do with it.

**Names are `global` and `jp`.** In TypeScript, `GlobalEdition` and
`JapanEdition`. Never `isJP`, never `useJapaneseMode`, never `specialMode`. A
boolean cannot describe a third edition, and a name that says "special" says
nothing at all.

## The global edition is not the empty one

It is the standard edition, and it is what somebody in any country gets.

> Simple, manual, jurisdiction-neutral.

It automates no country's tax rules, and it withholds nothing: the journal, the
accounts, the entries, the reports, and the whole flexibility of hledger. A
country's rules are expressible by hand in any set of books — the accounts, the
tags and the declarations are the reader's own. An edition is only what saves
somebody from doing that by hand.

## Adding something to the Japan edition

Put it in a directory of its own under `editions/jp/`, one per subject:

```
editions/jp/
├── consumption-tax/
├── invoice/
├── fixed-assets/
├── corporate-tax/
└── etax/
```

It may reach into core the way any code here does — the journal, hledger, the
reports, the components, the shape checkers. It reaches the app only through
`JapanEdition`, and only as one of the two tables or the paragraph:

- A **view** is a screen with an address, a place on the rail and an explorer
  beside it. It carries its own `label` as a function, so it can bring words the
  app's dictionary has never heard of and still follow the language being
  switched.
- A **capability** is the same work offered by name. Add one and it is described
  by `describe()`, callable as `choai.call(name, args)`, and given to a model as
  a tool by exactly the same rules as core's own — including `offered`, which is
  what decides whether a model may call it at all.
- **`guidance`** is what a model is told about how these books are kept: which
  tags entries here carry and what the words for them are. Compose it from the
  constants the code already reads, so it cannot fall behind them, and leave the
  deciding to the reader — say where a classification goes, not which one a
  particular purchase takes.

All three are `readonly` data. None of them needs core to be edited.

## What holds these rules

Two of them are held rather than hoped for. The rest are still prose, and are
marked as such below.

**Naming an edition module from outside one fails to compile.**
`tsconfig.boundary.json` is the app's own settings over core, the app and this
contract — and over no edition at all — with `composite`, which makes that list
binding: importing a file the project does not list is an error rather than a
reason to widen it. So the import comes back as `TS6307`, naming the file and
the line, and `bun run build` stops before vite is ever reached.

There is no exception, not even for the seam. `~/edition/chosen` is a name with
no file behind it: vite's alias points it at the edition being built, `paths`
points it at the global edition for the typechecker, the tests and the editor,
and the boundary check points it at `edition/none.ts`, which declares an edition
without being one. So the check can list no editions and still typecheck the
whole of core, and there is nothing left that a rule has to be bent around.

That the seam has no file is also why it can only be spelled one way. A
`./chosen` beside it would resolve to the same module, typecheck, test clean,
and quietly build every edition as the global one — which happened once. There
is no longer a file to reach that way.

**`tests/boundary.test.ts` holds what no type can say**, which is which
spelling was used and what a module says about itself. It reads the source
rather than importing it, and asserts:

- nothing outside `editions/` names an edition module — the list is empty, not
  "empty but for the seam".
- the seam has no file, is spelled `~/edition/chosen`, and is imported from
  `edition/index.ts` alone.
- the three tsconfigs agree on where that name resolves, since a seam that
  resolved differently between the typechecker and the tests would be a
  difference nobody could see.
- nothing outside `editions/` asks `edition.id === "jp"`.
- every `editions/*/index.ts` answers to the name `edition`, which is what the
  seam is replaced by.

**Still only prose**, so worth a look by eye when the Japan edition fills up:
that a Japanese rule has not been expressed as a branch somewhere subtler than
the test's pattern, that the contract has not grown a third table, and that
what an edition adds is still only added.

**The other edition's code staying out of a bundle** is not held by anything,
because nothing can assert on a bundle from here. Check it by hand when the
Japan edition first has code worth shaking out: put a distinctive string in a
Japan-only module and look for it.

```sh
bun run build:global && grep -rc "THE_STRING" dist/assets/   # every count zero
bun run build:jp     && grep -rc "THE_STRING" dist/assets/   # one of them is not
```

The second half is what makes the first half mean anything.

**Which edition a deployment is** — `window.choai.describe().edition`, and the
one line the app writes to the console.
