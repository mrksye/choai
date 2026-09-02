import { withJournal } from "~/core/api/capabilities/journal"
import type { SomeCapability } from "~/core/api/capability"
import type { AccountType, Quantity } from "~/core/hledger/wire"
import { fromHledger, type Hitch } from "~/core/api/hitch"
import { figureOf, type Figure } from "~/core/api/answered"
import { ask } from "~/core/hledger/client"
import { askTrialBalance } from "~/core/reports/ask"
import { Err, Ok, digits, fields, nothing, spare, type Result } from "~/core/lib/monad"
import { declaredAcross } from "./chart/directives"
import { checkChart, checkConsumptionTax, checkRegister, type Finding } from "./check/findings"
import { normalize } from "./consumption-tax/normalize"
import { summarizeConsumptionTax } from "./consumption-tax/summarize"
import { depreciationFor } from "./fixed-assets/depreciation"
import { readEvents } from "./fixed-assets/events"
import { ASSET, REGISTER, registerFrom, type FixedAsset } from "./fixed-assets/register"
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
        ...(band.taxWithin === undefined ? {} : { taxWithin: figureOf(band.taxWithin) }),
        query: band.query,
      })),
      unmarked: summary.unmarked.map((one) => ({ index: one.index, account: one.account })),
      unrecognised: summary.unrecognised.map((one) => ({
        index: one.index,
        account: one.account,
        said: one.said,
      })),
      notWorkedOut: summary.notWorkedOut,
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
