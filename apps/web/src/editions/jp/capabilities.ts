import { withJournal } from "~/core/api/capabilities/journal"
import type { SomeCapability } from "~/core/api/capability"
import type { AccountType, Quantity } from "~/core/hledger/wire"
import { fromHledger, type Hitch } from "~/core/api/hitch"
import { figureOf, type Figure } from "~/core/api/answered"
import { ask } from "~/core/hledger/client"
import { askTrialBalance } from "~/core/reports/ask"
import { Err, Ok, digits, fields, listOf, nothing, spare, text, type Result } from "~/core/lib/monad"
import { declaredAcross } from "./chart/directives"
import { checkChart, checkConsumptionTax, checkRegister, type Finding } from "./check/findings"
import { normalize } from "./consumption-tax/normalize"
import { DEDUCT, DEDUCT_VALUES, TAX, TAX_CATEGORIES } from "./consumption-tax/category"
import { EVIDENCE, INVOICE, INVOICE_STATUSES, PARTNER, REGISTRATION } from "./invoice/note"
import { ACCRUALS, CLOSING } from "./closing/adjustments"
import { JP } from "./chart/mapping"
import { SECTIONS } from "./chart/sections"
import { summarizeConsumptionTax, type NotWorkedOut } from "./consumption-tax/summarize"
import { depreciationFor } from "./fixed-assets/depreciation"
import { readEvents } from "./fixed-assets/events"
import { ASSET, REGISTER, registerFrom, type FixedAsset } from "./fixed-assets/register"
import { asLine } from "./fixed-assets/events"
import { COMPANION, companionsIn } from "~/core/journal/companions"
import { propose } from "~/core/journal/proposals"
import { shapeOf, type OfferedAll } from "~/core/api/capabilities/transaction"
import { fromRefusal } from "~/core/api/hitch"
import { writtenOffIn } from "./fixed-assets/written-off"
import { asFigure, whole } from "./money"
import { CAPABILITY } from "./naming"
import { RULES } from "./rules"
import { balanceSheetFrom, incomeStatementFrom } from "./statements/layout"
import { during, fiscalYearFrom, lastDayOf, upTo, type FiscalYear } from "./statements/period"

/**
 * The same work, offered by name.
 *
 * Everything the screens here do is reachable without one: a script, a test or a
 * model asks `choai.call("jp.consumptionTax", …)` and gets the figures the
 * screen is drawn from. That is the second of the two doors an edition has, and
 * it is the same door core's own capabilities come through — described by
 * `describe()`, checked against the same shapes, offered to a model by the same
 * rules.
 *
 * None of them writes. Depreciation comes back as figures and the entries are
 * proposed by a person on the closing screen, because an edition that could put
 * an accounting entry into the journal by name would be a way around the one
 * rule this app has about its own books.
 *
 * The summaries are written for something that is not a person and say what is
 * not being answered as plainly as what is, because a model that mistakes a
 * total of taxable sales for a tax return will say so to somebody who believes it.
 */

const YEAR = {
  year: digits("The calendar year the financial year begins in, e.g. 2026."),
  startingMonth: spare(
    digits("The month it begins in, 1 for January. April if left out, which is the commonest in Japan."),
  ),
}

const APRIL = 4

/**
 * What hledger takes each account to be, asked outright.
 *
 * The screens read this off a resource core keeps for them, which is right for
 * a screen: it settles a moment later and everything redraws. It is wrong here.
 * A capability answers once and is done, and one that read a resource would
 * answer differently depending on whether an unrelated screen had happened to
 * ask first — silently, and in the direction of claiming less than it knows.
 * Asking costs one more round trip and cannot be out of date.
 */
const typesOf = async (): Promise<Result<Readonly<Record<string, AccountType>>, Hitch>> => {
  const reply = await ask({ kind: "accountTypes" })
  return reply.ok ? Ok(reply.value) : Err(fromHledger(reply.error))
}

const yearFrom = (args: { readonly year: number; readonly startingMonth?: number }): FiscalYear =>
  fiscalYearFrom(args.year, args.startingMonth ?? APRIL)

export interface TaxBand {
  readonly category: string
  readonly postings: number
  readonly recorded: Figure
  readonly total: Figure
  /**
   * The same band, split by which side of the books each posting was on.
   *
   * Three of the categories say nothing about the side, so their total nets a
   * sale against a purchase — and the ratio of taxable sales to all sales cannot
   * be worked out from a figure like that. Which side it was on is in the
   * account, so it is read from there rather than from the tag.
   */
  readonly bySide: {
    readonly sales: { readonly postings: number; readonly total: Figure }
    readonly purchases: { readonly postings: number; readonly total: Figure }
    readonly unplaced: { readonly postings: number; readonly total: Figure }
  }
  readonly taxWithin?: Figure
  readonly query: string
}

