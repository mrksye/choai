import type { Quantity } from "~/core/hledger/wire"
import { Err, Ok, type Result } from "~/core/lib/monad"
import { compare, minusOf, plusOf, readDecimal, scaledBy, smallerOf, whole } from "../money"
import type { DecliningRate, Fraction, JapaneseTaxRules } from "../rules"
import {
  startingMonthOf,
  yearContaining,
  yearsThrough,
  type FiscalYear,
} from "../statements/period"
import type { FixedAsset } from "./register"

/**
 * The whole life of an asset, year by year, as the rules would write it off.
 *
 * A schedule rather than one year's figure, because under the declining-balance
 * method a year cannot be worked out on its own. The method takes a proportion
 * of what is left, which never reaches zero, so at the point where a year's
 * proportion falls below a guaranteed amount it stops being a proportion: what
 * is left at that moment becomes a fixed base, spread evenly over the years
 * remaining. Which year that happened in is not recoverable from a running
 * total — two different histories reach the same book value — so it is replayed
 * from the beginning.
 *
 * The straight-line method needs none of that and is here anyway, so that the
 * two are one thing with one set of edges: the first year apportioned by months,
 * the last year stopping at the memorandum value, and nothing after it.
 *
 * **What this is, and is not.** It is the schedule for a company that writes off
 * the whole of what it is allowed to, each year, which is the ordinary case and
 * the one the rates are drawn for. It is not a reading of the journal. Where the
 * journal says something else — a year nobody posted, an amount somebody chose —
 * the two disagree, and saying so is `check/`'s job rather than this one's.
 * Quietly reconciling them here would hide a missed year inside a plausible
 * figure.
 */

export type Undecided =
  /** A method this app does not calculate. The register is still true; this is not its answer. */
  | { readonly why: "method"; readonly said: string }
  /** A useful life the published table does not reach. */
  | { readonly why: "useful-life"; readonly years: number }
  /** A cost that is not a figure. */
  | { readonly why: "cost"; readonly said: string }
  /**
   * Bought before the table in these rules applies.
   *
   * The declining-balance rates were replaced in 2012 and the ones before them
   * are not transcribed here. Running an older asset through a newer table would
   * be arithmetic on the wrong numbers, which is worse than no answer because it
   * looks like one.
   */
  | { readonly why: "acquired-before"; readonly from: string; readonly acquired: string }
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

/** What one year of the schedule comes to. */
export interface Year {
  readonly year: FiscalYear
  /** Months the asset was in use during it, out of twelve. */
  readonly months: number
  /** What stood on the books when it opened. */
  readonly opening: Quantity
  /** The rate that decided the charge — the revised one once the switch happens. */
  readonly rate: Fraction
  /** Whether this year is worked out on a fixed base rather than a proportion. */
  readonly switched: boolean
  /** A full year at that rate, before the months are counted. */
  readonly annual: Quantity
  readonly charge: Quantity
  readonly closing: Quantity
}

/**
 * How many months of the year the asset was in use for.
 *
 * Counted in whole months from the month it was put to use, which is how the
 * apportionment is done: a month begun is a month counted. Twelve for anything
 * already in use when the year opened, and none for anything not in use by the
 * time it closed.
 */
const monthIndex = (date: string): number | undefined => {
  const year = Number(date.slice(0, 4))
  const month = Number(date.slice(5, 7))
  return Number.isInteger(year) && Number.isInteger(month) && month >= 1 && month <= 12
    ? year * 12 + (month - 1)
    : undefined
}

export const monthsInService = (year: FiscalYear, inService: string): number => {
  const opened = monthIndex(year.from)
  const afterClose = monthIndex(year.to)
  const started = monthIndex(inService)
  if (opened === undefined || afterClose === undefined || started === undefined) return 0

  if (started <= opened) return 12
  if (started >= afterClose) return 0
  return afterClose - started
}

/** What the rules give for this asset's method and life, or why they give nothing. */
type Basis =
  | { readonly is: "straight-line"; readonly rate: Fraction }
  | { readonly is: "declining-balance"; readonly rates: DecliningRate }

