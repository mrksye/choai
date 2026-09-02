import { formatAmount, formatMixed } from "~/core/hledger/amount"
import type { MixedAmount, Posting, Tag, Transaction } from "~/core/hledger/wire"
import { spanOf, type Span } from "~/core/journal/lines"

/**
 * What answers are made of.
 *
 * Inside, shapes are hledger's own so that they follow upstream. Out here they
 * are not, for two reasons. hledger sends a floating-point copy of every
 * quantity beside the exact one — harmless while the types hide it, an
 * invitation to add money up wrongly the moment the JSON leaves — and what is
 * published is a promise, which should not change because hledger renamed a
 * field.
 *
 * So every figure crossing out is rebuilt from the parts that are true: a
 * mantissa, a scale, and the same figure written out the way these books write
 * it.
 */

/** One commodity's worth, as `mantissa / 10 ** places`. Never a float. */
export interface Money {
  readonly commodity: string
  readonly mantissa: number
  readonly places: number
  readonly rendered: string
}

/** A figure, which is one amount per commodity. Nothing at all means zero. */
export interface Figure {
  readonly amounts: readonly Money[]
  readonly rendered: string
}

export const figureOf = (mixed: MixedAmount): Figure => ({
  amounts: mixed.map((amount) => ({
    commodity: amount.acommodity,
    mantissa: amount.aquantity.decimalMantissa,
    places: amount.aquantity.decimalPlaces,
    rendered: formatAmount(amount),
  })),
  rendered: formatMixed(mixed),
})

/**
 * A tag, named rather than positional.
 *
 * hledger sends a pair and this is what goes out, for the same reason every
 * figure is rebuilt: what is published is a promise, and `[0]` and `[1]` are a
 * promise about aeson's tuple encoding rather than about a tag. It is also the
 * shape a tag is written back in, so what comes out of `report.entries` can be
 * handed to `transaction.propose` unchanged.
 */
export interface Named {
  readonly name: string
  readonly value: string
}

const namedOf = (tags: readonly Tag[]): readonly Named[] =>
  tags.map(([name, value]) => ({ name, value }))

export interface Line {
  readonly account: string
  readonly amount: Figure
  readonly comment: string
  /**
   * This posting's own tags. The entry's are on the entry, not repeated here —
   * see `ttags` in the wire for why the two are kept apart.
   */
  readonly tags: readonly Named[]
  /** A date of the posting's own, where it differs from the entry's. */
  readonly date?: string
  readonly status: string
}

export interface Entry {
  /** hledger's own numbering within the journal, counting from one. */
  readonly index: number
  readonly date: string
  readonly description: string
  readonly comment: string
  readonly tags: readonly Named[]
  /** Which file this is written in, and which lines of it. */
  readonly at: Span
  readonly postings: readonly Line[]
}

export const entryOf = (transaction: Transaction): Entry => ({
  index: transaction.tindex,
  date: transaction.tdate,
  description: transaction.tdescription,
  comment: transaction.tcomment,
  tags: namedOf(transaction.ttags),
  at: spanOf(transaction.tsourcepos),
  postings: transaction.tpostings.map(lineOf),
})

const lineOf = (posting: Posting): Line => ({
  account: posting.paccount,
  amount: figureOf(posting.pamount),
  comment: posting.pcomment,
  tags: namedOf(posting.ptags),
  ...(posting.pdate === null ? {} : { date: posting.pdate }),
  status: posting.pstatus,
})