export interface TaxAnswer {
  readonly from: string
  readonly to: string
  readonly rules: string
  readonly accounting: string
  readonly entries: number
  readonly bands: readonly TaxBand[]
  readonly unmarked: readonly { readonly index: number; readonly account: string }[]
  readonly unrecognised: readonly { readonly index: number; readonly account: string; readonly said: string }[]
  /** Said in the answer, not only on a screen. This is not a return. */
  readonly notWorkedOut: readonly string[]
  /** What the count of unclassified postings does not reach. */
  readonly notChecked: readonly string[]
  /**
   * What was asked about, and what was passed over.
   *
   * Published because `unmarked` being empty is what a caller will read as the
   * work being finished, and an empty list looks the same whether there was
   * nothing left or whether the question was narrow. The accounts holding money
   * are on `skipped` and always will be; an account with an unfamiliar name and
   * a real figure on it is the one to look at.
   */
  readonly coverage: {
    readonly examined: number
    readonly skipped: readonly {
      readonly account: string
      readonly type?: string
      readonly postings: number
      readonly total: Figure
    }[]
  }
}

/**
 * What is not worked out, in the words something that is not a person reads.
 *
 * English here and the reader's language on the screen, from the one list of
 * names — because a model that mistakes a band total for a tax return will say
 * so to somebody who believes it, and it should be told plainly which steps are
 * missing.
 */
const NOT_WORKED_OUT_SAID: Readonly<Record<NotWorkedOut, string>> = {
  "taxable-base": "the taxable base, which is rounded down to the nearest thousand yen",
  "tax-payable":
    "the tax payable, which depends on whether it is worked out by aggregation or by invoice",
  "simplified-basis": "the simplified basis, and the transitional twenty-percent rule",
  "national-and-local": "the split between national and local consumption tax",
}

const consumptionTax = (args: {
  readonly year: number
  readonly startingMonth?: number
}): Promise<Result<TaxAnswer, Hitch>> =>
  withJournal(async (open) => {
    const year = yearFrom(args)
    const reply = await ask({
      kind: "entries",
      query: during(year),
      limit: Math.max(open.summary.transactions, 1),
      offset: 0,
    })
    if (!reply.ok) return Err(fromHledger(reply.error))

    const types = await typesOf()
    if (!types.ok) return types

    const summary = summarizeConsumptionTax(normalize(reply.value.items), RULES, types.value)
    return Ok({
      from: year.from,
      to: lastDayOf(year),
      rules: summary.rules,
      accounting: summary.accounting,
      entries: summary.entries,
      bands: summary.bands.map((band) => ({
        category: band.category,
        postings: band.postings,
        recorded: figureOf(band.recorded),
        total: figureOf(band.total),
        bySide: {
          sales: { postings: band.bySide.sales.postings, total: figureOf(band.bySide.sales.total) },
          purchases: {
            postings: band.bySide.purchases.postings,
            total: figureOf(band.bySide.purchases.total),
          },
          unplaced: {
            postings: band.bySide.unplaced.postings,
            total: figureOf(band.bySide.unplaced.total),
          },
        },
        ...(band.taxWithin === undefined ? {} : { taxWithin: figureOf(band.taxWithin) }),
        query: band.query,
      })),
      unmarked: summary.unmarked.map((one) => ({ index: one.index, account: one.account })),
      unrecognised: summary.unrecognised.map((one) => ({
        index: one.index,
        account: one.account,
        said: one.said,
      })),
      notWorkedOut: summary.notWorkedOut.map((one) => NOT_WORKED_OUT_SAID[one]),
      notChecked: [...summary.notChecked],
      coverage: {
        examined: summary.coverage.examined,
        skipped: summary.coverage.skipped.map((one) => ({
          account: one.account,
          ...(one.type === undefined ? {} : { type: one.type }),
          postings: one.postings,
          total: figureOf(one.total),
        })),
      },
    })
  })

export interface StatementLine {
  readonly account: string
  readonly amount: Figure
  /** Whether the heading was declared, assumed, or neither. */
  readonly placed: string
}

export interface StatementHeading {
  readonly section: string
  readonly total: Figure
  readonly lines: readonly StatementLine[]
}