const basisFor = (asset: FixedAsset, rules: JapaneseTaxRules): Result<Basis, Undecided> => {
  switch (asset.method) {
    case "straight-line": {
      const rate = rules.straightLine[asset.usefulLife]
      return rate === undefined
        ? Err({ why: "useful-life", years: asset.usefulLife })
        : Ok({ is: "straight-line", rate })
    }
    case "declining-balance": {
      if (asset.acquiredAt < rules.decliningBalance.from) {
        return Err({
          why: "acquired-before",
          from: rules.decliningBalance.from,
          acquired: asset.acquiredAt,
        })
      }
      const rates = rules.decliningBalance.table[asset.usefulLife]
      return rates === undefined
        ? Err({ why: "useful-life", years: asset.usefulLife })
        : Ok({ is: "declining-balance", rates })
    }
    default:
      return Err({ why: "method", said: asset.method })
  }
}

/** Where the schedule stands as it moves from one year to the next. */
interface Standing {
  readonly writtenOff: Quantity
  /**
   * The base the revised rate is applied to, once there is one.
   *
   * Fixed at the moment of the switch and carried forward unchanged, which is
   * the whole reason a year cannot be worked out without the years before it.
   */
  readonly revisedBase?: Quantity
}

/**
 * A full year's charge under the declining-balance method, and whether it is the
 * year the method changes.
 *
 * The comparison is made on a whole year, before the months of the first year
 * are counted: what is being asked is whether a proportion of what is left has
 * become too small to finish the job, and a part year would answer that question
 * about the wrong number. It cannot bite in the first year anyway — nothing has
 * been written off yet, and the rate is always above the guarantee rate.
 */
const decliningYear = (
  cost: Quantity,
  opening: Quantity,
  rates: DecliningRate,
  standing: Standing,
  rounding: JapaneseTaxRules["rounding"],
): { annual: Quantity; rate: Fraction; switched: boolean; base?: Quantity } => {
  const already = standing.revisedBase
  if (already !== undefined && rates.revised !== undefined) {
    return {
      annual: scaledBy(already, rates.revised, rounding),
      rate: rates.revised,
      switched: true,
      base: already,
    }
  }

  const proportion = scaledBy(opening, rates.rate, rounding)
  const guaranteed =
    rates.guarantee === undefined ? whole(0) : scaledBy(cost, rates.guarantee, rounding)

  if (rates.revised === undefined || compare(proportion, guaranteed) >= 0) {
    return { annual: proportion, rate: rates.rate, switched: false }
  }

  return {
    annual: scaledBy(opening, rates.revised, rounding),
    rate: rates.revised,
    switched: true,
    base: opening,
  }
}

/**
 * The schedule from the year the asset was put to use through the year asked for.
 *
 * Stops early once there is nothing left but the memorandum value, so a
 * four-year asset asked about in its tenth year comes back with six years and
 * no tenth — which is what `fully-written-off` is read off.
 */
export const scheduleThrough = (
  asset: FixedAsset,
  rules: JapaneseTaxRules,
  through: FiscalYear,
): Result<readonly Year[], Undecided> => {
  const basis = basisFor(asset, rules)
  if (!basis.ok) return basis

  const cost = readDecimal(asset.cost)
  if (cost === undefined) return Err({ why: "cost", said: asset.cost })

  const first = yearContaining(asset.inService, startingMonthOf(through))
  const memorandum = whole(rules.memorandumValue)

  const walked = yearsThrough(first, through).reduce<{
    standing: Standing
    years: readonly Year[]
  }>(
    (so, year) => {
      const opening = minusOf(cost, so.standing.writtenOff)
      const spendable = minusOf(opening, memorandum)
      if (compare(spendable, whole(0)) <= 0) return so

      const months = monthsInService(year, asset.inService)
      if (months === 0) return so

      const full =
        basis.value.is === "straight-line"
          ? { annual: scaledBy(cost, basis.value.rate, rules.rounding), rate: basis.value.rate, switched: false, base: undefined }
          : decliningYear(cost, opening, basis.value.rates, so.standing, rules.rounding)

      const thisYear =
        months === 12
          ? full.annual
          : scaledBy(full.annual, { over: months, under: 12 }, rules.rounding)

      // The last year is not a special case: it is this cap taking effect, with
      // one unit of currency staying behind so that something still owned is
      // never worth nothing at all.
      const charge = smallerOf(thisYear, spendable)

      return {
        standing: {
          writtenOff: plusOf(so.standing.writtenOff, charge),
          ...(full.base === undefined ? {} : { revisedBase: full.base }),
        },
        years: [
          ...so.years,
          {
            year,
            months,
            opening,
            rate: full.rate,
            switched: full.switched,
            annual: full.annual,
            charge,
            closing: minusOf(opening, charge),
          },
        ],
      }
    },
    { standing: { writtenOff: whole(0) }, years: [] },
  )

  return Ok(walked.years)
}
