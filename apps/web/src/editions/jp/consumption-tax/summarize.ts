import type { AccountType, MixedAmount } from "~/core/hledger/wire"
import { includedAt, negated, sumOf } from "../money"
import type { Fraction, JapaneseTaxRules, Side } from "../rules"
import { queryFor, type JapaneseTaxCategory } from "./category"
import type { JapaneseTaxTransaction, TaxPosting } from "./normalize"

/**
 * What each band of the consumption tax came to, and what is still unanswered.
 *
 * A fold over what `normalize` read, and nothing else: given the same entries it
 * gives the same figures, with no journal, no hledger and no screen involved.
 * That is the point of it — a tax figure is the sort of thing somebody has to be
 * able to check line by line, and one that can only be produced by running an
 * application is one nobody can.
 *
 * **This is not a return.** It is the totals a return is worked out from. What
 * is deliberately not here is every step that needs a judgement or an election:
 * the taxable base rounded down to the nearest thousand, the choice between
 * working the tax out by aggregation or by invoice, the simplified basis, the
 * transitional twenty-percent rule. Each of those is a decision a company makes
 * and can be wrong about, and an app that quietly made it for them would be
 * handing over a figure that looks filed-in and is not.
 *
 * The tax within a band is offered on the same terms. It is the arithmetic of an
 * inclusive figure and nothing more, worked out at the rounding the rules name,
 * and it is a reference — the sort of number somebody checks their own working
 * against, not the sort they copy onto a form.
 */

/**
 * What this deliberately does not work out, named rather than worded.
 *
 * Named, because the two places that say it say it differently: a screen says it
 * in the language the reader is reading, and the API says it in English to
 * something that is not a person. One list of identifiers, two tables of
 * sentences, and a test that neither table has fallen behind the list.
 */
export const NOT_WORKED_OUT = [
  "taxable-base",
  "tax-payable",
  "simplified-basis",
  "national-and-local",
] as const

export type NotWorkedOut = (typeof NOT_WORKED_OUT)[number]

/** One posting that a return would want an answer about, and has not got one. */
export interface Loose {
  readonly index: number
  readonly date: string
  readonly description: string
  readonly account: string
  readonly amount: MixedAmount
}

/** The same, plus what was written where a category was expected. */
export interface Mistyped extends Loose {
  readonly said: string
}

export interface BandTotal {
  readonly category: JapaneseTaxCategory
  readonly side: Side
  readonly rate?: Fraction
  /** How many postings fell in this band. */
  readonly postings: number
  /**
   * The sum exactly as the postings have it, signs and all.
   *
   * A sale is a credit in the books, so this comes out negative for one. Kept
   * beside `total` rather than replaced by it because it is the figure that can
   * be checked against hledger, and the check is worth more than the tidiness.
   */
  readonly recorded: MixedAmount
  /**
   * The same figure the way its side of the books is read: a sale turned over,
   * so it reads as an amount taken in rather than as a negative one.
   *
   * A band that is neither a sale nor a purchase is left as recorded, because it
   * can be either — exempt sales and exempt purchases are both `tax-exempt`, and
   * turning one over would be turning the other the wrong way.
   */
  readonly total: MixedAmount
  /**
   * The same band, split by which side of the books each posting was on.
   *
   * Three of the categories say nothing about the side — an exempt sale and an
   * exempt purchase are both `tax-exempt` — and totalling them together nets one
   * against the other. That is not a tidiness problem: the ratio of taxable
   * sales to all sales is worked out from non-taxable **sales**, and a figure
   * with purchases netted into it cannot produce it. A fee paid to a ministry
   * and interest received are both `non-taxable`, and their sum is a number
   * about nothing.
   *
   * Which side a posting was on is not in the tag and does not need to be: it is
   * in the account, and hledger already says what kind each account is. So the
   * split is read off the books rather than asked for, and it is done for every
   * band — including the four that name their side, where the two answers
   * disagreeing is worth seeing rather than hiding.
   */
  readonly bySide: Sided
  /**
   * The consumption tax inside `total`, where the band carries a rate and the
   * books are kept tax-inclusive. A reference figure. See the note above.
   */
  readonly taxWithin?: MixedAmount
  /** The hledger query that selects exactly what this counted. */
  readonly query: string
}