export interface StatementsAnswer {
  readonly balanceSheet: {
    readonly asAt: string
    readonly parts: readonly { readonly part: string; readonly total: Figure; readonly headings: readonly StatementHeading[] }[]
    readonly unplaced: readonly StatementLine[]
  }
  readonly incomeStatement: {
    readonly from: string
    readonly to: string
    readonly headings: readonly StatementHeading[]
    readonly running: readonly { readonly id: string; readonly total: Figure }[]
    readonly unplaced: readonly StatementLine[]
  }
}

const lineOf = (line: {
  account: string
  amount: Parameters<typeof figureOf>[0]
  placement: { is: string }
}): StatementLine => ({
  account: line.account,
  amount: figureOf(line.amount),
  placed: line.placement.is,
})

const headingOf = (heading: {
  section: string
  total: Parameters<typeof figureOf>[0]
  lines: readonly Parameters<typeof lineOf>[0][]
}): StatementHeading => ({
  section: heading.section,
  total: figureOf(heading.total),
  lines: heading.lines.map(lineOf),
})

const statements = (args: {
  readonly year: number
  readonly startingMonth?: number
}): Promise<Result<StatementsAnswer, Hitch>> =>
  withJournal(async (open) => {
    const year = yearFrom(args)
    const standing = await askTrialBalance(upTo(year))
    if (!standing.ok) return Err(fromHledger(standing.error))
    const moving = await askTrialBalance(during(year))
    if (!moving.ok) return Err(fromHledger(moving.error))

    const types = await typesOf()
    if (!types.ok) return types

    const declared = declaredAcross(open.source.files)

    const sheet = balanceSheetFrom(standing.value.report.prRows, declared, types.value, lastDayOf(year))
    const income = incomeStatementFrom(
      moving.value.report.prRows,
      declared,
      types.value,
      year.from,
      lastDayOf(year),
    )

    return Ok({
      balanceSheet: {
        asAt: sheet.asAt,
        parts: sheet.parts.map((part) => ({
          part: part.part,
          total: figureOf(part.total),
          headings: part.headings.map(headingOf),
        })),
        unplaced: sheet.unplaced.lines.map(lineOf),
      },
      incomeStatement: {
        from: income.from,
        to: income.to,
        headings: income.headings.map(headingOf),
        running: income.running.map((one) => ({ id: one.id, total: figureOf(one.total) })),
        unplaced: income.unplaced.lines.map(lineOf),
      },
    })
  })

export interface RegisteredAsset extends FixedAsset {
  readonly inUse: boolean
}

export interface RegisterAnswer {
  readonly file: string
  readonly assets: readonly RegisteredAsset[]
  readonly unreadableLines: readonly { readonly line: number; readonly why: string }[]
}

const registerIn = (files: Readonly<Record<string, string>>) => {
  const reading = readEvents(files[REGISTER] ?? "")
  return { reading, register: registerFrom(reading.events) }
}

const fixedAssets = (): Promise<Result<RegisterAnswer, Hitch>> =>
  withJournal(async (open) => {
    const { reading, register } = registerIn(open.source.files)
    return Ok({
      file: REGISTER,
      assets: register.assets.map((asset) => ({ ...asset, inUse: asset.retiredAt === undefined })),
      unreadableLines: reading.faults.map((one) => ({ line: one.line, why: one.why })),
    })
  })

export interface Charge {
  readonly assetId: string
  readonly account: string
  readonly commodity: string
  readonly months: number
  /** Whether this year is worked out on a fixed base rather than a proportion. */
  readonly switched: boolean
  /**
   * Every figure here is a figure, not a string of one.
   *
   * These were worked out in this edition rather than by hledger, and they leave
   * under the same promise as everything else that leaves: a mantissa, a scale
   * and the same amount written out. A caller adding two of them together should
   * not have to parse a decimal point back out of text.
   */
  readonly charge: Figure
  readonly remaining: Figure
  /** What the schedule had written off before this year, and what the journal says. */
  readonly scheduledBefore: Figure
  readonly writtenOffBefore: Figure
  readonly agreesWithJournal: boolean
  readonly rules: string
}

export interface DepreciationAnswer {
  readonly from: string
  readonly to: string
  readonly charges: readonly Charge[]
  /** Assets with no charge this year, each with the reason. */
  readonly notWorkedOut: readonly { readonly assetId: string; readonly why: string }[]
  /** How these become entries. They are never written by calling this. */
  readonly howToWriteThem: string
}

