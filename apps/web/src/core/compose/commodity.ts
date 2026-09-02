/**
 * The symbol a figure typed without one is written with.
 *
 * hledger reads a bare number as a commodity of its own — so `1200` into yen
 * books quietly starts a second currency, and every balance afterwards answers
 * about two. The one exception is a journal carrying a `D` directive, which
 * says what a bare number means; there, writing the symbol out changes nothing
 * about what the entry is worth, only about whether the file says so. That is
 * the whole of when a symbol may be added: when adding it decides nothing.
 */

import type { DefaultCommodity } from "~/core/hledger/wire"

/**
 * What hledger accepts between the digits of a figure.
 *
 * `isDigitSeparatorChar` in hledger's `Hledger.Read.Common`: either decimal
 * mark, and eight kinds of space. Anything outside this set is a symbol of
 * some sort, which is what makes a figure containing one already spoken for.
 */
const SEPARATORS = ".,\\u0020\\u00a0\\u2002\\u2003\\u2008\\u2009\\u202f\\u205f"

const BARE = new RegExp(`^[-+]?[${SEPARATORS}]*\\d[\\d${SEPARATORS}]*$`)

/**
 * A figure with nothing in it to say which commodity it is.
 *
 * Blank is not one: a posting left empty is how a journal asks hledger to work
 * the figure out, and a lone symbol is not what that means.
 */
export const isBare = (amount: string): boolean => BARE.test(amount.trim())

/**
 * The figure as it goes into the journal.
 *
 * The symbol is laid out as hledger's own `showAmountB` lays it out — before
 * the signed quantity on the left, after it on the right — so an entry written
 * here and the same entry written by `hledger print` are the same text. A
 * figure that already names a commodity is left exactly as it was typed;
 * somebody who wrote a symbol meant that symbol, default or no default.
 */
export const asWritten = (amount: string, declared: DefaultCommodity | undefined): string => {
  const figure = amount.trim()
  if (declared === undefined || !isBare(figure)) return figure
  const gap = declared.spaced ? " " : ""
  return declared.side === "left"
    ? `${declared.symbol}${gap}${figure}`
    : `${figure}${gap}${declared.symbol}`
}

/**
 * The symbol to show against a box being typed into, or nothing.
 *
 * Nothing once the box holds a commodity of its own, which is how the box says
 * that what was typed has taken over from the default.
 */
export const ghostOf = (
  amount: string,
  declared: DefaultCommodity | undefined,
): DefaultCommodity | undefined =>
  declared === undefined || (amount.trim() !== "" && !isBare(amount)) ? undefined : declared
