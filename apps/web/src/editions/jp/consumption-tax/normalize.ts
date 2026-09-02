import type { MixedAmount, Posting, Transaction } from "~/core/hledger/wire"
import { noteIn, type InvoiceNote } from "../invoice/note"
import { treatmentIn, type Treatment } from "./category"

/**
 * The journal, read as the thing a consumption tax return is worked out from.
 *
 * One step, doing one thing: hledger's shapes in, this edition's shapes out. It
 * decides nothing and totals nothing — every posting comes through, marked or
 * not, recognised or not, with the figure exactly as the journal recorded it.
 * What is dropped here is dropped from the answer, so nothing is.
 *
 * Everything downstream is a fold over what this produces, which is why it is
 * worth having as its own function: the summary, the warnings and the screen all
 * read the same reading of the books, and cannot come to disagree about which
 * entries were in it.
 */

export interface TaxPosting {
  readonly account: string
  /** The figure as the journal has it, untouched. */
  readonly amount: MixedAmount
  readonly treatment: Treatment
}

export interface JapaneseTaxTransaction {
  /** hledger's own numbering, so an entry on screen can be found in the file. */
  readonly index: number
  readonly date: string
  readonly description: string
  readonly invoice: InvoiceNote
  readonly postings: readonly TaxPosting[]
}

/**
 * A posting's own tags, then its entry's.
 *
 * hledger keeps the two apart and lets a query match either, so a treatment
 * written once on an entry covers every line of it — which is what a receipt
 * that is all one thing looks like — while a line that says something for itself
 * is not overruled by it.
 */
const postingOf = (posting: Posting, transaction: Transaction): TaxPosting => ({
  account: posting.paccount,
  amount: posting.pamount,
  treatment: treatmentIn(posting.ptags, transaction.ttags),
})

export const normalize = (
  transactions: readonly Transaction[],
): readonly JapaneseTaxTransaction[] =>
  transactions.map((transaction) => ({
    index: transaction.tindex,
    date: transaction.tdate,
    description: transaction.tdescription,
    invoice: noteIn(transaction.ttags),
    postings: transaction.tpostings.map((posting) => postingOf(posting, transaction)),
  }))
