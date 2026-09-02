import type { Amount, MixedAmount, Quantity } from "~/core/hledger/wire"
import type { Fraction, Rounding } from "./rules"

/**
 * Adding up figures hledger was not asked to add up.
 *
 * Core does none of this on purpose: hledger keeps the books and hledger totals
 * them, and a screen that added its own figures could disagree with the tool
 * whose answer it is showing. That holds wherever hledger can be asked, and for
 * a consumption tax band it cannot — hledger has no report keyed by tag, and
 * `hledger bal tag:tax=taxable-sale-10` is seven questions where the reader
 * asked one, with no way to say what was left unmarked.
 *
 * So the totalling is here, in the edition that needs it, and it is exact. Every
 * sum is done on the mantissa as an integer, the way `hledger/amount.ts` renders
 * one, and no figure passes through a binary float at any point. What comes out
 * is an ordinary `Amount`, so core renders it in the style the journal declares.
 *
 * It is also checkable. Every band carries the hledger query that selects it
 * (`queryFor`), so a total worked out here can be put to hledger by hand and
 * compared. A figure nobody can check is a figure somebody has to trust.
 */

const scaleOf = (quantity: Quantity): number => quantity.decimalPlaces

/** The mantissa at a scale of its own, as an exact integer. */
const at = (quantity: Quantity, scale: number): bigint =>
  BigInt(quantity.decimalMantissa) * 10n ** BigInt(scale - scaleOf(quantity))

const quantity = (mantissa: bigint, places: number): Quantity => ({
  decimalMantissa: Number(mantissa),
  decimalPlaces: places,
})

/**
 * Two amounts of one commodity, added.
 *
 * Both are brought to the finer of the two scales before they meet, so nothing
 * is dropped: ¥1 and ¥0.005 add to ¥1.005 rather than to ¥1. The style is the
 * first one's, since a total of a journal's figures is written the way that
 * journal writes figures.
 */
const added = (a: Amount, b: Amount): Amount => {
  const places = Math.max(scaleOf(a.aquantity), scaleOf(b.aquantity))
  return { ...a, aquantity: quantity(at(a.aquantity, places) + at(b.aquantity, places), places) }
}

/**
 * Mixed amounts added, one commodity at a time.
 *
 * A commodity only the second has is carried across rather than dropped — a
 * total of books kept in two currencies is two figures, which is what hledger
 * would say too. Order is first-seen, so a total reads in the order the entries
 * did.
 */
export const plus = (a: MixedAmount, b: MixedAmount): MixedAmount =>
  b.reduce<readonly Amount[]>((into, amount) => {
    const at = into.findIndex((one) => one.acommodity === amount.acommodity)
    return at === -1
      ? [...into, amount]
      : into.map((one, index) => (index === at ? added(one, amount) : one))
  }, a)

/** Every one of them added together. Nothing at all is a zero balance. */
export const sumOf = (all: readonly MixedAmount[]): MixedAmount => all.reduce(plus, [])

/** The same figure with its sign turned over, for a credit read as a positive. */
export const negated = (mixed: MixedAmount): MixedAmount =>
  mixed.map((amount) => ({
    ...amount,
    aquantity: { ...amount.aquantity, decimalMantissa: -amount.aquantity.decimalMantissa },
  }))

/**
 * A quotient in integers, rounded as told.
 *
 * Written out rather than divided and rounded, because a division that has
 * already happened cannot be rounded correctly — the remainder is what the
 * decision is about, and a float has spent it by then. The sign is taken off
 * first so that "down" means towards zero for a credit as well as a debit:
 * rounding a negative figure further from zero would make a refund larger than
 * what was refunded.
 */
const divided = (numerator: bigint, denominator: bigint, rounding: Rounding): bigint => {
  const negative = numerator < 0n
  const size = negative ? -numerator : numerator
  const whole = size / denominator
  const left = size % denominator

  const rounded = ((): bigint => {
    if (left === 0n) return whole
    switch (rounding) {
      case "down":
        return whole
      case "up":
        return whole + 1n
      case "half-up":
        return left * 2n >= denominator ? whole + 1n : whole
    }
  })()

  return negative ? -rounded : rounded
}

/**
 * A figure multiplied by a rate, at the scale it is already written in.
 *
 * The scale is kept rather than grown: books kept in whole yen should not
 * sprout fractions of one because a rate was applied to them, and the rounding
 * is the point of the exercise rather than something to be deferred.
 */