/** One band's postings, told apart by the side of the books they were on. */
export interface Sided {
  readonly sales: Part
  readonly purchases: Part
  /** Postings on accounts hledger could not place, so neither can this. */
  readonly unplaced: Part
}

export interface Part {
  readonly postings: number
  /** Read the way its side is read: a sale turned over, a purchase as recorded. */
  readonly total: MixedAmount
}

export interface ConsumptionTaxSummary {
  /** Which rules decided every rate here. */
  readonly rules: string
  readonly currentAt: string
  readonly accounting: JapaneseTaxRules["accounting"]
  readonly rounding: JapaneseTaxRules["rounding"]
  /** How many entries were read to make this. */
  readonly entries: number
  readonly bands: readonly BandTotal[]
  /** Postings a return would ask about, on which nothing was written. */
  readonly unmarked: readonly Loose[]
  /** Postings marked with something that is not a category. */
  readonly unrecognised: readonly Mistyped[]
  readonly notWorkedOut: readonly NotWorkedOut[]
  /** What the count of unclassified postings does not reach. */
  readonly notChecked: readonly NotChecked[]
}

/**
 * Which accounts a treatment is expected on.
 *
 * What comes in and what goes out; never the cash or the bank the other side of
 * it, since tagging both sides of one receipt would count it twice and nagging
 * about the untagged side would be nagging about every entry ever written.
 *
 * Read off what hledger takes each account to be rather than off its name, so a
 * book kept in Japanese is treated the same as one kept in English. Where
 * hledger could place nothing — a chart with no `account` directives — nothing
 * is expected of anything, which is a quiet screen rather than a false alarm on
 * a perfectly good journal. The screen that fixes that is core's own.
 *
 * **And whatever these books have classified before.** A taxable purchase does
 * not have to be an expense: one capitalised into an asset — a fixed asset,
 * formation costs, stock — is a purchase that never reaches the income
 * statement, and asking only about income and expense would leave it out of
 * every count for good. Nobody would be told, because the only thing that says
 * an account can carry a treatment is that somebody once said so. So that is
 * what is used: an account with a treatment anywhere in what was read is an
 * account a treatment is expected on.
 *
 * It follows that the first one is never caught. That is a real limit and it is
 * said out loud rather than left to be discovered — see `NOT_CHECKED`.
 */
const WANTS_A_TREATMENT: readonly AccountType[] = ["Revenue", "Expense"]

/** The accounts these books have put a treatment on, which is what makes one expected. */
const classifiedAlready = (
  every: readonly { entry: JapaneseTaxTransaction; posting: TaxPosting }[],
): ReadonlySet<string> =>
  new Set(
    every.flatMap(({ posting }) =>
      posting.treatment.is === "categorised" ? [posting.account] : [],
    ),
  )

const expectsTreatment = (
  account: string,
  types: Readonly<Record<string, AccountType>>,
  classified: ReadonlySet<string>,
): boolean => {
  if (classified.has(account)) return true
  const kind = types[account]
  return kind !== undefined && WANTS_A_TREATMENT.some((wanted) => wanted === kind)
}

/**
 * What the count of unclassified postings does not cover, said in the answer.
 *
 * A limit nobody is told about is a limit that reads as a clean bill of health.
 */
export const NOT_CHECKED = [
  "a purchase capitalised into an account these books have never classified — until one posting on that account is classified, nothing on it is asked about",
  "accounts hledger could not place, which are in no count here at all",
] as const

export type NotChecked = (typeof NOT_CHECKED)[number]

const looseAt = (entry: JapaneseTaxTransaction, posting: TaxPosting): Loose => ({
  index: entry.index,
  date: entry.date,
  description: entry.description,
  account: posting.account,
  amount: posting.amount,
})

/** Every posting of every entry, each still knowing which entry it came from. */
const allPostings = (
  entries: readonly JapaneseTaxTransaction[],
): readonly { entry: JapaneseTaxTransaction; posting: TaxPosting }[] =>
  entries.flatMap((entry) => entry.postings.map((posting) => ({ entry, posting })))

