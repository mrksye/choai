import type { JapaneseTaxCategory } from "../consumption-tax/category"

/**
 * Everything about Japanese tax that is true of a year rather than of accounting.
 *
 * Tax law changes and accounting does not. A rate, a band, a table of rates by
 * useful life — all of them are facts about a period, and a set of books written
 * under one of them has to keep reading under the next. So they are data in one
 * place, handed to functions as an argument, and there is no `if (year >= …)`
 * anywhere: swapping the rules is swapping one object.
 *
 * This is deliberately not an engine. There are no conditions, no formulas held
 * as data, no precedence between rules. It is a table somebody transcribed from
 * a statute, with the statute named beside it, and the arithmetic is ordinary
 * code that takes the table.
 *
 * What is not here is anything requiring a judgement: whether a supply is
 * zero-rated, whether an asset qualifies for a special write-off, which of the
 * permitted roundings a company has adopted. Those are not facts about a year.
 */

/**
 * An exact fraction — 10% is 10 over 100.
 *
 * Not a number. A rate multiplies money, and a rate that cannot be written down
 * exactly makes money that cannot either.
 */
export interface Fraction {
  readonly over: number
  readonly under: number
}

/** Which side of the books a band belongs to, or neither. */
export type Side = "sale" | "purchase" | "neither"

/**
 * How the fraction of a penny is dealt with.
 *
 * Named rather than chosen in code because it is a choice a company makes and
 * keeps, and because the choices are not all equally available for every figure.
 */
export type Rounding = "down" | "up" | "half-up"

/** One band of the consumption tax, as the journal marks it. */
export interface Band {
  readonly category: JapaneseTaxCategory
  readonly side: Side
  /**
   * What rate the band carries, where it carries one.
   *
   * Absent for the three that are not rates: something outside the tax, exempt
   * from it, or not a taxable supply at all. Absent is not zero — a zero rate
   * would say the tax applies and comes to nothing, which is a different fact
   * and appears in a different box.
   */
  readonly rate?: Fraction
}

/**
 * Whether the figures in the journal include the tax or stand beside it.
 *
 * Both are permitted and a company picks one. Only the first is worked out here;
 * the second is named so that supporting it later is a case somebody has to
 * handle rather than a shape somebody has to invent, and so that every function
 * that would answer differently says so now instead of quietly assuming.
 */
export type AccountingMethod = "tax-included" | "tax-excluded"

/**
 * How an asset's cost is spread, as the journal records the method.
 *
 * Only the straight-line method is worked out. The declining-balance method
 * needs three tables rather than one — a rate, a revised rate and a guarantee
 * rate, with a rule for when the second replaces the first — and shipping it
 * half-transcribed would be worse than not shipping it: a figure that is nearly
 * right is filed as though it were right.
 */
export type DepreciationMethod = "straight-line" | "declining-balance"

export interface JapaneseTaxRules {
  /** Which set this is, so a figure can say what decided it. */
  readonly named: string
  /**
   * The date the sources these were read from were current at.
   *
   * One date for the set rather than one per number, because the numbers came
   * in at different times — a rate in force since 2019, a table of rates since
   * 2012 — and what a reader needs is not when each began but when somebody
   * last looked. That is the date after which this set may be out of date.
   */
  readonly currentAt: string
  /** Where the numbers were read from, for whoever checks them next. */
  readonly sources: readonly string[]
  readonly bands: readonly Band[]
  readonly accounting: AccountingMethod
  /**
   * What is left on the books when an asset has been written down as far as it
   * goes, so that something owned is never worth nothing at all.
   */
  readonly memorandumValue: number
  /**
   * The straight-line rate for each useful life in years, as the table gives it.
   *
   * A table rather than one divided by the years, because that is what the
   * statute is. They agree — the table is a division rounded up to three places
   * — and a test says so, which is the only reason to be confident that what was
   * transcribed is what was published.
   */
  readonly straightLine: Readonly<Record<number, Fraction>>
  /** How the fraction left over is dealt with when a rate is applied. */
  readonly rounding: Rounding
}
