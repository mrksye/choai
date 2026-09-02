import type { Tag } from "~/core/hledger/wire"
import { said } from "../tags"

/**
 * How a figure is treated for consumption tax, and where that is written.
 *
 * One tag on the posting, because the treatment belongs to a figure and not to
 * an entry: a single receipt can carry a line at the standard rate and a line at
 * the reduced one, and an entry-wide answer would have to be wrong about one of
 * them. Written on the entry it still counts, for every posting under it — that
 * is the shorthand for a receipt that is all one thing — and a posting that says
 * something for itself wins.
 *
 * The categories are the bands somebody has to be able to tell apart in order to
 * fill in a return. They are not the return: what a band comes to is one figure,
 * and what is owed is a question with a person in it. See `summarize.ts`.
 *
 * The number in a name is the name of the band, not the rate. What rate a band
 * carries is in the rules, because a rate is a thing that changes and a band is
 * a thing books are kept in — a journal written under one rate must still read
 * under the next one, saying what it always said.
 */

export const TAX = "tax"

export const TAX_CATEGORIES = [
  "taxable-sale-10",
  "taxable-sale-8",
  "taxable-purchase-10",
  "taxable-purchase-8",
  "non-taxable",
  "tax-exempt",
  "out-of-scope",
] as const

export type JapaneseTaxCategory = (typeof TAX_CATEGORIES)[number]

export const isTaxCategory = (value: string): value is JapaneseTaxCategory =>
  TAX_CATEGORIES.some((known) => known === value)

/**
 * What a posting says about its treatment — including that it says nothing, and
 * that it says something nobody recognises.
 *
 * Three cases rather than an optional category, because they are three different
 * things to a reader. Nothing written is work still to do. Something written
 * that is not a band is a mistake worth naming, and it must not be quietly read
 * as nothing: a misspelt `taxable-purchse-10` counted as untreated looks exactly
 * like a posting nobody has got to yet, and the one thing the reader would want
 * to know — that they did get to it, and typed it wrong — is the thing that
 * would be lost.
 */
export type Treatment =
  | { readonly is: "categorised"; readonly category: JapaneseTaxCategory }
  | { readonly is: "unmarked" }
  | { readonly is: "unrecognised"; readonly said: string }

/** What the tags on a posting, and then on its entry, say the treatment is. */
export const treatmentIn = (...sets: readonly (readonly Tag[])[]): Treatment => {
  const written = said(TAX, ...sets)
  if (written === undefined) return { is: "unmarked" }

  const value = written.trim()
  return isTaxCategory(value) ? { is: "categorised", category: value } : { is: "unrecognised", said: value }
}

/**
 * The hledger query that selects exactly what a band counted.
 *
 * Offered so the reader can put the same question to hledger themselves and see
 * the same figure come back. A total worked out here that cannot be checked
 * against the tool that keeps the books is a total somebody has to take on
 * trust, and this app is not owed that.
 */
export const queryFor = (category: JapaneseTaxCategory): string => `tag:${TAX}=${category}`
