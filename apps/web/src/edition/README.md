# Editions

choai is published twice from this one tree. `choai.dev` is the **global
edition**, which belongs to no jurisdiction, and `jp.choai.dev` is the **Japan
edition**, which is where Japanese tax work goes. They share a core, and the
core does not know either of them exists.

This file is the standing policy, kept beside the code it governs. The root
`README.md` says what an edition is and how to build one; this says what must
stay true while they are added to, and how you would find out that it no longer
does.

```
global ─┐
        ├──> core
jp ─────┘
```

## The tree

```
src/
├── core/       plain text accounting. Belongs to nowhere and knows of no edition
├── edition/    the contract (types.ts), the roll, and the seam the build fills
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

**The contract stays small.** Two tables, because this app has two doors:
`views` is how a person arrives, `capabilities` is how a script, a test or a
model arrives. That is the whole of what a jurisdiction needs. Do not grow this
into a plugin framework — no hooks, no lifecycle, no registry, no dependency
injection. If something genuinely cannot be said as a view or a capability,
that is worth a conversation, not a third abstraction added in advance.

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
`JapanEdition`, and only as one of the two tables:

- A **view** is a screen with an address, a place on the rail and an explorer
  beside it. It carries its own `label` as a function, so it can bring words the
  app's dictionary has never heard of and still follow the language being
  switched.
- A **capability** is the same work offered by name. Add one and it is described
  by `describe()`, callable as `choai.call(name, args)`, and given to a model as
  a tool by exactly the same rules as core's own — including `offered`, which is
  what decides whether a model may call it at all.

Both are `readonly` data. Neither needs core to be edited.

## How you would know the boundary had broken

Nothing enforces this at build time, so these are the checks worth running when
the edition directories start to fill up.

**Core naming an edition** — this must print nothing:

```sh
grep -rn "editions/" src/core src/app
```

The only permitted mention of an edition module anywhere outside `editions/` is
`edition/chosen.ts`, which is the hole the build fills.

**The other edition's code in the bundle** — put a distinctive string in a
Japan-only module, build the global edition, and look for it:

```sh
bun run build:global && grep -rc "THE_STRING" dist/assets/
```

Every count must be zero. Then build `build:jp` and confirm it is one, so that
the check is measuring something.

**The seam still being a seam** — `edition/chosen.ts` must be imported through
the alias, as `~/edition/chosen`, and from `edition/index.ts` alone. The build
swaps a *name*; a relative `./chosen` is a name it has no way to recognise, and
under it both editions quietly build as the global one. This has happened once
already.

**Which edition a deployment is** — `window.choai.describe().edition`, and the
one line the app writes to the console.
