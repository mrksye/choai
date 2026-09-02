import type { Draft } from "~/core/compose/draft"
import type { Item } from "~/core/journal/proposals"
import { writeDecimal } from "../money"
import type { Depreciation } from "./depreciation"
import { ASSET } from "./register"

/**
 * A year's depreciation, written out as entries nobody has agreed to yet.
 *
 * Nothing here touches the journal. What comes back is the same `Draft` the
 * compose panel builds and the same `Item` a model's suggestion becomes, so it
 * goes through the one road every change to these books goes through: offered,
 * read by hledger, shown as the text it would be, and kept only when somebody
 * presses. A calculation that wrote itself into the ledger would be an app
 * making an accounting entry on its own authority, which is the one thing this
 * must never do — however certain the arithmetic.
 *
 * Each entry carries the asset's id as a tag, on the expense line as well as on
 * the entry. That is what makes next year possible: what has been written off so
 * far is `tag:asset=<id> type:X` put to hledger, which is the journal answering
 * about itself rather than a second figure kept in the register and drifting.
 */

/** Where the two halves of a depreciation entry go. */
export interface Posted {
  /** The expense — 減価償却費, or whatever these books call it. */
  readonly expense: string
  /**
   * What is credited.
   *
   * The asset's own account writes the value down directly; an accumulated
   * depreciation account leaves the cost standing and gathers the write-down
   * beside it. Both are ordinary in Japan and this does not choose: the account
   * is asked for, and the register's own account is only ever the default a
   * screen offers.
   */
  readonly against: string
}

/**
 * One entry for one asset.
 *
 * The amount is written plainly, with no symbol, so the journal's own declared
 * commodity applies to it exactly as it would to a figure somebody typed — see
 * `compose/commodity.ts`. Where the register records a symbol the journal does
 * not declare, that is a thing to point out rather than to paper over here; the
 * check does it.
 */
export const depreciationDraft = (
  charge: Depreciation,
  on: string,
  describedAs: string,
  into: Posted,
): Draft => ({
  date: on,
  payee: describedAs,
  note: "",
  tags: [{ name: ASSET, value: charge.assetId }],
  postings: [
    {
      account: into.expense,
      amount: writeDecimal(charge.charge),
      tags: [{ name: ASSET, value: charge.assetId }],
    },
    { account: into.against, amount: `-${writeDecimal(charge.charge)}`, tags: [] },
  ],
})

/**
 * A year's worth, as one proposal.
 *
 * All of them together rather than one call each: hledger re-reads the whole
 * journal for every candidate, so twenty assets offered separately is twenty
 * whole parses and twenty things to decide about, where what the reader has is
 * one decision about a year's closing.
 *
 * Written with full confidence because none of it is a guess — it is arithmetic
 * on figures the register and the journal already hold. Confidence here says how
 * sure the writer was, not whether the reader should look: the diff is shown
 * either way, and looking is the whole point of offering it.
 */
export const depreciationItems = (
  charges: readonly Depreciation[],
  on: string,
  describedAs: (charge: Depreciation) => string,
  into: (charge: Depreciation) => Posted,
): readonly Item[] =>
  charges.map((charge) => ({
    is: "add" as const,
    draft: depreciationDraft(charge, on, describedAs(charge), into(charge)),
    confidence: 1,
  }))
