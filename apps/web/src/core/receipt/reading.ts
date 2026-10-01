import type { Tag } from "~/core/compose/draft"
import type { Result } from "~/core/lib/monad"
import type { Printed, Role } from "./roles"
import type { Understood } from "./understood"

/**
 * What an edition may say about reading receipts where its books are kept.
 *
 * Reading a receipt is core's: the text off the picture, which row is which,
 * the arithmetic that picks the total, the accounts. None of it depends on a
 * country. What does is how the paper is printed — the script, the way a date
 * and an amount are written, the words for "total" — and what the law makes of
 * it once it is read: which rate each figure was charged at, what tags say so,
 * whether the paper carries what an invoice must. Those are the four things an
 * edition brings, and the only four.
 *
 * Every one is optional, and the standard edition brings none: a receipt read
 * there is a total, a date, a shop and two accounts.
 */
export interface ReceiptReading {
  /**
   * Every character receipts here can be printed in, for OCR to choose from.
   * The recogniser was taught several scripts at once and answers with a
   * character from the wrong one as readily as the right one beside it.
   */
  readonly characters?: () => string
  /**
   * A row as OCR read it, rewritten into the one form core reads: dates as
   * `YYYY-MM-DD`, amounts marked with a currency sign, times as `HH:MM`. Only
   * spelling is changed — nothing is added that was not printed.
   */
  readonly normalised?: (row: string) => string
  /** The words receipts here print for each role, added to what Jev is told. */
  readonly printed?: Printed
  /** What a receipt means under this jurisdiction, once core has read it. */
  readonly interpret?: (read: Read) => Promise<Result<Interpretation, Uninterpreted>>
}

/** What core read, handed to an edition to make sense of. */
export interface Read {
  /** Each row as one line, already normalised. */
  readonly rows: readonly string[]
  readonly likelihoods: readonly Readonly<Record<Role, number>>[]
  readonly understood: Understood
}

/** One thing worth showing about the receipt: its label and what it said. */
export interface Fact {
  readonly label: () => string
  readonly value: string
}

/** One requirement the paper does or does not meet, under this jurisdiction's law. */
export interface Finding {
  readonly label: () => string
  readonly met: boolean
  /** What is missing, where it is. */
  readonly missing?: () => string
}

export interface Interpretation {
  /**
   * How the expense splits, where the receipt says: an amount and the tags each
   * line carries — one per tax rate, most often. Used only when they add up to
   * the total; otherwise the total is one line.
   */
  readonly lines?: readonly { readonly amount: number; readonly tags: readonly Tag[] }[]
  /** Tags for the entry as a whole: what the paper says of itself. */
  readonly tags: readonly Tag[]
  /** What to show beside the total. */
  readonly facts: readonly Fact[]
  /** A heading and the requirements under it, where the law sets some. */
  readonly findings?: { readonly heading: () => string; readonly each: readonly Finding[] }
  /** Things a person should look at, in the edition's own words; each lowers the confidence. */
  readonly doubts: readonly (() => string)[]
}

export interface Uninterpreted {
  readonly detail: string
}