export const times = (mixed: MixedAmount, by: Fraction, rounding: Rounding): MixedAmount =>
  mixed.map((amount) => ({
    ...amount,
    aquantity: quantity(
      divided(BigInt(amount.aquantity.decimalMantissa) * BigInt(by.over), BigInt(by.under), rounding),
      scaleOf(amount.aquantity),
    ),
  }))

/**
 * What is included in a figure at a given rate — the tax inside a tax-inclusive
 * amount.
 *
 * ¥1,100 at 10% holds ¥100, which is 10/110 of it and not 10/100. Written as
 * its own function because getting it wrong is invisible: 10% of the inclusive
 * figure is ¥110, which is a plausible number and the wrong one.
 */
export const includedAt = (mixed: MixedAmount, rate: Fraction, rounding: Rounding): MixedAmount =>
  times(mixed, { over: rate.over, under: rate.under + rate.over }, rounding)

/** Whether a figure comes to nothing, in every commodity it names. */
export const isZero = (mixed: MixedAmount): boolean =>
  mixed.every((amount) => amount.aquantity.decimalMantissa === 0)

/**
 * The same arithmetic on one figure of one commodity.
 *
 * A fixed asset register holds a cost and nothing else — one figure, its symbol
 * beside it — so the mixed-amount machinery above is more than it needs and the
 * commodity would only be carried along to be ignored. These are the same
 * integers underneath.
 */

/** A whole number of the smallest unit there is: three hundred thousand yen, exactly. */
export const whole = (value: number): Quantity => ({ decimalMantissa: value, decimalPlaces: 0 })

const bothAt = (a: Quantity, b: Quantity): { places: number; left: bigint; right: bigint } => {
  const places = Math.max(scaleOf(a), scaleOf(b))
  return { places, left: at(a, places), right: at(b, places) }
}

export const plusOf = (a: Quantity, b: Quantity): Quantity => {
  const { places, left, right } = bothAt(a, b)
  return quantity(left + right, places)
}

export const minusOf = (a: Quantity, b: Quantity): Quantity => {
  const { places, left, right } = bothAt(a, b)
  return quantity(left - right, places)
}

/** Negative, zero or positive as the first is less than, equal to or more than the second. */
export const compare = (a: Quantity, b: Quantity): number => {
  const { left, right } = bothAt(a, b)
  return left < right ? -1 : left > right ? 1 : 0
}

export const smallerOf = (a: Quantity, b: Quantity): Quantity => (compare(a, b) <= 0 ? a : b)

/** One figure taken by a rate, rounded as told, at the scale it was written in. */
export const scaledBy = (value: Quantity, by: Fraction, rounding: Rounding): Quantity =>
  quantity(
    divided(BigInt(value.decimalMantissa) * BigInt(by.over), BigInt(by.under), rounding),
    scaleOf(value),
  )

/**
 * A figure as somebody wrote it down.
 *
 * Digit groups are allowed because a person writing three hundred thousand into
 * a box writes `300,000`, and a file somebody has edited by hand will have them.
 * Nothing else is: a symbol, a space, a stray letter all come back as absence,
 * which is a fault for the reader to see rather than a number to guess at.
 */
const DECIMAL = /^([+-]?)(\d{1,3}(?:,\d{3})*|\d+)(?:\.(\d+))?$/

export const readDecimal = (said: string): Quantity | undefined => {
  const found = DECIMAL.exec(said.trim())
  if (found === null) return undefined

  const digits = (found[2] ?? "").replaceAll(",", "")
  const after = found[3] ?? ""
  const size = BigInt(digits + after)
  return quantity(found[1] === "-" ? -size : size, after.length)
}

/**
 * The same figure written back out, plainly.
 *
 * No symbol and no digit groups: this is what goes into a journal, where the
 * commodity is written beside the number and hledger decides how it is shown.
 */
export const writeDecimal = (value: Quantity): string => {
  const negative = value.decimalMantissa < 0
  const digits = Math.abs(value.decimalMantissa)
    .toString()
    .padStart(value.decimalPlaces + 1, "0")
  const point = digits.length - value.decimalPlaces
  const written =
    value.decimalPlaces === 0 ? digits : `${digits.slice(0, point)}.${digits.slice(point)}`
  return negative ? `-${written}` : written
}