/**
 * How a side of the books reads.
 *
 * Sales are credits, so the total of them is negative in the file and positive
 * in the sentence somebody says about it. Nothing else is turned over.
 */
const asRead = (side: Side, recorded: MixedAmount): MixedAmount =>
  side === "sale" ? negated(recorded) : recorded

/**
 * Which side of the books a posting was on, according to the books.
 *
 * Revenue is a sale and everything else that is not the money itself is a
 * purchase — including an asset, because a purchase capitalised into one is
 * still a purchase. An account hledger could not place is left unplaced rather
 * than guessed at.
 */
const sideOf = (account: string, types: Readonly<Record<string, AccountType>>): Side | undefined => {
  const kind = types[account]
  if (kind === undefined) return undefined
  return kind === "Revenue" ? "sale" : "purchase"
}

const partOf = (
  fell: readonly { entry: JapaneseTaxTransaction; posting: TaxPosting }[],
  side: Side,
): Part => ({
  postings: fell.length,
  total: asRead(side, sumOf(fell.map(({ posting }) => posting.amount))),
})

const splitBySide = (
  fell: readonly { entry: JapaneseTaxTransaction; posting: TaxPosting }[],
  types: Readonly<Record<string, AccountType>>,
): Sided => {
  const on = (which: Side | undefined) =>
    fell.filter(({ posting }) => sideOf(posting.account, types) === which)
  return {
    sales: partOf(on("sale"), "sale"),
    purchases: partOf(on("purchase"), "purchase"),
    unplaced: partOf(on(undefined), "neither"),
  }
}

/**
 * The tax inside a total, where there is one to be had.
 *
 * Absent under tax-exclusive accounting rather than worked out differently: with
 * the tax posted separately there is nothing inside the figure to find, and the
 * answer is the balance of the tax accounts rather than a fraction of anything.
 * That is not implemented, so nothing is claimed — see `AccountingMethod`.
 */
const taxWithin = (
  rules: JapaneseTaxRules,
  rate: Fraction | undefined,
  total: MixedAmount,
): MixedAmount | undefined => {
  if (rate === undefined) return undefined
  switch (rules.accounting) {
    case "tax-included":
      return includedAt(total, rate, rules.rounding)
    case "tax-excluded":
      return undefined
  }
}

export const summarizeConsumptionTax = (
  entries: readonly JapaneseTaxTransaction[],
  rules: JapaneseTaxRules,
  types: Readonly<Record<string, AccountType>> = {},
): ConsumptionTaxSummary => {
  const every = allPostings(entries)

  const bands = rules.bands.map((band): BandTotal => {
    const fell = every.filter(
      ({ posting }) =>
        posting.treatment.is === "categorised" && posting.treatment.category === band.category,
    )
    const recorded = sumOf(fell.map(({ posting }) => posting.amount))
    const total = asRead(band.side, recorded)

    const within = taxWithin(rules, band.rate, total)
    return {
      category: band.category,
      side: band.side,
      ...(band.rate === undefined ? {} : { rate: band.rate }),
      postings: fell.length,
      recorded,
      total,
      bySide: splitBySide(fell, types),
      ...(within === undefined ? {} : { taxWithin: within }),
      query: queryFor(band.category),
    }
  })

  const classified = classifiedAlready(every)
  const unmarked = every
    .filter(
      ({ posting }) =>
        posting.treatment.is === "unmarked" &&
        expectsTreatment(posting.account, types, classified),
    )
    .map(({ entry, posting }) => looseAt(entry, posting))

  const unrecognised = every.flatMap(({ entry, posting }) =>
    posting.treatment.is === "unrecognised"
      ? [{ ...looseAt(entry, posting), said: posting.treatment.said }]
      : [],
  )

  return {
    rules: rules.named,
    currentAt: rules.currentAt,
    accounting: rules.accounting,
    rounding: rules.rounding,
    entries: entries.length,
    bands,
    unmarked,
    unrecognised,
    notWorkedOut: NOT_WORKED_OUT,
    notChecked: NOT_CHECKED,
  }
}