const OFFERED_NOT_WRITTEN =
  "These are figures, not entries. To put them in the journal, write them as transactions through transaction.propose so they are shown before they are kept — or use the year-end screen, which does the same."

const depreciation = (args: {
  readonly year: number
  readonly startingMonth?: number
}): Promise<Result<DepreciationAnswer, Hitch>> =>
  withJournal(async (open) => {
    const year = yearFrom(args)
    const { register } = registerIn(open.source.files)

    const already = await ask({
      kind: "entries",
      query: `tag:${ASSET} date:..${year.from}`,
      limit: Math.max(open.summary.transactions, 1),
      offset: 0,
    })
    if (!already.ok) return Err(fromHledger(already.error))

    const types = await typesOf()
    if (!types.ok) return types

    const writtenOff = writtenOffIn(already.value.items, types.value)

    const worked = register.assets.map((asset) => ({
      asset,
      out: depreciationFor(asset, year, RULES, writtenOff.get(asset.id) ?? whole(0)),
    }))

    /** Written the way this journal writes figures, where it says how it does. */
    const shown = (value: Quantity, commodity: string): Figure =>
      asFigure(value, commodity, open.summary.defaultCommodity)

    return Ok({
      from: year.from,
      to: lastDayOf(year),
      charges: worked.flatMap(({ asset, out }) =>
        out.ok
          ? [
              {
                assetId: asset.id,
                account: asset.account,
                commodity: asset.commodity,
                months: out.value.months,
                switched: out.value.switched,
                charge: shown(out.value.charge, asset.commodity),
                remaining: shown(out.value.remaining, asset.commodity),
                scheduledBefore: shown(out.value.scheduledBefore, asset.commodity),
                writtenOffBefore: shown(out.value.writtenOffBefore, asset.commodity),
                agreesWithJournal: out.value.agreesWithJournal,
                rules: out.value.rules,
              },
            ]
          : [],
      ),
      notWorkedOut: worked.flatMap(({ asset, out }) =>
        out.ok ? [] : [{ assetId: asset.id, why: out.error.why }],
      ),
      howToWriteThem: OFFERED_NOT_WRITTEN,
    })
  })

export interface CheckAnswer {
  readonly errors: readonly Finding[]
  readonly warnings: readonly Finding[]
}

const check = (args: {
  readonly year: number
  readonly startingMonth?: number
}): Promise<Result<CheckAnswer, Hitch>> =>
  withJournal(async (open) => {
    const year = yearFrom(args)
    const reply = await ask({
      kind: "entries",
      query: during(year),
      limit: Math.max(open.summary.transactions, 1),
      offset: 0,
    })
    if (!reply.ok) return Err(fromHledger(reply.error))

    const types = await typesOf()
    if (!types.ok) return types

    const declared = declaredAcross(open.source.files)
    const { reading, register } = registerIn(open.source.files)
    const entries = normalize(reply.value.items)

    const found: readonly Finding[] = [
      ...checkRegister(reading, register, RULES, open.summary.accounts, open.summary.defaultCommodity?.symbol),
      ...checkConsumptionTax(entries, summarizeConsumptionTax(entries, RULES, types.value)),
      ...checkChart(open.summary.accounts, declared, types.value),
    ]

    return Ok({
      errors: found.filter((one) => one.severity === "error"),
      warnings: found.filter((one) => one.severity === "warning"),
    })
  })

/**
 * Assets offered for the register, never written to it.
 *
 * The register is a file beside the journal, and the rule that nothing is kept
 * until somebody has seen it is a rule about this app rather than about the
 * journal — so this goes through the same proposal a transaction does: the lines
 * are shown as the lines they would be, and a person presses.
 *
 * The declaration goes in the same proposal where the journal does not carry one
 * yet. A register written and undeclared is a file the repository will take and
 * never give back, and the two must not be able to happen separately.
 */
