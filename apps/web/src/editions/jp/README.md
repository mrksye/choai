# The Japan edition

Everything a Japanese company needs that plain text accounting does not have,
and nothing else. `src/edition/README.md` is the boundary this lives inside;
this file is what stands within it — what is here, what is deliberately not,
and which of the two any new thing belongs to.

## The one division everything follows

```
              hledger
                 │
         ┌───────┴────────┐
         │                │
     the books        tax metadata
         │                │
     ┌───┴───┐       ┌────┴────┐
    BS      PL    consumption  corporate
                     tax       tax adj.
      \      /         │           │
       \    /          │           │
       exporter        │           │
           │           │           │
      NTA CSV ─────────┴───────────┘
           │
         e-Tax
```

**On the left is what does not change.** A date, a debit, a credit, an amount, a
counterparty. It is the same in every country, hledger already keeps it, and
nothing in this edition touches it.

**On the right is what does change** — with a tax year, with a change in the law,
with which accountant a company uses. A consumption tax band, a useful life, the
heading an account prints under. None of it is an accounting fact and none of it
is allowed to look like one.

Every module here sits on one side or the other, and every screen draws the line
across the middle of itself: what the books say above, what Japanese tax makes of
it below. Somebody looking at a figure should be able to see which of the two it
came from without being told.

**e-Tax is a submission protocol and nothing more.** It is not built, and when it
is it goes at the bottom of that diagram and nowhere else. This app is not
becoming a filing tool and hledger is not becoming one either.

## Where things are

```
editions/jp/
├── naming.ts          the addresses and names this edition claims. No imports.
├── words.ts           its own dictionary, keyed by locale — for the screens
├── guidance.ts        how these books are kept, said to a model — composed from
│                      the same constants the code reads
├── tags.ts            reading what a journal was marked with
├── money.ts           exact arithmetic on figures hledger has no report for
├── rules/             every number that changes with the law. Data, with sources
├── chart/             account directives: what an account is, and where it prints
├── consumption-tax/   the tax tag, normalising, and the band totals
├── invoice/           what is known about the paper behind an entry
├── fixed-assets/      the register, the straight-line charge, the entries it becomes
├── closing/           the four accruals a year is closed with
├── check/             findings, split into errors and warnings
├── statements/        the Japanese layout of a balance sheet and an income statement
└── ui/                the two-layer frame, the period, the explorer, the icons
```

## What is written into somebody's journal

All of it is ordinary hledger that a person could have typed, and all of it is
readable without this app. The names are English in every language the screens
speak, because they are keys somebody types into a query — a journal whose tags
changed with the interface language would not answer the same question twice.

| Written as | Where | What it says |
|---|---|---|
| `tax:taxable-purchase-10` | posting tag (an entry tag covers all its postings) | how the figure is treated for consumption tax |
| `invoice:qualified` | entry tag | whether the document behind it is a qualified invoice |
| `partner:株式会社Example` | entry tag | who it was with |
| `invoice-number:T1234567890123` | entry tag | their registration number |
| `evidence:papers/2026/09/a.pdf` | entry tag | where the document itself is kept |
| `asset:PC-2026-001` | entry and posting tag | which fixed asset an entry is about |
| `closing:accrued-expense` | entry tag | that this is a year-end adjustment |
| `jp:sga` | `account` directive tag | which heading the account prints under |
| `; choai-file: fixed-assets.jsonl` | a comment in the journal | that this file belongs with these books |

The last two are read by parsing the journal's own text, because hledger sends
neither: the wire answers what kind each account is and nothing further. That is
not a second source of truth — it is a second reader of the only one.

**A model is told all of this**, through `guidance.ts` and the third field of the
edition contract. Without it a model writes entries with nothing for
`jp.consumptionTax` to count, and is then shown its own entries in the list of
ones nobody has classified. The text is composed from the constants above rather
than typed out beside them, so a category added to `TAX_CATEGORIES` reaches the
model without anybody remembering to come back — a text that has fallen behind
the code is worse than no text, because the model follows it and what it writes
is wrong in a way that looks deliberate. `tests/jp.test.ts` holds the two
together and `e2e/jp.spec.ts` watches it actually reach a provider.

## Depreciation

Both methods, from the tables the tax office publishes. The straight-line rate
and the 200% declining-balance rate each agree with an arithmetic — one over the
years rounded up, and twice one over the years to the nearest — and a test says
so, which is the only check available on a transcription. The revised rate and
the guarantee rate agree with nothing; they are the statute and are written one
line per year in the order it lists them.

The answer is a **schedule replayed from the year the asset went into use**, not
a figure worked out from a running total. Under the declining-balance method a
year cannot be worked out on its own: the moment where a proportion stops being a
proportion is not recoverable from an accumulated amount, because two different
histories reach the same book value. The straight-line method goes through the
same replay so the two have one set of edges.

What the journal says has been written off is carried **alongside** rather than
used. The schedule is what the rules allow; the journal is what happened; and a
year nobody posted shows up as `agreesWithJournal: false` and a warning, instead
of disappearing into a plausible figure.

