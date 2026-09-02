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
   * The consumption tax inside `total`, where the band carries a rate and the
   * books are kept tax-inclusive. A reference figure. See the note above.
   */
  readonly taxWithin?: MixedAmount
  /** The hledger query that selects exactly what this counted. */
  readonly query: string
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
 */
const WANTS_A_TREATMENT: readonly AccountType[] = ["Revenue", "Expense"]

const expectsTreatment = (
  account: string,
  types: Readonly<Record<string, AccountType>>,
): boolean => {
  const kind = types[account]
  return kind !== undefined && WANTS_A_TREATMENT.some((wanted) => wanted === kind)
}

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
      ...(within === undefined ? {} : { taxWithin: within }),
      query: queryFor(band.category),
    }
  })

  const unmarked = every
    .filter(
      ({ posting }) =>
        posting.treatment.is === "unmarked" && expectsTreatment(posting.account, types),
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
  }
}