const recordAssets = (args: {
  readonly assets: readonly {
    readonly id: string
    readonly name: string
    readonly account: string
    readonly acquiredAt: string
    readonly inService: string
    readonly cost: string
    readonly usefulLife: number
    readonly method?: string
    readonly confidence?: number
    readonly why?: string
  }[]
}): Promise<Result<OfferedAll, Hitch>> =>
  withJournal(async (open) => {
    const entry = open.source.entry.replace(/^\//, "")
    const journal = open.source.files[entry] ?? ""
    const known = new Set(registerIn(open.source.files).register.assets.map((one) => one.id))

    const lines = args.assets
      .filter((one) => !known.has(one.id.trim()))
      .map((one) => ({
        line: asLine({
          event: "acquired",
          id: one.id.trim(),
          at: one.acquiredAt,
          name: one.name,
          account: one.account,
          cost: one.cost,
          commodity: open.summary.defaultCommodity?.symbol ?? "",
          method: one.method ?? "straight-line",
          usefulLife: one.usefulLife,
          inService: one.inService,
        }),
        confidence: one.confidence ?? 1,
        ...(one.why === undefined ? {} : { why: one.why }),
      }))

    if (lines.length === 0) return Err({ at: "nothing-proposed" })

    const declaring = companionsIn(journal).includes(REGISTER)
      ? []
      : [
          {
            is: "append" as const,
            path: entry,
            text: `\n; ${COMPANION}: ${REGISTER}`,
            confidence: 1,
          },
        ]

    const made = await propose([
      ...lines.map((one) => ({ is: "append" as const, path: REGISTER, ...one, text: one.line })),
      ...declaring,
    ])
    return made.ok
      ? Ok(shapeOf(made.value, open.summary.defaultCommodity))
      : Err(fromRefusal(made.error))
  })

/**
 * The vocabulary these books are marked with, as data.
 *
 * The guidance tells a model this in prose, which is right for a model and no
 * use to anything else: a script, a test, or a person at the console reads
 * `describe()` and finds `tax:` named in one summary and nothing at all about
 * the invoice tags. That left the names in the author's head, which is where a
 * convention goes to die.
 *
 * So they are answerable. Every name and every permitted value comes from the
 * constant the code reads, so this cannot describe a vocabulary the code does
 * not have.
 */
const conventions = async (): Promise<Result<Vocabulary, Hitch>> =>
  Ok({
    tags: [
      {
        name: TAX,
        on: "posting",
        values: [...TAX_CATEGORIES],
        says: "How the figure is treated for consumption tax. On the posting, because one receipt can hold a line at each rate; on the entry it counts for every posting under it.",
      },
      {
        name: INVOICE,
        on: "entry",
        values: [...INVOICE_STATUSES],
        says: "Whether the document behind the entry is a qualified invoice. Unknown is not the same as not-qualified: one is a question nobody asked.",
      },
      {
        name: DEDUCT,
        on: "posting",
        values: [...DEDUCT_VALUES],
        says: "Whether the tax on this purchase can be taken off what is owed. A second question, not a finer answer to the tax band: it turns on whether a qualified invoice was kept, whether a provider abroad is registered, and what the purchase was for. Write the reason after a second colon, as deduct:no:… . Nothing said is counted as deductible, which is the ordinary case, and counted again on its own so the silence stays visible.",
      },
      { name: PARTNER, on: "entry", values: [], says: "Who it was with." },
      {
        name: REGISTRATION,
        on: "entry",
        values: [],
        says: "The supplier's registration number, which is a T and thirteen digits. Keeping input tax deductible turns on holding one, so it belongs in the books beside the entry rather than only on the paper.",
      },
      {
        name: EVIDENCE,
        on: "entry",
        values: [],
        says: "Where the document itself is kept, as a path relative to the journal. The file stays a file; this only says where.",
      },
      {
        name: ASSET,
        on: "entry",
        values: [],
        says: "Which fixed asset an entry is about. Written from the register rather than by hand — an entry tagged by hand would be counted twice.",
      },
      {
        name: CLOSING,
        on: "entry",
        values: [...ACCRUALS],
        says: "That this is a year-end adjustment. Written from the year-end screen rather than by hand.",
      },
    ],
    accountTag: {
      name: JP,
      values: [...SECTIONS],
      says: "On an `account` directive rather than on an entry: which heading of a Japanese statement the account is printed under. Read out of the journal's own text, because hledger sends what kind an account is and nothing further.",
    },
  })

export interface Vocabulary {
  readonly tags: readonly {
    readonly name: string
    readonly on: "entry" | "posting"
    /** The values this takes, where it takes a fixed set. Empty means free text. */
    readonly values: readonly string[]
    readonly says: string
  }[]
  readonly accountTag: {
    readonly name: string
    readonly values: readonly string[]
    readonly says: string
  }
}

export const JAPAN_CAPABILITIES: Readonly<Record<string, SomeCapability>> = {
  [CAPABILITY.consumptionTax]: {
    summary:
      "Consumption tax totals for a Japanese financial year, per band, worked out from the tax: tag on each posting. Every band carries the hledger query that selects exactly what it counted, so any figure can be checked against hledger directly. This is NOT a return: the taxable base, the tax payable, the simplified basis and the transitional rule are all deliberately not worked out, and the answer lists them. Do not present a band total as an amount of tax owed.",
    takes: fields(YEAR),
    writes: false,
    needsJournal: true,
    leaves: false,
    offered: true,
    run: consumptionTax,
  },

  [CAPABILITY.statements]: {
    summary:
      "A balance sheet and an income statement laid out the way a Japanese company's are, for one financial year. Every figure is hledger's; what happens here is the grouping, which comes from the jp: tag on each account's declaration. Accounts with no heading are returned under `unplaced` rather than dropped, and each line says whether its heading was declared or assumed.",
    takes: fields(YEAR),
    writes: false,
    needsJournal: true,
    leaves: false,
    offered: true,
    run: statements,
  },

  [CAPABILITY.fixedAssets]: {
    summary:
      "The fixed asset register, read from the plain text file kept beside the journal. Lifecycle only — what was bought, when it was put to use, how long it is expected to last. `cost` is the text the file holds, exactly as somebody wrote it, because that is what the register records; the figures worked out from it come back from jp.depreciation as figures. How much has been written off is not here because the journal has it: query tag:asset=<id> for that.",
    takes: nothing,
    writes: false,
    needsJournal: true,
    leaves: false,
    offered: true,
    run: fixedAssets,
  },

  [CAPABILITY.depreciation]: {
    summary:
      "What may be written off each fixed asset in a financial year, straight line or declining balance. The answer is the statutory schedule replayed from the year the asset went into use, so it says what the rules allow rather than what was posted; `writtenOffBefore` is what the journal actually holds and `agreesWithJournal` says whether the two match. Where they do not, a year was probably never posted — say so rather than presenting the charge as settled. Returns figures, never entries: to put them in the journal, offer them through transaction.propose so a person sees them first. Assets it will not work out — a useful life outside the published table, an asset bought before the rates these rules hold, one disposed of mid-year — come back under `notWorkedOut` with the reason, and must be entered by hand rather than guessed at.",
    takes: fields(YEAR),
    writes: false,
    needsJournal: true,
    leaves: false,
    offered: true,
    run: depreciation,
  },

  [CAPABILITY.recordAssets]: {
    summary:
      "Offer fixed assets for the register kept beside the journal — never write them. What comes back is a proposal, shown as the lines it would add and kept only when a person presses, exactly as a transaction is. Give what you read off the purchase: an id somebody will recognise, what it is, the account it sits in, what it cost, when it was bought and when it was put to use. A useful life is a statutory class rather than a guess, so unless the reader gave you one, say so and put the confidence below 1. An id already in the register is left alone rather than added twice.",
    takes: fields({
      assets: listOf(
        "The assets to offer.",
        fields({
          id: text("An id somebody will recognise, unique in the register."),
          name: text("What it is."),
          account: text("The account it sits in, spelled as journal.summary spells it."),
          acquiredAt: text("The day it was bought, as YYYY-MM-DD."),
          inService: text("The day it was put to use, as YYYY-MM-DD. Writing it off starts here."),
          cost: text("What it cost, as a plain figure with no symbol."),
          usefulLife: digits("In years, as the statutory tables count them."),
          method: spare(text("straight-line or declining-balance. Straight line if left out.")),
          confidence: spare(digits("How sure you are, from 0 to 1.")),
          why: spare(text("Why these details, in a phrase.")),
        }),
      ),
    }),
    writes: false,
    needsJournal: true,
    leaves: false,
    offered: true,
    run: recordAssets,
  },

  [CAPABILITY.conventions]: {
    summary:
      "The tags these books are marked with: what each one is called, whether it goes on an entry or on a posting, and the values it takes. Read this before writing or classifying an entry here — a treatment written under a name this edition does not read is a treatment nothing counts, and the names are not guessable. Every one of them is ordinary hledger written into the journal, so anything that opens the file can see them too.",
    takes: nothing,
    writes: false,
    needsJournal: false,
    leaves: false,
    offered: true,
    run: conventions,
  },

  [CAPABILITY.check]: {
    summary:
      "What is worth saying about these books for Japanese purposes, split into errors and warnings. An error is something that does not hold together and no figure resting on it means anything. A warning is a place where a person has to decide — a purchase with no invoice details may be perfectly deductible — so do not report a warning as a mistake.",
    takes: fields(YEAR),
    writes: false,
    needsJournal: true,
    leaves: false,
    offered: true,
    run: check,
  },
} satisfies Record<string, SomeCapability>
