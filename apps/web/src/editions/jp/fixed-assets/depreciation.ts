import type { Quantity } from "~/core/hledger/wire"
import { Err, Ok, type Result } from "~/core/lib/monad"
import { compare, minusOf, readDecimal, scaledBy, smallerOf, whole } from "../money"
import type { Fraction, JapaneseTaxRules } from "../rules"
import type { FiscalYear } from "../statements/period"
import type { FixedAsset } from "./register"

/**
 * What one asset may be written off this year, under the straight-line method.
 *
 * A function of an asset, a year, a set of rules and what the journal says has
 * been written off already — and of nothing else. No journal is read here and
 * nothing is written; what comes back is a figure and the working behind it, so
 * that a screen can show why it is what it is and somebody can disagree with it.
 *
 * It declines, by name, wherever it is not sure. A method it cannot calculate, a
 * useful life the published table does not reach, a cost it cannot read, an
 * asset scrapped part way through the year — each comes back as its own refusal
 * rather than as a number. Half of doing this honestly is knowing when not to
 * answer: a figure that is nearly right gets filed as though it were right.
 *
 * The straight-line method, for an asset acquired on or after 2007-04-01:
 *
 *   this year = cost × rate × months in service ÷ 12
 *
 * capped so that what is left is never less than the memorandum value — a
 * hundred yen of something still owned is a hundred yen of something still
 * owned, and an asset written down to nothing disappears from a balance sheet
 * while still sitting on the desk.
 */

export type Undecided =
  /** A method this app does not calculate. The register is still true; this is not its answer. */
  | { readonly why: "method"; readonly said: string }
  /** A useful life the published table does not reach. */
  | { readonly why: "useful-life"; readonly years: number }
  /** A cost that is not a figure. */
  | { readonly why: "cost"; readonly said: string }
  /** Not yet put to use by the end of this year, so nothing is written off yet. */
  | { readonly why: "not-yet-in-service"; readonly inService: string }
  /** Already scrapped before this year began. */
  | { readonly why: "retired"; readonly on: string }
  /**
   * Scrapped during the year.
   *
   * Deliberately not answered. How the year of disposal is treated — a part
   * year's depreciation and then a loss, or the whole remaining book value
   * written off at once — is a choice a company makes, and both are ordinary.
   * Working one of them out silently would be filing somebody's return for them.
   */
  | { readonly why: "retired-during-the-year"; readonly on: string }
  /** Nothing left but the memorandum value. */
  | { readonly why: "fully-written-off" }

export interface Depreciation {
  readonly assetId: string
  readonly account: string
  readonly commodity: string
  readonly rate: Fraction
  /** Months the asset was in use during the year, out of twelve. */
  readonly months: number
  /** A full year at this rate, before the months are counted. */
  readonly annual: Quantity
  /** What may be written off this year. */
  readonly charge: Quantity
  /** What the journal says was written off before this year began. */
  readonly writtenOffBefore: Quantity
  /** What is left on the books afterwards. Never below the memorandum value. */
  readonly remaining: Quantity
  /** Which set of rules decided the rate. */
  readonly rules: string
}

/** A date as three numbers, without a calendar being involved. */
const monthIndex = (date: string): number | undefined => {
  const parts = date.split("-")
  const year = Number(parts[0])
  const month = Number(parts[1])
  return Number.isInteger(year) && Number.isInteger(month) && month >= 1 && month <= 12
    ? year * 12 + (month - 1)
    : undefined
}

/**
 * How many months of the year the asset was in use for.
 *
 * Counted in whole months from the month it was put to use, which is how the
 * apportionment is done: a month begun is a month counted. Twelve for anything
 * already in use when the year opened, and none for anything not in use by the
 * time it closed.
 */
export const monthsInService = (year: FiscalYear, inService: string): number => {
  const opened = monthIndex(year.from)
  const afterClose = monthIndex(year.to)
  const started = monthIndex(inService)
  if (opened === undefined || afterClose === undefined || started === undefined) return 0

  if (started <= opened) return 12
  if (started >= afterClose) return 0
  return afterClose - started
}

const rateFor = (rules: JapaneseTaxRules, years: number): Fraction | undefined =>
  rules.straightLine[years]

export const depreciationFor = (
  asset: FixedAsset,
  year: FiscalYear,
  rules: JapaneseTaxRules,
  writtenOffBefore: Quantity,
): Result<Depreciation, Undecided> => {
  if (asset.method !== "straight-line") return Err({ why: "method", said: asset.method })

  const rate = rateFor(rules, asset.usefulLife)
  if (rate === undefined) return Err({ why: "useful-life", years: asset.usefulLife })

  const cost = readDecimal(asset.cost)
  if (cost === undefined) return Err({ why: "cost", said: asset.cost })

  if (asset.retiredAt !== undefined) {
    if (asset.retiredAt < year.from) return Err({ why: "retired", on: asset.retiredAt })
    if (asset.retiredAt < year.to) return Err({ why: "retired-during-the-year", on: asset.retiredAt })
  }

  const months = monthsInService(year, asset.inService)
  if (months === 0) return Err({ why: "not-yet-in-service", inService: asset.inService })

  const memorandum = whole(rules.memorandumValue)
  const left = minusOf(cost, writtenOffBefore)
  const spendable = minusOf(left, memorandum)
  if (compare(spendable, whole(0)) <= 0) return Err({ why: "fully-written-off" })

  const annual = scaledBy(cost, rate, rules.rounding)
  const thisYear = months === 12 ? annual : scaledBy(annual, { over: months, under: 12 }, rules.rounding)
  // The last year is not a special case, it is this cap taking effect: what is
  // left over from the years before is smaller than a full year's charge, and
  // one yen of it stays behind.
  const charge = smallerOf(thisYear, spendable)

  return Ok({
    assetId: asset.id,
    account: asset.account,
    commodity: asset.commodity,
    rate,
    months,
    annual,
    charge,
    writtenOffBefore,
    remaining: minusOf(left, charge),
    rules: rules.named,
  })
}
