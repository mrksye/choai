import type { Quantity } from "~/core/hledger/wire"
import { Err, Ok, type Result } from "~/core/lib/monad"
import { compare, plusOf, whole } from "../money"
import type { Fraction, JapaneseTaxRules } from "../rules"
import type { FiscalYear } from "../statements/period"
import type { FixedAsset } from "./register"
import { scheduleThrough, type Undecided, type Year } from "./schedule"

/**
 * What one asset may be written off this year.
 *
 * A function of an asset, a year and a set of rules — and of nothing else. No
 * journal is read here and nothing is written; what comes back is a figure and
 * the working behind it, so that a screen can show why it is what it is and
 * somebody can disagree with it.
 *
 * It declines, by name, wherever it is not sure. A method it cannot calculate, a
 * useful life the published table does not reach, a cost it cannot read, an
 * asset bought before the table applies, an asset scrapped part way through the
 * year — each comes back as its own refusal rather than as a number. Half of
 * doing this honestly is knowing when not to answer: a figure that is nearly
 * right gets filed as though it were right.
 *
 * What the journal says has been written off is carried alongside rather than
 * used. The schedule is what the rules give; the journal is what happened; and a
 * year nobody posted shows up as the two disagreeing instead of disappearing
 * into a plausible figure. `check/` is where that disagreement is said out loud.
 */

export type { Undecided } from "./schedule"
export { monthsInService } from "./schedule"

export interface Depreciation {
  readonly assetId: string
  readonly account: string
  readonly commodity: string
  readonly rate: Fraction
  /** Whether this year is worked out on a fixed base rather than a proportion. */
  readonly switched: boolean
  /** Months the asset was in use during the year, out of twelve. */
  readonly months: number
  /** What the schedule says stood on the books when the year opened. */
  readonly opening: Quantity
  /** A full year at this rate, before the months are counted. */
  readonly annual: Quantity
  /** What may be written off this year. */
  readonly charge: Quantity
  /** What the schedule leaves afterwards. Never below the memorandum value. */
  readonly remaining: Quantity
  /**
   * What the schedule had written off before this year began, and what the
   * journal says was.
   *
   * Both, because they are two different claims and the point is whether they
   * agree. They will where each year was posted at the amount allowed, which is
   * the ordinary case; where they do not, something was missed or somebody chose
   * differently, and either way the reader should see it rather than have it
   * reconciled away.
   */
  readonly scheduledBefore: Quantity
  readonly writtenOffBefore: Quantity
  readonly agreesWithJournal: boolean
  /** Which set of rules decided the rate. */
  readonly rules: string
}

/** What the schedule had written off before a given year of it. */
const before = (years: readonly Year[], at: number): Quantity =>
  years.slice(0, at).reduce((so, year) => plusOf(so, year.charge), whole(0))

export const depreciationFor = (
  asset: FixedAsset,
  year: FiscalYear,
  rules: JapaneseTaxRules,
  writtenOffBefore: Quantity,
): Result<Depreciation, Undecided> => {
  if (asset.retiredAt !== undefined) {
    if (asset.retiredAt < year.from) return Err({ why: "retired", on: asset.retiredAt })
    if (asset.retiredAt < year.to) return Err({ why: "retired-during-the-year", on: asset.retiredAt })
  }

  const schedule = scheduleThrough(asset, rules, year)
  if (!schedule.ok) return schedule

  const at = schedule.value.findIndex((one) => one.year.from === year.from)
  const found = at === -1 ? undefined : schedule.value[at]
  if (found === undefined) {
    // Nothing for this year: either it is not in use yet, or there is nothing
    // left to write off. Which of the two is told apart by whether the schedule
    // has reached anything at all.
    return schedule.value.length === 0 && asset.inService >= year.to
      ? Err({ why: "not-yet-in-service", inService: asset.inService })
      : Err({ why: "fully-written-off" })
  }

  const scheduledBefore = before(schedule.value, at)

  return Ok({
    assetId: asset.id,
    account: asset.account,
    commodity: asset.commodity,
    rate: found.rate,
    switched: found.switched,
    months: found.months,
    opening: found.opening,
    annual: found.annual,
    charge: found.charge,
    remaining: found.closing,
    scheduledBefore,
    writtenOffBefore,
    agreesWithJournal: compare(scheduledBefore, writtenOffBefore) === 0,
    rules: rules.named,
  })
}