## The fixed asset register

`fixed-assets.jsonl`, beside the journal, declared by it, and **only ever added
to**. One JSON object per line, each one an event: acquired, corrected, retired.
The register is what reading them in order comes to.

It is a log rather than a table because an asset has a life rather than a value,
and because a file that only grows is the one shape the GitHub syncing here can
merge without asking a person. Correcting a useful life adds a line saying so; it
never goes back and changes the line that was wrong. All three events are
writable from the screen.

**Money is not in it.** How much has been written off is the balance of the
depreciation postings, which the journal has, and a second copy kept here would
be a second copy to disagree with.

## What to do next

This works as it stands. What follows is not a list of holes — it is where the
next hour would go furthest, with the reason, so that whoever picks it up does
not have to rediscover why.

**1. A band's entries, from the band.** The consumption tax screen shows what
each band came to and the hledger query that selects it. Pressing the band should
show those entries. Everything needed is already there — `queryFor` gives the
query and `core/journal/query.ts` already carries one between screens — so this
is a screen's worth of work and no new thinking. It is first because it is the
continuation of the one idea the whole edition rests on: a figure somebody can
look through is a figure somebody can disagree with, and a total that cannot be
opened has to be taken on trust.

**2. Tax-exclusive accounting** (税抜経理). The other half of `AccountingMethod`,
which is a union with the unsupported case already in it, and every function that
would answer differently already switches on it exhaustively. With the tax posted
separately there is nothing inside a figure to find: the answer is the balance of
the tax accounts rather than a fraction of anything, so `taxWithin` stops being a
division and starts being a lookup. Which method a company uses would have to be
said somewhere, and the journal is the only honest place — another tag.

**3. The 250% declining-balance table**, for assets bought between 2007-04-01 and
2012-03-31. It is the three columns beside the ones already transcribed, on the
same published page, and `decliningBalance.from` is already the thing that
decides which applies. Assets that old are getting rare, which is why it is
third and not second: the refusal by name is a correct answer today.

**Outside this boundary** is the right-hand branch of the diagram at the top —
corporate tax adjustments, and the exporter that would take the statements and
the tax summary to an NTA CSV. Both are named there and neither is started
without a conversation first, because the line between "supports a filing" and
"is a filing tool" is the line this whole edition is arranged around.

## What is deliberately not built

Not "not yet" in every case. Some of these are things this app should not do.

**Not built, and there is a place for it later** — corporate tax return forms and
their schedules, local taxes, the NTA CSV exporter, e-Tax submission,
tax-exclusive accounting, and the 250% declining-balance table for assets bought
between 2007 and 2012. Each has a named boundary already: `AccountingMethod` is a
union with the unsupported case in it, an asset from before the table these rules
hold is refused by name rather than run through the wrong numbers, and the
exporter's input is the statements and the tax summary, which are already
structured data.

**Not built, on purpose** — the taxable base, the tax payable, the choice between
working the tax out by aggregation or by invoice, the simplified basis, the
transitional twenty-percent rule, the small-value asset write-offs, how the year
of a disposal is treated. Every one of them is a decision a company makes and can
be wrong about. Working one out silently would hand somebody a figure that looks
filed-in and is not, and the reader would have no way to tell which of the
figures on the screen were theirs.

**Never** — payroll, year-end adjustment, social insurance, bank connections,
OCR, automatic categorisation of entries without a person seeing them, and a
plugin system. The first several are other products. The last is a boundary that
would stop meaning anything.

## Rules for adding to this

1. **Nothing here may be an accounting fact.** If a change would make a balance
   sheet mean something different, it is in the wrong place — core is where
   accounting lives, and core does not know Japan exists.
2. **Nothing writes an entry.** Anything that would change the books is a
   `propose()` away from a person pressing a button. There is no second road.
3. **Numbers from the law are data, with a source.** They go in `rules/`, one
   file per set, with the page they were read off named beside them. There is no
   `if (year >= …)` anywhere and there is not to be one.
4. **Decline by name rather than guessing.** A method that cannot be worked out,
   a useful life outside the table, a disposal mid-year: each returns its own
   refusal, and a screen says what it was. Half of doing this honestly is knowing
   when not to answer.
5. **An error is not a judgement.** `check/` splits the two, and nothing that
   needs a tax decision is an error. Calling a judgement an error teaches the
   reader to dismiss the real ones.
6. **Pure modules import no screens.** `bun test` cannot load a `.tsx` — there is
   no JSX runtime for it — so anything worth testing stays in a module that draws
   nothing. That has kept the reasoning testable and it should go on doing so.

## Checking that none of this reaches a global build

The typechecker holds the import boundary; nothing holds the bundle, so it is
checked by hand when something distinctive is added.

```sh
bun run build:global && grep -rl "消費税" dist/assets/    # nothing listed
bun run build:jp     && grep -rl "消費税" dist/assets/    # one file listed
```

The second half is what makes the first half mean anything.
