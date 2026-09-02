import type { Amount, AmountStyle, MixedAmount, Quantity } from "./wire"

/**
 * Render an amount the way hledger would.
 *
 * Built from the mantissa and the scale. hledger also sends the value as a
 * float, and that field is deliberately absent from `Quantity`: a binary float
 * cannot hold every decimal, and money must not be shown through one.
 */
export const formatAmount = (amount: Amount): string =>
  withCommodity(amount.astyle, amount.acommodity, sign(amount.aquantity) + digits(amount))

/** Render every commodity in a mixed amount; an empty one is a zero balance. */
export const formatMixed = (mixed: MixedAmount): string =>
  mixed.length === 0 ? "0" : mixed.map(formatAmount).join(", ")

const sign = (quantity: Quantity): string => (quantity.decimalMantissa < 0 ? "-" : "")

const digits = (amount: Amount): string =>
  withDecimalMark(amount.astyle, rescaled(amount), scaleOf(amount))

const scaleOf = (amount: Amount): number =>
  amount.astyle.asprecision ?? amount.aquantity.decimalPlaces

const rescaled = (amount: Amount): string =>
  rescale(unsignedDigits(amount.aquantity), amount.aquantity.decimalPlaces, scaleOf(amount))

/** The mantissa as digits, padded so there is always something before the point. */
const unsignedDigits = (quantity: Quantity): string =>
  Math.abs(quantity.decimalMantissa).toString().padStart(quantity.decimalPlaces + 1, "0")

/** Move to the scale the style asks for, staying in integers throughout. */
const rescale = (value: string, from: number, to: number): string =>
  to >= from ? value + "0".repeat(to - from) : roundOff(value, from - to)

const roundOff = (value: string, places: number): string => {
  const kept = value.slice(0, value.length - places) || "0"
  const firstDropped = value.charCodeAt(value.length - places) - "0".charCodeAt(0)
  return firstDropped >= 5 ? (BigInt(kept) + 1n).toString() : kept
}

const withDecimalMark = (style: AmountStyle, value: string, scale: number): string =>
  scale === 0
    ? group(style, value)
    : `${group(style, wholePart(value, scale))}${style.asdecimalmark ?? "."}${value.slice(value.length - scale)}`

const wholePart = (value: string, scale: number): string => value.slice(0, value.length - scale) || "0"

const group = (style: AmountStyle, whole: string): string =>
  style.asdigitgroups === null
    ? whole
    : splitFromRight(whole, style.asdigitgroups[1]).join(style.asdigitgroups[0])

/**
 * Cut a run of digits into groups from the right, the last size repeating for as
 * far as the digits go.
 */
const splitFromRight = (digits: string, sizes: readonly number[]): readonly string[] => {
  const size = sizes[0]
  if (size === undefined || size <= 0 || digits.length <= size) return [digits]
  return [
    ...splitFromRight(digits.slice(0, digits.length - size), sizes.length > 1 ? sizes.slice(1) : sizes),
    digits.slice(digits.length - size),
  ]
}

/** Put the commodity on the side the style says, spaced as it says. */
const withCommodity = (style: AmountStyle, commodity: string, number: string): string => {
  const gap = style.ascommodityspaced ? " " : ""
  return style.ascommodityside === "R" ? `${number}${gap}${commodity}` : `${commodity}${gap}${number}`
}
